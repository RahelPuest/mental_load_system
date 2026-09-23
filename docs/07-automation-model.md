# 07 – Trigger- und Automation Model

## 1. Autonomiestufen

Jede automatisierte Wirkung im System trägt eine Stufe. Die Stufe ist im Code als
`AutonomyLevel` typisiert und wird zur Laufzeit geprüft, nicht nur dokumentiert.

| Stufe | Bedeutung | Erlaubt ohne Konfiguration | Beispiele |
|---|---|---|---|
| **A0 – Observe** | Nur lesen und ableiten | ✔ | Freshness berechnen, Kalenderkontext ableiten |
| **A1 – Inform** | Hinweise erzeugen, nichts Ausführbares | ✔ | `Signal`, `AttentionItem`, Wissensverknüpfung, Playbook-**Vorschlag**, Re-Priorisierung, Overdue-Neubewertung |
| **A2 – Prepare** | Ausführbare Objekte erzeugen | nur bei expliziter Regel | `Task`/`Process` anlegen, Kalenderblock anlegen, Reminder senden, State aus `trusted`-Integration aktualisieren |
| **A3 – Decide** | Verantwortung/Rechte/Inhalte verändern | **nie automatisch** | Owner ändern, Rechte vergeben, Familienregel ändern, Gesundheitsdaten überschreiben, fremde Kalender schreiben, endgültig löschen |

**A3 ist im Code nicht erreichbar.** Der Service-Layer akzeptiert für alle A3-Operationen
ausschließlich einen `ActorContext` mit `kind='user'`; ein System-Actor führt zu
`403 requires_human_actor`. Ein Unit-Test (`autonomy.spec.ts`) enumeriert alle A3-Operationen und
prüft die Ablehnung.

A2 verlangt eine `AutomationRule` mit `enabled=true`, einem menschlichen `created_by` und einem
`rationale_template`. Ohne Regel bleibt die Wirkung auf A1 stehen: statt eines Tasks entsteht ein
`AttentionItem` mit dem Vorschlag „Task anlegen?“.

## 2. Nachvollziehbarkeit jeder Automatisierung

Jedes automatisch erzeugte Objekt trägt:
```
origin      = 'system_rule' | 'integration' | 'inference'
origin_ref  = 'monitor:<uuid>' | 'automation_rule:<uuid>' | 'calendar_connection:<uuid>'
rationale   = menschenlesbarer Satz, z. B.
              "Schuhgröße wurde zuletzt am 12.08.2026 bestätigt; die Prüfregel sieht 6 Wochen vor."
```
`rationale` ist ein **Pflichtfeld** für alle A1/A2-Erzeugungen (NOT NULL Constraint auf
`SIGNAL.evidence->>'rationale'` bzw. `ATTENTION_ITEM.why_now`). Damit ist INV-008 strukturell erzwungen,
nicht nur konventionell.

Automatisch erzeugtes Wissen bekommt `confirmed_at = NULL` und wird in der UI visuell
(nicht nur farblich – §41) als „vom System vermutet“ markiert (INV-004).

## 3. Monitoring-Regeltypen

`MONITOR.rule_kind` + `config` (validiert durch ein Zod-Schema je Typ):

| `rule_kind` | Config | Feuert wenn | Signal |
|---|---|---|---|
| `state_freshness` | `{ stateDefinitionId, interval, graceDays? }` | `now() > state_value.stale_at` | `stale_state` |
| `state_unknown` | `{ stateDefinitionId, afterDays }` | Wert seit `afterDays` `unknown` | `unresolved_unknown` |
| `state_threshold` | `{ stateDefinitionId, op, value }` | numerischer Vergleich erfüllt (z. B. Medikamentenvorrat < 7) | `threshold_crossed` |
| `schedule` | `{ rrule, leadTime }` | wiederkehrender Zeitpunkt minus Vorlauf | `scheduled_check_due` |
| `seasonal` | `{ month, day, leadDays }` | Vorlauf vor Saisonbeginn | `season_approaching` |
| `lead_time_before_event` | `{ domainId, matcher, leadTime }` | Kalendertermin in Vorlaufzeit | `event_preparation_due` |
| `date_field_lead_time` | `{ stateDefinitionId, leadTime }` | Datum in einem State-Feld nähert sich (z. B. „nächster Zahnarzt“) | `date_approaching` |
| `absence` | `{ domainId, sinceDays }` | Keine Aktivität in einer Domain seit N Tagen | `domain_dormant` |
| `dependency_recheck` | `{ waitingStateId }` | `recheck_at` erreicht | `waiting_recheck_due` |

