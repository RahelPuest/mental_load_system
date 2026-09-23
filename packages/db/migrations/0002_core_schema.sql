-- 0002 – Kernschema
-- Konventionen (docs/02-er-model.md):
--   * jede fachliche Tabelle trägt household_id (Tenant-Diskriminator, RLS-Anker)
--   * Aufzählungen sind text + CHECK (ADR-0013), nie Postgres-Enums
--   * mutierbare Aggregate tragen version (Optimistic Locking)
--   * erzeugbare Objekte tragen origin/origin_ref/confirmed_* (INV-004)
--   * unterhalb von domain gilt ON DELETE RESTRICT (INV-001 – kein stiller Verlust)
SET lock_timeout = '3s';
SET statement_timeout = '300s';

/* ══ Identity & Tenancy ═══════════════════════════════════════════════ */

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext NOT NULL,
  password_hash  text NOT NULL,
  display_name   text NOT NULL,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deactivated','pending_deletion','purged')),
  locale         text NOT NULL DEFAULT 'de-DE',
  last_login_at  timestamptz,
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uk ON users (email) WHERE deleted_at IS NULL;

CREATE TABLE user_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Nur der Hash wird gespeichert; das Token selbst verlässt den Server einmalig.
  refresh_token_hash text NOT NULL,
  family_id          uuid NOT NULL,
  user_agent_hash    text,
  ip_hash            text,
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  revoked_reason     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_used_at       timestamptz
);
CREATE UNIQUE INDEX user_sessions_token_uk ON user_sessions (refresh_token_hash);
CREATE INDEX user_sessions_user_idx ON user_sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX user_sessions_family_idx ON user_sessions (family_id);

CREATE TABLE password_reset_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE households (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  timezone     text NOT NULL DEFAULT 'Europe/Berlin',
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending_deletion','purged')),
  -- §23.5: Push-/E-Mail-Inhalte können auf reine Zählangaben reduziert werden.
  notification_content_level text NOT NULL DEFAULT 'minimal' CHECK (notification_content_level IN ('minimal','titles')),
  -- §32/ADR-0012: Die Balance-Ansicht ist bewusst opt-in.
  balance_view_enabled boolean NOT NULL DEFAULT false,
  purge_after  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      integer NOT NULL DEFAULT 1
);

CREATE TABLE persons (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  display_name        text NOT NULL,
  person_kind         text NOT NULL CHECK (person_kind IN ('adult_member','child','dependent','caregiver','external')),
  birth_date          date,
  sensitivity_default text NOT NULL DEFAULT 'normal' CHECK (sensitivity_default IN ('public','normal','private','health','sensitive')),
  note                text,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  version             integer NOT NULL DEFAULT 1
);
CREATE INDEX persons_household_idx ON persons (household_id) WHERE deleted_at IS NULL;

CREATE TABLE household_memberships (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id           uuid REFERENCES users(id) ON DELETE SET NULL,
  linked_person_id  uuid REFERENCES persons(id) ON DELETE SET NULL,
  display_name      text NOT NULL,
  role              text NOT NULL CHECK (role IN ('admin','adult','caregiver','teen','child','guest')),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended','left')),
  expires_at        timestamptz,
  joined_at         timestamptz NOT NULL DEFAULT now(),
  left_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           integer NOT NULL DEFAULT 1,
  -- §4 Guest: befristeter Zugang ist Pflicht
  CONSTRAINT guest_requires_expiry CHECK (role <> 'guest' OR expires_at IS NOT NULL)
);
CREATE UNIQUE INDEX memberships_user_household_uk ON household_memberships (household_id, user_id)
  WHERE user_id IS NOT NULL AND status <> 'left';
CREATE INDEX memberships_household_idx ON household_memberships (household_id);
CREATE INDEX memberships_user_idx ON household_memberships (user_id) WHERE status = 'active';

CREATE TABLE invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email        citext NOT NULL,
  role         text NOT NULL CHECK (role IN ('admin','adult','caregiver','teen','child','guest')),
  token_hash   text NOT NULL UNIQUE,
  invited_by   uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE access_grants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  membership_id   uuid NOT NULL REFERENCES household_memberships(id) ON DELETE CASCADE,
  scope_type      text NOT NULL CHECK (scope_type IN ('household','domain','object')),
  scope_id        uuid,
  capability      text NOT NULL,
  max_sensitivity text NOT NULL DEFAULT 'normal' CHECK (max_sensitivity IN ('public','normal','private','health','sensitive')),
  effect          text NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  granted_by      uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  reason          text,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scope_id_required CHECK (scope_type = 'household' OR scope_id IS NOT NULL)
);
CREATE INDEX grants_lookup_idx ON access_grants (household_id, membership_id, capability) WHERE revoked_at IS NULL;

/* ══ Responsibility ═══════════════════════════════════════════════════ */

