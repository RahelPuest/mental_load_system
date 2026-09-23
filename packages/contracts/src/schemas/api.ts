import { z } from 'zod'
import {
  ASSIGNMENT_KINDS,
  CALENDAR_PROVIDERS,
  CALENDAR_SHARE_LEVELS,
  DECISION_KINDS,
  BINDING_LEVELS,
  DELEGATION_KINDS,
  DOMAIN_ITEM_KINDS,
  GRANT_EFFECTS,
  GRANT_SCOPE_TYPES,
  CAPABILITIES,
  HOUSEHOLD_ROLES,
  INBOX_TARGETS,
  KNOWLEDGE_KINDS,
  KNOWLEDGE_SCOPES,
  MONITOR_RESPONSES,
  MONITOR_RULE_KINDS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_KINDS,
  NOTIFICATION_PRIORITIES,
  OWNERSHIP_INHERITANCE,
  PERSON_KINDS,
  PLAN_HORIZONS,
  PLAN_STRATEGIES,
  PROCESS_OUTCOMES,
  STATE_DATA_TYPES,
  COLOR_TONES,
  WAITING_KINDS,
} from '../enums.js'
import {
  capacityLevel,
  capacityReason,
  criticality,
  energy,
  isoDateTime,
  scoreFactor,
  sensitivity,
  uuid,
  valueKind,
} from './common.js'

/* ── Auth ─────────────────────────────────────────────────────────────── */

export const registerBody = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(200),
  displayName: z.string().min(1).max(120),
})
export const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) })
export const passwordResetRequestBody = z.object({ email: z.string().email() })
export const passwordResetConfirmBody = z.object({ token: z.string().min(20), password: z.string().min(12).max(200) })

/* ── Household & Menschen ─────────────────────────────────────────────── */

export const createHouseholdBody = z.object({
  name: z.string().min(1).max(120),
  timezone: z.string().min(1).max(64).default('Europe/Berlin'),
  /** 'family_de' legt einen typischen Domainbaum + Kontext-Tags an (Risiko P3). */
  template: z.enum(['none', 'family_de']).default('family_de'),
})

export const updateHouseholdBody = z.object({
  name: z.string().min(1).max(120).optional(),
  timezone: z.string().min(1).max(64).optional(),
  /** §23.5: Wie viel Inhalt darf in Push und E-Mail stehen? */
  notificationContentLevel: z.enum(['minimal', 'titles']).optional(),
  /** §32: Die Balance-Ansicht ist bewusst opt-in – sie kann in manchen Familien schaden. */
  balanceViewEnabled: z.boolean().optional(),
})

export const changeRoleBody = z.object({ role: z.enum(HOUSEHOLD_ROLES) })

/** `null` setzt auf die abgeleitete Voreinstellung zurück – das ist kein Fehlerfall. */
export const setColorBody = z.object({ tone: z.enum(COLOR_TONES).nullable() })

export const updateSelectionBody = z.object({
  externalCalendarId: z.string().min(1).max(512),
  readEnabled: z.boolean(),
  writeEnabled: z.boolean().default(false),
  shareLevel: z.enum(CALENDAR_SHARE_LEVELS).default('busy'),
})

export const createInvitationBody = z.object({
  email: z.string().email(),
  role: z.enum(HOUSEHOLD_ROLES),
  expiresAt: isoDateTime.optional(),
})

export const createPersonBody = z.object({
  displayName: z.string().min(1).max(120),
  personKind: z.enum(PERSON_KINDS),
  birthDate: z.string().date().optional(),
  sensitivityDefault: sensitivity.default('normal'),
})

export const createGrantBody = z.object({
  membershipId: uuid,
  scopeType: z.enum(GRANT_SCOPE_TYPES),
  scopeId: uuid.nullable().default(null),
  capability: z.enum(CAPABILITIES),
  maxSensitivity: sensitivity.default('normal'),
  effect: z.enum(GRANT_EFFECTS).default('allow'),
  expiresAt: isoDateTime.nullable().default(null),
})

/* ── Domains & Ownership ──────────────────────────────────────────────── */

