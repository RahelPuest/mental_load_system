import { describe, expect, it } from 'vitest'
import { evaluateMonitor } from '../src/monitors/evaluators.js'
import type { MonitorEvaluationContext, MonitorLike } from '../src/monitors/types.js'

/**
 * Regelmäßige Aufgaben und Aufgaben, die einer anderen folgen.
 *
 * Der Auswerter ist rein: keine Uhr außer der aus dem Kontext, keine Datenbank. Deshalb lässt
 * sich hier prüfen, was im Betrieb Wochen dauern würde – etwa, dass eine Regel nach einer
 * Erledigung genau einmal feuert und nicht bei jedem Durchlauf erneut.
 */
const at = (iso: string) => ({ now: () => new Date(iso) })

const monitor = (over: Partial<MonitorLike> = {}): MonitorLike => ({
  id: 'm1',
  householdId: 'h1',
  domainId: 'd1',
  stateDefinitionId: null,
  nextEvaluationAt: new Date('2026-03-12T09:00:00Z'),
  name: 'Wäsche',
  ruleKind: 'schedule',
  config: {},
  enabled: true,
  lastEvaluatedAt: null,
  ...over,
})

const ctx = (over: Partial<MonitorEvaluationContext> = {}): MonitorEvaluationContext => ({
  clock: at('2026-03-12T09:00:00Z'),
  suppressions: [],
  ...over,
})

describe('schedule – regelmäßige Aufgaben', () => {
  it('meldet sich nicht, bevor der Rhythmus es sagt', () => {
    const r = evaluateMonitor(
      monitor({ config: { every: 'P3D' }, lastEvaluatedAt: new Date('2026-03-11T09:00:00Z') }),
      ctx(),
    )
    expect(r.signals).toHaveLength(0)
    expect(r.nextEvaluationAt.toISOString().slice(0, 10)).toBe('2026-03-14')
  })

  it('meldet sich, wenn der Tag da ist – und sagt den Rhythmus im Klartext', () => {
    const r = evaluateMonitor(
      monitor({ config: { every: 'P3D' }, lastEvaluatedAt: new Date('2026-03-09T09:00:00Z') }),
      ctx(),
    )
    expect(r.signals).toHaveLength(1)
    expect(r.signals[0]!.whyNow).toContain('alle 3 Tage')
  })

  it('an Wochentagen: donnerstags meldet es sich donnerstags', () => {
    // 2026-03-12 ist ein Donnerstag.
    const r = evaluateMonitor(
      monitor({ config: { weekdays: [4] }, lastEvaluatedAt: new Date('2026-03-05T09:00:00Z') }),
      ctx(),
    )
    expect(r.signals).toHaveLength(1)
    expect(r.signals[0]!.whyNow).toContain('donnerstags')
    // Der nächste Termin ist der Donnerstag darauf, nicht in drei Tagen.
    expect(r.nextEvaluationAt.toISOString().slice(0, 10)).toBe('2026-03-19')
  })

  it('am Monatstag: der 15. kommt am 15.', () => {
    const r = evaluateMonitor(
      monitor({ config: { monthday: 15 }, lastEvaluatedAt: new Date('2026-03-14T09:00:00Z') }),
      ctx({ clock: at('2026-03-15T09:00:00Z') }),
    )
    expect(r.signals).toHaveLength(1)
    expect(r.signals[0]!.whyNow).toContain('am 15. jedes Monats')
    expect(r.nextEvaluationAt.toISOString().slice(0, 10)).toBe('2026-04-15')
  })

  it('zweimal am selben Tag ausgewertet ergibt einen Eimer, nicht zwei', () => {
    const a = evaluateMonitor(monitor({ config: { every: 'P1D' }, lastEvaluatedAt: new Date('2026-03-10T09:00:00Z') }), ctx())
    const b = evaluateMonitor(
      monitor({ config: { every: 'P1D' }, lastEvaluatedAt: new Date('2026-03-10T09:00:00Z') }),
      ctx({ clock: at('2026-03-12T21:00:00Z') }),
    )
    expect(a.signals[0]!.dedupeKey).toBe(b.signals[0]!.dedupeKey)
  })

  it('eine unterdrückte Gelegenheit meldet sich nicht', () => {
    /*
     * Der Eimer ist der **Termin**, nicht der Tag der Auswertung: Ein am 11. fälliger Termin,
     * der erst am 12. auffällt, ist derselbe Termin. Vorher hing der Eimer an „heute" – ein
     * verpasster Termin bekam dadurch an jedem Tag, an dem der Auswerter lief, einen neuen.
     */
    const r = evaluateMonitor(
      monitor({ config: { every: 'P1D' }, lastEvaluatedAt: new Date('2026-03-10T09:00:00Z') }),
      ctx({ suppressions: [{ bucketPattern: 'occurrence:2026-03-11T00:00:00.000Z', until: null }] }),
    )
    expect(r.signals).toHaveLength(0)
  })
})