CREATE TABLE domains (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id           uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  parent_id              uuid REFERENCES domains(id) ON DELETE RESTRICT,
  path                   ltree NOT NULL,
  name                   text NOT NULL,
  slug                   text NOT NULL,
  description            text,
  subject_person_id      uuid REFERENCES persons(id) ON DELETE SET NULL,
  -- Q-04: Vererbung ist explizit, nie implizit.
  ownership_inheritance  text NOT NULL DEFAULT 'inherit' CHECK (ownership_inheritance IN ('inherit','own')),
  criticality            text NOT NULL DEFAULT 'normal' CHECK (criticality IN ('low','normal','high','critical')),
  sensitivity            text NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('public','normal','private','health','sensitive')),
  position               integer NOT NULL DEFAULT 0,
  archived_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  version                integer NOT NULL DEFAULT 1,
  CONSTRAINT domain_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE UNIQUE INDEX domains_path_uk ON domains (household_id, path);
CREATE INDEX domains_path_gist ON domains USING gist (path);
CREATE INDEX domains_household_idx ON domains (household_id) WHERE archived_at IS NULL;
CREATE INDEX domains_subject_idx ON domains (subject_person_id);

CREATE TABLE responsibility_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  domain_id       uuid NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
  membership_id   uuid NOT NULL REFERENCES household_memberships(id) ON DELETE RESTRICT,
  assignment_kind text NOT NULL CHECK (assignment_kind IN ('primary_owner','secondary_owner','shared_owner','support','observer')),
  -- Bitemporal (ADR-0009): Zeilen werden nie gelöscht, nur beendet.
  effective_from  timestamptz NOT NULL DEFAULT now(),
  effective_to    timestamptz,
  assigned_by     uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  note            text,
  end_reason      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- §7.4: höchstens eine aktive Hauptverantwortung je Bereich
CREATE UNIQUE INDEX assignments_primary_owner_uk ON responsibility_assignments (domain_id)
  WHERE assignment_kind = 'primary_owner' AND effective_to IS NULL;
CREATE UNIQUE INDEX assignments_unique_active_uk ON responsibility_assignments (domain_id, membership_id, assignment_kind)
  WHERE effective_to IS NULL;
CREATE INDEX assignments_domain_idx ON responsibility_assignments (household_id, domain_id) WHERE effective_to IS NULL;
CREATE INDEX assignments_membership_idx ON responsibility_assignments (household_id, membership_id) WHERE effective_to IS NULL;

