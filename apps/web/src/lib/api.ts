import type { ColorTone, DishRating, MealSuitability, NowResponse } from '@thealotta/contracts'
import { readSetting, writeSetting } from './storage.js'

/**
 * Dünner API-Client.
 *
 * Zwei Dinge sind hier wichtig:
 *  1. Das CSRF-Token wird aus dem lesbaren Cookie gelesen und bei jeder Mutation mitgeschickt.
 *  2. Quick Capture funktioniert offline: fehlgeschlagene Erfassungen landen in einer lokalen
 *     Warteschlange und werden mit einem stabilen Idempotency-Key nachgesendet (§20, docs/09 §6).
 */
const BASE = '/api/v1'

/**
 * Ein Fehler vom Server.
 *
 * `title` ist die Kategorie („Konflikt."), `detail` der Satz, den jemand für diesen Fall
 * geschrieben hat („In „Schuhe" steht schon etwas: 13 Aufgaben …"). Bis hierher zeigte die
 * Oberfläche überall nur den Titel – die eigentliche Erklärung wurde übertragen und
 * verworfen. `message` ist deshalb das Genauere von beidem.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(detail?.trim() || title)
  }
}

function csrfToken(): string {
  /* Neuer Name zuerst, alter als Rückfall – bis die Sitzung einmal erneuert wurde (§24). */
  const match =
    document.cookie.match(/(?:^|;\s*)thealotta_csrf=([^;]+)/) ??
    document.cookie.match(/(?:^|;\s*)mira_csrf=([^;]+)/)
  return match?.[1] ?? ''
}

async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(method === 'GET' ? {} : { 'x-csrf-token': csrfToken() }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 204) return undefined as T
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const problem = payload as { code?: string; title?: string; detail?: string }
    throw new ApiError(response.status, problem.code ?? 'error', problem.title ?? 'Etwas hat nicht geklappt.', problem.detail)
  }
  return payload as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('POST', path, body ?? {}, headers),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}

/* ── Domänenspezifische Aufrufe ─────────────────────────────────────── */

export interface MeResponse {
  user: { id: string; displayName: string; email: string }
  memberships: { householdId: string; membershipId: string; role: string; displayName: string }[]
}

export interface HouseholdSummary {
  id: string
  name: string
  timezone: string
  role: string
  /** Die eigene Mitgliedschaft in diesem Haushalt. */
  membershipId: string
}

export interface DomainEntry {
  id: string
  parentId: string | null
  path: string
  name: string
  criticality: string
  sensitivity: string
  archivedAt: string | null
  effectiveOwner: {
    membershipId: string
    displayName: string
    inheritedFrom: string | null
    viaCoverage: boolean
    /** Bei geteilter Verantwortung: alle Beteiligten. Sonst leer. */
    sharedNames?: string[]
  } | null
}

export interface AttentionEntry {
  id: string
  domainId: string
  signalKind: string
  title: string
  whyNow: string
  ifItWaits: string
  state: string
  severity: string
  supportingSignals: { id: string; detectedAt: string; rationale: string; resolved: boolean }[]
}

export interface StateEntry {
  id: string
  definition: {
    id: string
    label: string
    key: string
    dataType: string
    unit: string | null
    isCritical: boolean
    freshnessInterval: string | null
    sensitivity: string
  }
  valueKind: 'known' | 'unknown' | 'not_applicable'
  value: unknown
  verifiedAt: string | null
  isStale: boolean
  origin: string
  confirmedAt: string | null
  version: number
  conflict: { state: string; observations: { id: string; value: unknown; observedAt: string; observedBy: string | null }[] } | null
}

export interface MonitorEntry {
  id: string
  name: string
  ruleKind: string
  /** `create_task` legt eine Aufgabe an, `attention_item` meldet sich nur. */
  defaultResponse: string
  config?: Record<string, unknown>
  enabled: boolean
  lastEvaluatedAt: string | null
  nextEvaluationAt: string
  domainId: string
  stateDefinitionId: string | null
  /** Was die Regel bisher bewirkt hat – null, solange sie nie gelaufen ist. */
  bilanz?: {
    gemeldet: number
    gefuehrtZu: number
    weggeklickt: number
    seit: string | null
  } | null
}

/** Ein Vorgang in der Liste – mit Stand und nächstem Schritt (§14). */
export interface ProcessSummary {
  id: string
  title: string
  goal: string | null
  state: string
  domainId: string
  outcome: string | null
  progress: { done: number; total: number; open: number }
  nextStep: { id: string; title: string; assigneeMembershipId: string | null } | null
  waiting: boolean
}

export interface AgendaEntry {
  kind: 'event' | 'task' | 'check'
  id: string
  title: string
  at: string
  endsAt: string | null
  allDay: boolean
  domain: { id: string; name: string } | null
  owner: { membershipId: string; displayName: string } | null
  assignee: { membershipId: string; displayName: string } | null
  hidden: boolean
}

export interface AgendaResponse {
  from: string
  to: string
  overdue: AgendaEntry[]
  days: { date: string; entries: AgendaEntry[] }[]
  perMember: {
    membershipId: string
    displayName: string
    open: number
    waiting: number
    items: { id: string; title: string; domain: string | null }[]
  }[]
  unassigned: { id: string; title: string; domain: string | null }[]
}

