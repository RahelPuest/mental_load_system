/**
 * Kontrollierte Vokabulare des gesamten Systems.
 *
 * Diese Datei ist die einzige Quelle der Wahrheit. Die Datenbank spiegelt sie über
 * `text` + CHECK-Constraints (ADR-0013), die API über Zod-Schemas.
 * Ein Wert, der hier nicht steht, existiert im System nicht.
 */

export const HOUSEHOLD_ROLES = ['admin', 'adult', 'caregiver', 'teen', 'child', 'guest'] as const
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number]

/**
 * Zustand einer Mitgliedschaft.
 *
 * Stand als CHECK in der Datenbank, aber nicht hier – ADR-0013 verlangt das Gegenteil:
 * Das Vokabular lebt in den Verträgen, die Datenbank spiegelt es. `left` heißt „gehört
 * nicht mehr dazu", nicht „gelöscht": Der Name bleibt lesbar, damit der Verlauf es bleibt.
 */
export const MEMBERSHIP_STATUSES = ['active', 'invited', 'suspended', 'left'] as const
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number]

/**
 * Farbtöne für Personen und Bereiche.
 *
 * Eine feste Auswahl statt freier Farbwahl. Jeder Ton ist in hellem UND dunklem Modus gegen
 * seine eigene Fläche geprüft (mindestens 4.5:1) und liegt mindestens 20° von jedem anderen
 * entfernt. Eine frei gewählte Farbe könnte beides nicht zusagen: Im Dunkelmodus müsste sie
 * so weit nachkorrigiert werden, dass sie nicht mehr die gewählte wäre.
 *
 * Die Reihenfolge ist die Anzeigereihenfolge im Farbwähler und entspricht --m1 … --m12.
 */
export const COLOR_TONES = [
  'gruen',
  'blau',
  'violett',
  'braun',
  'beere',
  'tuerkis',
  'ocker',
  'magenta',
  'rost',
  'indigo',
  'oliv',
  'pflaume',
] as const
export type ColorTone = (typeof COLOR_TONES)[number]

/** Wem eine Farbe gilt. Beides wird in derselben Tabelle abgelegt. */
export const COLOR_SUBJECTS = ['member', 'domain'] as const
export type ColorSubject = (typeof COLOR_SUBJECTS)[number]

export const PERSON_KINDS = ['adult_member', 'child', 'dependent', 'caregiver', 'external'] as const
export type PersonKind = (typeof PERSON_KINDS)[number]

/** Total geordnet – Index = Rang. Zugriff erfordert resource <= grant-ceiling. */
export const SENSITIVITY_LEVELS = ['public', 'normal', 'private', 'health', 'sensitive'] as const
export type Sensitivity = (typeof SENSITIVITY_LEVELS)[number]
export const sensitivityRank = (s: Sensitivity): number => SENSITIVITY_LEVELS.indexOf(s)

/**
 * Was in einem Bereich hängt und sich in einen anderen umhängen lässt.
 *
 * Bewusst nicht enthalten: Aufmerksamkeitseintraege und Signale. Die gehoeren einer Regel und
 * ziehen mit ihr um – sie einzeln zu verschieben hiesse, einen Hinweis von seiner Ursache zu
 * trennen.
 */
export const DOMAIN_ITEM_KINDS = [
  'state',
  'knowledge',
  'question',
  'decision',
  'monitor',
  'process',
  'task',
] as const
export type DomainItemKind = (typeof DOMAIN_ITEM_KINDS)[number]

export const ASSIGNMENT_KINDS = [
  'primary_owner',
  'secondary_owner',
  'shared_owner',
  'support',
  'observer',
] as const
export type AssignmentKind = (typeof ASSIGNMENT_KINDS)[number]

/** Assignments, die kognitive Verantwortung tragen (im Gegensatz zu Unterstützung/Beobachtung). */
export const OWNING_ASSIGNMENT_KINDS = ['primary_owner', 'secondary_owner', 'shared_owner'] as const

export const OWNERSHIP_INHERITANCE = ['inherit', 'own'] as const
export type OwnershipInheritance = (typeof OWNERSHIP_INHERITANCE)[number]

export const CRITICALITY = ['low', 'normal', 'high', 'critical'] as const
export type Criticality = (typeof CRITICALITY)[number]

export const ORIGINS = ['human', 'system_rule', 'integration', 'inference'] as const
export type Origin = (typeof ORIGINS)[number]

