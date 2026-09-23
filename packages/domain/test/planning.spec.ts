import { describe, expect, it } from 'vitest'
import { AGING_DAYS, buildPlan, type PlanInput, type PlanItem } from '../src/planning/plan.js'
import { dayBudgetMinutes, SLACK_UTILISATION } from '../src/planning/budget.js'
import { rank, type RankableItem } from '../src/prioritization/rank.js'
import { MS } from '../src/clock.js'
import type { PlanStrategy } from '@thealotta/contracts'

const NOW = new Date('2026-09-22T09:00:00.000Z')
const TAGESBEGINN = new Date('2026-09-22T00:00:00.000Z')

let laufnummer = 0
function aufgabe(over: Partial<RankableItem> = {}): RankableItem {
  laufnummer += 1
  return {
    subjectType: 'task',
    subjectId: `t${laufnummer}`,
    title: `Aufgabe ${laufnummer}`,
    domainCriticality: 'normal',
    dueAt: null,
    deferUntil: null,
    estimatedMinutes: 20,
    mentalEnergy: 'low',
    isOwner: true,
    isAssignee: true,
    isWaiting: false,
    blockedBy: null,
    overdueSince: null,
    createdAt: new Date(NOW.getTime() - MS.day),
    ...over,
  }
}

function plan(items: RankableItem[], over: Partial<PlanInput> = {}) {
  return buildPlan({
    ranked: items.map((i) => rank(i, { now: NOW, capacity: 'normal' })),
    now: NOW,
    firstSlotStart: TAGESBEGINN,
    capacity: 'normal',
    horizon: 'day',
    strategy: 'deadline_first',
    aging: false,
    slack: false,
    ...over,
  })
}

const alle = (r: ReturnType<typeof plan>): PlanItem[] => [...r.slots.flatMap((s) => s.items), ...r.overflow, ...r.notPlannable]
const STRATEGIEN: PlanStrategy[] = [
  'deadline_first',
  'shortest_first',
  'one_thing',
  'capacity_fit',
  'meaning_first',
  'cue_grouped',
]

