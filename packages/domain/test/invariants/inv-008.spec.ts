import { describe, expect, it } from 'vitest'
import { rank, type RankableItem } from '../../src/prioritization/rank.js'
import type { CapacityLevel, Criticality, EnergyLevel } from '@thealotta/contracts'

/** INV-008 – Automatische Priorisierung liefert immer eine menschenverständliche Begründung. */

const NOW = new Date('2026-09-07T09:00:00.000Z')
const CAPACITIES: CapacityLevel[] = ['normal', 'reduced', 'minimal', 'paused']
const CRITS: Criticality[] = ['low', 'normal', 'high', 'critical']
const ENERGIES: EnergyLevel[] = ['low', 'medium', 'high']

function* permutations(): Generator<{ item: RankableItem; capacity: CapacityLevel }> {
  let n = 0
  for (const capacity of CAPACITIES)
    for (const crit of CRITS)
      for (const energy of ENERGIES)
        for (const overdue of [true, false])
          for (const waiting of [true, false])
            {
              n += 1
              yield {
                capacity,
                item: {
                  subjectType: 'task',
                  subjectId: `t${n}`,
                  title: `t${n}`,
                  domainCriticality: crit,
                  dueAt: overdue ? new Date(NOW.getTime() - 86_400_000) : null,
                  deferUntil: null,
                  estimatedMinutes: (n % 40) + 1,
                  mentalEnergy: energy,
                  isOwner: n % 3 === 0,
                  isAssignee: n % 4 === 0,
                  isWaiting: waiting,
                  blockedBy: null,
                  overdueSince: overdue ? new Date(NOW.getTime() - 5 * 86_400_000) : null,
                  createdAt: NOW,
                },
              }
            }
}

describe('INV-008 – jede Priorisierung ist erklärbar', () => {
  it('liefert für jede Konstellation mindestens einen Faktor mit vollständigem Erklärtext', () => {
    let count = 0
    for (const { item, capacity } of permutations()) {
      const r = rank(item, { now: NOW, capacity })
      count += 1
      expect(r.factors.length, item.subjectId).toBeGreaterThan(0)
      for (const f of r.factors) {
        expect(f.code).toMatch(/^[a-z_]+$/)
        expect(f.label.trim().length).toBeGreaterThan(2)
        expect(f.explanation.trim().length).toBeGreaterThan(10)
        expect(Number.isFinite(f.contribution)).toBe(true)
      }
      expect(r.ifItWaits.trim().length).toBeGreaterThan(10)
    }
    expect(count).toBe(192) // 4 Kapazitäten × 4 Kritikalitäten × 3 Energiestufen × 2³ Schalter
  })

  it('der Score ist exakt die Summe der ausgewiesenen Faktoren – keine verborgenen Anteile', () => {
    for (const { item, capacity } of permutations()) {
      const r = rank(item, { now: NOW, capacity })
      expect(r.score).toBeCloseTo(
        r.factors.reduce((s, f) => s + f.contribution, 0),
        10,
      )
    }
  })
})