CREATE TABLE temporary_coverages (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id            uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  domain_id               uuid NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
  covering_membership_id  uuid NOT NULL REFERENCES household_memberships(id) ON DELETE RESTRICT,
  original_membership_id  uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  starts_at               timestamptz NOT NULL,
  ends_at                 timestamptz NOT NULL,
  return_mode             text NOT NULL DEFAULT 'require_confirmation' CHECK (return_mode IN ('auto_return','require_confirmation')),
  state                   text NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled','active','pending_return','returned','cancelled')),
  reason_category         text NOT NULL DEFAULT 'unspecified' CHECK (reason_category IN ('unspecified','health','workload','travel','care','rest')),
  note                    text,
  created_by              uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  returned_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  version                 integer NOT NULL DEFAULT 1,
  CONSTRAINT coverage_period CHECK (ends_at > starts_at)
);
-- Keine überlappenden aktiven Vertretungen für denselben Bereich (INV-003).
ALTER TABLE temporary_coverages ADD CONSTRAINT coverage_no_overlap
  EXCLUDE USING gist (domain_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (state IN ('scheduled','active','pending_return'));
CREATE INDEX coverage_due_idx ON temporary_coverages (state, starts_at, ends_at);

CREATE TABLE capacity_states (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id             uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  membership_id            uuid NOT NULL REFERENCES household_memberships(id) ON DELETE CASCADE,
  level                    text NOT NULL CHECK (level IN ('normal','reduced','minimal','paused')),
  accepts_new_assignments  boolean NOT NULL DEFAULT true,
  critical_only            boolean NOT NULL DEFAULT false,
  mute_push                boolean NOT NULL DEFAULT false,
  -- Q-13: bewusst grob. Es wird kein medizinischer Grund gespeichert.
  reason_category          text NOT NULL DEFAULT 'unspecified' CHECK (reason_category IN ('unspecified','health','workload','travel','care','rest')),
  note                     text,
  starts_at                timestamptz NOT NULL DEFAULT now(),
  ends_at                  timestamptz,
  cleared_at               timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  version                  integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX capacity_active_uk ON capacity_states (membership_id) WHERE cleared_at IS NULL;

/* ══ Knowledge & State ════════════════════════════════════════════════ */

CREATE TABLE state_definitions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id       uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  domain_id          uuid NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
  key                text NOT NULL,
  label              text NOT NULL,
  description        text,
  data_type          text NOT NULL CHECK (data_type IN ('text','number','date','boolean','enum','person','document','link','json')),
  options            jsonb,
  unit               text,
  freshness_interval interval,
  conflict_window    interval NOT NULL DEFAULT '24 hours',
  is_critical        boolean NOT NULL DEFAULT false,
  sensitivity        text NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('public','normal','private','health','sensitive')),
  archived_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  version            integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX state_definitions_key_uk ON state_definitions (domain_id, key);
CREATE INDEX state_definitions_domain_idx ON state_definitions (household_id, domain_id) WHERE archived_at IS NULL;

CREATE TABLE state_values (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  state_definition_id  uuid NOT NULL REFERENCES state_definitions(id) ON DELETE RESTRICT,
  -- INV-010: 'unknown' ist ein eigener Zustand, nicht NULL.
  value_kind           text NOT NULL CHECK (value_kind IN ('known','unknown','not_applicable')),
  value                jsonb,
  verified_at          timestamptz,
  stale_at             timestamptz,
  origin               text NOT NULL DEFAULT 'human' CHECK (origin IN ('human','system_rule','integration','inference')),
  origin_ref           text,
  confidence           text NOT NULL DEFAULT 'confirmed' CHECK (confidence IN ('confirmed','probable','uncertain')),
  observed_by          uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  confirmed_by         uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  confirmed_at         timestamptz,
  conflict_state       text NOT NULL DEFAULT 'none' CHECK (conflict_state IN ('none','unresolved','resolved_manual','resolved_by_priority')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  version              integer NOT NULL DEFAULT 1,
  CONSTRAINT known_requires_value CHECK (value_kind <> 'known' OR value IS NOT NULL)
);
CREATE UNIQUE INDEX state_values_definition_uk ON state_values (state_definition_id);
CREATE INDEX state_values_stale_idx ON state_values (household_id, stale_at) WHERE stale_at IS NOT NULL;
CREATE INDEX state_values_conflict_idx ON state_values (household_id) WHERE conflict_state = 'unresolved';

-- Append-only: die eigentliche Wahrheit über den Verlauf (§9, ADR-0009).
CREATE TABLE state_observations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  state_definition_id  uuid NOT NULL REFERENCES state_definitions(id) ON DELETE RESTRICT,
  value_kind           text NOT NULL CHECK (value_kind IN ('known','unknown','not_applicable')),
  value                jsonb,
  observed_at          timestamptz NOT NULL DEFAULT now(),
  origin               text NOT NULL CHECK (origin IN ('human','system_rule','integration','inference')),
  origin_ref           text,
  observed_by          uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  applied              boolean NOT NULL DEFAULT true,
  resolution_rule      text NOT NULL,
  conflict_state       text NOT NULL DEFAULT 'none' CHECK (conflict_state IN ('none','unresolved','resolved_manual','resolved_by_priority')),
  supersedes_id        uuid REFERENCES state_observations(id) ON DELETE SET NULL,
  note                 text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX state_observations_def_idx ON state_observations (state_definition_id, observed_at DESC);
CREATE INDEX state_observations_conflict_idx ON state_observations (household_id, state_definition_id) WHERE conflict_state = 'unresolved';

CREATE TABLE knowledge_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  domain_id     uuid REFERENCES domains(id) ON DELETE RESTRICT,
  person_id     uuid REFERENCES persons(id) ON DELETE SET NULL,
  process_id    uuid,
  scope         text NOT NULL DEFAULT 'domain' CHECK (scope IN ('person','domain','household','process','playbook')),
  kind          text NOT NULL DEFAULT 'fact' CHECK (kind IN ('fact','how_to','preference','experience','rule','pitfall','link','note')),
  title         text NOT NULL,
  body          text NOT NULL DEFAULT '',
  sensitivity   text NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('public','normal','private','health','sensitive')),
  origin        text NOT NULL DEFAULT 'human' CHECK (origin IN ('human','system_rule','integration','inference')),
  origin_ref    text,
  created_by    uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  confirmed_by  uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  confirmed_at  timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       integer NOT NULL DEFAULT 1
);
CREATE INDEX knowledge_domain_idx ON knowledge_items (household_id, domain_id) WHERE deleted_at IS NULL;

CREATE TABLE questions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  domain_id            uuid REFERENCES domains(id) ON DELETE RESTRICT,
  body                 text NOT NULL,
  state                text NOT NULL DEFAULT 'open' CHECK (state IN ('open','answered','knowledge_captured','closed')),
  asked_by             uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  directed_to          uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  answer_body          text,
  answered_by          uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  answered_at          timestamptz,
  answer_knowledge_id  uuid REFERENCES knowledge_items(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  version              integer NOT NULL DEFAULT 1
);
CREATE INDEX questions_open_idx ON questions (household_id, state) WHERE state = 'open';

