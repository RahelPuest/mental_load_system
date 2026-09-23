# 23 – Notification Model

## 1. Trennung von Ereignis, Absicht und Zustellung

```
DomainEvent  ──►  NotificationPlanner  ──►  Notification  ──►  NotificationDelivery (je Kanal)
 (Fakt)            (Regeln + Prefs)         (Absicht)          (Transport, eigener Lifecycle)
```

**INV-006**: Der Delivery-Lifecycle wirkt nie zurück. Der Notification-Worker läuft unter der
DB-Rolle `thealotta_notifier`, die auf fachlichen Tabellen nur `SELECT` besitzt – die Invariante ist
nicht Konvention, sondern Berechtigung.

## 2. Prioritäten

| Priorität | Bedeutung | Default-Kanal | Quiet Hours | Bündelung |
|---|---|---|---|---|
| `critical` | Versorgung, Sicherheit, Frist heute, ownerlose kritische Domain | Push **und** E-Mail | durchbricht | nie |
| `high` | Frist in 48 h, dir zugewiesen, Frage an dich gerichtet | Push | respektiert | max. 15 min |
| `normal` | Neues Attention Item, Prozess aktualisiert | In-App, morgendliche Bündelung | respektiert | Tagesbündel |
| `low` | FYI, Beobachterrolle | nur In-App | – | Wochenbündel |

Nutzer können je `notification_kind` einen `priority_floor` setzen („davon will ich nur Kritisches“)
und Kanäle einzeln abwählen. `critical` kann nicht vollständig abgeschaltet, aber auf E-Mail
begrenzt werden.

## 3. Gegen Notification Fatigue (§28.1)

1. **Bündelung**: `bundle_after` verzögert die Zustellung; im Fenster eintreffende Notifications
   desselben Empfängers werden zu einer Nachricht zusammengefasst („3 Dinge in *Kinder/Kind A*“).
2. **Dedupe**: `dedupe_key` = `(kind, subject_id, bucket)`. Dieselbe Sache erzeugt keine zweite
   Nachricht, solange die erste unbestätigt ist.
3. **Kapazitäts-Gate**: `capacity.level='paused'` → alles außer `critical` wird `suppressed`
   (mit Grund im Datensatz, für die In-App-Ansicht weiterhin sichtbar – nichts geht verloren).
4. **Staleness-Gate**: Eine Notification, die älter als `max_staleness` (6 h) ist, wird nicht mehr
   einzeln zugestellt, sondern in die nächste Zusammenfassung überführt (Schutz gegen den
   Sturm nach einem Ausfall, T4).
5. **Rate-Limit** je Empfänger: max. 4 Push/Stunde, 12/Tag (außer `critical`).
6. **Kein Nörgeln**: Es gibt keine Wiederholungs-Reminder für dieselbe Sache. Eine ignorierte
   Nachricht führt zu einer Neubewertung in der Now View, nicht zu einer zweiten Nachricht (§29).

## 4. Delivery-Zustände

`queued → sent → delivered → acknowledged` mit Abzweigen `failed` und `suppressed`.
Zustandshebungen sind monoton; verspätete Provider-Callbacks können nicht zurückstufen.

Retry: 5 Versuche, Backoff 1 min → 4 h mit Jitter. Terminal `failed` erzeugt eine Kanal-Health-Metrik;
bei `critical` erfolgt automatisch ein Fallback auf E-Mail. Ein endgültig gescheiterter Kanal ändert
**nichts** am Task oder Attention Item – die Sache bleibt in der Now View sichtbar.

## 5. Kanäle

| Kanal | Technik | Besonderheit |
|---|---|---|
| `in_app` | DB + SSE/Polling | Immer erfolgreich, immer die Rückfallebene |
| `push` | Web Push (VAPID, `web-push`) | 404/410 → Subscription `disabled_at`; iOS nur als installierte PWA |
| `email` | SMTP, Templates in `packages/contracts/templates` | Kein sensibler Inhalt im Betreff; Inhalt nur Klasse A/B |
| `calendar` | Kalenderblock (A2) | Nur mit Regel |

**Inhaltsregel**: Push- und E-Mail-Inhalte enthalten nie Daten der Klassen C–E. Statt
„Schuhgröße Kind A prüfen“ lautet der Push „1 Sache braucht Aufmerksamkeit in *Kinder/Kind A*“,
wenn die Domain-Sensitivity ≥ `health` ist. Bei `normal` ist der Titel erlaubt. Konfigurierbar
je Household (`notification_content_level ∈ {minimal, titles}`).

**INV-P03**: Es gibt keine API, mit der eine Person freien Text an eine andere pusht. Alle Inhalte
kommen aus systemdefinierten Vorlagen je `notification_kind`.

## 6. Notification Kinds (MVP)

```
attention.new                 attention.escalated
task.assigned_to_you          task.due_soon            task.waiting_released
question.directed_to_you      question.answered
process.stalled
ownership.assigned_to_you     ownership.coverage_starting   ownership.coverage_return_due
domain.unowned_critical
state.conflict
calendar.connection_unhealthy
capacity.coverage_gap
system.export_ready           system.deletion_scheduled
security.new_login            security.grant_changed        security.sensitive_access
```

`security.*` und `system.*` sind nicht abwählbar.

## 7. Sprache (§1.10)

Vorlagen werden gegen eine Wortliste gelintet (`i18n/lint-shame-words.ts`). Verboten sind u. a.
„überfällig“ (stattdessen „wartet seit“), „versäumt“, „vergessen“, „endlich“, „immer noch“,
„du solltest“, Ausrufezeichen in Statusmeldungen. Formulierungen sind beschreibend und optional:

> „*Schuhe Kind A* wartet seit dem 20.08. auf einen passenden Moment. Passt es heute?“

statt

> „Überfällig seit 18 Tagen!“