export const createDomainBody = z.object({
  name: z.string().min(1).max(120),
  parentId: uuid.nullable().default(null),
  subjectPersonId: uuid.nullable().default(null),
  criticality: criticality.default('normal'),
  sensitivity: sensitivity.default('normal'),
  ownershipInheritance: z.enum(OWNERSHIP_INHERITANCE).default('inherit'),
  description: z.string().max(2000).optional(),
})

/**
 * Was sich an einem Bereich nachträglich ändern lässt.
 *
 * Alle Felder optional: Wer nur den Namen ändert, soll nicht die Wichtigkeit mitschicken
 * müssen und dabei versehentlich überschreiben. `description: null` löscht sie ausdrücklich –
 * das ist etwas anderes als „nicht mitgeschickt".
 */
export const updateDomainBody = z.object({
  name: z.string().min(1).max(120).optional(),
  parentId: uuid.nullable().optional(),
  criticality: criticality.optional(),
  sensitivity: sensitivity.optional(),
  description: z.string().max(2000).nullable().optional(),
})

/** Vier Richtungen, eine Bewegung: hoch, runter, eine Ebene hinein, eine Ebene hinaus. */
export const moveDomainBody = z.object({ direction: z.enum(['up', 'down', 'in', 'out']) })

/**
 * Ein Ziel statt einer Richtung: unter diesen Bereich, vor jenen.
 *
 * `beforeId: null` heißt „ans Ende dieser Ebene", `parentId: null` „oberste Ebene".
 */
export const repositionDomainBody = z.object({
  parentId: uuid.nullable(),
  beforeId: uuid.nullable(),
})

/**
 * Inhalte eines Bereichs in einen anderen umhängen.
 *
 * Der Anlass ist das Aufteilen: Aus „Jacken und Schuhe" werden zwei Bereiche, und die
 * vorhandenen Angaben, Notizen, Regeln und Vorgaenge sollen mitkommen, statt neu getippt zu
 * werden. Deshalb eine Liste statt eines einzelnen Eintrags – wer aufteilt, verschiebt selten
 * genau eine Sache.
 *
 * `kind` steht dabei, weil die Kennung allein nicht sagt, in welcher Tabelle sie steht.
 */
export const moveDomainItemsBody = z.object({
  targetDomainId: uuid,
  items: z
    .array(z.object({ kind: z.enum(DOMAIN_ITEM_KINDS), id: uuid }))
    .min(1)
    .max(200),
})

export const createAssignmentBody = z.object({
  membershipId: uuid,
  assignmentKind: z.enum(ASSIGNMENT_KINDS),
  note: z.string().max(500).optional(),
})

export const transferOwnershipBody = z.object({
  toMembershipId: uuid,
  reason: z.string().min(1).max(500),
})

export const createCoverageBody = z.object({
  domainId: uuid,
  coveringMembershipId: uuid,
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  returnMode: z.enum(['auto_return', 'require_confirmation']).default('require_confirmation'),
  reasonCategory: capacityReason.default('unspecified'),
  note: z.string().max(500).optional(),
})

/* ── State & Wissen ───────────────────────────────────────────────────── */

export const createStateDefinitionBody = z.object({
  key: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/, 'nur a-z, 0-9 und _'),
  label: z.string().min(1).max(160),
  dataType: z.enum(STATE_DATA_TYPES),
  options: z.array(z.string()).optional(),
  unit: z.string().max(24).optional(),
  /** ISO-8601-Dauer, z. B. 'P6W'. Null = altert nicht. */
  freshnessInterval: z.string().regex(/^P/).nullable().default(null),
  isCritical: z.boolean().default(false),
  sensitivity: sensitivity.default('normal'),
  description: z.string().max(1000).optional(),
})

/**
 * Eine bestehende Angabe ändern (docs/77).
 *
 * Ohne `key`: Der technische Schlüssel benennt die Angabe für Regeln und Import; ihn nachträglich
 * zu ändern hieße, die Verweise darauf stillschweigend zu lösen. Der **Name** ist das, was
 * Menschen lesen, und genau der ließ sich bisher nicht ändern.
 *
 * `dataType` steht mit drin, wird vom Dienst aber abgelehnt, sobald ein Wert vorliegt –
 * „29" als Zahl ist als Datum nichts.
 */
