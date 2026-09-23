import type {
  ActorKind,
  AssignmentKind,
  Capability,
  CapacityLevel,
  Criticality,
  EnergyLevel,
  GrantEffect,
  GrantScopeType,
  HouseholdRole,
  Sensitivity,
} from '@thealotta/contracts'

/** Wer handelt. A3-Operationen akzeptieren ausschließlich `kind: 'user'` (ADR-0008). */
export interface ActorContext {
  kind: ActorKind
  userId: string | null
  membershipId: string | null
  /** z. B. 'monitor:<uuid>' – für Herkunftsnachweis automatisch erzeugter Objekte (INV-004). */
  ref?: string
  correlationId: string
}

export interface GrantRecord {
  id: string
  membershipId: string
  scopeType: GrantScopeType
  /** null bei scopeType='household' */
  scopeId: string | null
  capability: Capability
  maxSensitivity: Sensitivity
  effect: GrantEffect
  expiresAt: Date | null
}

export interface AssignmentRecord {
  domainId: string
  membershipId: string
  assignmentKind: AssignmentKind
}

export interface CoverageRecord {
  id: string
  domainId: string
  coveringMembershipId: string
  originalMembershipId: string | null
  startsAt: Date
  endsAt: Date
  state: string
}

export interface DomainNode {
  id: string
  parentId: string | null
  /** Materialisierter Pfad, z. B. 'kinder.kind_a.kleidung.schuhe' */
  path: string
  name: string
  criticality: Criticality
  sensitivity: Sensitivity
  ownershipInheritance: 'inherit' | 'own'
  archivedAt: Date | null
}

/**
 * Alles, was `decide()` über den Akteur wissen muss. Wird einmal je Request geladen
 * und dann durch reine Funktionen gereicht – kein DB-Zugriff in der Autorisierung.
 */
export interface EffectiveContext {
  actor: ActorContext
  /** Zeitpunkt, zu dem der Kontext geladen wurde – Grundlage jeder Ablaufprüfung. */
  evaluatedAt: Date
  householdIds: readonly string[]
  /** Aktueller Household des Requests. */
  householdId: string
  membershipId: string
  role: HouseholdRole
  grants: readonly GrantRecord[]
  assignments: readonly AssignmentRecord[]
  activeCoverages: readonly CoverageRecord[]
  /** Pfad je Domain-ID – für Subtree-Vererbung von Grants und Owner-Rechten. */
  domainPaths: ReadonlyMap<string, string>
  capacity: { level: CapacityLevel; acceptsNewAssignments: boolean; criticalOnly: boolean; mutePush: boolean }
}

/** Das Objekt, auf das zugegriffen wird – reduziert auf das, was die Entscheidung braucht. */
export interface ResourceRef {
  type: string
  id: string | null
  householdId: string
  /** Domain, in der das Objekt liegt (für Domain-Grants und Owner-Rechte). */
  domainId?: string | null
  sensitivity?: Sensitivity
  /** Für Selbstbezug: 'eigene Task abschließen' vs. 'fremde Task abschließen'. */
  ownerMembershipId?: string | null
  assigneeMembershipId?: string | null
}

export interface Decision {
  allowed: boolean
  /** Menschenlesbare, protokollierbare Begründung der gewinnenden Regel. */
  reason: string
  matchedRule: string
  ceiling: Sensitivity | null
}

export interface TaskLike {
  id: string
  title: string
  state: string
  domainId: string | null
  processId: string | null
  assigneeMembershipId: string | null
  dueAt: Date | null
  deferUntil: Date | null
  estimatedMinutes: number | null
  mentalEnergy: EnergyLevel
  position: number
  createdAt: Date
}