describe('dependency_recheck – etwas folgt auf etwas anderes', () => {
  const dep = (config: Record<string, unknown>) =>
    monitor({ ruleKind: 'dependency_recheck', name: 'Wäsche aufhängen', config })

  it('wartet, solange die vorangehende Aufgabe nicht erledigt ist', () => {
    const r = evaluateMonitor(dep({ delay: 'P1D' }), ctx({ precedingCompletedAt: null }))
    expect(r.signals, 'meldet sich, obwohl nichts passiert ist').toHaveLength(0)
  })

  it('zählt ab der Erledigung, nicht ab dem Kalender', () => {
    const r = evaluateMonitor(
      dep({ delay: 'P2D' }),
      ctx({ precedingCompletedAt: new Date('2026-03-11T18:00:00Z') }),
    )
    expect(r.signals, 'zu früh – zwei Tage sind noch nicht um').toHaveLength(0)
    expect(r.nextEvaluationAt.toISOString().slice(0, 10)).toBe('2026-03-13')
  })

  it('meldet sich, wenn die Frist um ist – und nennt beides: Frist und Anlass', () => {
    const r = evaluateMonitor(
      dep({ delay: 'P2D' }),
      ctx({ precedingCompletedAt: new Date('2026-03-09T18:00:00Z') }),
    )
    expect(r.signals).toHaveLength(1)
    expect(r.signals[0]!.whyNow).toMatch(/2 Tage|zwei Tage/)
    expect(r.signals[0]!.whyNow).toContain('09.03.2026')
  })

  it('jede Erledigung feuert genau einmal – der Eimer ist die Erledigung', () => {
    const erste = evaluateMonitor(dep({ delay: 'P1D' }), ctx({ precedingCompletedAt: new Date('2026-03-09T18:00:00Z') }))
    const nochmal = evaluateMonitor(dep({ delay: 'P1D' }), ctx({ precedingCompletedAt: new Date('2026-03-09T18:00:00Z') }))
    const zweite = evaluateMonitor(dep({ delay: 'P1D' }), ctx({ precedingCompletedAt: new Date('2026-03-10T18:00:00Z') }))

    expect(nochmal.signals[0]!.dedupeKey, 'derselbe Anlass ergibt einen neuen Eimer').toBe(erste.signals[0]!.dedupeKey)
    expect(zweite.signals[0]!.dedupeKey, 'eine neue Erledigung ergibt denselben Eimer').not.toBe(erste.signals[0]!.dedupeKey)
  })

  it('eine abgeschaltete Regel meldet sich nie', () => {
    const r = evaluateMonitor(
      { ...dep({ delay: 'P1D' }), enabled: false },
      ctx({ precedingCompletedAt: new Date('2026-03-01T18:00:00Z') }),
    )
    expect(r.signals).toHaveLength(0)
  })
})