export interface DomainDetail {
  domain: DomainEntry
  children: DomainEntry[]
  states: StateEntry[]
  monitors: MonitorEntry[]
  knowledge: { id: string; title: string; body: string; kind: string; origin: string; confirmedAt: string | null }[]
  questions: { id: string; body: string; state: string; directedTo: string | null }[]
  decisions: { id: string; title: string; body: string; decisionKind: string; bindingLevel: string }[]
  processes: { id: string; title: string; state: string; goal: string | null }[]
  /** Offene Einzelaufgaben dieses Bereichs – Vorgangsschritte stehen bei ihrem Vorgang. */
  tasks?: {
    id: string
    title: string
    state: string
    dueAt: string | null
    deferUntil: string | null
    assigneeMembershipId: string | null
    estimatedMinutes: number | null
    /* Zum Bearbeiten nötig: Ein Formular, das den aktuellen Wert nicht kennt, überschreibt ihn nur. */
    mentalEnergy: string
    origin: string
    rationale: string | null
  }[]
  attention: AttentionEntry[]
}

export interface ProcessDetail {
  process: { id: string; title: string; goal: string | null; state: string; domainId: string; outcome: string | null }
  tasks: {
    id: string
    title: string
    description: string | null
    state: string
    position: number
    estimatedMinutes: number | null
    mentalEnergy: string
    assigneeMembershipId: string | null
  }[]
  nextActions: { id: string; title: string }[]
  openTaskCount: number
  nextStepHint: string
}

export interface PlaybookEntry {
  id: string
  title: string
  triggerDescription: string
  domainId: string | null
  steps: { id: string; position: number; title: string; description: string | null; estimatedMinutes: number | null; mentalEnergy: string }[]
}

export interface NotificationPreference {
  notificationKind: string
  priorityFloor: string
  channels: string[]
  quietHours: { start: string; end: string; timezone: string } | null
  configurable: boolean
  explanation: string
}

export interface CalendarConnection {
  id: string
  provider: string
  displayName: string
  state: string
  lastSyncAt: string | null
  lastErrorCode: string | null
  consecutiveFailures: number
  selections: { externalCalendarId: string; readEnabled: boolean; writeEnabled: boolean; shareLevel: string; displayName: string }[]
}

export interface CareEntry {
  domainId: string
  name: string
  criticality: string
  hasCoverage: boolean
  activeProcesses: number
  activeChecks: number
  recommendation: 'needs_handover' | 'covered' | 'can_pause'
  reason: string
}

export interface SearchHit {
  kind: 'domain' | 'person' | 'state' | 'knowledge' | 'question' | 'decision' | 'process' | 'task' | 'playbook' | 'rule'
  id: string
  title: string
  subtitle: string
  domainId: string | null
  href: string
}

const hh = (householdId: string) => `/households/${householdId}`

/** Nur die Abweichungen von der abgeleiteten Voreinstellung. Leer heißt: alles wie gehabt. */
export interface ColorMap {
  members: Record<string, ColorTone>
  domains: Record<string, ColorTone>
}


/* ══ Essensplanung (docs/63) ══════════════════════════════════════════
 *
 * Ein Objekt, nicht zwei: `Dish` **ist** das Rezept. Alles außer dem Namen darf fehlen.
 */
export interface Dish {
  id: string
  name: string
  description: string | null
  servings: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  totalMinutes: number | null
  steps: string | null
  notes: string | null
  sourceUrl: string | null
  imageUrl: string | null
  excludedFromSuggestions: boolean
  /** Wofür das Gericht passt: `both`, `lunch` oder `dinner`. */
  suitableFor: MealSuitability
  archivedAt: string | null
  tags: string[]
  ingredients: { id: string; name: string; quantity: number | null; unit: string | null; note: string | null }[]
  ratings: { membershipId: string; displayName: string; rating: DishRating }[]
  /** Aus dem Plan abgeleitet – niemand pflegt das (§48). */
  lastPlannedOn: string | null
  plannedCount: number
  plannedLast90: number
}

export interface DishInput {
  name: string
  description?: string | null
  servings?: number | null
  prepMinutes?: number | null
  cookMinutes?: number | null
  steps?: string | null
  notes?: string | null
  sourceUrl?: string | null
  imageUrl?: string | null
  excludedFromSuggestions?: boolean
  suitableFor?: MealSuitability
  tags?: string[]
  ingredients?: { name: string; quantity?: number | null; unit?: string | null; note?: string | null }[]
}

export interface MealEntry {
  id: string
  dishId: string
  dishName: string
  totalMinutes: number | null
  servings: number | null
  note: string | null
  locked: boolean
  source: string
  suggestionReason: string | null
}

export interface MealWeek {
  weekStart: string
  defaultServings: number
  days: { date: string; weekday: number; slots: { slot: string; entry: MealEntry | null }[] }[]
}

export interface FillRequest {
  weekStart: string
  only?: { date: string; slot: string }[]
  replace?: boolean
  mode?: string
  requireTags?: string[]
  excludeTags?: string[]
  maxMinutes?: number | null
  seed?: number
}

export interface FillResult {
  filled: { date: string; slot: string; dishId: string; dishName: string; reason: string }[]
  unfilled: { date: string; slot: string; reason: string }[]
}

