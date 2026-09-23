import { describe, expect, it } from 'vitest'
import { MS } from '../../src/clock.js'
import { decide } from '../../src/authz/decide.js'
import { resolveEffectiveOwner, type AssignmentRow } from '../../src/ownership.js'
import type { CoverageRecord, DomainNode, EffectiveContext } from '../../src/types.js'

/** INV-003 – Temporäre Vertretung verändert nicht den permanenten Owner. */

const NOW = new Date('2026-09-15T09:00:00.000Z')
const domain: DomainNode = {
  id: 'd-health',
  parentId: null,
  path: 'kinder.kind_a.gesundheit',
  name: 'Gesundheit',
  criticality: 'critical',
  sensitivity: 'health',
  ownershipInheritance: 'own',
  archivedAt: null,
}
const assignment: AssignmentRow = {
  id: 'a1',
  domainId: 'd-health',
  membershipId: 'anna',
  assignmentKind: 'primary_owner',
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  effectiveTo: null,
}
const coverage: CoverageRecord = {
  id: 'cov',
  domainId: 'd-health',
  coveringMembershipId: 'ben',
  originalMembershipId: 'anna',
  startsAt: new Date('2026-09-07T00:00:00.000Z'),
  endsAt: new Date('2026-09-30T00:00:00.000Z'),
  state: 'active',
}

describe('INV-003 – Vertretung lässt die dauerhafte Verantwortung unberührt', () => {
  it('die Zuweisungszeile bleibt über den gesamten Vertretungszeitraum unverändert', () => {
    const snapshot = structuredClone(assignment)
    for (const t of [-MS.day, 0, 5 * MS.day, 30 * MS.day]) {
      resolveEffectiveOwner(domain, [], [assignment], [coverage], new Date(NOW.getTime() + t))
    }
    expect(assignment).toEqual(snapshot)
  })

  it('nach Ablauf der Vertretung ist wieder die ursprüngliche Person verantwortlich', () => {
    const after = resolveEffectiveOwner(domain, [], [assignment], [{ ...coverage, state: 'returned' }], new Date('2026-10-05T00:00:00.000Z'))
    expect(after?.membershipId).toBe('anna')
    expect(after?.viaCoverage).toBe(false)
  })

  it('die vertretende Person darf die Ownership nicht übertragen', () => {
    const ctx: EffectiveContext = {
      actor: { kind: 'user', userId: 'u-ben', membershipId: 'ben', correlationId: 'c' },
      evaluatedAt: NOW,
      householdIds: ['hh'],
      householdId: 'hh',
      membershipId: 'ben',
      role: 'adult',
      grants: [],
      assignments: [],
      activeCoverages: [coverage],
      domainPaths: new Map([['d-health', domain.path]]),
      capacity: { level: 'normal', acceptsNewAssignments: true, criticalOnly: false, mutePush: false },
    }
    const d = decide(ctx, 'ownership:transfer', { type: 'domain', id: 'd-health', householdId: 'hh', domainId: 'd-health' })
    expect(d.allowed).toBe(false)
    expect(d.matchedRule).toBe('coverage_cannot_transfer_ownership')
  })

  it('die vertretende Person darf den Bereich aber operativ führen', () => {
    const ctx: EffectiveContext = {
      actor: { kind: 'user', userId: 'u-ben', membershipId: 'ben', correlationId: 'c' },
      evaluatedAt: NOW,
      householdIds: ['hh'],
      householdId: 'hh',
      membershipId: 'ben',
      role: 'adult',
      grants: [],
      assignments: [],
      activeCoverages: [coverage],
      domainPaths: new Map([['d-health', domain.path]]),
      capacity: { level: 'normal', acceptsNewAssignments: true, criticalOnly: false, mutePush: false },
    }
    expect(decide(ctx, 'monitor:manage', { type: 'domain', id: 'd-health', householdId: 'hh', domainId: 'd-health' }).allowed).toBe(true)
  })
})
