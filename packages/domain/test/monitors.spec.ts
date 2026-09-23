import { describe, expect, it } from 'vitest'
import { FixedClock, MS } from '../src/clock.js'
import { evaluateMonitor } from '../src/monitors/evaluators.js'
import type { MonitorLike } from '../src/monitors/types.js'
import type { StateDefinitionLike, StateValueLike } from '../src/freshness.js'

const NOW = new Date('2026-09-07T09:00:00.000Z')

const shoeSize: StateDefinitionLike = {
  id: 'sd-1',
  key: 'shoe_size',
  label: 'Schuhgröße',
  freshnessInterval: 'P6W',
  isCritical: false,
}

function value(over: Partial<StateValueLike> = {}): StateValueLike {
  return {
    stateDefinitionId: 'sd-1',
    valueKind: 'known',
    value: 29,
    verifiedAt: new Date(NOW.getTime() - 49 * MS.day), // vor 7 Wochen
    staleAt: null,
    confirmedAt: new Date(NOW.getTime() - 49 * MS.day),
    origin: 'human',
    ...over,
  }
}

const monitor: MonitorLike = {
  id: 'mon-1',
  householdId: 'hh',
  domainId: 'd-schuhe',
  stateDefinitionId: 'sd-1',
  name: 'Schuhgröße prüfen',
  ruleKind: 'state_freshness',
  config: {},
  enabled: true,
  lastEvaluatedAt: null,
  nextEvaluationAt: null,
}

describe('state_freshness (Szenario §44)', () => {
  it('erzeugt ein Signal, wenn die letzte Bestätigung 7 Wochen zurückliegt', () => {
    const clock = new FixedClock(NOW)
    const r = evaluateMonitor(monitor, { clock, stateDefinition: shoeSize, stateValue: value(), suppressions: [] })
    expect(r.signals).toHaveLength(1)
    expect(r.signals[0]!.signalKind).toBe('stale_state')
    expect(r.signals[0]!.whyNow).toContain('Schuhgröße')
    expect(r.signals[0]!.whyNow).toContain('6 Wochen')
    expect(r.signals[0]!.evidence.rationale.length).toBeGreaterThan(20)
  })

  it('ist idempotent: dieselbe Evidenz erzeugt denselben dedupeKey (§11)', () => {
    const clock = new FixedClock(NOW)
    const args = { clock, stateDefinition: shoeSize, stateValue: value(), suppressions: [] }
    const a = evaluateMonitor(monitor, args)
    clock.advance(MS.hour * 5)
    const b = evaluateMonitor(monitor, args)
    expect(b.signals[0]!.dedupeKey).toBe(a.signals[0]!.dedupeKey)
  })

  it('erzeugt nach einer neuen Bestätigung einen anderen Schlüssel', () => {
    const clock = new FixedClock(NOW)
    const first = evaluateMonitor(monitor, { clock, stateDefinition: shoeSize, stateValue: value(), suppressions: [] })
    clock.advanceWeeks(7)
    const refreshed = value({ verifiedAt: new Date(NOW.getTime() + MS.day), confirmedAt: new Date(NOW.getTime() + MS.day) })
    const second = evaluateMonitor(monitor, { clock, stateDefinition: shoeSize, stateValue: refreshed, suppressions: [] })
    expect(second.signals).toHaveLength(1)
    expect(second.signals[0]!.dedupeKey).not.toBe(first.signals[0]!.dedupeKey)
  })

  it('schweigt, solange die Angabe frisch ist, und meldet den Bucket als aufgelöst', () => {
    const clock = new FixedClock(NOW)
    const fresh = value({ verifiedAt: new Date(NOW.getTime() - 7 * MS.day) })
    const r = evaluateMonitor(monitor, { clock, stateDefinition: shoeSize, stateValue: fresh, suppressions: [] })
    expect(r.signals).toHaveLength(0)
    expect(r.resolvedBuckets).toHaveLength(1)
  })

  it('respektiert eine Unterdrückung (mark_irrelevant, §7.6)', () => {
    const clock = new FixedClock(NOW)
    const v = value()
    const bucket = `verified:${v.verifiedAt!.toISOString()}`
    const r = evaluateMonitor(monitor, {
      clock,
      stateDefinition: shoeSize,
      stateValue: v,
      suppressions: [{ bucketPattern: bucket, until: null }],
    })
    expect(r.signals).toHaveLength(0)
  })

  it('stuft kritische Angaben höher ein', () => {
    const clock = new FixedClock(NOW)
    const r = evaluateMonitor(monitor, {
      clock,
      stateDefinition: { ...shoeSize, isCritical: true },
      stateValue: value(),
      suppressions: [],
    })
    expect(r.signals[0]!.severity).toBe('important')
  })
})

describe('weitere Regeltypen', () => {
  it('state_unknown meldet eine lange offene Angabe (INV-010)', () => {
    const clock = new FixedClock(NOW)
    const r = evaluateMonitor(
      { ...monitor, ruleKind: 'state_unknown', config: { afterDays: 14 } },
      {
        clock,
        stateDefinition: shoeSize,
        stateValue: value({ valueKind: 'unknown', value: null, verifiedAt: new Date(NOW.getTime() - 30 * MS.day) }),
        suppressions: [],
      },
    )
    expect(r.signals[0]!.signalKind).toBe('unresolved_unknown')
  })

  it('state_threshold meldet einen unterschrittenen Vorrat', () => {
    const clock = new FixedClock(NOW)
    const med: StateDefinitionLike = { id: 'sd-2', key: 'medikament_tage', label: 'Medikament (Tage)', freshnessInterval: null, isCritical: true }
    const r = evaluateMonitor(
      { ...monitor, ruleKind: 'state_threshold', config: { op: 'lt', value: 7 } },
      { clock, stateDefinition: med, stateValue: value({ value: 5, stateDefinitionId: 'sd-2' }), suppressions: [] },
    )
    expect(r.signals[0]!.signalKind).toBe('threshold_crossed')
    expect(r.signals[0]!.severity).toBe('critical')
    expect(r.signals[0]!.whyNow).toContain('5')
  })

  it('lead_time_before_event bereitet einen Termin vor (§14.1)', () => {
    const clock = new FixedClock(NOW)
    const r = evaluateMonitor(
      { ...monitor, ruleKind: 'lead_time_before_event', config: { leadTime: 'P3D' } },
      {
        clock,
        suppressions: [],
        upcomingEvents: [
          { id: 'ev-1', title: 'Kinderarzt Kind A', startsAt: new Date(NOW.getTime() + 2 * MS.day), sequence: 0 },
          { id: 'ev-2', title: 'Weit weg', startsAt: new Date(NOW.getTime() + 40 * MS.day), sequence: 0 },
        ],
      },
    )
    expect(r.signals).toHaveLength(1)
    expect(r.signals[0]!.title).toContain('Kinderarzt')
  })

  it('wertet einen deaktivierten Monitor nicht aus', () => {
    const clock = new FixedClock(NOW)
    const r = evaluateMonitor({ ...monitor, enabled: false }, { clock, stateDefinition: shoeSize, stateValue: value(), suppressions: [] })
    expect(r.signals).toHaveLength(0)
  })
})
