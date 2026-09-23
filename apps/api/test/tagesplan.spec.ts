import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { NowResponse } from '@thealotta/contracts'
import { Harness, familyFixture } from './helpers.js'

/**
 * Die Todo-Ansicht für Tag, Woche und Monat (docs/80).
 *
 * Geprüft wird hier nicht, ob eine Liste erscheint – das tut sie offensichtlich. Geprüft wird
 * die Zusage, die diese Ansicht überhaupt zulässig macht: Sie kommt **zusätzlich** und nimmt
 * „Jetzt" nichts weg. Wer nie danach gefragt hat, bekommt sie nicht zu sehen; wer sie
 * anfordert, verliert dadurch keinen Eintrag.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let domainId: string
const base = () => `/api/v1/households/${family.householdId}`

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'plan')
  domainId = (await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Planbereich' })).id
  for (const [titel, minuten] of [
    ['Kurz erledigen', 5],
    ['Mittellang', 45],
    ['Langer Brocken', 120],
  ] as const) {
    await h.json(family.anna, 'POST', `${base()}/tasks`, { domainId, title: titel, estimatedMinutes: minuten })
  }
}, 180_000)
afterAll(async () => h.stop())

describe('Der Plan kommt nur, wenn man ihn will', () => {
  it('ohne Angabe antwortet „Jetzt" wie bisher – ohne Plan', async () => {
    const view = await h.json<NowResponse>(family.anna, 'GET', `${base()}/now`)
    expect(view.plan ?? null, 'ungefragt darf keine Liste erscheinen').toBeNull()
    expect(view.sections.length).toBeGreaterThan(0)
  })

  it('mit Angabe kommt der Plan – und die Abschnitte bleiben daneben stehen', async () => {
    const view = await h.json<NowResponse>(family.anna, 'GET', `${base()}/now?horizon=day&strategy=shortest_first`)
    expect(view.plan).not.toBeNull()
    expect(view.plan!.strategy).toBe('shortest_first')
    expect(view.plan!.slots).toHaveLength(1)
    // Entscheidend: „Jetzt" verliert nichts, nur weil jemand eine Liste angefordert hat.
    expect(view.sections.find((s) => s.key === 'now')).toBeDefined()
  })

  it('jeder Eintrag sagt in Worten, warum er dort steht', async () => {
    const view = await h.json<NowResponse>(family.anna, 'GET', `${base()}/now?horizon=week&strategy=deadline_first`)
    const alle = [...view.plan!.slots.flatMap((s) => s.entries), ...view.plan!.overflow, ...view.plan!.notPlannable]
    expect(alle.length).toBeGreaterThan(0)
    for (const eintrag of alle) {
      // Der Platzierungssatz darf schweigen, wenn es über die Stelle nichts zu sagen gibt.
      if (eintrag.placedBecause !== null) expect(eintrag.placedBecause.length).toBeGreaterThan(10)
      expect(eintrag.why.length, 'INV-008: die Begründung bleibt am Eintrag').toBeGreaterThan(0)
    }

  })

  it('wo es etwas zu sagen gibt, steht es da – und sonst nicht', async () => {
    /*
     * Die drei Aufgaben oben haben keine Frist. „Frist zuerst" schweigt dazu zu Recht:
     * Zwölfmal „Ohne Frist" wäre Rauschen. Eine überfällige Sache dagegen muss es sagen.
     */
    const ueberfaellig = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, {
      domainId,
      title: 'Längst vorbei',
      estimatedMinutes: 10,
      // Weit in der Vergangenheit: Der Harness hat eine eigene Uhr, „vor drei Tagen"
      // gemessen an der Wanduhr kann dort noch in der Zukunft liegen (docs/71).
      dueAt: '2020-01-06T09:00:00.000Z',
    })
    const view = await h.json<NowResponse>(family.anna, 'GET', `${base()}/now?horizon=day&strategy=deadline_first`)
    const alle = [...view.plan!.slots.flatMap((s) => s.entries), ...view.plan!.overflow]
    const gefunden = alle.find((e) => e.subjectId === ueberfaellig.id)
    expect(gefunden?.placedBecause).toBe('Der Zeitpunkt ist vorbei.')
    expect(alle.some((e) => e.placedBecause === null), 'und die ohne Frist schweigen').toBe(true)
  })

  it('die Strategie sagt selbst, wo sie nicht taugt', async () => {
    const view = await h.json<NowResponse>(family.anna, 'GET', `${base()}/now?horizon=day&strategy=deadline_first`)
    expect(view.plan!.note).toMatch(/Bei mehr Arbeit als Zeit/)
  })

  it('Woche ergibt sieben, Monat vier Abschnitte', async () => {
    const woche = await h.json<NowResponse>(family.anna, 'GET', `${base()}/now?horizon=week`)
    const monat = await h.json<NowResponse>(family.anna, 'GET', `${base()}/now?horizon=month`)
    expect(woche.plan!.slots).toHaveLength(7)
    expect(monat.plan!.slots).toHaveLength(4)
  })
})

