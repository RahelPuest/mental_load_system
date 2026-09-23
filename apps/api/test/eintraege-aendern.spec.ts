import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Bestehende Einträge berichtigen.
 *
 * Bis hierher konnte man Notizen, Fragen, Entscheidungen und Aufgaben anlegen und über ihren
 * Lebenszyklus bewegen – abhaken, beantworten, verwerfen –, aber nicht **ändern**. Wer sich
 * vertippt hatte, wessen Fundort umgezogen war oder wessen Schätzung sich als falsch erwies,
 * musste den Eintrag umgehen. In einem Werkzeug gegen mentale Last ist das genau verkehrt.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let domainId: string
const base = () => `/api/v1/households/${family.householdId}`

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'aendern')
  domainId = (await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Änderbar' })).id
}, 180_000)
afterAll(async () => h.stop())

describe('Aufgaben', () => {
  it('Titel, Schätzung und Frist lassen sich berichtigen', async () => {
    const t = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, {
      domainId,
      title: 'Tippfeler im Titel',
      estimatedMinutes: 5,
    })
    await h.json(family.anna, 'PATCH', `${base()}/tasks/${t.id}`, {
      title: 'Tippfehler im Titel',
      estimatedMinutes: 25,
      mentalEnergy: 'high',
    })

    const detail = await h.json<{ tasks: { id: string; title: string; estimatedMinutes: number; mentalEnergy: string }[] }>(
      family.anna,
      'GET',
      `${base()}/domains/${domainId}/detail`,
    )
    const gefunden = detail.tasks.find((x) => x.id === t.id)
    expect(gefunden?.title).toBe('Tippfehler im Titel')
    expect(gefunden?.estimatedMinutes).toBe(25)
    expect(gefunden?.mentalEnergy).toBe('high')
  })

  it('was nicht mitgeschickt wird, bleibt stehen', async () => {
    const t = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, {
      domainId,
      title: 'Bleibt so',
      estimatedMinutes: 30,
    })
    await h.json(family.anna, 'PATCH', `${base()}/tasks/${t.id}`, { title: 'Neuer Titel' })

    const detail = await h.json<{ tasks: { id: string; estimatedMinutes: number | null }[] }>(
      family.anna,
      'GET',
      `${base()}/domains/${domainId}/detail`,
    )
    expect(detail.tasks.find((x) => x.id === t.id)?.estimatedMinutes, 'undefined heißt unverändert').toBe(30)
  })

  it('eine Frist lässt sich ausdrücklich leeren', async () => {
    const t = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, {
      domainId,
      title: 'Mit Frist',
      dueAt: '2026-10-01T09:00:00.000Z',
    })
    await h.json(family.anna, 'PATCH', `${base()}/tasks/${t.id}`, { dueAt: null })
    const detail = await h.json<{ tasks: { id: string; dueAt: string | null }[] }>(
      family.anna,
      'GET',
      `${base()}/domains/${domainId}/detail`,
    )
    expect(detail.tasks.find((x) => x.id === t.id)?.dueAt, 'null heißt leeren').toBeNull()
  })
})

describe('Vorgänge', () => {
  it('Titel und Ziel lassen sich ändern', async () => {
    const v = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/processes`, {
      domainId,
      title: 'Vorgang mit Tipfehler',
      goal: 'Altes Ziel',
    })
    await h.json(family.anna, 'PATCH', `${base()}/processes/${v.id}`, { title: 'Vorgang ohne Tippfehler', goal: null })

    const detail = await h.json<{ processes: { id: string; title: string; goal: string | null }[] }>(
      family.anna,
      'GET',
      `${base()}/domains/${domainId}/detail`,
    )
    const gefunden = detail.processes.find((x) => x.id === v.id)
    expect(gefunden?.title).toBe('Vorgang ohne Tippfehler')
    expect(gefunden?.goal, 'null heißt: kein Ziel, nicht leerer Text').toBeNull()
  })
})

describe('Notizen, Fragen, Entscheidungen', () => {
  it('eine Notiz lässt sich ändern und gilt danach als bestätigt', async () => {
    const k = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/knowledge`, {
      domainId,
      scope: 'domain',
      kind: 'note',
      title: 'Fundort',
      body: 'Im Keller',
      sensitivity: 'normal',
    })
    await h.json(family.anna, 'PATCH', `${base()}/knowledge/${k.id}`, { body: 'Auf dem Dachboden' })

    const detail = await h.json<{ knowledge: { id: string; body: string; confirmedAt: string | null }[] }>(
      family.anna,
      'GET',
      `${base()}/domains/${domainId}/detail`,
    )
    const gefunden = detail.knowledge.find((x) => x.id === k.id)
    expect(gefunden?.body).toBe('Auf dem Dachboden')
    // INV-004: Wer durchsieht und anfasst, bestätigt.
    expect(gefunden?.confirmedAt).not.toBeNull()
  })

  it('der Wortlaut einer Frage lässt sich ändern', async () => {
    const q = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/questions`, {
      domainId,
      body: 'Welche Grösse?',
    })
    await h.json(family.anna, 'PATCH', `${base()}/questions/${q.id}`, { body: 'Welche Größe?' })

    const detail = await h.json<{ questions: { id: string; body: string }[] }>(
      family.anna,
      'GET',
      `${base()}/domains/${domainId}/detail`,
    )
    expect(detail.questions.find((x) => x.id === q.id)?.body).toBe('Welche Größe?')
  })

  it('eine Entscheidung lässt sich ändern', async () => {
    const d = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/decisions`, {
      domainId,
      title: 'Budget',
      body: '50 Euro',
      decisionKind: 'family_decision',
      bindingLevel: 'orientation',
    })
    await h.json(family.anna, 'PATCH', `${base()}/decisions/${d.id}`, { body: '80 Euro', bindingLevel: 'binding' })

    const detail = await h.json<{ decisions: { id: string; body: string; bindingLevel: string }[] }>(
      family.anna,
      'GET',
      `${base()}/domains/${domainId}/detail`,
    )
    const gefunden = detail.decisions.find((x) => x.id === d.id)
    expect(gefunden?.body).toBe('80 Euro')
    expect(gefunden?.bindingLevel).toBe('binding')
  })

  it('ein fremder Haushalt kommt nicht heran', async () => {
    const k = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/knowledge`, {
      domainId,
      scope: 'domain',
      kind: 'note',
      title: 'Privat',
      body: 'geheim',
      sensitivity: 'normal',
    })
    const fremd = await familyFixture(h, 'fremd')
    const antwort = await h.request(fremd.anna, 'PATCH', `/api/v1/households/${fremd.householdId}/knowledge/${k.id}`, {
      body: 'umgeschrieben',
    })
    expect(antwort.statusCode, 'Mandantentrennung: die Notiz gehört einem anderen Haushalt').toBe(404)
  })
})