export interface DayRule {
  weekday: number
  slot: string | null
  maxMinutes: number | null
  requireTags: string[]
  excludeTags: string[]
  note?: string | null
}

export interface MealSettings {
  lunchWeekdays: number[]
  defaultServings: number
  suggestionMode: string
  dayRules: DayRule[]
}

export interface ShoppingItem {
  id: string
  name: string
  quantity: number | null
  unit: string | null
  note: string | null
  checked: boolean
  haveAtHome: boolean
  origin: string
  pushedAt: string | null
}

export interface ShoppingList {
  id: string | null
  weekStart: string
  items: ShoppingItem[]
}

export interface UpcomingMeal {
  date: string
  slot: string
  dishName: string
  totalMinutes: number | null
}

/** Was sich aus einem Bereich in einen anderen umhängen lässt (docs/72). */
export type MoveItemKind = 'state' | 'knowledge' | 'question' | 'decision' | 'monitor' | 'process' | 'task'
export interface MoveItemRef {
  kind: MoveItemKind
  id: string
}
export interface MovedItem extends MoveItemRef {
  title: string
  /** Nur an dem gesetzt, was nicht gewählt war, sondern untrennbar dazugehört. */
  grund?: string
}
export interface MoveItemsResult {
  moved: MovedItem[]
  mitgenommen: MovedItem[]
}

