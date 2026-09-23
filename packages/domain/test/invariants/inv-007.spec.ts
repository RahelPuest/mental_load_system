import { describe, expect, it } from 'vitest'
import { decide } from '../../src/authz/decide.js'
import { rankAll, type RankableItem } from '../../src/prioritization/rank.js'
import type { CapacityLevel } from '@thealotta/contracts'
import { ctx, res } from '../helpers.js'

/** INV-007 – Reduzierte Kapazität verändert Sichtbarkeit und Priorisierung, nicht Relevanz oder Ownership. */

const NOW = new Date('2026-09-07T09:00:00.000Z')
const items: RankableItem[] = ['a', 'b', 'c', 'd'].map((id, i) => ({
  subjectType: 'task',
  subjectId: id,
  title: id,
  domainCriticality: i === 0 ? 'critical' : 'normal',
  dueAt: null,
  deferUntil: null,
  estimatedMinutes: (i + 1) * 10,
  mentalEnergy: i % 2 === 0 ? 'low' : 'high',
  isOwner: false,
  isAssignee: false,
  isWaiting: false,
  blockedBy: null,
  overdueSince: null,
  createdAt: NOW,
}))

describe('INV-007 – Kapazität ändert Darstellung, nicht Substanz', () => {
  it('die Menge relevanter Elemente bleibt über alle Kapazitätsstufen identisch', () => {
    const sets = (['normal', 'reduced', 'minimal', 'paused'] as CapacityLevel[]).map(
      (capacity) => new Set(rankAll(items, { now: NOW, capacity }).map((r) => r.item.subjectId)),
    )
    for (const s of sets) expect([...s].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('nur die Reihenfolge ändert sich', () => {
    const normal = rankAll(items, { now: NOW, capacity: 'normal' }).map((r) => r.item.subjectId)
    const minimal = rankAll(items, { now: NOW, capacity: 'minimal' }).map((r) => r.item.subjectId)
    expect(minimal).not.toEqual(normal)
    expect([...minimal].sort()).toEqual([...normal].sort())
  })

  it('Kapazität verändert keine Berechtigung', () => {
    const normal = decide(ctx({ capacity: { level: 'normal', acceptsNewAssignments: true, criticalOnly: false, mutePush: false } }), 'state:write', res())
    const paused = decide(ctx({ capacity: { level: 'paused', acceptsNewAssignments: false, criticalOnly: true, mutePush: true } }), 'state:write', res())
    expect(paused.allowed).toBe(normal.allowed)
    expect(paused.matchedRule).toBe(normal.matchedRule)
  })
})
