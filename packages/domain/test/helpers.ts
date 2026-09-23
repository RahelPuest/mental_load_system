import type { EffectiveContext, GrantRecord, ResourceRef } from '../src/types.js'
import type { Capability, HouseholdRole, Sensitivity } from '@thealotta/contracts'

export const HH = '11111111-1111-4111-8111-111111111111'
export const OTHER_HH = '22222222-2222-4222-8222-222222222222'

export const DOMAINS = {
  kinder: { id: 'd-kinder', path: 'kinder' },
  kindA: { id: 'd-kind-a', path: 'kinder.kind_a' },
  kleidung: { id: 'd-kleidung', path: 'kinder.kind_a.kleidung' },
  schuhe: { id: 'd-schuhe', path: 'kinder.kind_a.kleidung.schuhe' },
  gesundheit: { id: 'd-gesundheit', path: 'kinder.kind_a.gesundheit' },
  haushalt: { id: 'd-haushalt', path: 'haushalt' },
} as const

export const domainPaths = new Map(Object.values(DOMAINS).map((d) => [d.id, d.path]))

export function ctx(overrides: Partial<EffectiveContext> = {}): EffectiveContext {
  return {
    actor: { kind: 'user', userId: 'u1', membershipId: 'm1', correlationId: 'c1' },
    evaluatedAt: new Date(),
    householdIds: [HH],
    householdId: HH,
    membershipId: 'm1',
    role: 'adult' as HouseholdRole,
    grants: [],
    assignments: [],
    activeCoverages: [],
    domainPaths,
    capacity: { level: 'normal', acceptsNewAssignments: true, criticalOnly: false, mutePush: false },
    ...overrides,
  }
}

export function grant(over: Partial<GrantRecord> & Pick<GrantRecord, 'capability'>): GrantRecord {
  return {
    id: `g-${Math.random().toString(36).slice(2, 8)}`,
    membershipId: 'm1',
    scopeType: 'household',
    scopeId: null,
    maxSensitivity: 'normal',
    effect: 'allow',
    expiresAt: null,
    ...over,
  }
}

export function res(over: Partial<ResourceRef> = {}): ResourceRef {
  return { type: 'domain', id: DOMAINS.schuhe.id, householdId: HH, domainId: DOMAINS.schuhe.id, ...over }
}

export const cap = (c: Capability): Capability => c
export const sens = (s: Sensitivity): Sensitivity => s
