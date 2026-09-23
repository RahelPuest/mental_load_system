# 02 – Entity-Relationship-Modell

Alle fachlichen Tabellen tragen `household_id uuid NOT NULL` (Tenant-Diskriminator, → RLS, ADR-0003),
`created_at`, `updated_at`, sowie – wo mutierbar – `version integer NOT NULL DEFAULT 1` (Optimistic Locking).

Herkunftsspalten auf allen Objekten, die automatisch entstehen können (INV-004):
`origin ∈ { human, system_rule, integration, inference }`, `origin_ref text`, `confirmed_by`, `confirmed_at`.

## Identity & Tenancy

```mermaid
erDiagram
  USER ||--o{ HOUSEHOLD_MEMBERSHIP : has
  HOUSEHOLD ||--o{ HOUSEHOLD_MEMBERSHIP : contains
  HOUSEHOLD ||--o{ PERSON : contains
  PERSON |o--o| HOUSEHOLD_MEMBERSHIP : "linked_person"
  USER ||--o{ SESSION : owns
  USER ||--o{ USER_CREDENTIAL : owns
  HOUSEHOLD ||--o{ INVITATION : issues

  USER { uuid id PK; citext email UK; text password_hash; text status; timestamptz deleted_at }
  SESSION { uuid id PK; uuid user_id FK; text refresh_token_hash; uuid family_id; timestamptz expires_at; timestamptz revoked_at }
  HOUSEHOLD { uuid id PK; text name; text timezone; text status; timestamptz purge_after }
  HOUSEHOLD_MEMBERSHIP { uuid id PK; uuid household_id FK; uuid user_id FK; uuid linked_person_id FK; text role; text status; timestamptz left_at }
  PERSON { uuid id PK; uuid household_id FK; text display_name; text person_kind; date birth_date; text sensitivity_default }
  INVITATION { uuid id PK; uuid household_id FK; citext email; text role; text token_hash; timestamptz expires_at; timestamptz accepted_at }
```

## Responsibility

```mermaid
erDiagram
  HOUSEHOLD ||--o{ DOMAIN : contains
  DOMAIN ||--o{ DOMAIN : parent_of
  DOMAIN ||--o{ RESPONSIBILITY_ASSIGNMENT : has
  HOUSEHOLD_MEMBERSHIP ||--o{ RESPONSIBILITY_ASSIGNMENT : holds
  DOMAIN ||--o{ TEMPORARY_COVERAGE : covered_by
  HOUSEHOLD_MEMBERSHIP ||--o{ CAPACITY_STATE : declares
  PERSON |o--o{ DOMAIN : "subject_person"

  DOMAIN { uuid id PK; uuid household_id FK; uuid parent_id FK; ltree path; text name; text slug; uuid subject_person_id FK; text ownership_inheritance; text criticality; text sensitivity; int position; timestamptz archived_at }
  RESPONSIBILITY_ASSIGNMENT { uuid id PK; uuid household_id FK; uuid domain_id FK; uuid membership_id FK; text assignment_kind; timestamptz effective_from; timestamptz effective_to; uuid assigned_by FK; text note }
  TEMPORARY_COVERAGE { uuid id PK; uuid household_id FK; uuid domain_id FK; uuid covering_membership_id FK; uuid original_membership_id FK; timestamptz starts_at; timestamptz ends_at; text return_mode; text state; text reason_category }
  CAPACITY_STATE { uuid id PK; uuid household_id FK; uuid membership_id FK; text level; bool accepts_new_assignments; bool critical_only; bool mute_push; timestamptz starts_at; timestamptz ends_at; text note }
```

`DOMAIN.path` ist ein materialisierter Pfad (`ltree`) für O(1)-Subtree-Queries in der Autorisierung.
`return_mode ∈ { auto_return, require_confirmation }` (§25.1).

## Knowledge & State