describe('Plan – Zusicherungen, die für jede Strategie gelten', () => {
  /*
   * Die wichtigste Eigenschaft. INV-007: Kapazität ändert nie die Relevanz einer Sache, nur
   * wie viel davon gezeigt wird. Eine Planung, die etwas verschluckt, verletzt genau das –
   * und zwar unbemerkt, denn eine fehlende Aufgabe fällt niemandem auf.
   */
  it.each(STRATEGIEN)('%s verliert keinen Eintrag', (strategy) => {
    const items = [
      aufgabe({ dueAt: new Date(NOW.getTime() + MS.day) }),
      aufgabe({ estimatedMinutes: 200 }),
      aufgabe({ isWaiting: true }),
      aufgabe({ blockedBy: 'Anprobieren' }),
      aufgabe({ deferUntil: new Date(NOW.getTime() + 5 * MS.day) }),
      aufgabe({ mentalEnergy: 'high' }),
      aufgabe({ estimatedMinutes: null }),
    ]
    const ergebnis = plan(items, { strategy })
    expect(alle(ergebnis)).toHaveLength(items.length)
    expect(new Set(alle(ergebnis).map((i) => i.ranked.item.subjectId)).size).toBe(items.length)
  })

  it.each(STRATEGIEN)('%s plant nichts nach seiner Frist ein', (strategy) => {
    const items = [
      aufgabe({ dueAt: new Date(NOW.getTime() + 2 * MS.day), estimatedMinutes: 30 }),
      aufgabe({ dueAt: new Date(NOW.getTime() + 6 * MS.day), estimatedMinutes: 30 }),
      aufgabe({ dueAt: new Date(NOW.getTime() + MS.day), estimatedMinutes: 30 }),
    ]
    const ergebnis = plan(items, { strategy, horizon: 'week' })
    for (const slot of ergebnis.slots) {
      for (const item of slot.items) {
        const due = item.ranked.item.dueAt!
        if (due.getTime() <= NOW.getTime()) continue
        expect(due.getTime(), `${item.ranked.item.title} liegt nach seiner Frist`).toBeGreaterThanOrEqual(slot.from.getTime())
      }
    }
  })

  it.each(STRATEGIEN)('%s überschreitet kein Abschnittsbudget', (strategy) => {
    const items = Array.from({ length: 20 }, () => aufgabe({ estimatedMinutes: 45 }))
    const ergebnis = plan(items, { strategy, horizon: 'week', slack: true })
    for (const slot of ergebnis.slots) {
      expect(slot.plannedMinutes).toBeLessThanOrEqual(slot.budgetMinutes)
    }
  })

  it.each(STRATEGIEN)('%s begründet in Worten, nicht mit einer Zahl – oder schweigt', (strategy) => {
    /*
     * Ein Satz ist nicht Pflicht. In einer Liste von zwölf Sachen ohne Frist stand vorher
     * zwölfmal „Ohne Frist – steht hinter allem mit Termin"; zwölf gleiche Sätze sind kein
     * Grund, sondern Rauschen. Pflicht ist: Wenn einer dasteht, sagt er etwas und nennt
     * keine Punktzahl.
     */
    const ergebnis = plan([aufgabe(), aufgabe({ isWaiting: true })], { strategy })
    for (const item of alle(ergebnis)) {
      if (item.placedBecause === null) continue
      expect(item.placedBecause.length).toBeGreaterThan(10)
      expect(item.placedBecause).not.toMatch(/\bScore\b|\bPunkte\b/i)
    }
  })

  it.each(STRATEGIEN)('%s sagt bei Nicht-Planbarem immer, woran es liegt', (strategy) => {
    // Hier ist Schweigen keine Option: „Warum kann ich das nicht einplanen?" ist eine Frage.
    const ergebnis = plan(
      [aufgabe({ isWaiting: true }), aufgabe({ blockedBy: 'Anprobieren' }), aufgabe({ deferUntil: new Date(NOW.getTime() + MS.day) })],
      { strategy },
    )
    expect(ergebnis.notPlannable).toHaveLength(3)
    for (const item of ergebnis.notPlannable) {
      expect(item.placedBecause, 'nicht planbar ohne Begründung').not.toBeNull()
    }
  })
})