CREATE TABLE decisions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  domain_id     uuid REFERENCES domains(id) ON DELETE RESTRICT,
  title         text NOT NULL,
  body          text NOT NULL DEFAULT '',
  decision_kind text NOT NULL CHECK (decision_kind IN ('personal_preference','family_decision','hard_rule','guideline','exception')),
  binding_level text NOT NULL DEFAULT 'orientation' CHECK (binding_level IN ('orientation','strong','binding')),
  decided_by    uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  decided_at    timestamptz NOT NULL DEFAULT now(),
  review_after  timestamptz,
  supersedes_id uuid REFERENCES decisions(id) ON DELETE SET NULL,
  superseded_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       integer NOT NULL DEFAULT 1
);
CREATE INDEX decisions_domain_idx ON decisions (household_id, domain_id) WHERE superseded_at IS NULL;

/* ══ Attention ════════════════════════════════════════════════════════ */

CREATE TABLE monitors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  domain_id           uuid NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
  state_definition_id uuid REFERENCES state_definitions(id) ON DELETE CASCADE,
  name                text NOT NULL,
  rule_kind           text NOT NULL CHECK (rule_kind IN ('state_freshness','state_unknown','state_threshold','schedule','seasonal','lead_time_before_event','date_field_lead_time','absence','dependency_recheck')),
  config              jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- §6/Q-09: 'create_task' ist Autonomiestufe A2 und braucht eine aktivierte Regel.
  default_response    text NOT NULL DEFAULT 'attention_item' CHECK (default_response IN ('attention_item','create_task')),
  automation_rule_id  uuid,
  enabled             boolean NOT NULL DEFAULT true,
  origin              text NOT NULL DEFAULT 'human' CHECK (origin IN ('human','system_rule','integration','inference')),
  created_by          uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  last_evaluated_at   timestamptz,
  next_evaluation_at  timestamptz NOT NULL DEFAULT now(),
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  version             integer NOT NULL DEFAULT 1
);
-- Scanner-Index: fällige Arbeit statt aller Haushalte (docs/10 §Scheduling)
CREATE INDEX monitors_due_idx ON monitors (next_evaluation_at) WHERE enabled = true;
CREATE INDEX monitors_domain_idx ON monitors (household_id, domain_id);

CREATE TABLE monitor_suppressions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  monitor_id     uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  bucket_pattern text NOT NULL,
  reason         text NOT NULL,
  created_by     uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  until          timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX monitor_suppressions_idx ON monitor_suppressions (monitor_id);

-- Unveränderlich. Nutzeraktionen wirken auf attention_items, nie hier (ADR-0004).
CREATE TABLE signals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  monitor_id    uuid REFERENCES monitors(id) ON DELETE SET NULL,
  domain_id     uuid NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
  signal_kind   text NOT NULL,
  severity      text NOT NULL DEFAULT 'notice' CHECK (severity IN ('info','notice','important','critical')),
  dedupe_key    text NOT NULL,
  bucket        text NOT NULL,
  evidence      jsonb NOT NULL,
  detected_at   timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- §7.2: Begründungspflicht strukturell erzwungen (INV-008)
  CONSTRAINT signal_requires_rationale CHECK (evidence ? 'rationale' AND length(evidence->>'rationale') > 10)
);
-- Idempotenz-Anker der gesamten Monitoring-Pipeline (§11)
CREATE UNIQUE INDEX signals_dedupe_uk ON signals (household_id, dedupe_key)
  WHERE superseded_at IS NULL AND resolved_at IS NULL;
CREATE INDEX signals_domain_idx ON signals (household_id, domain_id, signal_kind);
CREATE INDEX signals_bucket_idx ON signals (monitor_id, bucket);

CREATE TABLE attention_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  domain_id      uuid NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
  signal_kind    text NOT NULL,
  title          text NOT NULL,
  -- INV-008: ohne Begründung existiert kein Aufmerksamkeitseintrag
  why_now        text NOT NULL CHECK (length(why_now) > 10),
  if_it_waits    text NOT NULL DEFAULT '',
  state          text NOT NULL DEFAULT 'open' CHECK (state IN ('open','acknowledged','snoozed','dismissed','irrelevant','converted','obsolete')),
  severity       text NOT NULL DEFAULT 'notice' CHECK (severity IN ('info','notice','important','critical')),
  snoozed_until  timestamptz,
  resolved_by    uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  resolved_at    timestamptz,
  resolution_note text,
  process_id     uuid,
  origin         text NOT NULL DEFAULT 'system_rule' CHECK (origin IN ('human','system_rule','integration','inference')),
  origin_ref     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  version        integer NOT NULL DEFAULT 1
);
-- Bündelung je (Bereich, Signalart): zehn Belege ⇒ ein Eintrag (§4)
CREATE UNIQUE INDEX attention_open_uk ON attention_items (household_id, domain_id, signal_kind)
  WHERE state IN ('open','acknowledged','snoozed');
CREATE INDEX attention_state_idx ON attention_items (household_id, state);
CREATE INDEX attention_snooze_idx ON attention_items (snoozed_until) WHERE state = 'snoozed';