export const updateStateDefinitionBody = z.object({
  label: z.string().min(1).max(160).optional(),
  dataType: z.enum(STATE_DATA_TYPES).optional(),
  unit: z.string().max(24).nullable().optional(),
  freshnessInterval: z.string().regex(/^P/).nullable().optional(),
  isCritical: z.boolean().optional(),
  description: z.string().max(1000).nullable().optional(),
})

export const putStateValueBody = z.object({
  valueKind,
  value: z.unknown().optional(),
  note: z.string().max(1000).optional(),
  /** true = menschliche Bestätigung; setzt verified_at und confirmed_at. */
  confirm: z.boolean().default(true),
  observedAt: isoDateTime.optional(),
})

export const resolveConflictBody = z.object({
  chosenObservationId: uuid,
  note: z.string().max(1000).optional(),
})

export const createKnowledgeBody = z.object({
  domainId: uuid.nullable().default(null),
  scope: z.enum(KNOWLEDGE_SCOPES).default('domain'),
  kind: z.enum(KNOWLEDGE_KINDS).default('fact'),
  title: z.string().min(1).max(200),
  body: z.string().max(20_000).default(''),
  sensitivity: sensitivity.default('normal'),
})

export const createQuestionBody = z.object({
  domainId: uuid.nullable().default(null),
  body: z.string().min(1).max(2000),
  directedTo: uuid.nullable().default(null),
})

export const answerQuestionBody = z.object({
  body: z.string().min(1).max(20_000),
  promoteToKnowledge: z.boolean().default(true),
  knowledgeTitle: z.string().max(200).optional(),
})

export const createDecisionBody = z.object({
  domainId: uuid.nullable().default(null),
  title: z.string().min(1).max(200),
  body: z.string().max(20_000).default(''),
  decisionKind: z.enum(DECISION_KINDS),
  bindingLevel: z.enum(BINDING_LEVELS).default('orientation'),
  reviewAfter: isoDateTime.nullable().default(null),
})

/* ── Monitoring & Attention ───────────────────────────────────────────── */

export const createMonitorBody = z.object({
  domainId: uuid,
  stateDefinitionId: uuid.nullable().default(null),
  name: z.string().min(1).max(160),
  ruleKind: z.enum(MONITOR_RULE_KINDS),
  config: z.record(z.unknown()).default({}),
  defaultResponse: z.enum(MONITOR_RESPONSES).default('attention_item'),
  enabled: z.boolean().default(true),
})

export const setMonitorEnabledBody = z.object({ enabled: z.boolean() })

/**
 * Eine Regel ändern.
 *
 * Alles ist freiwillig – wer nur den Rhythmus anpasst, schickt nur `config`. Der Bereich
 * fehlt bewusst: Eine Regel gehört zu ihrem Bereich. Sie umzuhängen wäre eine andere Regel,
 * und die legt man an, statt diese umzudeuten.
 */
export const updateMonitorBody = z.object({
  name: z.string().min(1).max(160).optional(),
  ruleKind: z.enum(MONITOR_RULE_KINDS).optional(),
  config: z.record(z.unknown()).optional(),
  defaultResponse: z.enum(MONITOR_RESPONSES).optional(),
  stateDefinitionId: uuid.nullable().optional(),
  enabled: z.boolean().optional(),
})

export const snoozeAttentionBody = z.object({ until: isoDateTime, reason: z.string().max(500).optional() })
export const dismissAttentionBody = z.object({ reason: z.string().max(500).optional() })
export const markIrrelevantBody = z.object({ reason: z.string().min(1).max(500) })
export const promoteAttentionBody = z.object({
  processTitle: z.string().min(1).max(200).optional(),
  playbookId: uuid.nullable().default(null),
})

/* ── Arbeit ───────────────────────────────────────────────────────────── */