Alle Monitore werden vom selben Job ausgewertet; `rule_kind` wählt eine reine Evaluator-Funktion
`(monitor, context) => SignalDraft[]`. Neue Regeltypen sind eine Datei plus Registry-Eintrag.

## 4. Idempotenz der Monitoring-Pipeline (§11)

```
dedupe_key = sha256(monitor_id | signal_kind | bucket)
```
`bucket` ist der regeltypspezifische Diskretisierungsschlüssel, z. B.
- `state_freshness`: `state_value.verified_at` (ISO) → derselbe veraltete Wert erzeugt genau **ein** Signal,
  nicht eines pro Job-Lauf.
- `schedule`: die konkrete Vorkommensinstanz (`occurrence_start`).
- `lead_time_before_event`: `calendar_event.id | sequence`.

`INSERT ... ON CONFLICT (household_id, dedupe_key) WHERE superseded_at IS NULL DO NOTHING` macht
wiederholte Verarbeitung folgenlos. Ändert sich die Evidenz (neuer `verified_at`), entsteht ein
neuer Bucket; das alte Signal wird `superseded`.

## 5. Signal → AttentionItem (Aggregation)

Der Attention-Aggregator bündelt Signale nach `(domain_id, signal_kind)` zu **einem**
`AttentionItem`, solange dieses `open|snoozed|acknowledged` ist. Damit erzeugen zehn stale States in
einer Domain nicht zehn Einträge, sondern einen mit zehn Belegen – die zentrale Gegenmaßnahme gegen
die „lange Todo-Liste“ aus §4.

Ein `AttentionItem` wird automatisch nach `obsolete` überführt, wenn alle stützenden Signale
`resolved|superseded` sind **und** der Nutzer es nicht `confirmed` hat. Bestätigte Items bleiben
bestehen, bis der Mensch sie schließt (INV-001).

## 6. Suppression statt Wiederholung

`mark_irrelevant` erzeugt eine `MONITOR_SUPPRESSION`-Zeile
`(monitor_id, bucket_pattern, until?, reason)`. Der Evaluator konsultiert sie vor dem Insert.
So kann eine Familie sagen „Diese Regel passt bei uns nicht“, ohne den Monitor zu löschen und ohne
die Regel jede Woche neu wegzuklicken.

## 7. Trigger für Ausführungskontext (§13)

Getrennt von Monitoring. `TaskContextRequirement(context_tag, strength ∈ {required, helpful, preferred})`.
Der `ContextResolver` bestimmt die aktuell verfügbaren Tags aus:

1. **explizit**: Nutzer setzt aktive Kontexte in der Now View („Ich bin: zuhause, mit Kind A“),
2. **abgeleitet**: Kalender (`busy` → nicht „ruhige Umgebung“; Termin mit Kind A → `person:kind-a`),
3. **zeitlich**: Wochentag/Uhrzeit-Tags (`weekend`, `evening`, `business_hours`),
4. **Kapazität**: `mental_energy <= capacity.level`.

`required` nicht erfüllt → Task erscheint **nicht** unter „Kann ich jetzt erledigen“, aber weiterhin
unter „Demnächst relevant“ mit dem Hinweis, welcher Kontext fehlt. Nichts verschwindet (INV-001).

## 8. Kalender-Ableitungen (A0/A1)

| Ableitung | Stufe | Wirkung |
|---|---|---|
| Termin → Domain-Zuordnung per Matcher (Titel-Keywords, Teilnehmer:in) | A1 | Vorschlag mit Bestätigen-Button, nie stille Zuordnung |
| Termin → `busy`-Kontext | A0 | Beeinflusst Now View |
| Arzttermin erkannt → Prep-Checkliste vorschlagen | A1 | `AttentionItem`, kein Task |
| Nach dem Termin → „Was ist neu?“-Learn-Prompt | A1 | `AttentionItem` |
| Termin → Kalenderblock für Process | A2 | nur mit Regel + `write_enabled` auf dem Zielkalender |

## 9. Was das System bei Konflikt tut

Wenn eine automatische Ableitung einer menschlich bestätigten Information widerspricht
(z. B. Kalender sagt „Termin existiert“, Mensch hat ihn als abgesagt markiert):
**Der menschliche Wert bleibt stehen** (INV-011). Das System erzeugt ein `AttentionItem`
`state_conflict` mit beiden Werten und lässt entscheiden. Siehe [09-conflict-model](09-conflict-model.md).
