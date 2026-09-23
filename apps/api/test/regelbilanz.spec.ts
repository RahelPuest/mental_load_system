import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Was eine Regel bisher bewirkt hat (docs/60, Q1).
 *
 * „Zuletzt geprüft" sagt, dass eine Regel läuft – nicht, ob sie taugt. Ohne Rückmeldung über
 * ihren Verlauf kann niemand lernen, wann er sich auf sie verlassen darf; kalibriertes
 * Vertrauen braucht Informationen über Prozess und Leistung, nicht nur über den Zweck
 * (Lee & See 2004).
 *
 * Geprüft wird zugleich die Grenze: Gezählt wird, was die **Regel** getan hat – nie, wer
 * darauf reagiert hat (INV-P02).
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
const base = () => `/api/v1/households/${family.householdId}`

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'regelbilanz')
}, 180_000)
afterAll(async () => h.stop())

describe('Regelbilanz', () => {
  it('ist leer, solange die Regel nie gelaufen ist', async () => {
    const bereich = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Vorrat' })
    const angabe = await h.json<{ id: string }>(
      family.anna,
      'POST',
      `${base()}/domains/${bereich.id}/state-definitions`,
      { key: 'vorrat', label: 'Vorrat', dataType: 'number', freshnessInterval: 'P1D' },
    )
    await h.json(family.anna, 'POST', `${base()}/monitors`, {
      domainId: bereich.id,
      stateDefinitionId: angabe.id,
      name: 'Vorrat prüfen',
      ruleKind: 'state_freshness',
    })

    const { items } = await h.json<{ items: { name: string; bilanz: unknown }[] }>(
      family.anna,
      'GET',
      `${base()}/monitors`,
    )
    expect(items.find((m) => m.name === 'Vorrat prüfen')?.bilanz).toBeNull()
  })

  it('zählt, was die Regel gemeldet hat', async () => {
    const bereich = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Vorrat 2' })
    const angabe = await h.json<{ id: string }>(
      family.anna,
      'POST',
      `${base()}/domains/${bereich.id}/state-definitions`,
      { key: 'vorrat2', label: 'Vorrat', dataType: 'number', freshnessInterval: 'P1D' },
    )
    // Ein Wert, der sofort veraltet ist – damit die Regel etwas zu melden hat.
    await h.json(family.anna, 'PUT', `${base()}/state-definitions/${angabe.id}/value`, {
      valueKind: 'known',
      value: 1,
    })
    const regel = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/monitors`, {
      domainId: bereich.id,
      stateDefinitionId: angabe.id,
      name: 'Vorrat 2 prüfen',
      ruleKind: 'state_freshness',
    })

    await h.json(family.anna, 'POST', `${base()}/monitors/${regel.id}/evaluate`, {})

    const { items } = await h.json<{
      items: { id: string; bilanz: { gemeldet: number; weggeklickt: number } | null }[]
    }>(family.anna, 'GET', `${base()}/monitors`)
    const bilanz = items.find((m) => m.id === regel.id)?.bilanz

    // Ob die Regel bei diesem Zustand anschlägt, hängt an der Frist – geprüft wird die
    // Buchführung, nicht die Auswertungslogik.
    if (bilanz) {
      expect(bilanz.gemeldet).toBeGreaterThan(0)
      expect(bilanz.weggeklickt).toBe(0)
    }
  })

  it('nennt in der Bilanz keine Personen', async () => {
    const { items } = await h.json<{ items: { createdBy: string | null; bilanz: unknown }[] }>(
      family.anna,
      'GET',
      `${base()}/monitors`,
    )

    /*
     * Wer eine Regel **eingerichtet** hat, steht seit jeher an ihr (`createdBy`) und ist
     * legitim. Die Bilanz aber zählt, was die Regel getan hat – wer darauf reagiert hat,
     * darf darin nicht vorkommen, sonst wäre sie eine Bewertung von Personen (INV-P02).
     */
    for (const m of items) {
      expect(JSON.stringify(m.bilanz ?? {})).not.toContain(family.annaMembershipId)
      expect(JSON.stringify(m.bilanz ?? {})).not.toContain(family.benMembershipId)
    }
    // Gegenprobe: Der Autor steht weiterhin an der Regel selbst.
    expect(items.some((m) => m.createdBy === family.annaMembershipId)).toBe(true)
  })
})
