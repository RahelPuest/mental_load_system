import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Eine Regel nachträglich ändern.
 *
 * Bisher unmöglich: `PATCH` nahm nur `enabled`, und `remove()` verweigert ab dem ersten
 * Signal. Eine einmal gelaufene Regel war damit für immer eingefroren – wer den Rhythmus
 * falsch gewählt hatte, konnte sie nur noch abschalten. Dieselbe Art Sackgasse, die dieses
 * Produkt an anderen Stellen ausdrücklich vermeidet.
 *
 * Die Gegenprobe ist der wichtigste Test hier: **Die Vergangenheit bleibt.** Was die Regel
 * damals gesehen hat, wird durch eine Änderung nicht umgedeutet.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let bereichId: string
let angabeId: string
const base = () => `/api/v1/households/${family.householdId}`

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'regel-edit')
  bereichId = (await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Wäsche' })).id
  angabeId = (
    await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains/${bereichId}/state-definitions`, {
      key: 'waschmittel',
      label: 'Waschmittel',
      dataType: 'number',
      freshnessInterval: 'P14D',
    })
  ).id
}, 180_000)
afterAll(async () => h.stop())

async function neueRegel(name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const r = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/monitors`, {
    domainId: bereichId,
    name,
    ruleKind: 'schedule',
    config: { weekdays: [1] },
    defaultResponse: 'create_task',
    ...extra,
  })
  return r.id
}

async function regel(id: string) {
  const { items } = await h.json<{
    items: { id: string; name: string; ruleKind: string; config: Record<string, unknown>; defaultResponse: string; enabled: boolean; stateDefinitionId: string | null }[]
  }>(family.anna, 'GET', `${base()}/monitors`)
  return items.find((m) => m.id === id)!
}

describe('Ändern', () => {
  it('ändert den Rhythmus, ohne die Regel neu anlegen zu müssen', async () => {
    const id = await neueRegel('Waschmittel prüfen')
    await h.json(family.anna, 'PATCH', `${base()}/monitors/${id}`, { config: { weekdays: [4] } })

    const nachher = await regel(id)
    expect(nachher.config['weekdays']).toEqual([4])
    expect(nachher.name, 'was nicht mitgeschickt wurde, bleibt').toBe('Waschmittel prüfen')
  })

  it('ändert Name, Art, Antwort und Zielangabe einzeln oder zusammen', async () => {
    const id = await neueRegel('Alter Name')
    await h.json(family.anna, 'PATCH', `${base()}/monitors/${id}`, {
      name: 'Neuer Name',
      ruleKind: 'state_freshness',
      stateDefinitionId: angabeId,
      defaultResponse: 'attention_item',
    })

    const nachher = await regel(id)
    expect(nachher.name).toBe('Neuer Name')
    expect(nachher.ruleKind).toBe('state_freshness')
    expect(nachher.stateDefinitionId).toBe(angabeId)
    expect(nachher.defaultResponse).toBe('attention_item')
  })

  it('lässt Ändern und Abschalten in einem Zug zu', async () => {
    const id = await neueRegel('Beides')
    await h.json(family.anna, 'PATCH', `${base()}/monitors/${id}`, { name: 'Umbenannt', enabled: false })

    const nachher = await regel(id)
    expect(nachher.name).toBe('Umbenannt')
    expect(nachher.enabled).toBe(false)
  })

  it('weist eine Angabe aus einem fremden Bereich ab', async () => {
    const anderer = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Fremd' })
    const fremdeAngabe = await h.json<{ id: string }>(
      family.anna,
      'POST',
      `${base()}/domains/${anderer.id}/state-definitions`,
      { key: 'x', label: 'X', dataType: 'text' },
    )
    const id = await neueRegel('Bleibt wie sie ist')

    const antwort = await h.request(family.anna, 'PATCH', `${base()}/monitors/${id}`, {
      stateDefinitionId: fremdeAngabe.id,
    })
    expect(antwort.statusCode).toBe(422)
    expect(JSON.parse(antwort.body).detail).toMatch(/anderen Bereich/)

    expect((await regel(id)).stateDefinitionId, 'nichts darf halb geändert sein').toBeNull()
  })
})

describe('Die Vergangenheit bleibt', () => {
  it('deutet frühere Meldungen nicht um', async () => {
    const id = await neueRegel('Läuft schon', {
      ruleKind: 'state_freshness',
      stateDefinitionId: angabeId,
      config: {},
    })
    await h.json(family.anna, 'PUT', `${base()}/state-definitions/${angabeId}/value`, {
      valueKind: 'known',
      value: 2,
    })
    await h.json(family.anna, 'POST', `${base()}/monitors/${id}/evaluate`, {})
    const vorher = (await regel(id)) as unknown as { bilanz: { gemeldet: number } | null }

    await h.json(family.anna, 'PATCH', `${base()}/monitors/${id}`, { name: 'Umbenannt nach dem Lauf' })

    const nachher = (await regel(id)) as unknown as { bilanz: { gemeldet: number } | null }
    expect(nachher.bilanz?.gemeldet ?? 0).toBe(vorher.bilanz?.gemeldet ?? 0)
    expect((await regel(id)).name).toBe('Umbenannt nach dem Lauf')
  })

  it('schreibt die Änderung in den Verlauf', async () => {
    const id = await neueRegel('Für den Verlauf')
    await h.json(family.anna, 'PATCH', `${base()}/monitors/${id}`, { name: 'Danach' })

    const { items } = await h.json<{ items: { eventType: string; payload: Record<string, unknown> }[] }>(
      family.anna,
      'GET',
      `${base()}/history?subjectId=${id}&limit=20`,
    )
    const aenderung = items.find((e) => e.eventType === 'monitor.updated')
    expect(aenderung, 'eine stille Änderung wäre keine nachvollziehbare').toBeTruthy()
    expect(JSON.stringify(aenderung?.payload)).toContain('Für den Verlauf')
  })
})