export const STATE_DATA_TYPES = [
  'text',
  'number',
  'date',
  'boolean',
  'enum',
  'person',
  'document',
  'link',
  'json',
] as const
export type StateDataType = (typeof STATE_DATA_TYPES)[number]

/** INV-010: 'unknown' ist ein gültiger, eigenständiger Zustand – nicht null, nicht false. */
export const VALUE_KINDS = ['known', 'unknown', 'not_applicable'] as const
export type ValueKind = (typeof VALUE_KINDS)[number]

export const CONFLICT_STATES = ['none', 'unresolved', 'resolved_manual', 'resolved_by_priority'] as const
export type ConflictState = (typeof CONFLICT_STATES)[number]

export const MONITOR_RULE_KINDS = [
  'state_freshness',
  'state_unknown',
  'state_threshold',
  'schedule',
  'seasonal',
  'lead_time_before_event',
  'date_field_lead_time',
  'absence',
  'dependency_recheck',
] as const
export type MonitorRuleKind = (typeof MONITOR_RULE_KINDS)[number]

/*
 * docs/60 E1 – die Lücke „keine Regel knüpft an eine Situation" wird NICHT hier geschlossen.
 *
 * Naheliegend wäre eine zehnte Regelart `situational_cue` gewesen. Sie wäre falsch: Eine
 * Monitor-Regel muss der Worker auswerten können, und ein Anlass („beim nächsten Einkauf")
 * tritt nicht messbar ein – ein Mensch bestätigt ihn. Eine Regelart, die nie feuern kann,
 * ist eine Behauptung im Modell, die niemand einlöst.
 *
 * Der Anlass ist deshalb ein eigenes Objekt neben der Aufgabe (`situational_cues`,
 * `tasks.cue_id`, Migration 0013) und wirkt in der Planung, nicht in der Überwachung.
 * Siehe docs/80.
 */

export const MONITOR_RESPONSES = ['attention_item', 'create_task'] as const
export type MonitorResponse = (typeof MONITOR_RESPONSES)[number]

export const SIGNAL_KINDS = [
  'stale_state',
  'unresolved_unknown',
  'threshold_crossed',
  'scheduled_check_due',
  'season_approaching',
  'event_preparation_due',
  'date_approaching',
  'domain_dormant',
  'waiting_recheck_due',
  'state_conflict',
  'coverage_gap',
  'process_stalled',
  'integration_unhealthy',
] as const
export type SignalKind = (typeof SIGNAL_KINDS)[number]

export const SEVERITIES = ['info', 'notice', 'important', 'critical'] as const
export type Severity = (typeof SEVERITIES)[number]

export const ATTENTION_STATES = [
  'open',
  'acknowledged',
  'snoozed',
  'dismissed',
  'irrelevant',
  'converted',
  'obsolete',
] as const
export type AttentionState = (typeof ATTENTION_STATES)[number]

export const NEED_STATES = ['open', 'met', 'dropped'] as const

export const PROCESS_STATES = ['draft', 'active', 'paused', 'blocked', 'completed', 'abandoned'] as const
export type ProcessState = (typeof PROCESS_STATES)[number]

export const PROCESS_OUTCOMES = ['achieved', 'no_longer_needed', 'replaced', 'abandoned'] as const
export type ProcessOutcome = (typeof PROCESS_OUTCOMES)[number]

export const TASK_STATES = [
  'draft',
  'ready',
  'in_progress',
  'blocked',
  'waiting',
  'deferred',
  'done',
  'dropped',
  'superseded',
] as const
export type TaskState = (typeof TASK_STATES)[number]

/** Zustände, in denen eine Task noch offene Verantwortung darstellt (INV-001). */
export const OPEN_TASK_STATES = ['draft', 'ready', 'in_progress', 'blocked', 'waiting', 'deferred'] as const

export const DELEGATION_KINDS = ['none', 'delegated', 'transferred', 'shared', 'support_requested'] as const
export type DelegationKind = (typeof DELEGATION_KINDS)[number]

export const ENERGY_LEVELS = ['low', 'medium', 'high'] as const
export type EnergyLevel = (typeof ENERGY_LEVELS)[number]
export const energyRank = (e: EnergyLevel): number => ENERGY_LEVELS.indexOf(e)



export const WAITING_KINDS = [
  'date',
  'person',
  'external_party',
  'delivery',
  'event',
  'task',
  'calendar_event',
  'manual_release',
] as const
export type WaitingKind = (typeof WAITING_KINDS)[number]