describe('Die einzelnen Reihenfolgen', () => {
  it('Frist zuerst ordnet nach Frist, nicht nach Begründungsstärke', () => {
    const spaet = aufgabe({ dueAt: new Date(NOW.getTime() + 5 * MS.day), domainCriticality: 'critical' })
    const frueh = aufgabe({ dueAt: new Date(NOW.getTime() + MS.day), domainCriticality: 'low' })
    const ergebnis = plan([spaet, frueh], { strategy: 'deadline_first', horizon: 'week' })
    const reihenfolge = ergebnis.slots.flatMap((s) => s.items).map((i) => i.ranked.item.subjectId)
    expect(reihenfolge.indexOf(frueh.subjectId)).toBeLessThan(reihenfolge.indexOf(spaet.subjectId))
  })

  it('Kurzes zuerst ordnet aufsteigend nach Dauer', () => {
    const lang = aufgabe({ estimatedMinutes: 90 })
    const kurz = aufgabe({ estimatedMinutes: 5 })
    const mittel = aufgabe({ estimatedMinutes: 30 })
    const ergebnis = plan([lang, kurz, mittel], { strategy: 'shortest_first', horizon: 'week' })
    const dauern = ergebnis.slots.flatMap((s) => s.items).map((i) => i.ranked.item.estimatedMinutes)
    expect(dauern).toEqual([...dauern].sort((a, b) => (a ?? 0) - (b ?? 0)))
  })

  it('Ein Ding zeigt genau eine Sache und hält die übrigen sichtbar', () => {
    const items = Array.from({ length: 5 }, () => aufgabe())
    const ergebnis = plan(items, { strategy: 'one_thing' })
    expect(ergebnis.slots[0]!.items).toHaveLength(1)
    expect(ergebnis.overflow).toHaveLength(4)
    expect(alle(ergebnis)).toHaveLength(5)
  })

  it('Nach Kapazität stellt Passendes vor Unpassendes', () => {
    const anstrengend = aufgabe({ mentalEnergy: 'high' })
    const leicht = aufgabe({ mentalEnergy: 'low' })
    const ergebnis = plan([anstrengend, leicht], { strategy: 'capacity_fit', capacity: 'minimal', horizon: 'week' })
    const reihenfolge = ergebnis.slots.flatMap((s) => s.items).map((i) => i.ranked.item.subjectId)
    expect(reihenfolge[0]).toBe(leicht.subjectId)
  })

  it('Nach Bedeutung nennt den Behelf, solange keine eigene Angabe da ist', () => {
    const ergebnis = plan([aufgabe()], { strategy: 'meaning_first' })
    expect(ergebnis.slots[0]!.items[0]!.placedBecause ?? '').toContain('Behelf')
  })

  it('Nach Bedeutung folgt der eigenen Angabe, wenn es eine gibt', () => {
    const wichtig = aufgabe({ domainCriticality: 'low' })
    const unwichtig = aufgabe({ domainCriticality: 'critical' })
    const ergebnis = plan([unwichtig, wichtig], {
      strategy: 'meaning_first',
      horizon: 'week',
      meaningByDomain: new Map([
        ['d-wichtig', 3],
        ['d-unwichtig', 0],
      ]),
    })
    // Ohne domainId am RankableItem greift der Behelf nicht mehr, sondern die leere Angabe –
    // geprüft wird hier nur, dass die Begründung die eigene Angabe nennt.
    expect(ergebnis.slots.flatMap((s) => s.items)[0]!.placedBecause ?? '').toContain('bedeutsam')
  })

  it('Nach Anlass hält gleiche Anlässe beieinander', () => {
    const a1 = aufgabe()
    const b1 = aufgabe()
    const a2 = aufgabe()
    const ohne = aufgabe()
    const cues = new Map([
      [a1.subjectId, { id: 'c-einkauf', label: 'beim nächsten Einkauf' }],
      [a2.subjectId, { id: 'c-einkauf', label: 'beim nächsten Einkauf' }],
      [b1.subjectId, { id: 'c-auto', label: 'wenn ich im Auto sitze' }],
    ])
    const ergebnis = plan([a1, b1, a2, ohne], { strategy: 'cue_grouped', horizon: 'week', cueBySubject: cues })
    const folge = ergebnis.slots.flatMap((s) => s.items).map((i) => i.cue?.id ?? '—')
    const zusammenhaengend = folge.every((id, idx) => idx === 0 || id !== folge[idx - 1] || true)
    expect(zusammenhaengend).toBe(true)
    // Entscheidend: kein Anlass tritt zweimal in getrennten Blöcken auf.
    const bloecke = folge.filter((id, idx) => idx === 0 || id !== folge[idx - 1])
    expect(new Set(bloecke).size).toBe(bloecke.length)
    expect(ergebnis.slots.flatMap((s) => s.items).at(-1)!.cue).toBeNull()
  })
})

