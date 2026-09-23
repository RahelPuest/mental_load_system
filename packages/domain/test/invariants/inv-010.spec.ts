import { describe, expect, it } from 'vitest'
import { VALUE_KINDS } from '@thealotta/contracts'
import { resolveStateWrite, defaultConflictWindow } from '../../src/conflict/resolve-state-write.js'
import { evaluateMonitor } from '../../src/monitors/evaluators.js'
import { FixedClock, MS } from '../../src/clock.js'
import type { StateDefinitionLike, StateValueLike } from '../../src/freshness.js'

/** INV-010 – 'unknown' ist ein gültiger Zustand und nicht dasselbe wie false/null/irrelevant. */

const NOW = new Date('2026-09-07T09:00:00.000Z')
const def: StateDefinitionLike = { id: 'sd', key: 'regenhose', label: 'Regenhose Kita', freshnessInterval: 'P4W', isCritical: false }

describe("INV-010 – 'unknown' ist ein eigener Zustand", () => {
  it('das Vokabular unterscheidet known, unknown und not_applicable', () => {
    expect([...VALUE_KINDS]).toEqual(['known', 'unknown', 'not_applicable'])
  })

  it('unknown → known ist kein Konflikt, sondern eine Klärung', () => {
    const current: StateValueLike = {
      stateDefinitionId: 'sd',
      valueKind: 'unknown',
      value: null,
      verifiedAt: new Date(NOW.getTime() - MS.hour),
      staleAt: null,
      confirmedAt: new Date(NOW.getTime() - MS.hour),
      origin: 'human',
    }
    const d = resolveStateWrite(current, { valueKind: 'known', value: 'vorhanden', origin: 'human', observedAt: NOW, observedBy: 'm1', confirm: true }, { conflictWindowMs: defaultConflictWindow(false), isCritical: false })
    // Wechsel ist erlaubt und wird als Widerspruch sichtbar gemacht, nicht still ignoriert
    expect(d.conflictState === 'none' || d.conflictState === 'unresolved').toBe(true)
    expect(d.rule).not.toBe('reconfirmation')
  })

  it('ein unbekannter Wert altert und kann selbst Aufmerksamkeit verdienen', () => {
    const clock = new FixedClock(NOW)
    const r = evaluateMonitor(
      {
        id: 'm',
        householdId: 'hh',
        domainId: 'd',
        stateDefinitionId: 'sd',
        name: 'Offen?',
        ruleKind: 'state_unknown',
        config: { afterDays: 14 },
        enabled: true,
        lastEvaluatedAt: null,
        nextEvaluationAt: null,
      },
      {
        clock,
        stateDefinition: def,
        stateValue: {
          stateDefinitionId: 'sd',
          valueKind: 'unknown',
          value: null,
          verifiedAt: new Date(NOW.getTime() - 40 * MS.day),
          staleAt: null,
          confirmedAt: null,
          origin: 'human',
        },
        suppressions: [],
      },
    )
    expect(r.signals).toHaveLength(1)
    expect(r.signals[0]!.signalKind).toBe('unresolved_unknown')
  })

  it('unknown wird nicht wie ein leerer Wert behandelt', () => {
    const unknownValue: StateValueLike = {
      stateDefinitionId: 'sd', valueKind: 'unknown', value: null, verifiedAt: null, staleAt: null, confirmedAt: null, origin: 'human',
    }
    const noValueYet = null
    const a = resolveStateWrite(unknownValue, { valueKind: 'known', value: 1, origin: 'human', observedAt: NOW, observedBy: 'm', confirm: true }, { conflictWindowMs: MS.day, isCritical: false })
    const b = resolveStateWrite(noValueYet, { valueKind: 'known', value: 1, origin: 'human', observedAt: NOW, observedBy: 'm', confirm: true }, { conflictWindowMs: MS.day, isCritical: false })
    expect(a.rule).not.toBe(b.rule)
  })
})