```mermaid
erDiagram
  DOMAIN ||--o{ STATE_DEFINITION : defines
  STATE_DEFINITION ||--|| STATE_VALUE : current
  STATE_DEFINITION ||--o{ STATE_OBSERVATION : history
  DOMAIN ||--o{ KNOWLEDGE_ITEM : holds
  DOMAIN ||--o{ QUESTION : holds
  DOMAIN ||--o{ DECISION : holds
  QUESTION |o--o| KNOWLEDGE_ITEM : "answered_into"
  KNOWLEDGE_ITEM ||--o{ ATTACHMENT : has

  STATE_DEFINITION { uuid id PK; uuid household_id FK; uuid domain_id FK; text key; text label; text data_type; jsonb options; interval freshness_interval; bool is_critical; text sensitivity; text unit }
  STATE_VALUE { uuid id PK; uuid household_id FK; uuid state_definition_id FK UK; text value_kind; jsonb value; timestamptz verified_at; timestamptz stale_at; text origin; text confidence; uuid observed_by FK; int version }
  STATE_OBSERVATION { uuid id PK; uuid household_id FK; uuid state_definition_id FK; text value_kind; jsonb value; timestamptz observed_at; text origin; uuid observed_by FK; uuid supersedes_id FK; text conflict_state; text note }
  KNOWLEDGE_ITEM { uuid id PK; uuid household_id FK; uuid domain_id FK; text scope; text kind; text title; text body; text sensitivity; text origin; timestamptz confirmed_at }
  QUESTION { uuid id PK; uuid household_id FK; uuid domain_id FK; text body; text state; uuid asked_by FK; uuid directed_to FK; uuid answer_knowledge_id FK }
  DECISION { uuid id PK; uuid household_id FK; uuid domain_id FK; text title; text body; text decision_kind; text binding_level; timestamptz decided_at; timestamptz review_after; uuid supersedes_id FK }
```

**Konfliktbehandlung**: `STATE_OBSERVATION` ist append-only. Ein `STATE_VALUE` ist die *kuratierte*
Projektion. Widersprüchliche Beobachtungen setzen `conflict_state = 'unresolved'` und blockieren die
automatische Projektion (siehe [09-conflict-model](09-conflict-model.md)).

## Attention

```mermaid
erDiagram
  DOMAIN ||--o{ MONITOR : has
  MONITOR ||--o{ MONITORING_RULE : configures
  MONITOR ||--o{ SIGNAL : emits
  SIGNAL }o--o{ ATTENTION_ITEM : supports
  ATTENTION_ITEM |o--o| NEED : expresses
  ATTENTION_ITEM |o--o| PROCESS : promoted_to

  MONITOR { uuid id PK; uuid household_id FK; uuid domain_id FK; uuid state_definition_id FK; text name; text rule_kind; jsonb config; bool enabled; text default_response; timestamptz last_evaluated_at; timestamptz next_evaluation_at }
  SIGNAL { uuid id PK; uuid household_id FK; uuid monitor_id FK; uuid domain_id FK; text signal_kind; text dedupe_key UK; jsonb evidence; text severity; timestamptz detected_at; timestamptz superseded_at }
  ATTENTION_ITEM { uuid id PK; uuid household_id FK; uuid domain_id FK; text title; text why_now; text state; text urgency; timestamptz snoozed_until; uuid resolved_by FK; uuid process_id FK; text origin; int version }
  NEED { uuid id PK; uuid household_id FK; uuid domain_id FK; uuid subject_person_id FK; text description; text state; text criticality; timestamptz needed_by }
```

`SIGNAL.dedupe_key` ist `UNIQUE (household_id, dedupe_key) WHERE superseded_at IS NULL` – das ist der
Idempotenz-Anker der Monitoring-Pipeline (§11).

## Work

