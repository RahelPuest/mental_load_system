import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Der Verlauf wird nachgeladen, statt alles auf einmal zu holen (Review C5).
 *
 * Er wächst mit jeder Handlung. Eine Ansicht, die immer alles zieht, wird mit der Zeit die
 * längste der Anwendung – auf dem Handy waren es schon 1580 px, bevor überhaupt jemand
 * ernsthaft damit gearbeitet hat.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let domainId: string
const base = () => `/api/v1/households/${family.householdId}`

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'verlauf')
  domainId = (await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Verlaufstest' })).id
  // Genug Ereignisse für mehrere Seiten.
  for (let i = 0; i < 7; i += 1) {
    await h.json(family.anna, 'POST', `${base()}/knowledge`, {
      domainId,
      title: `Notiz ${i}`,
      body: 'x',
      kind: 'fact',
    })
  }
}, 180_000)
afterAll(async () => h.stop())

describe('Verlauf, seitenweise', () => {
  it('meldet, dass es weitergeht – ohne die Gesamtzahl zu zählen', async () => {
    const seite = await h.json<{ items: { occurredAt: string }[]; hasMore: boolean }>(
      family.anna,
      'GET',
      `${base()}/history?domainId=${domainId}&limit=3`,
    )
    expect(seite.items).toHaveLength(3)
    expect(seite.hasMore).toBe(true)
  })

  it('liefert die nächste Seite ohne Überschneidung und ohne Lücke', async () => {
    const eins = await h.json<{ items: { id: string; occurredAt: string }[] }>(
      family.anna,
      'GET',
      `${base()}/history?domainId=${domainId}&limit=3`,
    )
    const zwei = await h.json<{ items: { id: string; occurredAt: string }[] }>(
      family.anna,
      'GET',
      `${base()}/history?domainId=${domainId}&limit=3&before=${encodeURIComponent(eins.items[2]!.occurredAt)}`,
    )

    const doppelt = zwei.items.filter((e) => eins.items.some((f) => f.id === e.id))
    expect(doppelt, 'kein Ereignis darf auf zwei Seiten stehen').toEqual([])
    expect(
      new Date(zwei.items[0]!.occurredAt).getTime(),
      'die zweite Seite muss älter sein als die erste',
    ).toBeLessThan(new Date(eins.items[2]!.occurredAt).getTime())
  })

  it('meldet das Ende, wenn nichts mehr kommt', async () => {
    const alles = await h.json<{ items: unknown[]; hasMore: boolean }>(
      family.anna,
      'GET',
      `${base()}/history?domainId=${domainId}&limit=200`,
    )
    expect(alles.hasMore).toBe(false)
  })
})
