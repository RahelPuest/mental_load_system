import { describe, expect, it } from 'vitest'
import { MS } from '../src/clock.js'
import { rank, rankAll, type RankableItem } from '../src/prioritization/rank.js'

const NOW = new Date('2026-09-07T09:00:00.000Z')

const item = (over: Partial<RankableItem> = {}): RankableItem => ({
  subjectType: 'task',
  subjectId: 't1',
  title: 'Zehenraum prüfen',
  domainCriticality: 'normal',
  dueAt: null,
  deferUntil: null,
  estimatedMinutes: 2,
  mentalEnergy: 'low',
  isOwner: false,
  isAssignee: false,
  isWaiting: false,
  blockedBy: null,
  overdueSince: null,
  createdAt: new Date(NOW.getTime() - MS.day),
  ...over,
})

describe('rank() – INV-008', () => {
  it('liefert immer mindestens einen begründenden Faktor', () => {
    const r = rank(item(), { now: NOW, capacity: 'normal' })
    expect(r.factors.length).toBeGreaterThan(0)
    for (const f of r.factors) {
      expect(f.explanation.length).toBeGreaterThan(10)
      expect(f.label.length).toBeGreaterThan(0)
    }
  })

  it('Score ist exakt die Summe der Faktoren', () => {
    for (const capacity of ['normal', 'reduced', 'minimal', 'paused'] as const) {
      for (const crit of ['low', 'normal', 'high', 'critical'] as const) {
        const r = rank(item({ domainCriticality: crit, dueAt: new Date(NOW.getTime() - MS.day) }), { now: NOW, capacity })
        expect(r.score).toBeCloseTo(r.factors.reduce((s, f) => s + f.contribution, 0), 10)
      }
    }
  })


  it('stuft bei geringer Kapazität energieintensive Dinge zurück, ohne sie zu entfernen', () => {
    const heavy = item({ mentalEnergy: 'high', estimatedMinutes: 90 })
    const low = rank(heavy, { now: NOW, capacity: 'minimal' })
    const normal = rank(heavy, { now: NOW, capacity: 'normal' })
    expect(low.score).toBeLessThan(normal.score)
    expect(low.factors.map((f) => f.code)).toContain('above_capacity')
  })

  it('erklärt bei einem verpassten Zeitpunkt ohne wertende Sprache', () => {
    const r = rank(item({ dueAt: new Date(NOW.getTime() - 5 * MS.day), overdueSince: new Date(NOW.getTime() - 5 * MS.day) }), {
      now: NOW,
      capacity: 'normal',
    })
    const text = r.factors.map((f) => `${f.label} ${f.explanation}`).join(' ') + r.ifItWaits
    expect(text).not.toMatch(/überfällig|versäumt|vergessen|endlich|Du solltest/i)
    expect(r.factors.map((f) => f.code)).toContain('due_passed')
  })

  it('sortiert stabil und deterministisch', () => {
    const items = [item({ subjectId: 'a' }), item({ subjectId: 'b', domainCriticality: 'critical' }), item({ subjectId: 'c', isWaiting: true })]
    const ranked = rankAll(items, { now: NOW, capacity: 'normal' })
    expect(ranked[0]!.item.subjectId).toBe('b')
    expect(ranked.at(-1)!.item.subjectId).toBe('c')
  })
})

describe('rank() – blockierte Schritte (Audit 2, K1)', () => {
  it('nennt den früheren Schritt und drückt die Aufgabe nach hinten', () => {
    const blockiert = rank(item({ blockedBy: 'Anprobieren' }), { now: NOW, capacity: 'normal' })
    const frei = rank(item({}), { now: NOW, capacity: 'normal' })

    expect(blockiert.score).toBeLessThan(frei.score)
    const grund = blockiert.factors.find((f) => f.code === 'blocked_by')
    expect(grund?.explanation, 'der Nutzer muss lesen, woran es hängt').toContain('Anprobieren')
  })

  it('beantwortet „was passiert, wenn es wartet" mit dem Vorgänger', () => {
    // Vorher stand hier „Keine akute Folge" – bei einem blockierten Schritt ist das falsch:
    // Es passiert sehr wohl etwas, nämlich am Schritt davor.
    const r = rank(item({ blockedBy: 'Bestellen oder kaufen' }), { now: NOW, capacity: 'normal' })
    expect(r.ifItWaits).toContain('Bestellen oder kaufen')
  })
})

describe('Jeder Eintrag trägt eine Begründung', () => {
  /*
   * Der Vertrag verlangt `why.min(1)` mit dem Vermerk „INV-008: jedes Element muss begründet
   * sein". Alle Faktoren in rank() hängen aber an Bedingungen – eine schlichte offene Aufgabe
   * erfüllte keine davon. Gefunden beim Bau der Planung (docs/80), erreichbar war es vorher
   * schon über „Kann ich jetzt erledigen".
   */
  it('auch eine Aufgabe, an der nichts besonders ist', () => {
    const schlicht = rank(
      {
        subjectType: 'task',
        subjectId: 't-schlicht',
        title: 'Irgendwann mal',
        domainCriticality: 'normal',
        dueAt: null,
        deferUntil: null,
        estimatedMinutes: 45,
        mentalEnergy: 'low',
        isOwner: false,
        isAssignee: false,
        isWaiting: false,
        blockedBy: null,
        overdueSince: null,
        createdAt: new Date('2026-09-20T00:00:00.000Z'),
      },
      { now: new Date('2026-09-22T09:00:00.000Z'), capacity: 'normal' },
    )
    expect(schlicht.factors.length).toBeGreaterThanOrEqual(1)
    expect(schlicht.factors.map((f) => f.code)).toContain('merely_open')
    // Die Eigenschaft aus ADR-0005 bleibt: Punktzahl ist die Summe der Beiträge.
    expect(schlicht.score).toBe(schlicht.factors.reduce((s, f) => s + f.contribution, 0))
  })
})
