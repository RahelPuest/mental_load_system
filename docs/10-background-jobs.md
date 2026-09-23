# 10 – Background Job Catalog

Alle Jobs laufen in `apps/worker` auf BullMQ (Redis). Gemeinsame Eigenschaften:
**idempotent**, **retryfähig** (exponential backoff), **beobachtbar** (Metrics + strukturierte Logs mit
`correlationId`), **tenant-scoped** (ein Fehler betrifft einen Household, nicht alle).

Jeder Job-Handler wird von `withJobContext()` umschlossen: setzt `SET LOCAL app.household_ids`,
öffnet Trace-Span, erzwingt Timeout, meldet Erfolg/Fehler an die Metrics.

## Katalog

| Job | Zeitplan | Idempotenz-Anker | Retry | Fehlerverhalten |
|---|---|---|---|---|
| `monitor.scan` | alle 5 min | – (nur Lesen; verteilt Arbeit) | 3× | Meldet Lag-Metrik; kein Datenverlust |
| `monitor.evaluate` | je Monitor, `next_evaluation_at` | `SIGNAL.dedupe_key` | 5×, Backoff 30 s–1 h | Nach 5 Fehlversuchen → `monitor.evaluation_failing` + AttentionItem für Admin |
| `attention.aggregate` | Outbox-getriggert (`signal.raised`) | `(consumer, event_id)` | 5× | DLQ, Alert |
| `attention.reevaluate` | stündlich | `attention_item.id` + Stundenbucket | 3× | – |
| `task.overdue_reassess` | stündlich | `(task_id, due_at)` | 3× | – |
| `task.defer_release` | alle 5 min | `(task_id, defer_until)` | 3× | – |
| `waiting.recheck` | alle 15 min | `(waiting_state_id, recheck_at)` | 3× | – |
| `process.stall_detect` | täglich 06:00 lokal | `(process_id, day)` | 3× | – |
| `coverage.activate` / `coverage.expire` | alle 5 min | `(coverage_id, phase)` | 5× | Bei Fehler bleibt Coverage aktiv (sicherer Default, INV-014) |
| `capacity.expire` | alle 15 min | `(capacity_id)` | 3× | – |
| `capacity.critical_check` | Outbox (`capacity.declared`) | `(consumer, event_id)` | 5× | – |
| `domain.unowned_scan` | täglich 07:00 lokal | `(domain_id, day)` | 3× | – |
| `calendar.sync_incremental` | alle 15 min je Connection | `sync_token` + `(connection, external_id, recurrence_id, sequence)` | 5×, Backoff bis 6 h | 3 Fehler → `degraded`; 401 → `needs_reauth` + AttentionItem |
| `calendar.sync_full` | wöchentlich + nach Reconnect | wie oben | 3× | Reconciliation: markiert lokal vorhandene, extern fehlende Events als `cancelled` |
| `calendar.derive_context` | Outbox (`calendar.event_upserted`) | `(consumer, event_id)` | 5× | – |
| `outbox.relay` | kontinuierlich, `FOR UPDATE SKIP LOCKED`, Batch 100 | `outbox_event.id` | ∞ mit Backoff, nach 20 → `dead` + Alert | Kein Datenverlust, Events bleiben in der Tabelle |
| `notification.plan` | Outbox-getriggert | `notification.dedupe_key` | 5× | – |
| `notification.bundle` | alle 5 min | `(membership_id, bundle_window)` | 3× | – |
| `notification.dispatch` | queue-getrieben | `(notification_id, channel)` UNIQUE | 5×, Backoff 1 min–4 h | Nach max → `failed`; **kein** Effekt auf Quellobjekt (INV-006) |
| `push.prune_subscriptions` | täglich | – | 3× | 410/404 vom Push-Service → `disabled_at` setzen |
| `state.freshness_recompute` | Outbox (`state.definition_updated`) | `(consumer, event_id)` | 3× | – |
| `export.run` | on demand | `export_job.id` + Fortschrittsmarke | 3× | Wiederaufnehmbar, Teilartefakte werden verworfen |
| `deletion.execute` | on demand nach Karenzzeit | `deletion_request.id` + Phasenmarke | 5× | Phasenweise, protokolliert; bricht nie halb ab ohne Log |
| `grant.expire` | täglich | `(grant_id)` | 3× | – |
| `idempotency.gc` | stündlich | – | – | – |
| `event.retention_gc` | täglich | – | – | `DOMAIN_EVENT` > 24 Monate → Archiv-Bucket; `AUDIT_EVENT` > 12 Monate → Löschung |
| `restore.verify` | wöchentlich (CI-Job) | – | – | Restore-Test, siehe [29](29-backup-recovery.md) |

## Scheduling-Modell

Zwei Ebenen, um „ein Cron pro Household“ zu vermeiden:

1. **Scanner** (globaler Repeatable Job) liest fällige Arbeit über einen Index
   (`monitor.next_evaluation_at < now()`), begrenzt auf `N` Zeilen mit `FOR UPDATE SKIP LOCKED`.
2. **Worker-Jobs** je Einheit, angereichert mit `householdId` und `correlationId`.

Damit skaliert das System linear mit *fälliger* Arbeit, nicht mit der Zahl der Haushalte.

## Zeitzonen (§36)

- Alle Zeitstempel in der DB sind `timestamptz` (UTC).
- Jeder Household hat `timezone` (IANA). „Täglich 07:00“ heißt 07:00 **lokal** – berechnet über
  `luxon` beim Einplanen, nicht beim Ausführen.
- Wiederkehrende Regeln speichern die RRULE **mit** Zeitzone; DST-Sprünge werden von
  `rrule` + `luxon` aufgelöst. Der Testfall „Sonntag 02:30 existiert nicht“ ist Teil der Suite.
- Ein Job, der wegen DST doppelt fällig wäre, wird durch den Idempotenz-Bucket
  (lokales Datum + Stunde) entschärft.

## Poison-Pill-Schutz

Ein Job, der 3× mit demselben Fehlerhash fehlschlägt, wandert in die DLQ und erzeugt einen Alert.
Für `monitor.evaluate` und `calendar.sync_incremental` wird zusätzlich das betroffene Objekt
`degraded` markiert, damit ein defekter Monitor nicht die Verarbeitung aller anderen blockiert.