CREATE TABLE attention_item_signals (
  attention_item_id uuid NOT NULL REFERENCES attention_items(id) ON DELETE CASCADE,
  signal_id         uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  household_id      uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  attached_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attention_item_id, signal_id)
);

CREATE TABLE needs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  domain_id         uuid NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
  subject_person_id uuid REFERENCES persons(id) ON DELETE SET NULL,
  description       text NOT NULL,
  state             text NOT NULL DEFAULT 'open' CHECK (state IN ('open','met','dropped')),
  criticality       text NOT NULL DEFAULT 'normal' CHECK (criticality IN ('low','normal','high','critical')),
  needed_by         timestamptz,
  attention_item_id uuid REFERENCES attention_items(id) ON DELETE SET NULL,
  process_id        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           integer NOT NULL DEFAULT 1
);
CREATE INDEX needs_open_idx ON needs (household_id, state) WHERE state = 'open';

/* ══ Work ═════════════════════════════════════════════════════════════ */

CREATE TABLE automation_rules (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id       uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name               text NOT NULL,
  operation          text NOT NULL,
  enabled            boolean NOT NULL DEFAULT true,
  config             jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- ADR-0008: A2 verlangt einen menschlichen Urheber und eine Begründungsvorlage.
  rationale_template text NOT NULL,
  created_by         uuid NOT NULL REFERENCES household_memberships(id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  version            integer NOT NULL DEFAULT 1
);

CREATE TABLE playbooks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  domain_id           uuid REFERENCES domains(id) ON DELETE RESTRICT,
  title               text NOT NULL,
  trigger_description text NOT NULL DEFAULT '',
  scope               text NOT NULL DEFAULT 'household' CHECK (scope IN ('household','domain')),
  archived_at         timestamptz,
  created_by          uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  version             integer NOT NULL DEFAULT 1
);

CREATE TABLE playbook_steps (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  playbook_id          uuid NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  position             integer NOT NULL,
  title                text NOT NULL,
  description          text,
  estimated_minutes    integer,
  mental_energy        text NOT NULL DEFAULT 'medium' CHECK (mental_energy IN ('low','medium','high')),
  context_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  branch_condition     text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX playbook_steps_position_uk ON playbook_steps (playbook_id, position);

CREATE TABLE processes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  domain_id           uuid NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
  playbook_id         uuid REFERENCES playbooks(id) ON DELETE SET NULL,
  attention_item_id   uuid REFERENCES attention_items(id) ON DELETE SET NULL,
  title               text NOT NULL,
  goal                text,
  state               text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','active','paused','blocked','completed','abandoned')),
  outcome             text CHECK (outcome IS NULL OR outcome IN ('achieved','no_longer_needed','replaced','abandoned')),
  outcome_reason      text,
  learnings           text,
  owner_membership_id uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  due_at              timestamptz,
  completed_at        timestamptz,
  origin              text NOT NULL DEFAULT 'human' CHECK (origin IN ('human','system_rule','integration','inference')),
  origin_ref          text,
  created_by          uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  version             integer NOT NULL DEFAULT 1,
  CONSTRAINT completed_requires_outcome CHECK (state <> 'completed' OR outcome IS NOT NULL)
);
CREATE INDEX processes_domain_idx ON processes (household_id, domain_id, state);
CREATE INDEX processes_active_idx ON processes (household_id) WHERE state = 'active';

ALTER TABLE attention_items ADD CONSTRAINT attention_process_fk
  FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE SET NULL;
ALTER TABLE needs ADD CONSTRAINT needs_process_fk
  FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE SET NULL;
ALTER TABLE knowledge_items ADD CONSTRAINT knowledge_process_fk
  FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE SET NULL;
ALTER TABLE monitors ADD CONSTRAINT monitors_automation_rule_fk
  FOREIGN KEY (automation_rule_id) REFERENCES automation_rules(id) ON DELETE SET NULL;