export const CAPACITY_LEVELS = ['normal', 'reduced', 'minimal', 'paused'] as const
export type CapacityLevel = (typeof CAPACITY_LEVELS)[number]
export const capacityRank = (c: CapacityLevel): number => CAPACITY_LEVELS.indexOf(c)

/**
 * §25 / Q-13: Es wird bewusst kein medizinischer Grund gespeichert.
 * 'unspecified' ist der Default und für die Produktlogik ausreichend.
 */
export const CAPACITY_REASON_CATEGORIES = ['unspecified', 'health', 'workload', 'travel', 'care', 'rest'] as const

export const COVERAGE_STATES = [
  'scheduled',
  'active',
  'pending_return',
  'returned',
  'cancelled',
] as const
export type CoverageState = (typeof COVERAGE_STATES)[number]

export const COVERAGE_RETURN_MODES = ['auto_return', 'require_confirmation'] as const
export type CoverageReturnMode = (typeof COVERAGE_RETURN_MODES)[number]

export const INBOX_STATES = ['captured', 'suggested', 'processed', 'discarded'] as const
export type InboxState = (typeof INBOX_STATES)[number]

export const INBOX_TARGETS = [
  'task',
  'question',
  'knowledge',
  'state_update',
  'decision',
  'process',
  'attention_item',
  'monitor',
] as const
export type InboxTarget = (typeof INBOX_TARGETS)[number]

export const QUESTION_STATES = ['open', 'answered', 'knowledge_captured', 'closed'] as const

export const KNOWLEDGE_KINDS = [
  'fact',
  'how_to',
  'preference',
  'experience',
  'rule',
  'pitfall',
  'link',
  'note',
] as const

export const KNOWLEDGE_SCOPES = ['person', 'domain', 'household', 'process', 'playbook'] as const

export const DECISION_KINDS = ['personal_preference', 'family_decision', 'hard_rule', 'guideline', 'exception'] as const
export const BINDING_LEVELS = ['orientation', 'strong', 'binding'] as const

export const CALENDAR_PROVIDERS = ['ics', 'caldav', 'google'] as const
export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number]

export const CALENDAR_CONNECTION_STATES = [
  'pending_auth',
  'active',
  'degraded',
  'needs_reauth',
  'disconnected',
  'revoked',
] as const
export type CalendarConnectionState = (typeof CALENDAR_CONNECTION_STATES)[number]

export const CALENDAR_SHARE_LEVELS = ['none', 'busy', 'title', 'full'] as const
export type CalendarShareLevel = (typeof CALENDAR_SHARE_LEVELS)[number]

export const CALENDAR_EVENT_STATES = ['confirmed', 'tentative', 'cancelled'] as const

export const NOTIFICATION_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number]
export const priorityRank = (p: NotificationPriority): number => NOTIFICATION_PRIORITIES.indexOf(p)

export const NOTIFICATION_CHANNELS = ['in_app', 'push', 'email', 'calendar'] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export const DELIVERY_STATES = ['queued', 'sent', 'delivered', 'failed', 'suppressed', 'acknowledged'] as const
export type DeliveryState = (typeof DELIVERY_STATES)[number]

export const NOTIFICATION_KINDS = [
  'attention.new',
  'attention.escalated',
  'task.assigned_to_you',
  'task.due_soon',
  'task.waiting_released',
  'question.directed_to_you',
  'question.answered',
  'process.stalled',
  'ownership.assigned_to_you',
  'ownership.coverage_starting',
  'ownership.coverage_return_due',
  'domain.unowned_critical',
  'state.conflict',
  'calendar.connection_unhealthy',
  'capacity.coverage_gap',
  'system.export_ready',
  'system.deletion_scheduled',
  'security.new_login',
  'security.grant_changed',
  'security.sensitive_access',
] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

/** Diese Arten sind nicht abwählbar (§23.6). */
export const UNDISMISSABLE_NOTIFICATION_KINDS: readonly NotificationKind[] = [
  'security.new_login',
  'security.grant_changed',
  'security.sensitive_access',
  'system.export_ready',
  'system.deletion_scheduled',
]

export const GRANT_SCOPE_TYPES = ['household', 'domain', 'object'] as const
export type GrantScopeType = (typeof GRANT_SCOPE_TYPES)[number]

