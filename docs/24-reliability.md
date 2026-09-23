# 24 – Reliability Strategy

Leitsatz: **Nutzer externalisieren Verantwortung an dieses System. Der teuerste Fehler ist nicht
ein Absturz, sondern stiller Verlust.**

## 1. Fehlerklassen und Antworten

| Situation (§36) | Antwort |
|---|---|
| Notification nicht zustellbar | Delivery `failed`, Objekt unverändert, In-App bleibt, Fallback E-Mail bei `critical` (INV-006) |
| Kalenderverbindung unterbrochen | `degraded` → Backoff → `AttentionItem`; keine abgeleitete Arbeit wird entfernt (INV-012) |
| Nutzer mehrere Tage offline | Nichts läuft ab; Rückkehr zeigt eine **Zusammenfassung**, keine 40 Einzelmeldungen |
| Hintergrundverarbeitung fehlgeschlagen | Retry mit Backoff, danach DLQ + Alert; Arbeit bleibt in der DB fällig |
| Externe Integration nicht erreichbar | Circuit Breaker je Connection; das Produkt funktioniert ohne Integrationen vollständig |
| Doppeltes Ereignis | Fachliche Idempotenzschlüssel (nicht Job-IDs) |
| Zeitzonen-/DST-Wechsel | `timestamptz` + IANA-Zone + lokale Neuberechnung, Testmatrix |
| Kalendertermin verschoben/gelöscht | Siehe [22](22-calendar-sync.md#6) |
| Job mehrfach ausgeführt | Alle Handler idempotent; Test führt jeden Handler zweimal aus |
| Worker-Absturz | BullMQ-Stalled-Detection + `available_at`-Requeue; Quelle der Wahrheit ist die DB |
| Netzwerkunterbrechung im Client | Offline-Queue in IndexedDB + `Idempotency-Key` |
| Race Conditions | Optimistic Locking (K2), Aggregat-Locks (K5), Partial-Unique-Indizes |
| Partielle Integrationsergebnisse | Seitenweise Transaktionen, Cursor erst nach Commit |

## 2. Idempotenz-Anker (die vollständige Liste)

| Pfad | Schlüssel |
|---|---|
| HTTP `POST` | `IDEMPOTENCY_KEY(key)` + `request_hash` |
| Outbox-Konsum | `PROCESSED_EVENT(consumer_name, event_id)` |
| Monitoring | `SIGNAL(household_id, dedupe_key)` partial unique |
| Kalender | `(connection_id, external_calendar_id, external_id, recurrence_id)` unique + `sequence`-Gate |
| Notification | `NOTIFICATION(dedupe_key)` + `NOTIFICATION_DELIVERY(notification_id, channel)` unique |
| Webhook | `PROCESSED_EVENT('webhook:'||provider, external_event_id)` |
| Coverage/Capacity-Übergänge | `(object_id, phase)` in `PROCESSED_EVENT` |
| Zustandsübergänge | Zielzustand ist absorbierend: `complete` auf `done` → `200`, kein Fehler |

## 3. Degradationsstufen

| Ausfall | Verhalten |
|---|---|
| Redis weg | API voll funktionsfähig (Schreiben in Outbox). Keine Hintergrundverarbeitung; Alert. Nach Rückkehr arbeitet der Relay auf. |
| Kalender-Provider weg | Kein Sync; Kontextableitung nutzt letzten bekannten Stand; Alter wird angezeigt. |
| SMTP/Push weg | In-App unverändert; Deliveries stauen sich mit Backoff. |
| DB-Replikat weg | Lesezugriffe fallen auf den Primary zurück. |
| DB-Primary weg | Harter Ausfall. Managed-Failover (RTO ≤ 15 min), `/health/ready` meldet rot. |

Der Kernnutzen – „Was braucht gerade Aufmerksamkeit?“ – hängt an genau zwei Komponenten:
API und Postgres. Alles andere ist degradierbar. Das ist eine bewusste Architekturentscheidung.

## 4. Health Endpoints

- `/health/live` – Prozess lebt.
- `/health/ready` – DB erreichbar, Migrationen aktuell, Redis erreichbar (für den Worker Pflicht,
  für die API nur Warnung).
- `/health/deep` (intern) – Outbox-Lag, Job-Lag je Queue, Sync-Alter je Connection, DLQ-Größe.

## 5. SLOs

| Indikator | Ziel |
|---|---|
| API-Verfügbarkeit (5xx-Rate) | ≥ 99.5 %/30 d |
| `GET /now` p95 | < 400 ms |
| Outbox-Lag p99 | < 60 s |
| Monitor-Auswertung nach Fälligkeit p95 | < 10 min |
| Zustellung `critical` p95 | < 2 min |
| Verlorene Domain-Events | **0** (harte Anforderung, DLQ zählt nicht als Verlust) |
| Datenverlust (RPO) | ≤ 5 min |
| Wiederherstellung (RTO) | ≤ 60 min |

## 6. Load Shedding

Bei Überlast: Schreiben hat Vorrang vor Lesen (Erfassung darf nie scheitern),
`critical`-Notifications vor allen anderen, Monitoring-Auswertung vor Reporting.
Quick Capture ist der letzte Endpunkt, der abgeschaltet würde.

## 7. Chaos-Tests in CI

- Worker während `calendar.sync_incremental` `SIGKILL` → keine Duplikate, Cursor konsistent.
- Redis-Flush während Betrieb → Outbox arbeitet auf, keine Events verloren.
- DB-Latenz 2 s injizieren → keine Teilcommits.
- Jeden Job-Handler zweimal mit identischer Eingabe ausführen → identischer Endzustand.