CREATE TABLE tasks (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id           uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  domain_id              uuid REFERENCES domains(id) ON DELETE RESTRICT,
  process_id             uuid REFERENCES processes(id) ON DELETE RESTRICT,
  title                  text NOT NULL,
  description            text,
  state                  text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','ready','in_progress','blocked','waiting','deferred','done','dropped','superseded')),
  position               integer NOT NULL DEFAULT 0,
  assignee_membership_id uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  delegated_by           uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  -- INV-002: Delegation ist ein Attribut der Aufgabe, nie eine Ownership-Änderung.
  delegation_kind        text NOT NULL DEFAULT 'none' CHECK (delegation_kind IN ('none','delegated','transferred','shared','support_requested')),
  due_at                 timestamptz,
  defer_until            timestamptz,
  estimated_minutes      integer CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  mental_energy          text NOT NULL DEFAULT 'medium' CHECK (mental_energy IN ('low','medium','high')),
  physical_energy        text NOT NULL DEFAULT 'low' CHECK (physical_energy IN ('low','medium','high')),
  focus_required         text NOT NULL DEFAULT 'medium' CHECK (focus_required IN ('low','medium','high')),
  social_load            text NOT NULL DEFAULT 'low' CHECK (social_load IN ('low','medium','high')),
  origin                 text NOT NULL DEFAULT 'human' CHECK (origin IN ('human','system_rule','integration','inference')),
  origin_ref             text,
  rationale              text,
  -- §29: der ursprüngliche Zeitpunkt bleibt erhalten, auch wenn er vorbei ist (INV-001)
  overdue_since          timestamptz,
  last_reassessed_at     timestamptz,
  completed_at           timestamptz,
  completion_note        text,
  drop_reason            text,
  created_by             uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  version                integer NOT NULL DEFAULT 1,
  CONSTRAINT drop_requires_reason CHECK (state <> 'dropped' OR drop_reason IS NOT NULL),
  CONSTRAINT automatic_requires_rationale CHECK (origin = 'human' OR rationale IS NOT NULL)
);
CREATE INDEX tasks_open_idx ON tasks (household_id, state) WHERE state IN ('draft','ready','in_progress','blocked','waiting','deferred');
CREATE INDEX tasks_process_idx ON tasks (process_id, position);
CREATE INDEX tasks_assignee_idx ON tasks (household_id, assignee_membership_id) WHERE state IN ('ready','in_progress');
CREATE INDEX tasks_defer_idx ON tasks (defer_until) WHERE state = 'deferred';
CREATE INDEX tasks_due_idx ON tasks (due_at) WHERE state IN ('ready','in_progress','blocked','waiting','deferred');

CREATE TABLE task_dependencies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  task_id             uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id  uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_kind     text NOT NULL DEFAULT 'finish_to_start' CHECK (dependency_kind IN ('finish_to_start','informational')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_dependency CHECK (task_id <> depends_on_task_id)
);
CREATE UNIQUE INDEX task_dependencies_uk ON task_dependencies (task_id, depends_on_task_id);

