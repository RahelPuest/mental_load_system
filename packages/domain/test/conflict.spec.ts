import { describe, expect, it } from 'vitest'
import { MS } from '../src/clock.js'
import { defaultConflictWindow, resolveStateWrite } from '../src/conflict/resolve-state-write.js'
import type { StateValueLike } from '../src/freshness.js'

const NOW = new Date('2026-09-07T09:00:00.000Z')
const opts = { conflictWindowMs: defaultConflictWindow(false), isCritical: false }

const current = (over: Partial<StateValueLike> = {}): StateValueLike => ({
  stateDefinitionId: 'sd-1',
  valueKind: 'known',
  value: 29,
  verifiedAt: new Date(NOW.getTime() - MS.hour),
  staleAt: null,
  confirmedAt: new Date(NOW.getTime() - MS.hour),
  origin: 'human',
  ...over,
})

describe('resolveStateWrite (§10)', () => {
  it('übernimmt den ersten Wert', () => {
    const d = resolveStateWrite(null, { valueKind: 'known', value: 29, origin: 'human', observedAt: NOW, observedBy: 'm1', confirm: true }, opts)
    expect(d.applyValue).toBe(true)
    expect(d.rule).toBe('initial_value')
  })

  it('frischt bei gleichem Wert nur die Gültigkeit auf', () => {
    const d = resolveStateWrite(current(), { valueKind: 'known', value: 29, origin: 'human', observedAt: NOW, observedBy: 'm2', confirm: true }, opts)
    expect(d.applyValue).toBe(true)
    expect(d.refreshVerified).toBe(true)
    expect(d.conflictState).toBe('none')
  })

  it('lässt einen Menschen einen maschinellen Wert korrigieren', () => {
    const d = resolveStateWrite(
      current({ origin: 'inference', confirmedAt: null }),
      { valueKind: 'known', value: 30, origin: 'human', observedAt: NOW, observedBy: 'm1', confirm: true },
      opts,
    )
    expect(d.applyValue).toBe(true)
  })

  it('INV-011: eine Integration überschreibt bestätigtes menschliches Wissen nicht', () => {
    const d = resolveStateWrite(
      current(),
      { valueKind: 'known', value: 30, origin: 'integration', observedAt: NOW, observedBy: null, confirm: true },
      opts,
    )
    expect(d.applyValue).toBe(false)
    expect(d.conflictState).toBe('unresolved')
    expect(d.conflictExplanation).toBeTruthy()
  })

  it('macht den Fall "29 vs. 30" sichtbar, statt still zu überschreiben', () => {
    const d = resolveStateWrite(
      current(),
      { valueKind: 'known', value: 30, origin: 'human', observedAt: NOW, observedBy: 'm2', confirm: true },
      opts,
    )
    expect(d.applyValue).toBe(false)
    expect(d.rule).toBe('human_conflict_within_window')
    expect(d.conflictState).toBe('unresolved')
  })

  it('lässt außerhalb des Konfliktfensters die neuere menschliche Angabe gewinnen', () => {
    const d = resolveStateWrite(
      current({ verifiedAt: new Date(NOW.getTime() - 10 * MS.day), confirmedAt: new Date(NOW.getTime() - 10 * MS.day) }),
      { valueKind: 'known', value: 30, origin: 'human', observedAt: NOW, observedBy: 'm2', confirm: true },
      opts,
    )
    expect(d.applyValue).toBe(true)
    expect(d.rule).toBe('newer_human_wins')
  })

  it('behandelt known → unknown als echten Wechsel und prüft ihn auf Konflikt', () => {
    const d = resolveStateWrite(
      current(),
      { valueKind: 'unknown', value: null, origin: 'human', observedAt: NOW, observedBy: 'm2', confirm: true },
      opts,
    )
    expect(d.conflictState).toBe('unresolved')
  })

  it('nutzt für kritische Angaben ein längeres Konfliktfenster', () => {
    expect(defaultConflictWindow(true)).toBe(7 * MS.day)
    expect(defaultConflictWindow(false)).toBe(MS.day)
  })
})