```mermaid
erDiagram
  DOMAIN ||--o{ PROCESS : contains
  PROCESS ||--o{ TASK : contains
  PLAYBOOK ||--o{ PLAYBOOK_STEP : contains
  PLAYBOOK |o--o{ PROCESS : instantiated_as
  TASK ||--o{ TASK_DEPENDENCY : blocked_by
  TASK ||--o{ TASK_CONTEXT_REQUIREMENT : requires
  CONTEXT_TAG ||--o{ TASK_CONTEXT_REQUIREMENT : referenced_by
  TASK |o--o| WAITING_STATE : waits_on
  TASK }o--o| HOUSEHOLD_MEMBERSHIP : assigned_to

  PROCESS { uuid id PK; uuid household_id FK; uuid domain_id FK; uuid playbook_id FK; text title; text goal; text state; text outcome; uuid owner_membership_id FK; timestamptz due_at; timestamptz completed_at; int version }
  TASK { uuid id PK; uuid household_id FK; uuid domain_id FK; uuid process_id FK; text title; text state; int position; uuid assignee_membership_id FK; uuid delegated_by FK; text delegation_kind; timestamptz due_at; timestamptz defer_until; int estimated_minutes; text mental_energy; text physical_energy; text focus_required; text social_load; text origin; int version }
  TASK_DEPENDENCY { uuid id PK; uuid task_id FK; uuid depends_on_task_id FK; text dependency_kind }
  CONTEXT_TAG { uuid id PK; uuid household_id FK; text key; text label; text tag_kind; uuid person_id FK }
  TASK_CONTEXT_REQUIREMENT { uuid id PK; uuid task_id FK; uuid context_tag_id FK; text strength }
  WAITING_STATE { uuid id PK; uuid household_id FK; uuid task_id FK; text waiting_kind; uuid waiting_on_membership_id FK; text external_party; timestamptz recheck_at; text description; timestamptz released_at }
  PLAYBOOK { uuid id PK; uuid household_id FK; uuid domain_id FK; text title; text trigger_description; text scope; int version }
  PLAYBOOK_STEP { uuid id PK; uuid playbook_id FK; int position; text title; text description; jsonb context_requirements; text branch_condition; int estimated_minutes; text mental_energy }
```

## Intake, Integration, Delivery

```mermaid
erDiagram
  HOUSEHOLD ||--o{ INBOX_ITEM : receives
  HOUSEHOLD_MEMBERSHIP ||--o{ CALENDAR_CONNECTION : owns
  CALENDAR_CONNECTION ||--o{ CALENDAR_SELECTION : selects
  CALENDAR_CONNECTION ||--o{ CALENDAR_EVENT : mirrors
  CALENDAR_EVENT }o--o| DOMAIN : "linked_domain"
  NOTIFICATION ||--o{ NOTIFICATION_DELIVERY : dispatched_as
  HOUSEHOLD_MEMBERSHIP ||--o{ NOTIFICATION_PREFERENCE : configures
  HOUSEHOLD_MEMBERSHIP ||--o{ PUSH_SUBSCRIPTION : registers

  INBOX_ITEM { uuid id PK; uuid household_id FK; uuid created_by FK; text raw_text; text source; jsonb source_ref; text state; jsonb suggestion; uuid resulting_object_id; text resulting_object_type; timestamptz processed_at }
  CALENDAR_CONNECTION { uuid id PK; uuid household_id FK; uuid membership_id FK; text provider; text display_name; bytea credentials_ciphertext; text credentials_key_id; text state; text sync_token; timestamptz last_sync_at; text last_error_code; int consecutive_failures }
  CALENDAR_SELECTION { uuid id PK; uuid connection_id FK; text external_calendar_id; bool read_enabled; bool write_enabled; text share_level }
  CALENDAR_EVENT { uuid id PK; uuid household_id FK; uuid connection_id FK; text external_calendar_id; text external_id; text recurrence_id; text etag; int sequence; text title_encrypted; timestamptz starts_at; timestamptz ends_at; text time_zone; bool all_day; text state; uuid linked_domain_id FK; text visibility }
  NOTIFICATION { uuid id PK; uuid household_id FK; uuid recipient_membership_id FK; text notification_kind; text priority; text title; text body; jsonb payload; text subject_type; uuid subject_id; text dedupe_key; timestamptz bundle_after; timestamptz created_at }
  NOTIFICATION_DELIVERY { uuid id PK; uuid notification_id FK; text channel; text state; int attempt_count; timestamptz next_attempt_at; text failure_code; timestamptz sent_at; timestamptz acknowledged_at }
  NOTIFICATION_PREFERENCE { uuid id PK; uuid household_id FK; uuid membership_id FK; text notification_kind; text priority_floor; jsonb channels; jsonb quiet_hours }
  PUSH_SUBSCRIPTION { uuid id PK; uuid household_id FK; uuid membership_id FK; text endpoint UK; text p256dh; text auth; timestamptz last_success_at; timestamptz disabled_at }
```