CREATE TABLE context_tags (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  key          text NOT NULL,
  label        text NOT NULL,
  tag_kind     text NOT NULL CHECK (tag_kind IN ('location','person','tool','time','mode')),
  person_id    uuid REFERENCES persons(id) ON DELETE CASCADE,
  is_system    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX context_tags_key_uk ON context_tags (household_id, key);

CREATE TABLE task_context_requirements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  task_id         uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  context_tag_id  uuid NOT NULL REFERENCES context_tags(id) ON DELETE CASCADE,
  strength        text NOT NULL DEFAULT 'required' CHECK (strength IN ('required','helpful','preferred')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX task_context_uk ON task_context_requirements (task_id, context_tag_id);

CREATE TABLE waiting_states (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id            uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  task_id                 uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  waiting_kind            text NOT NULL CHECK (waiting_kind IN ('date','person','external_party','delivery','event','task','calendar_event','manual_release')),
  waiting_on_membership_id uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  external_party          text,
  description             text NOT NULL,
  recheck_at              timestamptz NOT NULL,
  released_at             timestamptz,
  release_reason          text,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX waiting_recheck_idx ON waiting_states (recheck_at) WHERE released_at IS NULL;
CREATE UNIQUE INDEX waiting_task_uk ON waiting_states (task_id) WHERE released_at IS NULL;

/* ══ Intake ═══════════════════════════════════════════════════════════ */

CREATE TABLE inbox_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_by           uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  raw_text             text NOT NULL,
  source               text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','calendar','notification','integration','system')),
  source_ref           jsonb,
  state                text NOT NULL DEFAULT 'captured' CHECK (state IN ('captured','suggested','processed','discarded')),
  suggestion           jsonb,
  resulting_object_type text,
  resulting_object_id   uuid,
  discard_reason       text,
  occurred_at          timestamptz NOT NULL DEFAULT now(),
  processed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  version              integer NOT NULL DEFAULT 1,
  CONSTRAINT processed_requires_target CHECK (state <> 'processed' OR resulting_object_type IS NOT NULL),
  CONSTRAINT discarded_requires_reason CHECK (state <> 'discarded' OR discard_reason IS NOT NULL)
);
CREATE INDEX inbox_open_idx ON inbox_items (household_id, state) WHERE state IN ('captured','suggested');

/* ══ Integration ══════════════════════════════════════════════════════ */

CREATE TABLE calendar_connections (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id           uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  membership_id          uuid NOT NULL REFERENCES household_memberships(id) ON DELETE CASCADE,
  provider               text NOT NULL CHECK (provider IN ('ics','caldav','google')),
  display_name           text NOT NULL,
  -- AES-256-GCM, Schlüssel-ID separat für Rotation ohne Neuverschlüsselung (§22.9)
  credentials_ciphertext bytea,
  credentials_key_id     text,
  state                  text NOT NULL DEFAULT 'pending_auth' CHECK (state IN ('pending_auth','active','degraded','needs_reauth','disconnected','revoked')),
  sync_token             text,
  last_sync_at           timestamptz,
  last_error_code        text,
  consecutive_failures   integer NOT NULL DEFAULT 0,
  next_sync_at           timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  version                integer NOT NULL DEFAULT 1
);
CREATE INDEX calendar_connections_due_idx ON calendar_connections (next_sync_at)
  WHERE state IN ('active','degraded');

CREATE TABLE calendar_selections (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  connection_id        uuid NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
  external_calendar_id text NOT NULL,
  display_name         text NOT NULL DEFAULT '',
  read_enabled         boolean NOT NULL DEFAULT true,
  write_enabled        boolean NOT NULL DEFAULT false,
  -- §22.8: Termininhalte anderer sind per Default verborgen.
  share_level          text NOT NULL DEFAULT 'busy' CHECK (share_level IN ('none','busy','title','full')),
  sync_cursor          text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX calendar_selections_uk ON calendar_selections (connection_id, external_calendar_id);

CREATE TABLE calendar_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  connection_id        uuid NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
  external_calendar_id text NOT NULL,
  external_id          text NOT NULL,
  -- '' für den Serien-Master, RECURRENCE-ID für abweichende Einzelinstanzen (§22.2)
  recurrence_id        text NOT NULL DEFAULT '',
  etag                 text,
  sequence             integer NOT NULL DEFAULT 0,
  title                text NOT NULL DEFAULT '',
  location             text,
  description          text,
  starts_at            timestamptz NOT NULL,
  ends_at              timestamptz NOT NULL,
  time_zone            text NOT NULL DEFAULT 'UTC',
  all_day              boolean NOT NULL DEFAULT false,
  rrule                text,
  exdates              text[],
  state                text NOT NULL DEFAULT 'confirmed' CHECK (state IN ('confirmed','tentative','cancelled')),
  -- Menschliche Zuordnung gewinnt immer gegen die automatische (§9 K4)
  linked_domain_id     uuid REFERENCES domains(id) ON DELETE SET NULL,
  link_origin          text NOT NULL DEFAULT 'inference' CHECK (link_origin IN ('human','system_rule','integration','inference')),
  -- Kennzeichnet vom System selbst geschriebene Blöcke (Schleifenschutz, §22.7)
  created_by_system    boolean NOT NULL DEFAULT false,
  linked_process_id    uuid REFERENCES processes(id) ON DELETE SET NULL,
  last_seen_at         timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  version              integer NOT NULL DEFAULT 1
);
-- Idempotenz des Kalender-Syncs (§14.4)
CREATE UNIQUE INDEX calendar_events_external_uk
  ON calendar_events (connection_id, external_calendar_id, external_id, recurrence_id);
CREATE INDEX calendar_events_window_idx ON calendar_events (household_id, starts_at, ends_at) WHERE state <> 'cancelled';
CREATE INDEX calendar_events_domain_idx ON calendar_events (linked_domain_id) WHERE linked_domain_id IS NOT NULL;

/* ══ Delivery ═════════════════════════════════════════════════════════ */

CREATE TABLE notifications (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id            uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  recipient_membership_id uuid NOT NULL REFERENCES household_memberships(id) ON DELETE CASCADE,
  notification_kind       text NOT NULL,
  priority                text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  title                   text NOT NULL,
  body                    text NOT NULL DEFAULT '',
  payload                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  subject_type            text,
  subject_id              uuid,
  dedupe_key              text NOT NULL,
  bundle_after            timestamptz,
  state                   text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','dispatched','suppressed','closed')),
  suppressed_reason       text,
  read_at                 timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX notifications_dedupe_uk ON notifications (household_id, recipient_membership_id, dedupe_key)
  WHERE state IN ('pending','dispatched');
CREATE INDEX notifications_recipient_idx ON notifications (household_id, recipient_membership_id, created_at DESC);
CREATE INDEX notifications_bundle_idx ON notifications (bundle_after) WHERE state = 'pending';

CREATE TABLE notification_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel         text NOT NULL CHECK (channel IN ('in_app','push','email','calendar')),
  state           text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','sent','delivered','failed','suppressed','acknowledged')),
  attempt_count   integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  failure_code    text,
  failure_detail  text,
  sent_at         timestamptz,
  delivered_at    timestamptz,
  acknowledged_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX deliveries_channel_uk ON notification_deliveries (notification_id, channel);
CREATE INDEX deliveries_due_idx ON notification_deliveries (next_attempt_at) WHERE state = 'queued';

CREATE TABLE notification_preferences (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  membership_id     uuid NOT NULL REFERENCES household_memberships(id) ON DELETE CASCADE,
  notification_kind text NOT NULL,
  priority_floor    text NOT NULL DEFAULT 'low' CHECK (priority_floor IN ('low','normal','high','critical')),
  channels          jsonb NOT NULL DEFAULT '["in_app"]'::jsonb,
  quiet_hours       jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX notification_prefs_uk ON notification_preferences (membership_id, notification_kind);

CREATE TABLE push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  membership_id   uuid NOT NULL REFERENCES household_memberships(id) ON DELETE CASCADE,
  endpoint        text NOT NULL,
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  user_agent_hash text,
  last_success_at timestamptz,
  disabled_at     timestamptz,
  disabled_reason text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX push_subscriptions_endpoint_uk ON push_subscriptions (endpoint);

/* ══ Ledger & Governance ══════════════════════════════════════════════ */

CREATE TABLE domain_events (
  seq                 bigserial PRIMARY KEY,
  id                  uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  event_type          text NOT NULL,
  event_version       integer NOT NULL DEFAULT 1,
  subject_type        text NOT NULL,
  subject_id          uuid,
  actor_kind          text NOT NULL CHECK (actor_kind IN ('user','system','integration')),
  actor_membership_id uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  actor_ref           text,
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  before              jsonb,
  after               jsonb,
  correlation_id      uuid NOT NULL,
  causation_id        uuid,
  occurred_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX domain_events_subject_idx ON domain_events (household_id, subject_type, subject_id, occurred_at DESC);
CREATE INDEX domain_events_household_idx ON domain_events (household_id, occurred_at DESC);
CREATE INDEX domain_events_correlation_idx ON domain_events (correlation_id);

-- Ohne FK auf households: muss eine Haushaltslöschung überleben (docs/11 §1).
CREATE TABLE audit_events (
  seq             bigserial PRIMARY KEY,
  id              uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  household_id    uuid,
  user_id         uuid,
  membership_id   uuid,
  action          text NOT NULL,
  outcome         text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','failure','denied')),
  subject_type    text,
  subject_id      uuid,
  ip_hash         text,
  user_agent_hash text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash       text,
  row_hash        text NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_household_idx ON audit_events (household_id, occurred_at DESC);
CREATE INDEX audit_events_action_idx ON audit_events (action, occurred_at DESC);

CREATE TABLE outbox_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  event_id       uuid NOT NULL,
  topic          text NOT NULL,
  payload        jsonb NOT NULL,
  state          text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','published','dead')),
  attempt_count  integer NOT NULL DEFAULT 0,
  available_at   timestamptz NOT NULL DEFAULT now(),
  published_at   timestamptz,
  last_error     text,
  correlation_id uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending_idx ON outbox_events (available_at) WHERE state = 'pending';

CREATE TABLE processed_events (
  consumer_name text NOT NULL,
  event_id      text NOT NULL,
  processed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_name, event_id)
);

CREATE TABLE idempotency_keys (
  key           text PRIMARY KEY,
  household_id  uuid,
  user_id       uuid,
  request_hash  text NOT NULL,
  status_code   integer,
  response_body jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);
CREATE INDEX idempotency_expiry_idx ON idempotency_keys (expires_at);

CREATE TABLE export_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  scope        text NOT NULL DEFAULT 'household' CHECK (scope IN ('household','me')),
  state        text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','ready','failed','expired','downloaded')),
  storage_ref  text,
  checksum     text,
  size_bytes   bigint,
  error        text,
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE deletion_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  requested_by  uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  scope         text NOT NULL CHECK (scope IN ('household','person','user','object')),
  subject_type  text,
  subject_id    uuid,
  mode          text NOT NULL DEFAULT 'soft' CHECK (mode IN ('soft','hard')),
  state         text NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled','cancelled','running','executed','failed')),
  phase         text,
  execute_after timestamptz NOT NULL,
  executed_at   timestamptz,
  cancelled_at  timestamptz,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deletion_due_idx ON deletion_requests (execute_after) WHERE state = 'scheduled';

-- Ohne FK, ohne Inhalte: erlaubt es, eine Löschung nach einem Restore erneut anzuwenden
-- (docs/29 §3, Schritt 4).
CREATE TABLE deletion_tombstones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL,
  subject_id   uuid NOT NULL,
  household_id uuid,
  deleted_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);
CREATE UNIQUE INDEX deletion_tombstones_uk ON deletion_tombstones (subject_type, subject_id);

CREATE TABLE attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  domain_id       uuid REFERENCES domains(id) ON DELETE RESTRICT,
  owner_type      text NOT NULL,
  owner_id        uuid NOT NULL,
  attachment_kind text NOT NULL CHECK (attachment_kind IN ('file','link','image')),
  title           text NOT NULL,
  url             text,
  storage_ref     text,
  mime_type       text,
  size_bytes      bigint,
  sensitivity     text NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('public','normal','private','health','sensitive')),
  uploaded_by     uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_owner_idx ON attachments (household_id, owner_type, owner_id) WHERE deleted_at IS NULL;

-- Hinweis: schema_migrations wird vom Migrationsläufer selbst angelegt (packages/db/src/migrate.ts).