export const createTaskBody = z.object({
  title: z.string().min(1).max(240),
  description: z.string().max(5000).optional(),
  domainId: uuid.nullable().default(null),
  processId: uuid.nullable().default(null),
  assigneeMembershipId: uuid.nullable().default(null),
  dueAt: isoDateTime.nullable().default(null),
  deferUntil: isoDateTime.nullable().default(null),
  estimatedMinutes: z.number().int().min(1).max(10_000).nullable().default(null),
  /*
   * `mentalEnergy` ist die einzige Anstrengungsachse, die wirkt: Sie wird gegen die
   * angegebene Kapazität geprüft. `physicalEnergy`, `focusRequired` und `socialLoad` gab es
   * hier ebenfalls – sie wurden entgegengenommen, gespeichert und nie gelesen. Eine
   * Schnittstelle, die Werte annimmt, die nichts bewirken, verspricht eine Feinsteuerung, die
   * es nicht gibt (Audit H4). Sie kommen wieder, sobald es eine Kapazitätsangabe gibt, gegen
   * die man sie prüfen kann.
   */
  mentalEnergy: energy.default('medium'),
  activate: z.boolean().default(true),
})

/**
 * Die Angaben einer Aufgabe berichtigen.
 *
 * Alles optional: Ein Formular, das nur den Titel ändert, soll die Schätzung nicht
 * mitschicken müssen – und `undefined` heißt „unverändert", nicht „leeren". Für „leeren"
 * steht ausdrücklich `null` bereit (Frist, Schätzung).
 *
 * Zustand, Zuweisung und Bereich fehlen mit Absicht: Dafür gibt es eigene Wege mit eigenen
 * Regeln. Berichtigen ist nicht dasselbe wie umdisponieren.
 */
export const updateTaskBody = z.object({
  title: z.string().min(1).max(240).optional(),
  estimatedMinutes: z.number().int().min(1).max(10_000).nullable().optional(),
  mentalEnergy: energy.optional(),
  dueAt: isoDateTime.nullable().optional(),
})

export const updateProcessBody = z.object({
  title: z.string().min(1).max(200).optional(),
  goal: z.string().max(2000).nullable().optional(),
})

export const updateKnowledgeBody = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(5000).optional(),
  kind: z.enum(KNOWLEDGE_KINDS).optional(),
})

export const updateQuestionBody = z.object({
  body: z.string().min(1).max(2000),
})

export const updateDecisionBody = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(5000).optional(),
  decisionKind: z.enum(DECISION_KINDS).optional(),
  bindingLevel: z.enum(BINDING_LEVELS).optional(),
})

export const completeTaskBody = z.object({
  note: z.string().max(5000).optional(),
  stateUpdates: z
    .array(z.object({ stateDefinitionId: uuid, valueKind, value: z.unknown().optional(), note: z.string().max(1000).optional() }))
    .default([]),
})

export const deferTaskBody = z.object({ until: isoDateTime, reason: z.string().max(500).optional() })
export const dropTaskBody = z.object({ reason: z.string().min(1).max(500) })
export const waitTaskBody = z.object({
  waitingKind: z.enum(WAITING_KINDS),
  description: z.string().min(1).max(500),
  recheckAt: isoDateTime,
  waitingOnMembershipId: uuid.nullable().default(null),
  externalParty: z.string().max(200).nullable().default(null),
})
export const assignTaskBody = z.object({
  membershipId: uuid.nullable(),
  delegationKind: z.enum(DELEGATION_KINDS).default('delegated'),
  /** Überschreibt `accepts_new_assignments=false`; erfordert Begründung und wird protokolliert. */
  override: z.boolean().default(false),
  overrideReason: z.string().max(500).optional(),
})

export const createProcessBody = z.object({
  domainId: uuid,
  title: z.string().min(1).max(200),
  goal: z.string().max(2000).optional(),
  playbookId: uuid.nullable().default(null),
  ownerMembershipId: uuid.nullable().default(null),
  dueAt: isoDateTime.nullable().default(null),
})

export const completeProcessBody = z.object({
  outcome: z.enum(PROCESS_OUTCOMES).default('achieved'),
  learnings: z.string().max(20_000).optional(),
  forceCloseReason: z.string().max(500).optional(),
})