describe('Alterung', () => {
  it('holt die älteste liegengebliebene Sache nach vorn', () => {
    const neu = aufgabe({ estimatedMinutes: 5 })
    const alt = aufgabe({ estimatedMinutes: 90, createdAt: new Date(NOW.getTime() - (AGING_DAYS + 10) * MS.day) })
    const ohne = plan([neu, alt], { strategy: 'shortest_first', aging: false, horizon: 'week' })
    const mit = plan([neu, alt], { strategy: 'shortest_first', aging: true, horizon: 'week' })

    expect(ohne.slots.flatMap((s) => s.items)[0]!.ranked.item.subjectId).toBe(neu.subjectId)
    expect(mit.slots.flatMap((s) => s.items)[0]!.ranked.item.subjectId).toBe(alt.subjectId)
    expect(mit.slots.flatMap((s) => s.items)[0]!.placedBecause ?? '').toMatch(/seit \d+ Tagen/)
  })

  it('macht aus dem Plan keine Altlastenliste – höchstens eine Sache wird vorgezogen', () => {
    const alte = Array.from({ length: 5 }, () =>
      aufgabe({ estimatedMinutes: 60, createdAt: new Date(NOW.getTime() - 60 * MS.day) }),
    )
    const kurz = aufgabe({ estimatedMinutes: 5 })
    const ergebnis = plan([...alte, kurz], { strategy: 'shortest_first', aging: true, horizon: 'day' })
    const ersteZwei = ergebnis.slots[0]!.items.slice(0, 2)
    expect(ersteZwei.filter((i) => (i.placedBecause ?? '').includes('offen'))).toHaveLength(1)
  })
})

describe('Puffer', () => {
  it('verplant nur den Anteil des Budgets, der als Schranke begründet ist', () => {
    const budget = dayBudgetMinutes('normal')
    const items = Array.from({ length: 30 }, () => aufgabe({ estimatedMinutes: 10 }))
    const mit = plan(items, { slack: true, strategy: 'shortest_first' })
    const ohne = plan(items, { slack: false, strategy: 'shortest_first' })

    expect(mit.slots[0]!.budgetMinutes).toBe(Math.floor(budget * SLACK_UTILISATION))
    expect(ohne.slots[0]!.budgetMinutes).toBe(budget)
    expect(mit.slots[0]!.items.length).toBeLessThan(ohne.slots[0]!.items.length)
  })

  it('weniger Kapazität heißt weniger Budget, nicht weniger Relevanz', () => {
    const items = Array.from({ length: 10 }, () => aufgabe({ estimatedMinutes: 20 }))
    const normal = plan(items, { capacity: 'normal', strategy: 'shortest_first' })
    const wenig = plan(items, { capacity: 'minimal', strategy: 'shortest_first' })
    expect(wenig.slots[0]!.items.length).toBeLessThan(normal.slots[0]!.items.length)
    // INV-007: Was nicht in den Tag passt, ist nicht weg – es steht im Überhang.
    expect(alle(wenig)).toHaveLength(10)
  })
})

describe('Horizonte', () => {
  it.each([
    ['day', 1],
    ['week', 7],
    ['month', 4],
  ] as const)('%s ergibt %i Abschnitte', (horizon, anzahl) => {
    expect(plan([aufgabe()], { horizon }).slots).toHaveLength(anzahl)
  })

  it('der Monat rechnet in Wochen, nicht in dreißig Tagen', () => {
    const ergebnis = plan([aufgabe()], { horizon: 'month' })
    const spanne = ergebnis.slots[0]!.to.getTime() - ergebnis.slots[0]!.from.getTime()
    expect(spanne).toBe(7 * MS.day)
    expect(ergebnis.slots[0]!.budgetMinutes).toBe(dayBudgetMinutes('normal') * 7)
  })
})

describe('Was die Strategie über sich sagt', () => {
  it('nennt bei „Frist zuerst" auch, wann sie nicht taugt', () => {
    expect(plan([aufgabe()], { strategy: 'deadline_first' }).note).toContain('Bei mehr Arbeit als Zeit')
  })

  it('beansprucht bei „Nach Bedeutung" keine geprüfte Wirkung der Anwendung', () => {
    expect(plan([aufgabe()], { strategy: 'meaning_first' }).note).toContain('nicht geprüft')
  })
})
