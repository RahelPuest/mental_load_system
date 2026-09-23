# 06 – Event Catalog

## 1. Aufbau

Jeder fachliche Schreibvorgang schreibt in derselben Transaktion:
1. die Zustandsänderung,
2. eine `DOMAIN_EVENT`-Zeile,
3. bei Bedarf eine `OUTBOX_EVENT`-Zeile (für asynchrone Folgeverarbeitung).

Envelope:
```jsonc
{
  "id": "uuid",
  "eventType": "state.value_updated",
  "version": 1,
  "householdId": "uuid",
  "subject": { "type": "state_value", "id": "uuid" },
  "actor": { "kind": "user" | "system" | "integration", "membershipId": "uuid|null", "ref": "monitor:uuid" },
  "occurredAt": "2026-09-07T09:12:00Z",
  "correlationId": "uuid",   // über alle Folgeeffekte hinweg konstant
  "causationId": "uuid",     // Event, das dieses ausgelöst hat
  "payload": { },            // fachliche Nutzlast, sensitivity-gefiltert
  "before": { }, "after": { }  // nur geänderte Felder, für History-Diff
}
```

`payload` enthält **nie** Werte der Klassen D/E im Klartext, sondern `{"valueOmitted": true, "sensitivity": "health"}`.
Die History-Ansicht rendert daraus „Wert geändert (Inhalt geschützt)“ und lädt den Inhalt nur, wenn der
Betrachter aktuell Zugriff hat – Historie darf keine Rechte-Umgehung sein.

## 2. Katalog

### Identity & Tenancy
| Event | Auslöser | Konsumenten |
|---|---|---|
| `household.created` | POST /households | Bootstrap-Job (Default-Domains, Kontext-Tags) |
| `membership.invited` / `.accepted` / `.left` | Einladungsfluss | Notification, Coverage-Gap-Check |
| `membership.role_changed` | `role:assign` | **AuditEvent**, Notification an Betroffene |
| `person.created` / `.updated` / `.deleted` | Personenverwaltung | Domain-Orphan-Check |
| `grant.created` / `.revoked` / `.self_elevated` | `grant:manage` | **AuditEvent**, Notification an Sensitivity-Subjekt |

### Responsibility
| Event | Auslöser | Konsumenten |
|---|---|---|
| `domain.created` / `.updated` / `.archived` | Domainverwaltung | Suchindex, Unowned-Check |
| `ownership.assigned` / `.transferred` / `.released` | Assignment-Änderung | History, Notification, Unowned-Check (INV-013) |
| `ownership.coverage_scheduled` / `.coverage_started` / `.coverage_return_pending` / `.coverage_returned` | Coverage-Maschine | Notification, Familienübersicht |
| `domain.became_unowned` | Unowned-Check-Job | AttentionItem `coverage_gap` |
| `domain.item_moved` | Umhängen von Inhalten (docs/72) | Verlauf des Zielbereichs und des Eintrags selbst; `payload.domainId` ist das **Ziel**, `fromDomainId` die Quelle |
| `domain.items_left` | dasselbe Umhängen, einmal je Vorgang | Verlauf des **Quellbereichs** – ohne dieses Ereignis wäre dort nur etwas verschwunden (INV-001) |
| `capacity.declared` / `.cleared` | `capacity:declare_self` | Now-View-Ranking, Notification-Suppression, Critical-Ownership-Check |

### Knowledge
| Event | Auslöser | Konsumenten |
|---|---|---|
| `state.definition_created` / `.updated` | `state:define` | Monitor-Bootstrap (Freshness) |
| `state.value_updated` | `state:write` | Freshness-Neuberechnung, Signal-Resolution, Suchindex |
| `state.observation_recorded` | jede Wertänderung | History |
| `state.conflict_detected` / `.conflict_resolved` | Konflikterkennung | AttentionItem `state_conflict` |
| `state.became_stale` | Freshness-Job | Signal `stale_state` |
| `knowledge.created` / `.updated` / `.confirmed` | `knowledge:write` | Suchindex |
| `question.asked` / `.answered` / `.promoted_to_knowledge` | Fragefluss | Notification an `directed_to` |
| `decision.recorded` / `.superseded` | `decision:write` | Vorschlagsmaschine (Playbook-Kontext) |

