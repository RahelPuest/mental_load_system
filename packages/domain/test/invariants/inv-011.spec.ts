import { describe, expect, it } from 'vitest'
import { MS } from '../../src/clock.js'
import { defaultConflictWindow, resolveStateWrite } from '../../src/conflict/resolve-state-write.js'
import type { StateValueLike } from '../../src/freshness.js'
import type { Origin } from '@thealotta/contracts'

/** INV-011 – Automatisches Wissen darf bestätigtes menschliches Wissen nicht still überschreiben. */

const NOW = new Date('2026-09-07T09:00:00.000Z')
const confirmedHuman: StateValueLike = {
  stateDefinitionId: 'sd',
  valueKind: 'known',
  value: 29,
  verifiedAt: new Date(NOW.getTime() - 3 * MS.day),
  staleAt: null,
  confirmedAt: new Date(NOW.getTime() - 3 * MS.day),
  origin: 'human',
}
const opts = { conflictWindowMs: defaultConflictWindow(false), isCritical: false }

describe('INV-011 – Maschine überschreibt bestätigten Menschen nicht', () => {
  it.each<Origin>(['system_rule', 'integration', 'inference'])(
    'origin=%s wird blockiert und als Konflikt sichtbar gemacht',
    (origin) => {
      const d = resolveStateWrite(confirmedHuman, { valueKind: 'known', value: 31, origin, observedAt: NOW, observedBy: null, confirm: true }, opts)
      expect(d.applyValue).toBe(false)
      expect(d.refreshVerified).toBe(false)
      expect(d.conflictState).toBe('unresolved')
      expect(d.conflictExplanation).toBeTruthy()
    },
  )

  it('eine maschinelle Bestätigung desselben Werts ist erlaubt', () => {
    const d = resolveStateWrite(confirmedHuman, { valueKind: 'known', value: 29, origin: 'integration', observedAt: NOW, observedBy: null, confirm: true }, opts)
    expect(d.applyValue).toBe(true)
    expect(d.conflictState).toBe('none')
  })

  it('eine Maschine frischt die Gültigkeit eines unbestätigten Werts nicht als "verifiziert" auf', () => {
    const unconfirmed: StateValueLike = { ...confirmedHuman, confirmedAt: null, origin: 'inference' }
    const d = resolveStateWrite(unconfirmed, { valueKind: 'known', value: 30, origin: 'inference', observedAt: NOW, observedBy: null, confirm: false }, opts)
    expect(d.applyValue).toBe(true)
    expect(d.refreshVerified).toBe(false)
  })
})
