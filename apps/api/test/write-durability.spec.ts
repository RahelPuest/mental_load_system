import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Eine bestätigte Schreiboperation muss auch geschehen sein.
 *
 * Bis zum dritten Durchgang rief jeder Handler `reply.send()` innerhalb der Transaktion auf.
 * Fastifys `Reply` ist ein Thenable – als Rückgabewert der Transaktion wartete diese darauf,
 * dass die Antwort den Client erreicht. Damit ging jede Antwort zwangsläufig **vor** dem
 * COMMIT hinaus. Zwei Folgen:
 *
 *  1. Ein gescheitertes COMMIT hinterließ einen Client, der „201 Created" gelesen hatte.
 *  2. Der unmittelbar nächste Aufruf sah die eigene Schreiboperation nicht.
 *
 * Beides widerspricht INV-001 („nichts geht still verloren") und der Zusage des Produkts,
 * dass man sich auf das System verlassen kann. Diese Datei hält das fest.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let domainId: string
const base = () => `/api/v1/households/${family.householdId}`

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'durability')
  domainId = (await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Haltbarkeit' })).id
}, 180_000)
afterAll(async () => h.stop())

describe('Bestätigt heißt gespeichert', () => {
  it('was als angelegt gemeldet wurde, ist im nächsten Aufruf sofort da', async () => {
    for (let i = 0; i < 25; i += 1) {
      const created = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, {
        title: `Aufgabe ${i}`,
        domainId,
      })
      const read = await h.request(family.anna, 'POST', `${base()}/tasks/${created.id}/start`)
      expect(read.statusCode, `Durchlauf ${i}: gerade bestätigte Aufgabe nicht auffindbar`).toBeLessThan(400)
    }
  })

  it('gilt auch, wenn mehrere Schreibvorgänge gleichzeitig laufen', async () => {
    const created = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, { title: `Parallel ${i}`, domainId }),
      ),
    )
    const reads = await Promise.all(
      created.map((task) => h.request(family.anna, 'POST', `${base()}/tasks/${task.id}/start`)),
    )
    expect(reads.filter((r) => r.statusCode >= 400)).toEqual([])
  })

  it('ein geänderter Wert ist unmittelbar danach der gelesene Wert', async () => {
    for (const level of ['reduced', 'normal', 'minimal', 'normal'] as const) {
      await h.json(family.anna, 'PUT', `${base()}/capacity/me`, { level, reason: 'self_declared' })
      const read = await h.json<{ level: string }>(family.anna, 'GET', `${base()}/capacity/me`)
      expect(read.level, 'gelesen wurde ein überholter Stand').toBe(level)
    }
  })
})