export const endpoints = {
  me: () => api.get<MeResponse>('/auth/me'),
  login: (email: string, password: string) => api.post<{ csrfToken: string }>('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  register: (email: string, password: string, displayName: string) =>
    api.post<{ userId: string }>('/auth/register', { email, password, displayName }),
  households: () => api.get<{ items: HouseholdSummary[] }>('/households'),
  createHousehold: (name: string, timezone: string) =>
    api.post<{ householdId: string }>('/households', { name, timezone, template: 'family_de' }),

  /* Farben – pro Betrachter, nicht pro Haushalt. */
  colors: (id: string) => api.get<ColorMap>(`${hh(id)}/colors`),
  setColor: (id: string, subject: 'member' | 'domain', subjectId: string, tone: ColorTone | null) =>
    api.put(`${hh(id)}/colors/${subject}/${subjectId}`, { tone }),

  search: (id: string, q: string) => api.get<{ items: SearchHit[] }>(`${hh(id)}/search?q=${encodeURIComponent(q)}`),

  /* Jetzt-Ansicht und Erfassung */
  /*
   * Ohne Kontextliste: Umstände werden nicht mehr von Hand gewählt.
   * Der Server leitet ab, was ableitbar ist (Wochentag, Tageszeit); alles andere war eine
   * Frage an die Nutzerin, die sie nie beantworten wollte.
   */
  now: (id: string, plan?: { horizon: string; strategy: string; aging: boolean; slack: boolean; remember?: boolean }) => {
    // Ohne Planparameter bleibt der Aufruf wörtlich der alte – „Jetzt" antwortet wie bisher.
    if (!plan) return api.get<NowResponse>(`${hh(id)}/now`)
    const q = new URLSearchParams({
      horizon: plan.horizon,
      strategy: plan.strategy,
      // Leerer Wert heißt bei z.coerce.boolean() „falsch", jeder nichtleere „wahr".
      aging: plan.aging ? '1' : '',
      slack: plan.slack ? '1' : '',
      ...(plan.remember ? { remember: '1' } : {}),
    })
    return api.get<NowResponse>(`${hh(id)}/now?${q.toString()}`)
  },
  inbox: (id: string) =>
    api.get<{ items: { id: string; rawText: string; state: string; suggestion: {
        targetType: string
        reason: string
        domainId: string | null
        fields: Record<string, unknown>
      } | null }[] }>(
      `${hh(id)}/inbox`,
    ),
  processInbox: (id: string, itemId: string, targetType: string, payload: Record<string, unknown>) =>
    api.post(`${hh(id)}/inbox/${itemId}/process`, { targetType, payload }),
  discardInbox: (id: string, itemId: string, reason: string) =>
    api.post(`${hh(id)}/inbox/${itemId}/discard`, { reason }),

  /* Bereiche und Verantwortung */
  domains: (id: string) => api.get<{ items: DomainEntry[] }>(`${hh(id)}/domains`),
  domainDetail: (id: string, domainId: string) => api.get<DomainDetail>(`${hh(id)}/domains/${domainId}/detail`),
  /** Nur mitschicken, was sich ändern soll – Weggelassenes bleibt, wie es war. */
  updateDomain: (
    id: string,
    domainId: string,
    body: {
      name?: string
      parentId?: string | null
      criticality?: string
      sensitivity?: string
      description?: string | null
    },
  ) => api.patch<DomainEntry>(`${hh(id)}/domains/${domainId}`, body),
  moveDomain: (id: string, domainId: string, direction: 'up' | 'down' | 'in' | 'out') =>
    api.post(`${hh(id)}/domains/${domainId}/move`, { direction }),
  repositionDomain: (id: string, domainId: string, target: { parentId: string | null; beforeId: string | null }) =>
    api.post(`${hh(id)}/domains/${domainId}/reposition`, target),
  /*
    Inhalte in einen anderen Bereich umhängen. Der Bereich in der Adresse ist die Quelle:
    Man steht in dem Bereich, aus dem etwas weggeht.
  */
  moveDomainItems: (id: string, domainId: string, targetDomainId: string, items: MoveItemRef[]) =>
    api.post<MoveItemsResult>(`${hh(id)}/domains/${domainId}/move-items`, { targetDomainId, items }),
  archiveDomain: (id: string, domainId: string) => api.post(`${hh(id)}/domains/${domainId}/archive`),
  unarchiveDomain: (id: string, domainId: string) => api.post(`${hh(id)}/domains/${domainId}/unarchive`),
  deleteDomain: (id: string, domainId: string) => api.del(`${hh(id)}/domains/${domainId}`),

  createDomain: (id: string, body: unknown) => api.post<{ id: string }>(`${hh(id)}/domains`, body),
  shareDomainWithAll: (id: string, domainId: string) =>
    api.post<{ members: number }>(`${hh(id)}/domains/${domainId}/share-all`),
  claimDomain: (id: string, domainId: string) => api.post(`${hh(id)}/domains/${domainId}/claim`, {}),
  assignDomain: (id: string, domainId: string, body: unknown) =>
    api.post(`${hh(id)}/domains/${domainId}/assignments`, body),
  transferDomain: (id: string, domainId: string, body: unknown) =>
    api.post(`${hh(id)}/domains/${domainId}/transfer`, body),
  ownershipHistory: (id: string, domainId: string) =>
    api.get<{ owners: { membershipId: string; assignmentKind: string; from: string; to: string | null; endReason: string | null }[] }>(
      `${hh(id)}/domains/${domainId}/ownership-history`,
    ),

  /* Zustand */
  createStateDefinition: (id: string, domainId: string, body: unknown) =>
    api.post<{ id: string }>(`${hh(id)}/domains/${domainId}/state-definitions`, body),
  updateStateDefinition: (id: string, definitionId: string, body: unknown) =>
    api.patch<{ id: string; label: string }>(`${hh(id)}/state-definitions/${definitionId}`, body),
  setStateValue: (id: string, definitionId: string, body: unknown) =>
    api.put<{ value: StateEntry; applied: boolean; rule: string }>(`${hh(id)}/state-definitions/${definitionId}/value`, body),
  resolveConflict: (id: string, stateValueId: string, body: unknown) =>
    api.post(`${hh(id)}/state-values/${stateValueId}/resolve-conflict`, body),

  /* Beobachtung und Aufmerksamkeit */
  monitors: (id: string, domainId?: string) =>
    api.get<{ items: MonitorEntry[] }>(`${hh(id)}/monitors${domainId ? `?domainId=${domainId}` : ''}`),
  /** Eine Regel nachträglich ändern – alles freiwillig, nur Mitgeschicktes ändert sich. */
  updateMonitor: (id: string, monitorId: string, body: Record<string, unknown>) =>
    api.patch<{ ok: boolean }>(`${hh(id)}/monitors/${monitorId}`, body),
  setMonitorEnabled: (id: string, monitorId: string, enabled: boolean) =>
    api.patch(`${hh(id)}/monitors/${monitorId}`, { enabled }),
  deleteMonitor: (id: string, monitorId: string) => api.del(`${hh(id)}/monitors/${monitorId}`),
  createMonitor: (id: string, body: unknown) => api.post<{ id: string }>(`${hh(id)}/monitors`, body),
  evaluateMonitor: (id: string, monitorId: string) =>
    api.post<{ signalsCreated: number; attentionCreated: string[] }>(`${hh(id)}/monitors/${monitorId}/evaluate`),
  attention: (id: string) => api.get<{ items: AttentionEntry[] }>(`${hh(id)}/attention?state=open`),
  triage: (id: string, itemId: string, action: string, body?: unknown) =>
    api.post(`${hh(id)}/attention/${itemId}/${action}`, body ?? {}),
  promote: (id: string, itemId: string, processTitle?: string) =>
    api.post<{ processId: string }>(`${hh(id)}/attention/${itemId}/promote`, { processTitle }),

  /* Vorgänge, Aufgaben, Playbooks */
  processes: (id: string, state = 'active') =>
    api.get<{ items: ProcessSummary[] }>(`${hh(id)}/processes?state=${state}`),
  process: (id: string, processId: string) => api.get<ProcessDetail>(`${hh(id)}/processes/${processId}`),
  createProcess: (id: string, body: unknown) => api.post<{ id: string }>(`${hh(id)}/processes`, body),
  completeProcess: (id: string, processId: string, body: unknown) =>
    api.post(`${hh(id)}/processes/${processId}/complete`, body),
  createTask: (id: string, body: unknown) => api.post<{ id: string }>(`${hh(id)}/tasks`, body),
  /* Berichtigen bestehender Einträge – nur die mitgeschickten Felder ändern sich. */
  updateTask: (id: string, taskId: string, body: unknown) => api.patch<{ id: string }>(`${hh(id)}/tasks/${taskId}`, body),
  updateProcess: (id: string, processId: string, body: unknown) =>
    api.patch<{ id: string }>(`${hh(id)}/processes/${processId}`, body),
  updateKnowledge: (id: string, knowledgeId: string, body: unknown) =>
    api.patch<{ id: string }>(`${hh(id)}/knowledge/${knowledgeId}`, body),
  updateQuestion: (id: string, questionId: string, body: unknown) =>
    api.patch<{ id: string }>(`${hh(id)}/questions/${questionId}`, body),
  updateDecision: (id: string, decisionId: string, body: unknown) =>
    api.patch<{ id: string }>(`${hh(id)}/decisions/${decisionId}`, body),
  completeTask: (id: string, taskId: string, body?: unknown) => api.post(`${hh(id)}/tasks/${taskId}/complete`, body ?? {}),
  reopenTask: (id: string, taskId: string) => api.post(`${hh(id)}/tasks/${taskId}/reopen`, {}),
  deferTask: (id: string, taskId: string, body: unknown) => api.post(`${hh(id)}/tasks/${taskId}/defer`, body),
  dropTask: (id: string, taskId: string, reason: string) => api.post(`${hh(id)}/tasks/${taskId}/drop`, { reason }),
  /* Nur für die unberührte Aufgabe – sonst antwortet der Server mit dem Weg über „drop". */
  deleteTask: (id: string, taskId: string) => api.del(`${hh(id)}/tasks/${taskId}`),
  waitTask: (id: string, taskId: string, body: unknown) => api.post(`${hh(id)}/tasks/${taskId}/wait`, body),
  releaseWait: (id: string, taskId: string) => api.post(`${hh(id)}/tasks/${taskId}/release-wait`),
  startTask: (id: string, taskId: string) => api.post(`${hh(id)}/tasks/${taskId}/start`),
  assignTask: (id: string, taskId: string, body: unknown) => api.post(`${hh(id)}/tasks/${taskId}/assign`, body),
  playbooks: (id: string) => api.get<{ items: PlaybookEntry[]; note: string }>(`${hh(id)}/playbooks`),
  createPlaybook: (id: string, body: unknown) => api.post<{ id: string }>(`${hh(id)}/playbooks`, body),
  instantiatePlaybook: (id: string, playbookId: string, body: unknown) =>
    api.post<{ id: string }>(`${hh(id)}/playbooks/${playbookId}/instantiate`, body),
  playbookSuggestions: (id: string, domainId: string, title: string) =>
    api.get<{ items: { id: string; title: string; reason: string }[] }>(
      `${hh(id)}/playbook-suggestions?domainId=${domainId}&title=${encodeURIComponent(title)}`,
    ),

  /* Wissen */
  knowledge: (id: string, domainId?: string) =>
    api.get<{ items: { id: string; title: string; body: string; kind: string; domainId: string | null; origin: string; confirmedAt: string | null }[] }>(
      `${hh(id)}/knowledge${domainId ? `?domainId=${domainId}` : ''}`,
    ),
  createKnowledge: (id: string, body: unknown) => api.post<{ id: string }>(`${hh(id)}/knowledge`, body),
  questions: (id: string, state = 'open') =>
    api.get<{ items: { id: string; body: string; state: string; domainId: string | null; directedTo: string | null; answerBody: string | null }[] }>(
      `${hh(id)}/questions?state=${state}`,
    ),
  createQuestion: (id: string, body: unknown) => api.post<{ id: string }>(`${hh(id)}/questions`, body),
  answerQuestion: (id: string, questionId: string, body: unknown) =>
    api.post(`${hh(id)}/questions/${questionId}/answer`, body),
  decisions: (id: string) =>
    api.get<{ items: { id: string; title: string; body: string; decisionKind: string; bindingLevel: string; domainId: string | null }[] }>(
      `${hh(id)}/decisions`,
    ),
  createDecision: (id: string, body: unknown) => api.post<{ id: string }>(`${hh(id)}/decisions`, body),

  /* Der gemeinsame Plan */
  agenda: (id: string, days = 7) => api.get<AgendaResponse>(`${hh(id)}/agenda?days=${days}`),

  /* Familie */
  /** Jemand verlässt den Haushalt. Antwortet mit dem, was dadurch ohne Zuständige dasteht. */
  removeMember: (id: string, membershipId: string) =>
    api.del<{
      vacatedDomains: { id: string; name: string; criticality: string }[]
      unassignedTasks: number
      note: string
    }>(`${hh(id)}/members/${membershipId}`),
  members: (id: string) =>
    api.get<{ items: { id: string; displayName: string; role: string; status: string }[] }>(`${hh(id)}/members`),
  persons: (id: string) =>
    api.get<{ items: { id: string; displayName: string; personKind: string; birthDate: string | null }[] }>(`${hh(id)}/persons`),
  createPerson: (id: string, body: unknown) => api.post<{ id: string }>(`${hh(id)}/persons`, body),
  grants: (id: string) =>
    api.get<{
      items: {
        id: string
        membershipId: string
        capability: string
        scopeType: string
        scopeId: string | null
        scopeName: string | null
        maxSensitivity: string
        effect: string
      }[]
    }>(`${hh(id)}/grants`),
  createGrant: (id: string, body: unknown) => api.post<{ id: string }>(`${hh(id)}/grants`, body),
  revokeGrant: (id: string, grantId: string) => api.del(`${hh(id)}/grants/${grantId}`),
  changeRole: (id: string, membershipId: string, role: string) =>
    api.patch(`${hh(id)}/members/${membershipId}/role`, { role }),
  overview: (id: string) =>
    api.get<{
      domains: { id: string; path: string; name: string; criticality: string; effectiveOwner: { membershipId: string; displayName: string; inheritedFrom: string | null; viaCoverage: boolean } | null }[]
      unownedCritical: { id: string; path: string }[]
      activeCoverages: { id: string; domainId: string; until: string; state: string }[]
      reducedCapacity: { membershipId: string; displayName: string; level: string }[]
      note: string
    }>(`${hh(id)}/overview`),
  capacity: (id: string) =>
    api.get<{
      level: string
      acceptsNewAssignments: boolean
      criticalOnly: boolean
      mutePush: boolean
      endsAt: string | null
    }>(`${hh(id)}/capacity/me`),
  setCapacity: (id: string, body: Record<string, unknown>) =>
    api.put<{ coverageGaps: { domainId: string }[]; note: string }>(`${hh(id)}/capacity/me`, body),
  clearCapacity: (id: string) => api.del(`${hh(id)}/capacity/me`),
  coverages: (id: string) =>
    api.get<{ items: { id: string; domainId: string; coveringMembershipId: string; startsAt: string; endsAt: string; state: string; returnMode: string }[] }>(
      `${hh(id)}/coverages`,
    ),
  createCoverage: (id: string, body: unknown) => api.post<{ id: string }>(`${hh(id)}/coverages`, body),
  confirmCoverageReturn: (id: string, coverageId: string) =>
    api.post(`${hh(id)}/coverages/${coverageId}/confirm-return`, {}),

  /* Einstellungen */
  settings: (id: string) =>
    api.get<{
      name: string
      timezone: string
      notificationContentLevel: string
      balanceViewEnabled: boolean
      yourRole: string
      explanations: Record<string, string>
    }>(`${hh(id)}/settings`),
  updateSettings: (id: string, body: unknown) => api.patch(`${hh(id)}/settings`, body),
  notificationPreferences: (id: string) =>
    api.get<{ items: NotificationPreference[]; note: string }>(`${hh(id)}/notification-preferences`),
  setNotificationPreferences: (id: string, body: unknown) => api.put(`${hh(id)}/notification-preferences`, body),
  pushSubscriptions: (id: string) =>
    api.get<{ items: { id: string; createdAt: string; lastSuccessAt: string | null; disabledAt: string | null }[] }>(
      `${hh(id)}/push-subscriptions`,
    ),
  addPushSubscription: (id: string, body: unknown) => api.post<{ id: string }>(`${hh(id)}/push-subscriptions`, body),
  pushConfig: () => api.get<{ publicKey: string | null }>('/push/config'),
  removePushSubscription: (id: string, subId: string) => api.del(`${hh(id)}/push-subscriptions/${subId}`),

  /* Kalender */
  calendarConnections: (id: string) =>
    api.get<{ own: CalendarConnection[]; othersCount: number; note: string }>(`${hh(id)}/calendar-connections`),
  connectCalendar: (id: string, body: unknown) => api.post<{ id: string }>(`${hh(id)}/calendar-connections`, body),
  updateCalendarSelection: (id: string, connectionId: string, body: unknown) =>
    api.patch(`${hh(id)}/calendar-connections/${connectionId}/selection`, body),
  syncCalendar: (id: string, connectionId: string) =>
    api.post<{ note: string }>(`${hh(id)}/calendar-connections/${connectionId}/sync`),
  disconnectCalendar: (id: string, connectionId: string) => api.del(`${hh(id)}/calendar-connections/${connectionId}`),
  calendarEvents: (id: string) =>
    api.get<{ items: { id: string; title: string; startsAt: string; endsAt: string; allDay: boolean; isMine: boolean; contentHidden: boolean; location: string | null }[] }>(
      `${hh(id)}/calendar-events`,
    ),

  /* Familie: Verteilung, Entlastung, Übergabe, Bedürfnisse */
  balance: (id: string) =>
    api.get<{
      dimensions: {
        key: string
        label: string
        question: string
        evenlyShared: boolean
        members: { membershipId: string; displayName: string; band: string }[]
      }[]
      dataQuality: { domainsTotal: number; domainsWithOwner: number; note: string }
      note: string
    }>(`${hh(id)}/balance`),
  careMode: (id: string, membershipId: string) =>
    api.get<{
      member: { membershipId: string; displayName: string }
      capacity: { level: string; active: boolean }
      needsHandover: CareEntry[]
      alreadyCovered: CareEntry[]
      canPause: CareEntry[]
      note: string
    }>(`${hh(id)}/care-mode/${membershipId}`),
  handover: (id: string, domainId: string) =>
    api.get<{
      domain: { id: string; name: string }
      openStates: { stateDefinitionId: string; label: string; question: string }[]
      staleStates: { stateDefinitionId: string; label: string; question: string }[]
      openQuestions: { id: string; body: string }[]
      knowledgePrompts: string[]
      note: string
    }>(`${hh(id)}/domains/${domainId}/handover`),
  needs: (id: string) =>
    api.get<{ items: { id: string; domainId: string; description: string; criticality: string; neededBy: string | null }[]; note: string }>(
      `${hh(id)}/needs`,
    ),
  createNeed: (id: string, body: unknown) => api.post<{ id: string }>(`${hh(id)}/needs`, body),
  resolveNeed: (id: string, needId: string, state: 'met' | 'dropped') =>
    api.post(`${hh(id)}/needs/${needId}/resolve`, { state }),

  /* Benachrichtigungen im Produkt */
  notifications: (id: string) =>
    api.get<{
      items: {
        id: string
        kind: string
        priority: string
        title: string
        body: string
        state: string
        readAt: string | null
        createdAt: string
        suppressedReason: string | null
      }[]
      unread: number
      note: string
    }>(`${hh(id)}/notifications`),
  ackNotification: (id: string, notificationId: string) => api.post(`${hh(id)}/notifications/${notificationId}/ack`),
  readAllNotifications: (id: string) => api.post(`${hh(id)}/notifications/read-all`),

  /* Einladungen und Beitritt */
  invitations: (id: string) =>
    api.get<{ items: { id: string; email: string; role: string; expiresAt: string; expired: boolean }[] }>(
      `${hh(id)}/invitations`,
    ),
  invite: (id: string, body: unknown) =>
    api.post<{ id: string; inviteUrl: string; expiresAt: string }>(`${hh(id)}/invitations`, body),
  revokeInvitation: (id: string, invitationId: string) => api.del(`${hh(id)}/invitations/${invitationId}`),
  previewInvitation: (token: string) =>
    api.get<{ householdName: string; role: string; emailHint: string; expiresAt: string }>(
      `/invitations/${token}/preview`,
    ),
  acceptInvitation: (token: string) =>
    api.post<{ householdId: string }>(`/invitations/${token}/accept`, { confirm: true }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ note: string }>('/auth/password', { currentPassword, newPassword }),

  /* Nachvollziehbarkeit und Daten */
  history: (id: string, query: string) =>
    api.get<{
      items: { id: string; eventType: string; subjectType: string; occurredAt: string; actorKind: string; payload: Record<string, unknown> }[]
      hasMore?: boolean
    }>(
      `${hh(id)}/history?${query}`,
    ),
  audit: (id: string) =>
    api.get<{ items: { id: string; action: string; outcome: string; occurredAt: string; metadata: Record<string, unknown> }[] }>(
      `${hh(id)}/audit`,
    ),
  /**
   * Die Sicherungsdatei – als Text, damit der Browser sie direkt anbieten kann.
   *
   * Nicht über `api.get`: Das würde die Datei durch `JSON.parse` und zurück schicken, nur
   * um sie danach wieder zu serialisieren. Der Rohtext ist genau das, was gespeichert wird.
   */
  exportHousehold: async (id: string): Promise<{ text: string; dateiname: string }> => {
    const antwort = await fetch(`${BASE}${hh(id)}/export`, { credentials: 'include' })
    if (!antwort.ok) throw new ApiError(antwort.status, 'export_failed', 'Der Export ist nicht durchgekommen.')
    const kopf = antwort.headers.get('content-disposition') ?? ''
    return {
      text: await antwort.text(),
      dateiname: /filename="([^"]+)"/.exec(kopf)?.[1] ?? 'thealotta-export.json',
    }
  },
  /* ── Essensplanung (docs/63) ────────────────────────────────────── */
  dishes: (id: string, query = '') => api.get<{ items: Dish[] }>(`${hh(id)}/dishes${query}`),
  createDish: (id: string, body: DishInput) => api.post<{ id: string }>(`${hh(id)}/dishes`, body),
  updateDish: (id: string, dishId: string, body: Partial<DishInput>) =>
    api.patch<void>(`${hh(id)}/dishes/${dishId}`, body),
  deleteDish: (id: string, dishId: string) => api.del<void>(`${hh(id)}/dishes/${dishId}`),
  archiveDish: (id: string, dishId: string, archived: boolean) =>
    api.post<void>(`${hh(id)}/dishes/${dishId}/archive`, { archived }),
  rateDish: (id: string, dishId: string, rating: DishRating | null) =>
    api.put<void>(`${hh(id)}/dishes/${dishId}/preference`, { rating }),

  mealWeek: (id: string, start: string) => api.get<MealWeek>(`${hh(id)}/meals/week?start=${start}`),
  planMeal: (
    id: string,
    body: { date: string; slot: string; dishId: string; servings?: number | null; note?: string | null },
  ) =>
    api.put<{ id: string }>(`${hh(id)}/meals/entry`, body),
  unplanMeal: (id: string, date: string, slot: string) =>
    api.del<void>(`${hh(id)}/meals/entry?date=${date}&slot=${slot}`),
  moveMeal: (
    id: string,
    from: { date: string; slot: string },
    to: { date: string; slot: string },
    mode: 'move' | 'copy' = 'move',
  ) => api.post<void>(`${hh(id)}/meals/move`, { from, to, mode }),
  lockMeal: (id: string, date: string, slot: string, locked: boolean) =>
    api.post<void>(`${hh(id)}/meals/lock`, { date, slot, locked }),
  fillWeek: (id: string, body: FillRequest) => api.post<FillResult>(`${hh(id)}/meals/week/fill`, body),

  mealSettings: (id: string) => api.get<MealSettings>(`${hh(id)}/meals/settings`),
  updateMealSettings: (id: string, body: Partial<Omit<MealSettings, 'dayRules'>>) =>
    api.patch<void>(`${hh(id)}/meals/settings`, body),
  setDayRule: (id: string, body: DayRule) => api.put<void>(`${hh(id)}/meals/day-rules`, body),

  shoppingList: (id: string, start: string) => api.get<ShoppingList>(`${hh(id)}/meals/shopping?start=${start}`),
  buildShoppingList: (id: string, weekStart: string) =>
    api.post<{ listId: string; added: number; kept: number; items: ShoppingItem[] }>(
      `${hh(id)}/meals/shopping/build`,
      { weekStart },
    ),
  saveShoppingItem: (
    id: string,
    listId: string,
    body: {
      id?: string
      name?: string
      quantity?: number | null
      unit?: string | null
      note?: string | null
      checked?: boolean
      haveAtHome?: boolean
    },
  ) => api.put<{ id: string }>(`${hh(id)}/meals/shopping/${listId}/items`, body),
  deleteShoppingItem: (id: string, listId: string, itemId: string) =>
    api.del<void>(`${hh(id)}/meals/shopping/${listId}/items/${itemId}`),
  pushShoppingList: (id: string, listId: string) =>
    api.post<{ pushed: number; failed: number; items: { name: string; grund: string }[]; note?: string }>(
      `${hh(id)}/meals/shopping/${listId}/push`,
      {},
    ),
  upcomingMeals: (id: string, days = 2) =>
    api.get<{ today: string; weekStart: string; items: UpcomingMeal[] }>(`${hh(id)}/meals/upcoming?days=${days}`),

  /* Bring! – Einkäufe dorthin, wo eingekauft wird. */
  bringStatus: (id: string) =>
    api.get<{
      verbindung: {
        email: string
        listUuid: string | null
        listName: string | null
        state: string
        lastPushAt: string | null
        lastErrorCode: string | null
      } | null
    }>(`${hh(id)}/bring`),
  bringConnect: (id: string, email: string, passwort: string) =>
    api.post<{ listen: { uuid: string; name: string }[]; email: string }>(`${hh(id)}/bring/connect`, {
      email,
      passwort,
    }),
  bringChooseList: (id: string, listUuid: string, listName: string) =>
    api.post<{ ok: boolean }>(`${hh(id)}/bring/list`, { listUuid, listName }),
  bringDisconnect: (id: string) => api.del(`${hh(id)}/bring`),
  bringPushTask: (id: string, taskId: string) =>
    api.post<{ artikel: string }>(`${hh(id)}/tasks/${taskId}/bring`, {}),
  clearHousehold: (id: string, confirmation: string) =>
    api.post<{ geloescht: Record<string, number> }>(`${hh(id)}/clear`, { confirmation }),
  importHousehold: (id: string, doc: unknown) =>
    api.post<{ angelegt: Record<string, number>; uebersprungen: string[] }>(`${hh(id)}/import`, doc),
  requestDeletion: (id: string, body: unknown) => api.post<{ id: string; note: string }>(`${hh(id)}/deletion-requests`, body),
}

