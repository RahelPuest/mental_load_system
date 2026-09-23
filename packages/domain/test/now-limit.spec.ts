import { describe, expect, it } from 'vitest'
import { nowLimitFor, type NowLimits } from '../src/capacity.js'

/**
 * Die Grenze der Jetzt-Ansicht ist verstellbar (docs/60, R3).
 *
 * Nicht, weil drei falsch wäre – sondern weil die übliche Begründung („zu viel Auswahl
 * überfordert") nicht trägt: Die große Meta-Analyse zu Choice Overload findet einen mittleren
 * Effekt von praktisch null (Scheibehenne u. a. 2010). Solange die Zahl eine Produktwette ist,
 * muss sie messbar sein, statt geglaubt zu werden.
 */
describe('nowLimitFor', () => {
  it('zeigt bei normaler Kapazität drei, bei wenig eine Sache', () => {
    expect(nowLimitFor('normal')).toBe(3)
    expect(nowLimitFor('reduced')).toBe(3)
    expect(nowLimitFor('minimal')).toBe(1)
    expect(nowLimitFor('paused')).toBe(1)
  })

  it('lässt sich für einen Vergleich verstellen', () => {
    const sieben: NowLimits = { normal: 7, reduziert: 1 }
    expect(nowLimitFor('normal', sieben)).toBe(7)
    // Auch im Vergleichsarm bleibt es bei wenig Kapazität bei einer Sache: Wer wenig
    // Kapazität angibt, ist nicht Teil des Experiments über die Obergrenze.
    expect(nowLimitFor('minimal', sieben)).toBe(1)
  })
})
