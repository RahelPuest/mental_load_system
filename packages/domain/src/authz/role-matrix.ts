import { SENSITIVITY_LEVELS, type Capability, type HouseholdRole, type Sensitivity } from '@thealotta/contracts'

/**
 * Household-Basisrechte je Rolle (docs/04-permission-model.md §4).
 *
 * Was hier NICHT steht, ist über die Rolle nicht erreichbar und braucht ein explizites Grant.
 * Insbesondere: Kinder- und Gastrollen haben household-weit kein Leserecht auf Domains (§7.2).
 */
const ALL_MEMBERS: Capability[] = [
  'household:read',
  'task:complete',
  'task:create',
  'inbox:capture',
  'capacity:declare_self',
  /*
    Was es zu essen gibt, darf jeder sehen – auch Kinder und Gäste. Es ist die eine Auskunft
    des Haushalts, die alle betrifft und niemanden bloßstellt.
  */
  'meal:read',
]

/*
  Wer betreut, kocht meistens auch. Planen gehört deshalb dazu; die Sammlung zu pflegen –
  und damit Gerichte samt ihrer Geschichte zu löschen – nicht.
*/
const CAREGIVER: Capability[] = [...ALL_MEMBERS, 'calendar:connect', 'meal:plan']

const ADULT: Capability[] = [
  ...ALL_MEMBERS,
  'person:read',
  'person:manage',
  'domain:read',
  'domain:create',
  'domain:manage',
  'ownership:claim',
  'coverage:create',
  'state:read',
  'state:write',
  'state:define',
  'knowledge:read',
  'knowledge:write',
  'decision:write',
  'monitor:read',
  'attention:read',
  'attention:triage',
  'process:read',
  'process:manage',
  'task:read',
  'task:assign',
  'task:complete_others',
  'task:drop',
  'inbox:process',
  'calendar:connect',
  'calendar:read_shared',
  'health:read',
  'capacity:read_others',
  'history:read',
  /* Planen und die Sammlung pflegen: die tägliche Arbeit eines Haushalts. */
  'meal:plan',
  'meal:manage',
]

const ADMIN: Capability[] = [
  ...ADULT,
  'household:manage',
  'household:delete',
  'member:invite',
  'member:manage',
  'role:assign',
  'grant:manage',
  'domain:archive',
  'ownership:assign',
  'ownership:transfer',
  'monitor:manage',
  'attention:suppress',
  'calendar:write_external',
  'audit:read',
  'export:request',
]

export const ROLE_CAPABILITIES: Record<HouseholdRole, ReadonlySet<Capability>> = {
  admin: new Set(ADMIN),
  adult: new Set(ADULT),
  caregiver: new Set(CAREGIVER),
  teen: new Set(ALL_MEMBERS),
  child: new Set(ALL_MEMBERS),
  guest: new Set(ALL_MEMBERS),
}

/**
 * Sensitivity-Obergrenze der Rolle. `sensitive` ist bewusst für niemanden Rollenrecht –
 * auch nicht für Admins (Q-05). Nur ein explizites, auditiertes Grant hebt sie an.
 */
export const ROLE_SENSITIVITY_CEILING: Record<HouseholdRole, Sensitivity> = {
  admin: 'health',
  adult: 'health',
  caregiver: 'normal',
  teen: 'normal',
  child: 'public',
  guest: 'public',
}

/**
 * Rechte, die sich allein aus der Ownership einer Domain ergeben ("O" in der Matrix).
 * Gelten für die Domain und ihren gesamten Subtree.
 */
export const OWNER_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  'domain:read',
  'domain:manage',
  'domain:archive',
  'state:read',
  'state:write',
  'state:define',
  'knowledge:read',
  'knowledge:write',
  'monitor:read',
  'monitor:manage',
  'attention:read',
  'attention:triage',
  'attention:suppress',
  'process:read',
  'process:manage',
  'task:read',
  'task:assign',
  'task:drop',
  'ownership:assign',
  'ownership:transfer',
])

/**
 * INV-003: Eine Vertretung erhält Owner-Rechte, aber NIEMALS das Recht, die permanente
 * Ownership zu verändern.
 */
export const COVERAGE_EXCLUDED_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  'ownership:transfer',
])

export const maxSensitivity = (a: Sensitivity, b: Sensitivity): Sensitivity =>
  SENSITIVITY_LEVELS.indexOf(a) >= SENSITIVITY_LEVELS.indexOf(b) ? a : b
