# 03 – Objekt-Lebenszyklen und State Machines

Alle hier definierten Übergänge sind im Paket `@thealotta/domain` als deklarative Tabellen implementiert
(`packages/domain/src/state-machines/`) und werden im Service-Layer **vor** jedem Schreibzugriff geprüft.
Ein illegaler Übergang ist ein `409 invalid_transition`, kein stiller No-Op.

Notation: `state --event--> state`.

---

## 1. Task

```
                     ┌─────────────────────────────────────────┐
                     ▼                                         │
draft ──activate──► ready ──start──► in_progress ──complete──► done
  │                  │  ▲              │      │
  │                  │  │              │      └──block──► blocked ──unblock──┐
  │                  │  └──resume──────┘                        │            │
  │                  │                                          └────────────┘
  │                  ├──defer──► deferred ──(defer_until reached)──► ready
  │                  ├──wait──► waiting ──release──► ready
  │                  └──drop──► dropped
  └──drop──► dropped
                     ready/blocked/waiting/deferred/in_progress ──supersede──► superseded
```

| Zustand | Bedeutung | Sichtbar in Now View |
|---|---|---|
| `draft` | Aus Quick Capture/Playbook entstanden, noch nicht bestätigt | nein (nur Inbox) |
| `ready` | Ausführbar, sobald Kontext passt | ja |
| `in_progress` | Aktiv begonnen | ja, priorisiert |
| `blocked` | Wartet auf andere Task (`TaskDependency`) | nein, aber in „Wartet“ |
| `waiting` | Wartet auf externes Ereignis (`WaitingState`) | nein, aber in „Wartet“ |
| `deferred` | Bewusst zurückgestellt bis `defer_until` | nein, aber im Bereich |
| `done` | Erledigt | nein |
| `dropped` | Bewusst verworfen, mit Grund | nein |
| `superseded` | Durch anderes Objekt ersetzt | nein |

**INV-001-Durchsetzung**: Es gibt **keinen** Übergang `--deadline_passed--> irgendwas_terminales`.
Der Ablauf von `due_at` erzeugt lediglich `task.overdue_reassessed` und verändert die Priorisierung
sowie `next_suitable_context`. `dropped` erfordert immer `drop_reason` und einen menschlichen Akteur
(oder eine explizit konfigurierte Regel mit `origin='system_rule'` und Begründung).

**Delegation** (§26) ist ein Attributwechsel (`assignee_membership_id`, `delegation_kind ∈
{delegated, transferred, shared, support_requested}`), **kein** Zustandsübergang und **nie**
eine Ownership-Änderung (INV-002).

---

## 2. Process

```
draft ──activate──► active ──complete──► completed
                     │  ▲                    
                     │  └──reopen───┐        
                     ├──pause──► paused ─────┘
                     ├──block──► blocked ──unblock──► active
                     └──abandon──► abandoned
```

- `completed` verlangt ein `outcome ∈ { achieved, no_longer_needed, replaced }`.
- `active → completed` ist nur zulässig, wenn keine Task im Zustand `ready|in_progress|blocked|waiting`
  offen ist **oder** der Akteur explizit `force_close_reason` angibt (dann werden offene Tasks
  auf `dropped` mit Verweis gesetzt und je ein Event geschrieben – kein stiller Verlust).
- `abandoned` erhält `outcome='abandoned'` + Pflichtbegründung.
- Ein Process ohne ausführbare Task ist **nicht** illegal, erzeugt aber ein `process.stalled`-Signal
  (Akzeptanzkriterium §12: „Was ist der nächste konkrete Schritt?“ muss immer beantwortbar sein).

---

## 3. AttentionItem

```
                ┌───────────────── re-signal ─────────────────┐
                ▼                                             │
open ──confirm──► acknowledged ──promote──► converted        │
 │  │                    │                                    │
 │  ├──snooze──► snoozed ─(snoozed_until)──► open ────────────┘
 │  ├──dismiss──► dismissed
 │  └──mark_irrelevant──► irrelevant
 └──(source signal superseded)──► obsolete
```

| Übergang | Wirkung |
|---|---|
| `confirm` | „Ja, relevant“ – bleibt sichtbar, aber ohne Neu-Benachrichtigung |
| `snooze` | Temporär unsichtbar bis `snoozed_until`; **kein** Datenverlust |
| `dismiss` | Für diese Instanz erledigt; Monitor darf beim nächsten Trigger neu erzeugen |
| `mark_irrelevant` | Erzeugt `MonitorSuppression` → Monitor erzeugt für diese Konstellation nicht erneut, bis Konfiguration geändert wird |
| `promote` | Erzeugt `Process` (oder verknüpft bestehenden) und setzt `process_id` |
| `obsolete` | Automatisch, wenn alle stützenden Signale superseded sind |

**§4-Anforderung**: `dismiss` ≠ `mark_irrelevant`. Ersteres ist „jetzt nicht“, letzteres ist
„diese Regel passt nicht zu uns“ – nur letzteres verändert das Monitoring.

---

## 4. Signal

```
detected ──(neue Evidenz zum gleichen dedupe_key)──► superseded
detected ──(Bedingung nicht mehr erfüllt)──► resolved
```

