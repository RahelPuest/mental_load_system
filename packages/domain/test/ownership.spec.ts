import { describe, expect, it } from 'vitest'
import { MS } from '../src/clock.js'
import { assertAssignmentCompatible, criticalDomainsAtRisk, resolveEffectiveOwner, type AssignmentRow } from '../src/ownership.js'
import type { CoverageRecord, DomainNode } from '../src/types.js'
import { DomainError } from '../src/errors.js'

const NOW = new Date('2026-09-07T09:00:00.000Z')

const node = (id: string, path: string, over: Partial<DomainNode> = {}): DomainNode => ({
  id,
  parentId: null,
  path,
  name: id,
  criticality: 'normal',
  sensitivity: 'normal',
  ownershipInheritance: 'inherit',
  archivedAt: null,
  ...over,
})

const kleidung = node('d-kleidung', 'kinder.kind_a.kleidung', { ownershipInheritance: 'own' })
const schuhe = node('d-schuhe', 'kinder.kind_a.kleidung.schuhe', { parentId: 'd-kleidung' })

const assignment = (over: Partial<AssignmentRow> = {}): AssignmentRow => ({
  id: 'a1',
  domainId: 'd-kleidung',
  membershipId: 'anna',
  assignmentKind: 'primary_owner',
  effectiveFrom: new Date(NOW.getTime() - 30 * MS.day),
  effectiveTo: null,
  ...over,
})

describe('resolveEffectiveOwner() – Q-04', () => {
  it('erbt die Verantwortung vom nächsten Vorfahren und weist das aus', () => {
    const owner = resolveEffectiveOwner(schuhe, [kleidung], [assignment()], [], NOW)
    expect(owner?.membershipId).toBe('anna')
    expect(owner?.inheritedFrom).toBe('kinder.kind_a.kleidung')
    expect(owner?.reason).toContain('geerbt')
  })

  it('bevorzugt eine eigene Zuweisung gegenüber der geerbten', () => {
    const own = assignment({ id: 'a2', domainId: 'd-schuhe', membershipId: 'ben' })
    const owner = resolveEffectiveOwner(schuhe, [kleidung], [assignment(), own], [], NOW)
    expect(owner?.membershipId).toBe('ben')
    expect(owner?.inheritedFrom).toBeNull()
  })

  it('meldet einen Bereich als ownerlos, wenn niemand zuständig ist (§31)', () => {
    expect(resolveEffectiveOwner(schuhe, [kleidung], [], [], NOW)).toBeNull()
  })

  it('ignoriert beendete Zuweisungen', () => {
    const ended = assignment({ effectiveTo: new Date(NOW.getTime() - MS.day) })
    expect(resolveEffectiveOwner(schuhe, [kleidung], [ended], [], NOW)).toBeNull()
  })

  it('INV-003: eine Vertretung überlagert die Anzeige, verändert aber nichts an der Zuweisung', () => {
    const coverage: CoverageRecord = {
      id: 'cov-1',
      domainId: 'd-kleidung',
      coveringMembershipId: 'ben',
      originalMembershipId: 'anna',
      startsAt: new Date(NOW.getTime() - MS.day),
      endsAt: new Date(NOW.getTime() + 10 * MS.day),
      state: 'active',
    }
    const rows = [assignment()]
    const before = JSON.stringify(rows)
    const owner = resolveEffectiveOwner(schuhe, [kleidung], rows, [coverage], NOW)
    expect(owner?.membershipId).toBe('ben')
    expect(owner?.viaCoverage).toBe(true)
    expect(owner?.permanentMembershipId).toBe('anna')
    expect(JSON.stringify(rows)).toBe(before)
  })

  it('lässt die Vertretung bestehen, solange die Rückgabe unbestätigt ist (Q-07/INV-014)', () => {
    const coverage: CoverageRecord = {
      id: 'cov-2',
      domainId: 'd-kleidung',
      coveringMembershipId: 'ben',
      originalMembershipId: 'anna',
      startsAt: new Date(NOW.getTime() - 20 * MS.day),
      endsAt: new Date(NOW.getTime() - MS.day),
      state: 'pending_return',
    }
    const owner = resolveEffectiveOwner(schuhe, [kleidung], [assignment()], [coverage], NOW)
    expect(owner?.membershipId).toBe('ben')
    expect(owner?.reason).toContain('Rückgabe')
  })
})

describe('assertAssignmentCompatible() – Q-03', () => {
  it('lässt keine zweite Hauptverantwortung zu', () => {
    expect(() => assertAssignmentCompatible([assignment()], 'primary_owner', 'd-kleidung', NOW)).toThrowError(DomainError)
  })

  it('schließt Hauptverantwortung und geteilte Verantwortung gegenseitig aus', () => {
    const shared = assignment({ assignmentKind: 'shared_owner' })
    expect(() => assertAssignmentCompatible([shared], 'primary_owner', 'd-kleidung', NOW)).toThrow(/gemeinsam/)
    expect(() => assertAssignmentCompatible([assignment()], 'shared_owner', 'd-kleidung', NOW)).toThrow(/Hauptverantwortung/)
  })

  it('erlaubt Support und Observer neben einer Hauptverantwortung', () => {
    expect(() => assertAssignmentCompatible([assignment()], 'support', 'd-kleidung', NOW)).not.toThrow()
    expect(() => assertAssignmentCompatible([assignment()], 'observer', 'd-kleidung', NOW)).not.toThrow()
    expect(() => assertAssignmentCompatible([assignment()], 'secondary_owner', 'd-kleidung', NOW)).not.toThrow()
  })
})

describe('criticalDomainsAtRisk() – INV-014', () => {
  it('findet kritische Bereiche, deren Owner pausiert', () => {
    const gesundheit = node('d-health', 'kinder.kind_a.gesundheit', { criticality: 'critical' })
    const spiel = node('d-spiel', 'kinder.kind_a.spiel', { criticality: 'low' })
    const owners = new Map([
      ['d-health', { membershipId: 'anna', assignmentKind: 'primary_owner' as const, inheritedFrom: null, viaCoverage: false, permanentMembershipId: 'anna', sharedWith: [], reason: '' }],
      ['d-spiel', { membershipId: 'anna', assignmentKind: 'primary_owner' as const, inheritedFrom: null, viaCoverage: false, permanentMembershipId: 'anna', sharedWith: [], reason: '' }],
    ])
    const risky = criticalDomainsAtRisk([gesundheit, spiel], owners, 'anna')
    expect(risky.map((d) => d.id)).toEqual(['d-health'])
  })

  it('zählt auch ownerlose kritische Bereiche', () => {
    const gesundheit = node('d-health', 'x', { criticality: 'high' })
    expect(criticalDomainsAtRisk([gesundheit], new Map([['d-health', null]]), 'anna')).toHaveLength(1)
  })
})
