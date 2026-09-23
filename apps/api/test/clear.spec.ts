import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Alles leeren.
 *
 * Die entscheidenden Zusagen: Es geht **nur** mit dem richtigen Wort, es löscht **genau das**,
 * was ein Export mitnimmt – und der Haushalt samt seinen Mitgliedern bleibt stehen. Ein
 * Schutz, den nur die Oberfläche kennt, wäre keiner; deshalb wird das Wort hier gegen die
 * Schnittstelle geprüft, nicht gegen den Knopf.
 */
const h = new Harness()
const WORT = 'ALLES LÖSCHEN'
let ziel: Awaited<ReturnType<typeof familyFixture>>
const base = () => `/api/v1/households/${ziel.householdId}`

beforeAll(async () => {
  await h.start()
  ziel = await familyFixture(h, 'leeren')
  const doc = JSON.parse(readFileSync('ops/beispiele/mental-load.json', 'utf8')) as unknown
  await h.json(ziel.anna, 'POST', `${base()}/import`, doc)
}, 180_000)
afterAll(async () => h.stop())

describe('Alle Einträge löschen', () => {
  it('verlangt das Wort – ohne passiert nichts', async () => {
    for (const versuch of ['', 'ja', 'alles löschen', 'ALLES LOESCHEN']) {
      const antwort = await h.request(ziel.anna, 'POST', `${base()}/clear`, { confirmation: versuch })
      expect(antwort.statusCode, `„${versuch}" hätte abgewiesen werden müssen`).toBe(422)
    }

    // Und danach steht noch alles da.
    const { items } = await h.json<{ items: unknown[] }>(ziel.anna, 'GET', `${base()}/domains`)
    expect(items.length).toBeGreaterThan(15)
  })

  it('löscht die Inhalte und nennt, was gefallen ist', async () => {
    const { geloescht } = await h.json<{ geloescht: Record<string, number> }>(
      ziel.anna,
      'POST',
      `${base()}/clear`,
      { confirmation: WORT },
    )
    expect(geloescht['Bereiche']).toBe(21)
    expect(geloescht['Regeln']).toBe(15)
    expect(geloescht['Aufgaben']).toBe(14)

    const nachher = await h.json<{ items: unknown[] }>(ziel.anna, 'GET', `${base()}/domains`)
    expect(nachher.items).toEqual([])
  })

  it('lässt den Haushalt und seine Mitglieder stehen', async () => {
    const mitglieder = await h.json<{ items: { displayName: string }[] }>(ziel.anna, 'GET', `${base()}/members`)
    expect(mitglieder.items.map((m) => m.displayName).sort()).toEqual(['Anna', 'Ben'])

    // Und man kann sofort weiterarbeiten.
    const neu = await h.json<{ id: string }>(ziel.anna, 'POST', `${base()}/domains`, { name: 'Neuanfang' })
    expect(neu.id).toBeTruthy()
  })

  it('räumt auch die Belege weg, an denen Bereiche sonst hängenbleiben', async () => {
    /*
     * `signals` und `state_observations` sind für die Anwendung anhängend – sie hängen aber
     * mit `RESTRICT` an Bereichen und Angaben. Ohne das Löschrecht (Migration 0008) bliebe
     * jeder Bereich stehen, an dem je eine Regel gelaufen ist. Dieser Test hält fest, dass
     * ein Haushalt mit Auswertungshistorie wirklich leer wird.
     */
    const mit = await familyFixture(h, 'leeren-belege')
    const b = `/api/v1/households/${mit.householdId}`
    const bereich = await h.json<{ id: string }>(mit.anna, 'POST', `${b}/domains`, { name: 'Mit Verlauf' })
    const angabe = await h.json<{ id: string }>(mit.anna, 'POST', `${b}/domains/${bereich.id}/state-definitions`, {
      key: 'vorrat',
      label: 'Vorrat',
      dataType: 'number',
      freshnessInterval: 'P7D',
    })
    await h.json(mit.anna, 'PUT', `${b}/state-definitions/${angabe.id}/value`, { valueKind: 'known', value: 3 })
    const regel = await h.json<{ id: string }>(mit.anna, 'POST', `${b}/monitors`, {
      domainId: bereich.id,
      stateDefinitionId: angabe.id,
      name: 'Vorrat prüfen',
      ruleKind: 'state_freshness',
    })
    await h.json(mit.anna, 'POST', `${b}/monitors/${regel.id}/evaluate`, {})

    const { geloescht } = await h.json<{ geloescht: Record<string, number> }>(mit.anna, 'POST', `${b}/clear`, {
      confirmation: WORT,
    })
    expect(geloescht['Bereiche'], 'der Bereich muss trotz Verlauf fallen').toBe(1)

    const rest = await h.json<{ items: unknown[] }>(mit.anna, 'GET', `${b}/domains`)
    expect(rest.items).toEqual([])
  })

  it('ist auf einem leeren Haushalt kein Fehler, sondern eine leere Antwort', async () => {
    const leer = await familyFixture(h, 'leeren-leer')
    const { geloescht } = await h.json<{ geloescht: Record<string, number> }>(
      leer.anna,
      'POST',
      `/api/v1/households/${leer.householdId}/clear`,
      { confirmation: WORT },
    )
    expect(Object.values(geloescht).reduce((a, b) => a + b, 0)).toBe(0)
  })
})