describe('Was nicht in den Plan passt', () => {
  it('steht im Überhang, nicht im Nichts', async () => {
    const eng = await h.json<NowResponse>(family.anna, 'GET', `${base()}/now?horizon=day&strategy=one_thing`)
    expect(eng.plan!.slots[0]!.entries).toHaveLength(1)
    expect(eng.plan!.overflow.length, 'INV-007: der Rest bleibt sichtbar').toBeGreaterThan(0)
  })
})

describe('Die Vorgabe gilt für den Betrachter', () => {
  it('was Anna sich merkt, bekommt Ben nicht', async () => {
    await h.json(family.anna, 'GET', `${base()}/now?horizon=month&strategy=capacity_fit&remember=1`)

    const anna = await h.json<NowResponse>(family.anna, 'GET', `${base()}/now`)
    expect(anna.plan, 'Annas gemerkte Vorgabe muss ohne Parameter greifen').not.toBeNull()
    expect(anna.plan!.horizon).toBe('month')
    expect(anna.plan!.strategy).toBe('capacity_fit')

    const ben = await h.json<NowResponse>(family.ben, 'GET', `${base()}/now`)
    expect(ben.plan ?? null, 'Annas Wahl ist in Bens Ansicht gelandet').toBeNull()
  })
})

describe('Situative Anlässe – „wenn X, dann Y"', () => {
  it('ein Anlass sammelt die Aufgaben, die an ihm hängen', async () => {
    const anlass = await h.json<{ id: string; label: string }>(family.anna, 'POST', `${base()}/cues`, {
      label: 'beim nächsten Einkauf',
    })
    expect(anlass.label).toBe('beim nächsten Einkauf')

    const eins = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, {
      domainId,
      title: 'Zahnpasta mitnehmen',
      estimatedMinutes: 2,
    })
    const zwei = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, {
      domainId,
      title: 'Batterien mitnehmen',
      estimatedMinutes: 2,
    })
    await h.json(family.anna, 'PUT', `${base()}/tasks/${eins.id}/cue`, { cueId: anlass.id })
    await h.json(family.anna, 'PUT', `${base()}/tasks/${zwei.id}/cue`, { cueId: anlass.id })

    const view = await h.json<NowResponse>(family.anna, 'GET', `${base()}/now?horizon=day&strategy=cue_grouped`)
    const eintraege = view.plan!.slots.flatMap((s) => s.entries)
    const amAnlass = eintraege.filter((e) => e.cue?.id === anlass.id)
    expect(amAnlass.length).toBe(2)
    for (const e of amAnlass) {
      expect(e.placedBecause ?? '').toContain('beim nächsten Einkauf')
    }
    // Der Anlass steht am Anfang: Was an einer Situation hängt, gehört beieinander und vorn.
    expect(eintraege[0]!.cue?.id).toBe(anlass.id)
  })

  it('zählt die Aufgaben am Anlass – ein leerer Anlass ist eine leere Absicht', async () => {
    const liste = await h.json<{ id: string; label: string; taskCount: number }[]>(family.anna, 'GET', `${base()}/cues`)
    const einkauf = liste.find((c) => c.label === 'beim nächsten Einkauf')
    expect(einkauf?.taskCount).toBe(2)
  })

  it('derselbe Name zweimal gibt denselben Anlass, keine zweite Liste', async () => {
    const a = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/cues`, { label: 'wenn ich im Auto sitze' })
    const b = await h.json<{ id: string }>(family.ben, 'POST', `${base()}/cues`, { label: 'wenn ich im Auto sitze' })
    expect(b.id).toBe(a.id)
  })

  it('ein zur Seite gelegter Anlass lässt die Aufgabe stehen', async () => {
    const anlass = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/cues`, { label: 'beim nächsten Arztbesuch' })
    const aufgabe = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, {
      domainId,
      title: 'Impfpass fragen',
      estimatedMinutes: 3,
    })
    await h.json(family.anna, 'PUT', `${base()}/tasks/${aufgabe.id}/cue`, { cueId: anlass.id })
    await h.json(family.anna, 'DELETE', `${base()}/cues/${anlass.id}`)

    const view = await h.json<NowResponse>(family.anna, 'GET', `${base()}/now?horizon=week&strategy=cue_grouped`)
    const alle = [...view.plan!.slots.flatMap((s) => s.entries), ...view.plan!.overflow, ...view.plan!.notPlannable]
    const gefunden = alle.find((e) => e.title === 'Impfpass fragen')
    expect(gefunden, 'die Aufgabe darf mit dem Anlass nicht verschwinden').toBeDefined()
    expect(gefunden!.cue, 'ohne Anlass, aber vorhanden').toBeNull()
  })
})