## Access Control & Ledger

```mermaid
erDiagram
  HOUSEHOLD_MEMBERSHIP ||--o{ ACCESS_GRANT : receives
  HOUSEHOLD ||--o{ DOMAIN_EVENT : records
  HOUSEHOLD ||--o{ OUTBOX_EVENT : queues
  HOUSEHOLD ||--o{ EXPORT_JOB : requests
  HOUSEHOLD ||--o{ DELETION_REQUEST : requests

  ACCESS_GRANT { uuid id PK; uuid household_id FK; uuid membership_id FK; text scope_type; uuid scope_id; text capability; text max_sensitivity; text effect; uuid granted_by FK; timestamptz expires_at }
  DOMAIN_EVENT { bigserial seq PK; uuid id UK; uuid household_id FK; text event_type; text subject_type; uuid subject_id; uuid actor_membership_id FK; text actor_kind; jsonb payload; jsonb before; jsonb after; uuid correlation_id; uuid causation_id; timestamptz occurred_at }
  AUDIT_EVENT { bigserial seq PK; uuid id UK; uuid household_id; uuid user_id; text action; text outcome; text subject_type; uuid subject_id; inet ip_hash; text user_agent_hash; jsonb metadata; timestamptz occurred_at }
  OUTBOX_EVENT { uuid id PK; uuid household_id FK; text topic; jsonb payload; text state; int attempt_count; timestamptz available_at; timestamptz published_at; text last_error }
  IDEMPOTENCY_KEY { text key PK; uuid household_id; uuid user_id; text request_hash; int status_code; jsonb response_body; timestamptz created_at; timestamptz expires_at }
  EXPORT_JOB { uuid id PK; uuid household_id FK; uuid requested_by FK; text scope; text state; text storage_ref; text checksum; timestamptz expires_at }
  DELETION_REQUEST { uuid id PK; uuid household_id FK; uuid requested_by FK; text scope; uuid subject_id; text state; text mode; timestamptz execute_after; timestamptz executed_at }
```

`AUDIT_EVENT` liegt bewusst **ohne** FK auf `household` und ohne RLS-Kopplung an fachliche Daten:
Es muss auch nach einer Household-Löschung auswertbar bleiben (→ [11-audit-history](11-audit-history.md)).

## Zentrale Constraints

| Constraint | Zweck | Invariante |
|---|---|---|
| `UNIQUE (household_id, domain_id) WHERE assignment_kind='primary_owner' AND effective_to IS NULL` | Genau ein Primary Owner | §7.4 |
| `EXCLUDE USING gist (domain_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE state='active'` auf `TEMPORARY_COVERAGE` | Keine überlappenden Vertretungen | INV-003 |
| `UNIQUE (household_id, dedupe_key) WHERE superseded_at IS NULL` auf `SIGNAL` | Monitoring-Idempotenz | §11 |
| `UNIQUE (connection_id, external_calendar_id, external_id, coalesce(recurrence_id,''))` | Kalender-Sync-Idempotenz | §14.4 |
| `UNIQUE (household_id, state_definition_id)` auf `STATE_VALUE` | Genau ein aktueller Wert | §9 |
| `CHECK (value_kind <> 'known' OR value IS NOT NULL)` | `unknown` ≠ `null` | INV-010 |
| `CHECK (parent_id IS NULL OR parent_id <> id)` + Trigger gegen Zyklen | Domainbaum azyklisch | §8 |
| `UNIQUE (notification_id, channel)` | Keine Doppelzustellung je Kanal | §28.2 |
| FK `ON DELETE RESTRICT` für alles unter `DOMAIN` | Kein stiller Verlust | INV-001 |