export const createPlaybookBody = z.object({
  domainId: uuid.nullable().default(null),
  title: z.string().min(1).max(200),
  triggerDescription: z.string().max(1000).default(''),
  steps: z
    .array(
      z.object({
        title: z.string().min(1).max(240),
        description: z.string().max(2000).optional(),
        estimatedMinutes: z.number().int().min(1).max(10_000).nullable().default(null),
        mentalEnergy: energy.default('medium'),
      }),
    )
    .min(1),
})

export const instantiatePlaybookBody = z.object({
  domainId: uuid,
  title: z.string().min(1).max(200).optional(),
})

/* ── Now View, Capture, Inbox, Kapazität ──────────────────────────────── */

export const nowQuery = z.object({
  at: isoDateTime.optional(),
  /*
   * Planung (docs/80). Alles optional: Ohne diese Angaben antwortet die Ansicht genau wie
   * bisher – „Jetzt" behält seinen Charakter, solange niemand danach fragt.
   */
  horizon: z.enum(PLAN_HORIZONS).optional(),
  strategy: z.enum(PLAN_STRATEGIES).optional(),
  aging: z.coerce.boolean().optional(),
  slack: z.coerce.boolean().optional(),
  /** Vorgaben dieses Aufrufs als persönliche Voreinstellung speichern. */
  remember: z.coerce.boolean().optional(),
})

export const nowItem = z.object({
  subjectType: z.enum(['task', 'attention_item', 'question']),
  subjectId: uuid,
  title: z.string(),
  domain: z.object({ id: uuid, path: z.string() }).nullable(),
  owner: z.object({ membershipId: uuid, displayName: z.string(), isYou: z.boolean() }).nullable(),
  assignee: z.object({ membershipId: uuid, displayName: z.string(), isYou: z.boolean() }).nullable(),
  why: z.array(scoreFactor).min(1, 'INV-008: jedes Element muss begründet sein'),
  ifItWaits: z.string(),
  nextStep: z.string().nullable(),
  estimatedMinutes: z.number().int().nullable(),
  mentalEnergy: energy,
  state: z.string(),
})

/* ── Situative Anlässe (docs/80 §5) ──────────────────────────────────── */

export const cueBody = z.object({
  /** Die Nachhälfte von „wenn …": „beim nächsten Einkauf", nicht „Einkauf". */
  label: z.string().trim().min(2).max(80),
})

export const cueView = z.object({
  id: uuid,
  label: z.string(),
  lastOccurredAt: isoDateTime.nullable(),
  taskCount: z.number().int(),
})
export type CueView = z.infer<typeof cueView>

export const attachCueBody = z.object({
  cueId: uuid.nullable(),
})

export const planEntry = nowItem.extend({
  /**
   * Warum steht es an dieser Stelle? Ein Satz, keine Punktzahl (INV-008).
   *
   * `null`, wenn es über die Stelle nichts Eigenes zu sagen gibt – zwölfmal derselbe Satz
   * wäre Rauschen, kein Grund.
   */
  placedBecause: z.string().min(1).nullable(),
  cue: z.object({ id: uuid, label: z.string() }).nullable(),
})

export const planSlot = z.object({
  key: z.string(),
  label: z.string(),
  from: isoDateTime,
  to: isoDateTime,
  budgetMinutes: z.number().int(),
  plannedMinutes: z.number().int(),
  entries: z.array(planEntry),
})

/**
 * Die Todo-Ansicht. Nur vorhanden, wenn danach gefragt wurde.
 *
 * `overflow` und `notPlannable` sind nicht Beiwerk, sondern die Einhaltung von INV-007:
 * Was nicht in den Plan passt, ist nicht weg – es steht benannt daneben.
 */
export const planView = z.object({
  horizon: z.enum(PLAN_HORIZONS),
  strategy: z.enum(PLAN_STRATEGIES),
  aging: z.boolean(),
  slack: z.boolean(),
  /** Was die Strategie kann – und wo sie nicht taugt. */
  note: z.string(),
  slots: z.array(planSlot),
  overflow: z.array(planEntry),
  notPlannable: z.array(planEntry),
})