`Signal` ist **immutable**. Es gibt keinen Nutzer-Übergang; Nutzeraktionen wirken auf das `AttentionItem`.
Ein „bestätigtes“ Signal existiert nicht – bestätigt wird immer die Aufmerksamkeitseinheit.

---

## 5. StateValue / Observation

```
StateValue.value_kind:  unknown ⇄ known ⇄ not_applicable
StateObservation.conflict_state: none | unresolved | resolved_manual | resolved_by_priority
```

- Jede Änderung an `StateValue` schreibt zwingend eine `StateObservation` (append-only).
- `verified_at` wird nur durch **menschliche Bestätigung** oder eine als `trusted` markierte
  Integration gesetzt. Eine `inference` setzt `verified_at` nie (INV-011).
- Freshness: `stale_at = verified_at + freshness_interval`. `now() > stale_at` bedeutet
  **„könnte veraltet sein“**, nicht „ist falsch“ (§9.1).
- Ein `unknown`-Wert kann `stale_at` besitzen (offene Frage altert ebenfalls).

---

## 6. TemporaryCoverage

```
scheduled ──(starts_at)──► active ──(ends_at, return_mode=auto_return)──► returned
                             │
                             ├──(ends_at, return_mode=require_confirmation)──► pending_return
                             │                                                     │
                             │                              ┌──confirm_return──────┘
                             │                              ▼
                             │                          returned
                             ├──extend──► active
                             └──cancel──► cancelled
```

- `pending_return` ist ein **sichtbarer, blockierender** Zustand in der Familienübersicht:
  Solange niemand bestätigt, bleibt der Vertretungs-Owner verantwortlich (INV-014 – die
  Verantwortung fällt nie in ein Loch).
- Wechsel nach `active`/`returned` schreibt `ownership.coverage_started` / `.coverage_returned`
  in den Ledger (INV-013). Die zugrunde liegende `ResponsibilityAssignment` bleibt unverändert (INV-003).

---

## 7. CapacityState

```
(kein Eintrag) = normal
normal ──declare──► reduced | minimal | paused ──(ends_at | clear)──► normal
```

- `paused` setzt `accepts_new_assignments=false` und `mute_push=true`.
- Beim Übergang nach `minimal`/`paused` prüft ein Job alle Domains, in denen die Person
  `primary_owner` mit `criticality='critical'` ist, und erzeugt ein `AttentionItem`
  `coverage_gap` für die Household-Admins (INV-014).
- Kapazität verändert **nie** `ResponsibilityAssignment` (INV-007).

---

## 8. InboxItem

```
captured ──classify──► suggested ──accept──► processed
   │                      │  └──edit──► suggested
   │                      └──reject──► captured
   ├──process_manually──► processed
   └──discard──► discarded
```

`processed` speichert `resulting_object_type/id`. Ein InboxItem verschwindet nie ohne Zielobjekt
oder expliziten `discard` mit Grund.

---

## 9. Notification / NotificationDelivery

```
Notification:  created ──bundle──► pending ──dispatch──► dispatched ──(alle Deliveries terminal)──► closed
                                      └──suppress──► suppressed   (Quiet Hours, Capacity, Prefs)

Delivery:      queued ──send──► sent ──ack──► acknowledged
                 │                │
                 │                └──(provider callback)──► delivered
                 ├──retry──► queued   (exponential backoff, max 5)
                 ├──fail──► failed    (terminal nach max attempts)
                 └──suppress──► suppressed
```

**INV-006**: Kein Delivery-Übergang darf ein Feld außerhalb von `notification_delivery` schreiben.
Technisch durchgesetzt: der Notification-Worker läuft mit einer DB-Rolle, die auf fachlichen
Tabellen nur `SELECT` besitzt (siehe [25-threat-model](25-threat-model.md#least-privilege)).

---

## 10. CalendarConnection

```
pending_auth ──authorize──► active ──sync_ok──► active
                              │  ├──auth_error──► needs_reauth ──authorize──► active
                              │  ├──transient_error──► degraded ──sync_ok──► active
                              │  └──disconnect──► disconnected
                          revoked ◄──user_revoke── (aus jedem Zustand)
```

- `degraded` nach 3 aufeinanderfolgenden Fehlern, `needs_reauth` sofort bei 401/403.
- **INV-012**: Kein Zustand dieser Maschine darf `Task`, `Process`, `AttentionItem` oder
  `Domain` verändern. Verlorene Kalenderdaten erzeugen ein `AttentionItem`
  („Kalenderverbindung X liefert seit 3 Tagen keine Daten“), löschen aber nichts.

---

## 11. Question

```
open ──answer──► answered ──promote_to_knowledge──► knowledge_captured
 │  ├──assign──► open (directed_to gesetzt)
 └──close_unanswered──► closed
```

---

## 12. Household / User (Löschung)

```
Household: active ──request_deletion──► pending_deletion (Karenzzeit 30 T) ──execute──► purged
                       └──cancel──► active
User:      active ──deactivate──► deactivated ──request_deletion──► pending_deletion ──execute──► purged
```

Details, inklusive Umgang mit letztem Admin und geteilten Daten: [05-privacy-model](05-privacy-model.md).