export const GRANT_EFFECTS = ['allow', 'deny'] as const
export type GrantEffect = (typeof GRANT_EFFECTS)[number]

export const CAPABILITIES = [
  'household:read',
  'household:manage',
  'household:delete',
  'member:invite',
  'member:manage',
  'role:assign',
  'grant:manage',
  'person:read',
  'person:manage',
  'domain:read',
  'domain:create',
  'domain:manage',
  'domain:archive',
  'ownership:claim',
  'ownership:assign',
  'ownership:transfer',
  'coverage:create',
  'state:read',
  'state:write',
  'state:define',
  'knowledge:read',
  'knowledge:write',
  'decision:write',
  'monitor:read',
  'monitor:manage',
  'attention:read',
  'attention:triage',
  'attention:suppress',
  'process:read',
  'process:manage',
  'task:read',
  'task:create',
  'task:assign',
  'task:complete',
  'task:complete_others',
  'task:drop',
  'inbox:capture',
  'inbox:process',
  'calendar:connect',
  'calendar:read_shared',
  'calendar:write_external',
  'health:read',
  'sensitive:read',
  'capacity:declare_self',
  'capacity:read_others',
  'history:read',
  'audit:read',
  'export:request',
  /*
    Essensplanung (docs/63). Drei Rechte, nicht eines:

    Lesen darf jeder im Haushalt – wer nicht weiß, was es zu essen gibt, kann sich auch nicht
    darauf einstellen. Planen ist die tägliche Handlung. Die Sammlung zu pflegen ist die
    seltenere: Ein Gericht zu löschen nimmt allen ihre Vorschläge und ihre Geschichte.
  */
  'meal:read',
  'meal:plan',
  'meal:manage',
] as const
export type Capability = (typeof CAPABILITIES)[number]

/**
 * Autonomiestufen (ADR-0008 / §6).
 * A3-Operationen sind für System-Akteure technisch unerreichbar.
 */
export const AUTONOMY_LEVELS = ['A0', 'A1', 'A2', 'A3'] as const
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number]

export const ACTOR_KINDS = ['user', 'system', 'integration'] as const
export type ActorKind = (typeof ACTOR_KINDS)[number]

export const NOW_SECTIONS = [
  'now',
  'can_do_now',
  'needs_clarification',
  'waiting',
  'soon',
  'resting',
] as const
export type NowSection = (typeof NOW_SECTIONS)[number]

/* ── Planung (docs/80) ────────────────────────────────────────────── */

/** Über welchen Zeitraum plant die Ansicht? */
export const PLAN_HORIZONS = ['day', 'week', 'month'] as const
export type PlanHorizon = (typeof PLAN_HORIZONS)[number]

/**
 * Wie wird ausgewählt und sortiert?
 *
 * Jede Strategie stammt aus einem benannten Verfahren – entweder aus der Ablaufplanung
 * (Betriebssysteme, Fertigung) oder aus der klinischen Psychologie. Wie gut jede belegt
 * ist, steht in docs/80; die Oberfläche sagt es bei der Auswahl mit.
 */
export const PLAN_STRATEGIES = [
  /** EDF, Liu & Layland 1973. Optimal – solange die Last überhaupt tragbar ist. */
  'deadline_first',
  /** SJF/SPT. Minimiert beweisbar die mittlere Wartezeit; kurzer Anlauf zuerst. */
  'shortest_first',
  /** WIP-Grenze 1. Genau eine Sache, der Rest bleibt erreichbar, aber ungezeigt. */
  'one_thing',
  /** Bin Packing gegen das erklärte Kapazitätsbudget. */
  'capacity_fit',
  /** Verhaltensaktivierung: Auswahl nach Bedeutung, nicht nach Dringlichkeit. */
  'meaning_first',
  /** Nach situativem Anlass gruppiert – „wenn X, dann Y". */
  'cue_grouped',
] as const
export type PlanStrategy = (typeof PLAN_STRATEGIES)[number]

/**
 * Zwei Zusätze, die keine Sortierung sind, sondern jede Sortierung verändern.
 *
 * Getrennt geführt, weil sie sich mit jeder Strategie kombinieren – und weil „Alterung"
 * eine Zusicherung ist (nichts verhungert), nicht eine Vorliebe.
 */
export const PLAN_MODIFIERS = ['aging', 'slack'] as const
export type PlanModifier = (typeof PLAN_MODIFIERS)[number]