/* ── Offline-fähiges Quick Capture ──────────────────────────────────── */

/*
  Der Puffer für offline Erfasstes zieht mit um (siehe `storage.ts`): Was jemand ohne Netz
  aufgeschrieben hat, darf eine Umbenennung nicht verschlucken.
*/
const QUEUE_KEY = 'capture.queue'

interface QueuedCapture {
  idempotencyKey: string
  householdId: string
  text: string
  createdAt: string
}

const readQueue = (): QueuedCapture[] => {
  try {
    return JSON.parse(readSetting(QUEUE_KEY) ?? '[]') as QueuedCapture[]
  } catch {
    return []
  }
}
const writeQueue = (items: QueuedCapture[]) => writeSetting(QUEUE_KEY, JSON.stringify(items))

export const pendingCaptures = (): number => readQueue().length

/**
 * Erfassen darf nie scheitern (§1.8, §20). Klappt der Netzaufruf nicht, wandert der Eintrag
 * in die lokale Warteschlange – mit einem stabilen Schlüssel, damit ein späterer Versuch
 * keinen zweiten Eintrag erzeugt.
 */
export async function capture(householdId: string, text: string): Promise<{ queued: boolean }> {
  const item: QueuedCapture = {
    idempotencyKey: crypto.randomUUID(),
    householdId,
    text,
    createdAt: new Date().toISOString(),
  }
  try {
    await api.post(`/households/${householdId}/capture`, { text }, { 'idempotency-key': item.idempotencyKey })
    return { queued: false }
  } catch {
    writeQueue([...readQueue(), item])
    return { queued: true }
  }
}

export async function flushCaptures(): Promise<number> {
  const queue = readQueue()
  if (queue.length === 0) return 0
  const remaining: QueuedCapture[] = []
  let sent = 0

  for (const item of queue) {
    try {
      await api.post(
        `/households/${item.householdId}/capture`,
        { text: item.text, occurredAt: item.createdAt },
        { 'idempotency-key': item.idempotencyKey },
      )
      sent += 1
    } catch (error) {
      // 4xx außer 409/429 sind dauerhaft – der Eintrag würde sonst ewig hängen bleiben.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 409 && error.status !== 429) {
        continue
      }
      remaining.push(item)
    }
  }
  writeQueue(remaining)
  return sent
}