### Attention
| Event | Auslöser | Konsumenten |
|---|---|---|
| `monitor.created` / `.updated` / `.disabled` | `monitor:manage` | Scheduler (`next_evaluation_at`) |
| `monitor.evaluated` | Monitoring-Job | Metrics (kein History-Rauschen: nur bei Ergebnisänderung persistiert) |
| `signal.raised` | Monitoring-Job | Attention-Aggregator |
| `signal.superseded` / `.resolved` | Monitoring-Job | AttentionItem → `obsolete` |
| `attention.created` | Attention-Aggregator | Now View, Notification |
| `attention.confirmed` / `.snoozed` / `.dismissed` / `.marked_irrelevant` | Triage | Monitor-Suppression, Re-Scheduling |
| `attention.promoted` | Triage → Process | Work-Context |
| `need.declared` / `.met` / `.dropped` | Need-Verwaltung | Now View |

### Work
| Event | Auslöser | Konsumenten |
|---|---|---|
| `process.created` / `.state_changed` / `.completed` | Process-Maschine | Attention-Resolution, Learn-Prompt |
| `process.stalled` | Stall-Detector-Job | AttentionItem `process_needs_next_step` |
| `task.created` / `.updated` / `.state_changed` | Task-Maschine | Now View, Notification |
| `task.assigned` / `.delegated` | `task:assign` | Notification, Capacity-Check (INV-002: keine Ownership-Wirkung) |
| `task.overdue_reassessed` | Overdue-Job | Now View (INV-001) |
| `task.waiting_declared` / `.waiting_released` | WaitingState | Re-Surfacing-Job |
| `playbook.instantiated` | Process aus Playbook | History |
| `playbook.suggested` | Vorschlagsmaschine | UI-Hinweis (nicht persistiert als Task) |

### Intake / Integration / Delivery
| Event | Auslöser | Konsumenten |
|---|---|---|
| `inbox.captured` / `.classified` / `.processed` / `.discarded` | Quick Capture | Now View (Badge) |
| `calendar.connected` / `.disconnected` / `.needs_reauth` / `.degraded` | Sync-Maschine | AttentionItem `integration_unhealthy`, **AuditEvent** bei connect/disconnect |
| `calendar.event_upserted` / `.event_cancelled` | Sync-Job | Kontextableitung, Prep/Follow-up-Vorschläge |
| `calendar.sync_completed` / `.sync_failed` | Sync-Job | Metrics, Health |
| `notification.created` / `.suppressed` | Notification-Service | Metrics |
| `delivery.queued` / `.sent` / `.delivered` / `.failed` / `.acknowledged` | Delivery-Worker | Metrics, Kanal-Health (INV-006: keine Rückwirkung) |

### Governance
| Event | Auslöser | Konsumenten |
|---|---|---|
| `export.requested` / `.completed` / `.downloaded` | Export | **AuditEvent** |
| `deletion.requested` / `.cancelled` / `.executed` | Löschung | **AuditEvent** |
| `auth.login_succeeded` / `.login_failed` / `.password_changed` / `.session_revoked` | Auth | **AuditEvent** (nur dort, nicht im DomainEvent-Ledger) |

## 3. Namenskonvention & Versionierung

`<aggregate>.<past_tense_verb>`, snake_case, immer Vergangenheitsform. Events sind additiv versioniert
(`version`-Feld); ein Feld wird nie umbenannt, nur ergänzt und in einer späteren Major-Version entfernt.
Konsumenten müssen unbekannte Felder ignorieren.

## 4. Zustellgarantie

At-least-once via Outbox (ADR-0007). Jeder Konsument ist idempotent über
`(consumer_name, event_id)` in `PROCESSED_EVENT`. Reihenfolge ist **nur** je `subject_id` garantiert
(Ordering-Schlüssel = `subject_id`).
