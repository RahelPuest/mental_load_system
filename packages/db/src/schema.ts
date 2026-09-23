/**
 * Drizzle-Schema.
 *
 * Quelle der Wahrheit für das DDL sind die SQL-Migrationen in `migrations/`. Diese Datei ist die
 * typisierte Sicht darauf. Damit beides nicht auseinanderläuft, vergleicht
 * `test/schema-parity.spec.ts` bei jedem CI-Lauf Spalte für Spalte gegen die laufende Datenbank.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const citext = customType<{ data: string }>({ dataType: () => 'citext' })
const ltree = customType<{ data: string }>({ dataType: () => 'ltree' })
const interval = customType<{ data: string }>({ dataType: () => 'interval' })
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' })
/* `integer[]` und `text[]` – Drizzle kennt sie, aber nicht in der Form, die die Migration schreibt. */
const intArray = customType<{ data: number[] }>({ dataType: () => 'integer[]' })
const textArray = customType<{ data: string[] }>({ dataType: () => 'text[]' })

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`)
const createdAt = () => ts('created_at').notNull().defaultNow()
const updatedAt = () => ts('updated_at').notNull().defaultNow()
const version = () => integer('version').notNull().default(1)

/* ══ Identity & Tenancy ═══════════════════════════════════════════════ */

export const users = pgTable('users', {
  id: id(),
  email: citext('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  status: text('status').notNull().default('active'),
  locale: text('locale').notNull().default('de-DE'),
  lastLoginAt: ts('last_login_at'),
  deletedAt: ts('deleted_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const userSessions = pgTable('user_sessions', {
  id: id(),
  userId: uuid('user_id').notNull(),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  familyId: uuid('family_id').notNull(),
  userAgentHash: text('user_agent_hash'),
  ipHash: text('ip_hash'),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  revokedReason: text('revoked_reason'),
  createdAt: createdAt(),
  lastUsedAt: ts('last_used_at'),
})

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: id(),
  userId: uuid('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: createdAt(),
})

export const households = pgTable('households', {
  id: id(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Europe/Berlin'),
  status: text('status').notNull().default('active'),
  notificationContentLevel: text('notification_content_level').notNull().default('minimal'),
  balanceViewEnabled: boolean('balance_view_enabled').notNull().default(false),
  purgeAfter: ts('purge_after'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const persons = pgTable('persons', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  displayName: text('display_name').notNull(),
  personKind: text('person_kind').notNull(),
  birthDate: date('birth_date'),
  sensitivityDefault: text('sensitivity_default').notNull().default('normal'),
  note: text('note'),
  deletedAt: ts('deleted_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const householdMemberships = pgTable('household_memberships', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  userId: uuid('user_id'),
  linkedPersonId: uuid('linked_person_id'),
  displayName: text('display_name').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('active'),
  expiresAt: ts('expires_at'),
  joinedAt: ts('joined_at').notNull().defaultNow(),
  leftAt: ts('left_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

/**
 * Farbzuweisungen – pro Betrachter, nicht pro Haushalt.
 *
 * Fehlt eine Zeile, gilt die aus der ID abgeleitete Voreinstellung. Zurücksetzen heißt
 * deshalb löschen, nicht „auf null setzen".
 */
export const colorPreferences = pgTable('color_preferences', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  viewerMembershipId: uuid('viewer_membership_id').notNull(),
  subjectKind: text('subject_kind').notNull(),
  subjectId: uuid('subject_id').notNull(),
  tone: text('tone').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/**
 * Situative Anlässe – „wenn X, dann Y" (0013, docs/80).
 *
 * Gehören dem Haushalt, nicht dem Betrachter: „beim nächsten Einkauf" ist für alle dasselbe,
 * und wer einkauft, kann die Sachen der anderen mitnehmen.
 */
export const situationalCues = pgTable('situational_cues', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  label: text('label').notNull(),
  lastOccurredAt: ts('last_occurred_at'),
  archivedAt: ts('archived_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/**
 * Planungsvorgaben je Betrachter (0013).
 *
 * Wie bei den Farben: Eine Reihenfolge, die einer Person hilft, ist keine Aussage über den
 * Haushalt. Keine Zeile heißt „wie voreingestellt".
 */
export const planningPreferences = pgTable('planning_preferences', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  viewerMembershipId: uuid('viewer_membership_id').notNull(),
  horizon: text('horizon').notNull().default('day'),
  strategy: text('strategy').notNull().default('deadline_first'),
  aging: boolean('aging').notNull().default(true),
  slack: boolean('slack').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const invitations = pgTable('invitations', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  email: citext('email').notNull(),
  role: text('role').notNull(),
  tokenHash: text('token_hash').notNull(),
  invitedBy: uuid('invited_by'),
  expiresAt: ts('expires_at').notNull(),
  acceptedAt: ts('accepted_at'),
  revokedAt: ts('revoked_at'),
  createdAt: createdAt(),
})

export const accessGrants = pgTable(
  'access_grants',
  {
    id: id(),
    householdId: uuid('household_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    scopeType: text('scope_type').notNull(),
    scopeId: uuid('scope_id'),
    capability: text('capability').notNull(),
    maxSensitivity: text('max_sensitivity').notNull().default('normal'),
    effect: text('effect').notNull().default('allow'),
    grantedBy: uuid('granted_by'),
    reason: text('reason'),
    expiresAt: ts('expires_at'),
    revokedAt: ts('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => ({ lookup: index('grants_lookup_idx').on(t.householdId, t.membershipId, t.capability) }),
)

/* ══ Responsibility ═══════════════════════════════════════════════════ */

export const domains = pgTable(
  'domains',
  {
    id: id(),
    householdId: uuid('household_id').notNull(),
    parentId: uuid('parent_id'),
    path: ltree('path').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    subjectPersonId: uuid('subject_person_id'),
    ownershipInheritance: text('ownership_inheritance').notNull().default('inherit'),
    criticality: text('criticality').notNull().default('normal'),
    sensitivity: text('sensitivity').notNull().default('normal'),
    position: integer('position').notNull().default(0),
    archivedAt: ts('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => ({ pathUk: uniqueIndex('domains_path_uk').on(t.householdId, t.path) }),
)

export const responsibilityAssignments = pgTable('responsibility_assignments', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  domainId: uuid('domain_id').notNull(),
  membershipId: uuid('membership_id').notNull(),
  assignmentKind: text('assignment_kind').notNull(),
  effectiveFrom: ts('effective_from').notNull().defaultNow(),
  effectiveTo: ts('effective_to'),
  assignedBy: uuid('assigned_by'),
  note: text('note'),
  endReason: text('end_reason'),
  createdAt: createdAt(),
})

export const temporaryCoverages = pgTable('temporary_coverages', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  domainId: uuid('domain_id').notNull(),
  coveringMembershipId: uuid('covering_membership_id').notNull(),
  originalMembershipId: uuid('original_membership_id'),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at').notNull(),
  returnMode: text('return_mode').notNull().default('require_confirmation'),
  state: text('state').notNull().default('scheduled'),
  reasonCategory: text('reason_category').notNull().default('unspecified'),
  note: text('note'),
  createdBy: uuid('created_by'),
  returnedAt: ts('returned_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const capacityStates = pgTable('capacity_states', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  membershipId: uuid('membership_id').notNull(),
  level: text('level').notNull(),
  acceptsNewAssignments: boolean('accepts_new_assignments').notNull().default(true),
  criticalOnly: boolean('critical_only').notNull().default(false),
  mutePush: boolean('mute_push').notNull().default(false),
  reasonCategory: text('reason_category').notNull().default('unspecified'),
  note: text('note'),
  startsAt: ts('starts_at').notNull().defaultNow(),
  endsAt: ts('ends_at'),
  clearedAt: ts('cleared_at'),
  createdAt: createdAt(),
  version: version(),
})

/* ══ Knowledge & State ════════════════════════════════════════════════ */

export const stateDefinitions = pgTable('state_definitions', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  domainId: uuid('domain_id').notNull(),
  key: text('key').notNull(),
  label: text('label').notNull(),
  description: text('description'),
  dataType: text('data_type').notNull(),
  options: jsonb('options').$type<string[] | null>(),
  unit: text('unit'),
  freshnessInterval: interval('freshness_interval'),
  conflictWindow: interval('conflict_window').notNull().default('24 hours'),
  isCritical: boolean('is_critical').notNull().default(false),
  sensitivity: text('sensitivity').notNull().default('normal'),
  archivedAt: ts('archived_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const stateValues = pgTable('state_values', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  stateDefinitionId: uuid('state_definition_id').notNull(),
  valueKind: text('value_kind').notNull(),
  value: jsonb('value'),
  verifiedAt: ts('verified_at'),
  staleAt: ts('stale_at'),
  origin: text('origin').notNull().default('human'),
  originRef: text('origin_ref'),
  confidence: text('confidence').notNull().default('confirmed'),
  observedBy: uuid('observed_by'),
  confirmedBy: uuid('confirmed_by'),
  confirmedAt: ts('confirmed_at'),
  conflictState: text('conflict_state').notNull().default('none'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const stateObservations = pgTable('state_observations', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  stateDefinitionId: uuid('state_definition_id').notNull(),
  valueKind: text('value_kind').notNull(),
  value: jsonb('value'),
  observedAt: ts('observed_at').notNull().defaultNow(),
  origin: text('origin').notNull(),
  originRef: text('origin_ref'),
  observedBy: uuid('observed_by'),
  applied: boolean('applied').notNull().default(true),
  resolutionRule: text('resolution_rule').notNull(),
  conflictState: text('conflict_state').notNull().default('none'),
  supersedesId: uuid('supersedes_id'),
  note: text('note'),
  createdAt: createdAt(),
})

export const knowledgeItems = pgTable('knowledge_items', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  domainId: uuid('domain_id'),
  personId: uuid('person_id'),
  processId: uuid('process_id'),
  scope: text('scope').notNull().default('domain'),
  kind: text('kind').notNull().default('fact'),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  sensitivity: text('sensitivity').notNull().default('normal'),
  origin: text('origin').notNull().default('human'),
  originRef: text('origin_ref'),
  createdBy: uuid('created_by'),
  confirmedBy: uuid('confirmed_by'),
  confirmedAt: ts('confirmed_at'),
  deletedAt: ts('deleted_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const questions = pgTable('questions', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  domainId: uuid('domain_id'),
  body: text('body').notNull(),
  state: text('state').notNull().default('open'),
  askedBy: uuid('asked_by'),
  directedTo: uuid('directed_to'),
  answerBody: text('answer_body'),
  answeredBy: uuid('answered_by'),
  answeredAt: ts('answered_at'),
  answerKnowledgeId: uuid('answer_knowledge_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const decisions = pgTable('decisions', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  domainId: uuid('domain_id'),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  decisionKind: text('decision_kind').notNull(),
  bindingLevel: text('binding_level').notNull().default('orientation'),
  decidedBy: uuid('decided_by'),
  decidedAt: ts('decided_at').notNull().defaultNow(),
  reviewAfter: ts('review_after'),
  supersedesId: uuid('supersedes_id'),
  supersededAt: ts('superseded_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

/* ══ Attention ════════════════════════════════════════════════════════ */

export const monitors = pgTable('monitors', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  domainId: uuid('domain_id').notNull(),
  stateDefinitionId: uuid('state_definition_id'),
  name: text('name').notNull(),
  ruleKind: text('rule_kind').notNull(),
  config: jsonb('config').notNull().default({}),
  defaultResponse: text('default_response').notNull().default('attention_item'),
  automationRuleId: uuid('automation_rule_id'),
  enabled: boolean('enabled').notNull().default(true),
  origin: text('origin').notNull().default('human'),
  createdBy: uuid('created_by'),
  lastEvaluatedAt: ts('last_evaluated_at'),
  nextEvaluationAt: ts('next_evaluation_at').notNull().defaultNow(),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  lastError: text('last_error'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const monitorSuppressions = pgTable('monitor_suppressions', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  monitorId: uuid('monitor_id').notNull(),
  bucketPattern: text('bucket_pattern').notNull(),
  reason: text('reason').notNull(),
  createdBy: uuid('created_by'),
  until: ts('until'),
  createdAt: createdAt(),
})

export const signals = pgTable('signals', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  monitorId: uuid('monitor_id'),
  domainId: uuid('domain_id').notNull(),
  signalKind: text('signal_kind').notNull(),
  severity: text('severity').notNull().default('notice'),
  dedupeKey: text('dedupe_key').notNull(),
  bucket: text('bucket').notNull(),
  evidence: jsonb('evidence').notNull(),
  detectedAt: ts('detected_at').notNull().defaultNow(),
  supersededAt: ts('superseded_at'),
  resolvedAt: ts('resolved_at'),
  createdAt: createdAt(),
})

export const attentionItems = pgTable('attention_items', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  domainId: uuid('domain_id').notNull(),
  signalKind: text('signal_kind').notNull(),
  title: text('title').notNull(),
  whyNow: text('why_now').notNull(),
  ifItWaits: text('if_it_waits').notNull().default(''),
  state: text('state').notNull().default('open'),
  severity: text('severity').notNull().default('notice'),
  snoozedUntil: ts('snoozed_until'),
  resolvedBy: uuid('resolved_by'),
  resolvedAt: ts('resolved_at'),
  resolutionNote: text('resolution_note'),
  processId: uuid('process_id'),
  origin: text('origin').notNull().default('system_rule'),
  originRef: text('origin_ref'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const attentionItemSignals = pgTable('attention_item_signals', {
  attentionItemId: uuid('attention_item_id').notNull(),
  signalId: uuid('signal_id').notNull(),
  householdId: uuid('household_id').notNull(),
  attachedAt: ts('attached_at').notNull().defaultNow(),
})

export const needs = pgTable('needs', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  domainId: uuid('domain_id').notNull(),
  subjectPersonId: uuid('subject_person_id'),
  description: text('description').notNull(),
  state: text('state').notNull().default('open'),
  criticality: text('criticality').notNull().default('normal'),
  neededBy: ts('needed_by'),
  attentionItemId: uuid('attention_item_id'),
  processId: uuid('process_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

/* ══ Work ═════════════════════════════════════════════════════════════ */

export const automationRules = pgTable('automation_rules', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  name: text('name').notNull(),
  operation: text('operation').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  config: jsonb('config').notNull().default({}),
  rationaleTemplate: text('rationale_template').notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const playbooks = pgTable('playbooks', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  domainId: uuid('domain_id'),
  title: text('title').notNull(),
  triggerDescription: text('trigger_description').notNull().default(''),
  scope: text('scope').notNull().default('household'),
  archivedAt: ts('archived_at'),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const playbookSteps = pgTable('playbook_steps', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  playbookId: uuid('playbook_id').notNull(),
  position: integer('position').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  estimatedMinutes: integer('estimated_minutes'),
  mentalEnergy: text('mental_energy').notNull().default('medium'),
  branchCondition: text('branch_condition'),
  createdAt: createdAt(),
})

export const processes = pgTable('processes', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  domainId: uuid('domain_id').notNull(),
  playbookId: uuid('playbook_id'),
  attentionItemId: uuid('attention_item_id'),
  title: text('title').notNull(),
  goal: text('goal'),
  state: text('state').notNull().default('draft'),
  outcome: text('outcome'),
  outcomeReason: text('outcome_reason'),
  learnings: text('learnings'),
  ownerMembershipId: uuid('owner_membership_id'),
  dueAt: ts('due_at'),
  completedAt: ts('completed_at'),
  origin: text('origin').notNull().default('human'),
  originRef: text('origin_ref'),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const tasks = pgTable('tasks', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  domainId: uuid('domain_id'),
  processId: uuid('process_id'),
  title: text('title').notNull(),
  description: text('description'),
  state: text('state').notNull().default('draft'),
  position: integer('position').notNull().default(0),
  assigneeMembershipId: uuid('assignee_membership_id'),
  delegatedBy: uuid('delegated_by'),
  delegationKind: text('delegation_kind').notNull().default('none'),
  dueAt: ts('due_at'),
  deferUntil: ts('defer_until'),
  estimatedMinutes: integer('estimated_minutes'),
  mentalEnergy: text('mental_energy').notNull().default('medium'),
  physicalEnergy: text('physical_energy').notNull().default('low'),
  focusRequired: text('focus_required').notNull().default('medium'),
  socialLoad: text('social_load').notNull().default('low'),
  origin: text('origin').notNull().default('human'),
  originRef: text('origin_ref'),
  rationale: text('rationale'),
  overdueSince: ts('overdue_since'),
  lastReassessedAt: ts('last_reassessed_at'),
  completedAt: ts('completed_at'),
  completionNote: text('completion_note'),
  dropReason: text('drop_reason'),
  createdBy: uuid('created_by'),
  /** Situativer Anlass, an dem diese Aufgabe hängt (0013). Null = an keinem. */
  cueId: uuid('cue_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const taskDependencies = pgTable('task_dependencies', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  taskId: uuid('task_id').notNull(),
  dependsOnTaskId: uuid('depends_on_task_id').notNull(),
  dependencyKind: text('dependency_kind').notNull().default('finish_to_start'),
  createdAt: createdAt(),
})

export const waitingStates = pgTable('waiting_states', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  taskId: uuid('task_id').notNull(),
  waitingKind: text('waiting_kind').notNull(),
  waitingOnMembershipId: uuid('waiting_on_membership_id'),
  externalParty: text('external_party'),
  description: text('description').notNull(),
  recheckAt: ts('recheck_at').notNull(),
  releasedAt: ts('released_at'),
  releaseReason: text('release_reason'),
  createdAt: createdAt(),
})

/* ══ Intake ═══════════════════════════════════════════════════════════ */

export const inboxItems = pgTable('inbox_items', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  createdBy: uuid('created_by'),
  rawText: text('raw_text').notNull(),
  source: text('source').notNull().default('manual'),
  sourceRef: jsonb('source_ref'),
  state: text('state').notNull().default('captured'),
  suggestion: jsonb('suggestion'),
  resultingObjectType: text('resulting_object_type'),
  resultingObjectId: uuid('resulting_object_id'),
  discardReason: text('discard_reason'),
  occurredAt: ts('occurred_at').notNull().defaultNow(),
  processedAt: ts('processed_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

/* ══ Integration ══════════════════════════════════════════════════════ */

/**
 * Anbindung an Bring! – eine je Haushalt.
 *
 * Gespeichert wird der Refresh-Token, nicht das Passwort: Es wird einmal eingegeben, gegen
 * Tokens getauscht und nie abgelegt. Wer den Zugang widerrufen will, ändert sein
 * Bring-Passwort.
 */
export const bringConnections = pgTable('bring_connections', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  membershipId: uuid('membership_id').notNull(),
  bringEmail: text('bring_email').notNull(),
  bringUserUuid: text('bring_user_uuid').notNull(),
  credentialsCiphertext: bytea('credentials_ciphertext'),
  credentialsKeyId: text('credentials_key_id'),
  listUuid: text('list_uuid'),
  listName: text('list_name'),
  state: text('state').notNull().default('connected'),
  lastPushAt: ts('last_push_at'),
  lastErrorCode: text('last_error_code'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const calendarConnections = pgTable('calendar_connections', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  membershipId: uuid('membership_id').notNull(),
  provider: text('provider').notNull(),
  displayName: text('display_name').notNull(),
  credentialsCiphertext: bytea('credentials_ciphertext'),
  credentialsKeyId: text('credentials_key_id'),
  state: text('state').notNull().default('pending_auth'),
  syncToken: text('sync_token'),
  lastSyncAt: ts('last_sync_at'),
  lastErrorCode: text('last_error_code'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  nextSyncAt: ts('next_sync_at').notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const calendarSelections = pgTable('calendar_selections', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  connectionId: uuid('connection_id').notNull(),
  externalCalendarId: text('external_calendar_id').notNull(),
  displayName: text('display_name').notNull().default(''),
  readEnabled: boolean('read_enabled').notNull().default(true),
  writeEnabled: boolean('write_enabled').notNull().default(false),
  shareLevel: text('share_level').notNull().default('busy'),
  syncCursor: text('sync_cursor'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const calendarEvents = pgTable('calendar_events', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  connectionId: uuid('connection_id').notNull(),
  externalCalendarId: text('external_calendar_id').notNull(),
  externalId: text('external_id').notNull(),
  recurrenceId: text('recurrence_id').notNull().default(''),
  etag: text('etag'),
  sequence: integer('sequence').notNull().default(0),
  title: text('title').notNull().default(''),
  location: text('location'),
  description: text('description'),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at').notNull(),
  timeZone: text('time_zone').notNull().default('UTC'),
  allDay: boolean('all_day').notNull().default(false),
  rrule: text('rrule'),
  exdates: text('exdates').array(),
  state: text('state').notNull().default('confirmed'),
  linkedDomainId: uuid('linked_domain_id'),
  linkOrigin: text('link_origin').notNull().default('inference'),
  createdBySystem: boolean('created_by_system').notNull().default(false),
  linkedProcessId: uuid('linked_process_id'),
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

/* ══ Delivery ═════════════════════════════════════════════════════════ */

export const notifications = pgTable('notifications', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  recipientMembershipId: uuid('recipient_membership_id').notNull(),
  notificationKind: text('notification_kind').notNull(),
  priority: text('priority').notNull().default('normal'),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  payload: jsonb('payload').notNull().default({}),
  subjectType: text('subject_type'),
  subjectId: uuid('subject_id'),
  dedupeKey: text('dedupe_key').notNull(),
  bundleAfter: ts('bundle_after'),
  state: text('state').notNull().default('pending'),
  suppressedReason: text('suppressed_reason'),
  readAt: ts('read_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  notificationId: uuid('notification_id').notNull(),
  channel: text('channel').notNull(),
  state: text('state').notNull().default('queued'),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextAttemptAt: ts('next_attempt_at'),
  failureCode: text('failure_code'),
  failureDetail: text('failure_detail'),
  sentAt: ts('sent_at'),
  deliveredAt: ts('delivered_at'),
  acknowledgedAt: ts('acknowledged_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const notificationPreferences = pgTable('notification_preferences', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  membershipId: uuid('membership_id').notNull(),
  notificationKind: text('notification_kind').notNull(),
  priorityFloor: text('priority_floor').notNull().default('low'),
  channels: jsonb('channels').notNull().default(['in_app']),
  quietHours: jsonb('quiet_hours'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  membershipId: uuid('membership_id').notNull(),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgentHash: text('user_agent_hash'),
  lastSuccessAt: ts('last_success_at'),
  disabledAt: ts('disabled_at'),
  disabledReason: text('disabled_reason'),
  createdAt: createdAt(),
})

/* ══ Ledger & Governance ══════════════════════════════════════════════ */

export const domainEvents = pgTable('domain_events', {
  seq: bigserial('seq', { mode: 'number' }).primaryKey(),
  id: uuid('id').notNull().default(sql`gen_random_uuid()`),
  householdId: uuid('household_id').notNull(),
  eventType: text('event_type').notNull(),
  eventVersion: integer('event_version').notNull().default(1),
  subjectType: text('subject_type').notNull(),
  subjectId: uuid('subject_id'),
  actorKind: text('actor_kind').notNull(),
  actorMembershipId: uuid('actor_membership_id'),
  actorRef: text('actor_ref'),
  payload: jsonb('payload').notNull().default({}),
  before: jsonb('before'),
  after: jsonb('after'),
  correlationId: uuid('correlation_id').notNull(),
  causationId: uuid('causation_id'),
  occurredAt: ts('occurred_at').notNull().defaultNow(),
})

export const auditEvents = pgTable('audit_events', {
  seq: bigserial('seq', { mode: 'number' }).primaryKey(),
  id: uuid('id').notNull().default(sql`gen_random_uuid()`),
  householdId: uuid('household_id'),
  userId: uuid('user_id'),
  membershipId: uuid('membership_id'),
  action: text('action').notNull(),
  outcome: text('outcome').notNull().default('success'),
  subjectType: text('subject_type'),
  subjectId: uuid('subject_id'),
  ipHash: text('ip_hash'),
  userAgentHash: text('user_agent_hash'),
  metadata: jsonb('metadata').notNull().default({}),
  prevHash: text('prev_hash'),
  rowHash: text('row_hash').notNull(),
  occurredAt: ts('occurred_at').notNull().defaultNow(),
})

export const outboxEvents = pgTable('outbox_events', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  eventId: uuid('event_id').notNull(),
  topic: text('topic').notNull(),
  payload: jsonb('payload').notNull(),
  state: text('state').notNull().default('pending'),
  attemptCount: integer('attempt_count').notNull().default(0),
  availableAt: ts('available_at').notNull().defaultNow(),
  publishedAt: ts('published_at'),
  lastError: text('last_error'),
  correlationId: uuid('correlation_id').notNull(),
  createdAt: createdAt(),
})

export const processedEvents = pgTable('processed_events', {
  consumerName: text('consumer_name').notNull(),
  eventId: text('event_id').notNull(),
  processedAt: ts('processed_at').notNull().defaultNow(),
})

export const idempotencyKeys = pgTable('idempotency_keys', {
  key: text('key').primaryKey(),
  householdId: uuid('household_id'),
  userId: uuid('user_id'),
  requestHash: text('request_hash').notNull(),
  statusCode: integer('status_code'),
  responseBody: jsonb('response_body'),
  createdAt: createdAt(),
  expiresAt: ts('expires_at').notNull(),
})

export const exportJobs = pgTable('export_jobs', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  requestedBy: uuid('requested_by'),
  scope: text('scope').notNull().default('household'),
  state: text('state').notNull().default('queued'),
  storageRef: text('storage_ref'),
  checksum: text('checksum'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  error: text('error'),
  expiresAt: ts('expires_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const deletionRequests = pgTable('deletion_requests', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  requestedBy: uuid('requested_by'),
  scope: text('scope').notNull(),
  subjectType: text('subject_type'),
  subjectId: uuid('subject_id'),
  mode: text('mode').notNull().default('soft'),
  state: text('state').notNull().default('scheduled'),
  phase: text('phase'),
  executeAfter: ts('execute_after').notNull(),
  executedAt: ts('executed_at'),
  cancelledAt: ts('cancelled_at'),
  error: text('error'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const deletionTombstones = pgTable('deletion_tombstones', {
  id: id(),
  subjectType: text('subject_type').notNull(),
  subjectId: uuid('subject_id').notNull(),
  householdId: uuid('household_id'),
  deletedAt: ts('deleted_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
})

export const attachments = pgTable('attachments', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  domainId: uuid('domain_id'),
  ownerType: text('owner_type').notNull(),
  ownerId: uuid('owner_id').notNull(),
  attachmentKind: text('attachment_kind').notNull(),
  title: text('title').notNull(),
  url: text('url'),
  storageRef: text('storage_ref'),
  mimeType: text('mime_type'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  sensitivity: text('sensitivity').notNull().default('normal'),
  uploadedBy: uuid('uploaded_by'),
  deletedAt: ts('deleted_at'),
  createdAt: createdAt(),
})

export const schemaMigrations = pgTable('schema_migrations', {
  version: text('version').primaryKey(),
  appliedAt: ts('applied_at').notNull().defaultNow(),
  checksum: text('checksum').notNull(),
})


/* ══ Essensplanung (docs/63, Migration 0010) ═════════════════════════
 *
 * Ein Objekt, nicht zwei: `dishes` ist das Gericht **und** sein Rezept. Alles außer dem Namen
 * darf fehlen – ein Gericht muss allein mit seinem Namen benutzbar sein.
 *
 * Es gibt bewusst keine Spalten `last_planned_at` oder `planned_count`. Beides steht in
 * `meal_plan_entries` und wird abgefragt; ein Zähler daneben wäre eine zweite Wahrheit.
 */
export const dishes = pgTable('dishes', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  servings: integer('servings'),
  prepMinutes: integer('prep_minutes'),
  cookMinutes: integer('cook_minutes'),
  steps: text('steps'),
  notes: text('notes'),
  sourceUrl: text('source_url'),
  imageUrl: text('image_url'),
  excludedFromSuggestions: boolean('excluded_from_suggestions').notNull().default(false),
  /* Wofür das Gericht passt – ein Feld, kein Tag: Die Auswahl verlässt sich darauf. */
  suitableFor: text('suitable_for').notNull().default('both'),
  archivedAt: ts('archived_at'),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const dishTags = pgTable('dish_tags', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  dishId: uuid('dish_id').notNull(),
  tag: text('tag').notNull(),
  createdAt: createdAt(),
})

export const dishIngredients = pgTable('dish_ingredients', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  dishId: uuid('dish_id').notNull(),
  position: integer('position').notNull().default(0),
  name: text('name').notNull(),
  quantity: numeric('quantity', { precision: 10, scale: 3 }),
  unit: text('unit'),
  note: text('note'),
  createdAt: createdAt(),
})

export const dishPreferences = pgTable('dish_preferences', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  dishId: uuid('dish_id').notNull(),
  membershipId: uuid('membership_id').notNull(),
  rating: text('rating').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const mealPlanEntries = pgTable('meal_plan_entries', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  onDate: date('on_date').notNull(),
  slot: text('slot').notNull(),
  dishId: uuid('dish_id').notNull(),
  servings: integer('servings'),
  note: text('note'),
  locked: boolean('locked').notNull().default(false),
  source: text('source').notNull().default('manual'),
  suggestionReason: text('suggestion_reason'),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const mealSettings = pgTable('meal_settings', {
  householdId: uuid('household_id').primaryKey(),
  lunchWeekdays: intArray('lunch_weekdays').notNull(),
  defaultServings: integer('default_servings').notNull().default(4),
  suggestionMode: text('suggestion_mode').notNull().default('balanced'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const mealDayRules = pgTable('meal_day_rules', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  weekday: integer('weekday').notNull(),
  slot: text('slot'),
  maxMinutes: integer('max_minutes'),
  requireTags: textArray('require_tags').notNull(),
  excludeTags: textArray('exclude_tags').notNull(),
  note: text('note'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const shoppingLists = pgTable('shopping_lists', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  weekStart: date('week_start').notNull(),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})

export const shoppingListItems = pgTable('shopping_list_items', {
  id: id(),
  householdId: uuid('household_id').notNull(),
  listId: uuid('list_id').notNull(),
  position: integer('position').notNull().default(0),
  name: text('name').notNull(),
  quantity: numeric('quantity', { precision: 10, scale: 3 }),
  unit: text('unit'),
  note: text('note'),
  checkedAt: ts('checked_at'),
  haveAtHome: boolean('have_at_home').notNull().default(false),
  origin: text('origin').notNull().default('dish'),
  editedAt: ts('edited_at'),
  pushedAt: ts('pushed_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
})
