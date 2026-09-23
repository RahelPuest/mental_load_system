# 30 – Observability

## 1. Strukturierte Logs

Pino, JSON, ein Ereignis je Zeile. Pflichtfelder:
`ts, level, msg, service, version, env, requestId, correlationId, householdId?, membershipId?,
route?, durationMs?, outcome`.

**Redaction als Allowlist**: `packages/observability/src/redact.ts` definiert die erlaubten
Feldnamen. Jedes andere Feld eines geloggten Objekts wird zu `[redacted]`. Neue Felder lecken
dadurch nicht by default. Ein Test (`no-sensitive-logs.spec.ts`) schreibt Klasse-D-Daten durch
alle Kernpfade und prüft, dass sie in keinem Log-Ausgabestream auftauchen.

Nie geloggt: Passwörter, Tokens, Kalendertitel, State-Werte, Wissensinhalte, E-Mail-Adressen,
Quick-Capture-Text, IP-Adressen im Klartext.

## 2. Metriken (Prometheus)

### Technisch
```
http_request_duration_seconds{route,method,status}
http_requests_total{route,method,status}
db_query_duration_seconds{repository,operation}
db_pool_connections{state}
job_duration_seconds{queue,job}
job_attempts_total{queue,job,outcome}
queue_depth{queue}         queue_dlq_depth{queue}
outbox_pending_total       outbox_lag_seconds
```

### Fachlich (Produkt-Health)
```
monitor_evaluations_total{rule_kind,outcome}
monitor_evaluation_lag_seconds
signals_raised_total{signal_kind}
attention_items_open{household_bucket}
attention_triage_actions_total{action}          # confirm|snooze|dismiss|irrelevant|promote
attention_to_task_ratio                         # Frühwarnsignal für Risiko P1
calendar_sync_age_seconds{connection}
calendar_sync_failures_total{provider,error}
notification_deliveries_total{channel,state}
notification_suppressed_total{reason}
push_subscriptions_active
unowned_critical_domains
coverage_pending_return_total
state_conflicts_open
export_jobs_total{state}    deletion_requests_total{state}
backup_restore_verified_timestamp
audit_chain_verified_timestamp
```

`attention_to_task_ratio` und `attention_triage_actions_total{action="irrelevant"}` sind bewusst
Produktmetriken: sie zeigen, ob der Attention-Layer trägt oder ob das System zur Todo-Liste
degeneriert (P1) bzw. Rauschen erzeugt (P2).

**Keine Metrik enthält personenbezogene Labels.** `household_bucket` ist eine Größenklasse,
kein Identifikator.

## 3. Tracing

OpenTelemetry, W3C `traceparent`. Ein Trace umspannt HTTP-Request → Service → DB → Outbox →
Job → Zustellung. `correlationId` ist identisch mit der Trace-ID und wird in jedes `DOMAIN_EVENT`
geschrieben. Damit ist die Frage *„Warum kam diese Push-Nachricht?“* durch eine einzige Abfrage
über die Kausalkette `signal.raised → attention.created → notification.created → delivery.sent`
beantwortbar – das ist die technische Entsprechung von INV-008.

Sampling: 100 % für Fehler und Jobs, 10 % für erfolgreiche Requests.

## 4. Error Tracking

Sentry (self-hosted, §25 – keine Drittanbieter-Weitergabe sensibler Daten), `beforeSend` nutzt
dieselbe Redaction-Allowlist. Fehler werden mit `requestId` gruppiert, nicht mit Nutzerdaten.

## 5. Alerts

| Alert | Bedingung | Schwere |
|---|---|---|
| API-Fehlerrate | 5xx > 1 % über 5 min | P1 |
| DB nicht erreichbar | `/health/ready` rot > 2 min | P1 |
| Outbox-Lag | > 5 min | P1 |
| DLQ wächst | > 10 Jobs | P2 |
| Monitor-Lag | p95 > 30 min | P2 |
| Kritische Notification nicht zugestellt | `critical` `failed` > 0 | P1 |
| Kalender-Sync-Alter | > 6 h bei aktiver Connection | P3 (+ AttentionItem für den Nutzer) |
| Restore-Verifikation veraltet | `backup_restore_verified_timestamp` > 10 Tage | P2 |
| Audit-Chain gebrochen | Verifikation schlägt fehl | **P1, Sicherheitsvorfall** |
| Ownerlose kritische Domain | `unowned_critical_domains` > 0 > 24 h | P3 (Produkt, kein Technikalarm) |

## 6. Dashboards

1. **Service Health** – Latenz, Fehler, Sättigung, Queue-Tiefe.
2. **Zuverlässigkeitsversprechen** – Outbox-Lag, Monitor-Lag, Zustellquote, Restore-Alter.
   Dieses Dashboard beantwortet die Frage „Können Nutzer sich gerade auf uns verlassen?“.
3. **Integrationen** – Sync-Alter, Fehlerquoten je Provider, Reauth-Bedarf.
4. **Produkt-Health** – Attention-Triage-Verteilung, `attention_to_task_ratio`,
   Anteil `mark_irrelevant` (Rauschindikator), ownerlose Domains.

## 7. Korrelation über Systemgrenzen

`X-Request-Id` (Client) → `requestId` → `correlationId` → `DOMAIN_EVENT.correlation_id` →
`OUTBOX_EVENT` → BullMQ-Job-Daten → `NOTIFICATION.payload.correlationId`.
Eine ID genügt, um von einer Push-Nachricht zurück zur auslösenden Nutzeraktion zu kommen.
