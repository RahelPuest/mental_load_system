import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * §48 (globale Suche) und §44 (verständliche Berechtigungen).
 *
 * Der wichtigste Test hier ist der letzte: Suche darf kein Weg an der Zugriffskontrolle
 * vorbei sein. Eine Suchfunktion, die mehr findet als die reguläre Ansicht zeigt, ist ein Leck.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let openDomainId: string
let healthDomainId: string

const base = () => `/api/v1/households/${family.householdId}`

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'search')

  openDomainId = (await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Schuhe' })).id
  healthDomainId = (
    await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, {
      name: 'Gesundheit Kind A',
      sensitivity: 'health',
      criticality: 'critical',
    })
  ).id

  await h.json(family.anna, 'POST', `${base()}/domains/${openDomainId}/state-definitions`, {
    key: 'shoe_size',
    label: 'Schuhgröße',
    dataType: 'number',
    freshnessInterval: 'P6W',
  })
  await h.json(family.anna, 'POST', `${base()}/knowledge`, {
    domainId: openDomainId,
    title: 'Marke Superfit passt gut',
    body: 'Weite mittel, fällt etwas kleiner aus.',
  })
  await h.json(family.anna, 'POST', `${base()}/knowledge`, {
    domainId: healthDomainId,
    title: 'Allergie gegen Nüsse',
    body: 'Bei Kita und Freunden hinterlegt.',
    sensitivity: 'health',
  })
  await h.json(family.anna, 'POST', `${base()}/questions`, {
    domainId: openDomainId,
    body: 'Wie erkenne ich, ob die Gummistiefel noch passen?',
  })
}, 180_000)
afterAll(async () => h.stop())

describe('Globale Suche', () => {
  it('findet über alle Objektarten hinweg', async () => {
    const result = await h.json<{ items: { kind: string; title: string; subtitle: string; href: string }[] }>(
      family.anna,
      'GET',
      `${base()}/search?q=schuh`,
    )
    const kinds = new Set(result.items.map((i) => i.kind))
    expect(kinds.has('domain')).toBe(true)
    expect(kinds.has('state')).toBe(true)
    expect(result.items.every((i) => i.href.length > 1)).toBe(true)
  })

  it('sucht unscharf im Text, nicht nur im Titel', async () => {
    const result = await h.json<{ items: { kind: string; title: string }[] }>(
      family.anna,
      'GET',
      `${base()}/search?q=superfit`,
    )
    expect(result.items.some((i) => i.kind === 'knowledge')).toBe(true)

    const inBody = await h.json<{ items: { title: string }[] }>(family.anna, 'GET', `${base()}/search?q=weite`)
    expect(inBody.items.map((i) => i.title)).toContain('Marke Superfit passt gut')
  })

  it('ist ohne Groß- und Kleinschreibung unterscheidbar', async () => {
    const lower = await h.json<{ items: unknown[] }>(family.anna, 'GET', `${base()}/search?q=gummistiefel`)
    const upper = await h.json<{ items: unknown[] }>(family.anna, 'GET', `${base()}/search?q=GUMMISTIEFEL`)
    expect(lower.items.length).toBe(upper.items.length)
    expect(lower.items.length).toBeGreaterThan(0)
  })

  it('liefert bei zu kurzer Eingabe nichts, statt alles zu laden', async () => {
    const result = await h.json<{ items: unknown[] }>(family.anna, 'GET', `${base()}/search?q=s`)
    expect(result.items).toHaveLength(0)
  })

  it('gibt Treffer aus fremden Haushalten nicht heraus (INV-005)', async () => {
    const other = await familyFixture(h, 'search-other')
    await h.json(other.anna, 'POST', `/api/v1/households/${other.householdId}/domains`, { name: 'Schuhschrank' })

    const result = await h.json<{ items: { title: string }[] }>(family.anna, 'GET', `${base()}/search?q=schuhschrank`)
    expect(result.items).toHaveLength(0)
  })
})

describe('Berechtigungen im Klartext', () => {
  it('Ben sieht Gesundheitswissen zunächst über sein Rollenrecht', async () => {
    const result = await h.json<{ items: { title: string }[] }>(family.ben, 'GET', `${base()}/search?q=allergie`)
    expect(result.items.map((i) => i.title)).toContain('Allergie gegen Nüsse')
  })

  it('ein ausdrückliches Verbot entzieht den Zugriff – auch in der Suche', async () => {
    await h.json(family.anna, 'POST', `${base()}/grants`, {
      membershipId: family.benMembershipId,
      scopeType: 'domain',
      scopeId: healthDomainId,
      capability: 'knowledge:read',
      maxSensitivity: 'normal',
      effect: 'deny',
    })

    const result = await h.json<{ items: { title: string }[] }>(family.ben, 'GET', `${base()}/search?q=allergie`)
    expect(result.items.map((i) => i.title)).not.toContain('Allergie gegen Nüsse')

    // Gegenprobe: die reguläre Ansicht verhält sich identisch.
    const knowledge = await h.json<{ items: { title: string }[] }>(
      family.ben,
      'GET',
      `${base()}/knowledge?domainId=${healthDomainId}`,
    )
    expect(knowledge.items.map((i) => i.title)).not.toContain('Allergie gegen Nüsse')
  })

  it('vergebene Zugänge lassen sich auflisten und in Klartext übersetzen', async () => {
    const grants = await h.json<{
      items: { membershipId: string; capability: string; scopeName: string | null; maxSensitivity: string }[]
    }>(family.anna, 'GET', `${base()}/grants`)

    const entry = grants.items.find((g) => g.capability === 'knowledge:read')
    expect(entry).toBeDefined()
    // Die Oberfläche braucht den Bereichsnamen, um einen Satz bilden zu können.
    expect(entry!.scopeName).toBe('Gesundheit Kind A')
  })

  it('nur Verwaltende dürfen die Zugänge überhaupt sehen', async () => {
    const response = await h.request(family.ben, 'GET', `${base()}/grants`)
    expect(response.statusCode).toBe(403)
  })
})

describe('Rückgängig statt Bestätigungsdialog (§57)', () => {
  it('eine erledigte Aufgabe lässt sich zurückholen', async () => {
    const task = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, {
      title: 'Versehentlich abgehakt',
      domainId: openDomainId,
    })

    const done = await h.json<{ state: string }>(family.anna, 'POST', `${base()}/tasks/${task.id}/complete`, {})
    expect(done.state).toBe('done')

    const reopened = await h.json<{ state: string }>(family.anna, 'POST', `${base()}/tasks/${task.id}/reopen`)
    expect(reopened.state).toBe('ready')

    // Und sie ist danach wieder ganz normal sichtbar – nichts ist verloren gegangen.
    const now = await h.json<{ sections: { items: { subjectId: string }[] }[] }>(family.anna, 'GET', `${base()}/now`)
    expect(now.sections.flatMap((s) => s.items).map((i) => i.subjectId)).toContain(task.id)
  })
})