export const nowResponse = z.object({
  generatedAt: isoDateTime,
  capacity: z.object({ level: capacityLevel, source: z.enum(['self_declared', 'default']) }),
  sections: z.array(
    z.object({ key: z.string(), label: z.string(), limit: z.number().int().nullable(), items: z.array(nowItem) }),
  ),
  plan: planView.nullable().optional(),
})
export type NowResponse = z.infer<typeof nowResponse>
export type NowItem = z.infer<typeof nowItem>
export type PlanView = z.infer<typeof planView>
export type PlanSlotView = z.infer<typeof planSlot>
export type PlanEntry = z.infer<typeof planEntry>

export const captureBody = z.object({
  text: z.string().min(1).max(5000),
  occurredAt: isoDateTime.optional(),
})

export const processInboxBody = z.object({
  targetType: z.enum(INBOX_TARGETS),
  payload: z.record(z.unknown()),
})

export const putCapacityBody = z.object({
  level: capacityLevel,
  endsAt: isoDateTime.nullable().default(null),
  acceptsNewAssignments: z.boolean().default(true),
  criticalOnly: z.boolean().default(false),
  mutePush: z.boolean().default(false),
  reasonCategory: capacityReason.default('unspecified'),
  note: z.string().max(500).optional(),
})

/* ── Kalender ─────────────────────────────────────────────────────────── */

export const createCalendarConnectionBody = z.object({
  provider: z.enum(CALENDAR_PROVIDERS),
  displayName: z.string().min(1).max(160),
  config: z.object({
    /** Nur für provider='ics'/'caldav'. Wird gegen die SSRF-Allowlist geprüft. */
    url: z.string().url().optional(),
    username: z.string().max(200).optional(),
    password: z.string().max(500).optional(),
  }),
})

export const updateSelectionsBody = z.array(
  z.object({
    externalCalendarId: z.string().min(1).max(512),
    readEnabled: z.boolean(),
    writeEnabled: z.boolean().default(false),
    shareLevel: z.enum(CALENDAR_SHARE_LEVELS).default('busy'),
  }),
)

/* ── Notifications & Governance ───────────────────────────────────────── */

export const putNotificationPreferencesBody = z.array(
  z.object({
    notificationKind: z.enum(NOTIFICATION_KINDS),
    priorityFloor: z.enum(NOTIFICATION_PRIORITIES).default('low'),
    channels: z.array(z.enum(NOTIFICATION_CHANNELS)).default(['in_app']),
    quietHours: z.object({ start: z.string(), end: z.string(), timezone: z.string() }).nullable().default(null),
  }),
)

export const createPushSubscriptionBody = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
})

export const createExportBody = z.object({ scope: z.enum(['household', 'me']).default('household') })

export const createDeletionRequestBody = z.object({
  scope: z.enum(['household', 'person', 'user', 'object']),
  subjectId: uuid.nullable().default(null),
  mode: z.enum(['soft', 'hard']).default('soft'),
  confirmation: z.string().min(1).describe('Name des Objekts als Tippbestätigung'),
})

/* ── Familienübersicht (§31) ──────────────────────────────────────────── */

export const overviewResponse = z.object({
  domains: z.array(
    z.object({
      id: uuid,
      path: z.string(),
      criticality,
      effectiveOwner: z
        .object({ membershipId: uuid, displayName: z.string(), inheritedFrom: z.string().nullable(), viaCoverage: z.boolean() })
        .nullable(),
      openProcesses: z.number().int(),
      openAttention: z.number().int(),
      openQuestions: z.number().int(),
    }),
  ),
  unownedCritical: z.array(z.object({ id: uuid, path: z.string() })),
  activeCoverages: z.array(
    z.object({ id: uuid, domainPath: z.string(), covering: z.string(), until: isoDateTime, state: z.string() }),
  ),
  reducedCapacity: z.array(z.object({ membershipId: uuid, displayName: z.string(), level: capacityLevel })),
  note: z.string().describe('§31: keine Leistungsbewertung – Text erklärt das explizit'),
})
