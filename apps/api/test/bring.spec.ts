import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Die Bring-Anbindung, geprüft ohne Bring.
 *
 * Der Adapter wird in `packages/services/test/bring-client.spec.ts` gegen ein gefälschtes
 * `fetch` geprüft. Hier geht es um das, was dahinter liegt: Was Thealotta **speichert** und was
 * nicht, und dass ein Fehlschlag an der Verbindung sichtbar wird.
 *
 * Die entscheidende Zusage: **Das Passwort wird nie abgelegt** – weder in der Tabelle noch
 * im Ereignisverlauf. Gespeichert ist nur der Refresh-Token, und der verschlüsselt.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
const base = () => `/api/v1/households/${family.householdId}`

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'bring')
}, 180_000)
afterAll(async () => h.stop())

describe('Bring-Verbindung', () => {
  it('ist zu Beginn nicht vorhanden', async () => {
    const r = await h.json<{ verbindung: unknown }>(family.anna, 'GET', `${base()}/bring`)
    expect(r.verbindung).toBeNull()
  })

  it('weist unvollständige Angaben ab, bevor irgendetwas hinausgeht', async () => {
    for (const body of [{}, { email: 'keine-mail', passwort: 'x' }, { email: 'a@b.c', passwort: '' }]) {
      const r = await h.request(family.anna, 'POST', `${base()}/bring/connect`, body)
      expect(r.statusCode, JSON.stringify(body)).toBe(422)
    }
  })

  it('sagt beim Senden, dass nichts verbunden ist – statt still nichts zu tun', async () => {
    const aufgabe = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, { title: 'Brot kaufen' })
    const r = await h.request(family.anna, 'POST', `${base()}/tasks/${aufgabe.id}/bring`, {})
    expect(r.statusCode).toBe(422)
    expect(JSON.parse(r.body).detail).toMatch(/keine Bring-Liste verbunden/)
  })
})

describe('Was gespeichert wird', () => {
  it('legt weder Passwort noch Zugangs-Token in der Datenbank ab', async () => {
    const { bringConnections, withTenant } = await import('@thealotta/db')

    /*
     * Ein gefälschtes `fetch` für die Dauer dieses Tests. Kein echter Aufruf – auch nicht
     * versehentlich. Der Weg geht durch die Route, damit Rechteprüfung und Kontext
     * mitgeprüft werden und nicht nur der Dienst für sich.
     */
    const echtes = globalThis.fetch
    const gesendet: string[] = []
    globalThis.fetch = (async (url: string, init?: { body?: string }) => {
      gesendet.push(`${String(url)} ${init?.body ?? ''}`)
      const body = String(url).includes('bringauth')
        ? JSON.stringify({ uuid: 'u-1', access_token: 'zugang-1', refresh_token: 'erneuerung-1', expires_in: 3600 })
        : JSON.stringify({ lists: [{ listUuid: 'l-1', name: 'Zuhause' }] })
      return { ok: true, status: 200, text: async () => body }
    }) as never

    try {
      const r = await h.json<{ listen: { uuid: string; name: string }[] }>(
        family.anna,
        'POST',
        `${base()}/bring/connect`,
        { email: 'a@b.c', passwort: 'streng-geheim' },
      )
      expect(r.listen).toEqual([{ uuid: 'l-1', name: 'Zuhause' }])
    } finally {
      globalThis.fetch = echtes
    }

    await withTenant(h.app.db, [family.householdId], async (tx) => {
      const [row] = await tx.select().from(bringConnections)
      const alsText = JSON.stringify({
        ...row,
        credentialsCiphertext: row?.credentialsCiphertext?.toString('utf8'),
      })
      expect(alsText, 'das Passwort darf nirgends stehen').not.toContain('streng-geheim')
      expect(alsText, 'auch der kurzlebige Zugang gehört nicht in die Datenbank').not.toContain('zugang-1')
      expect(alsText, 'der Refresh-Token darf nicht im Klartext stehen').not.toContain('erneuerung-1')
      expect(row?.bringEmail).toBe('a@b.c')
      expect(row?.state).toBe('connected')
    })

    // Genau einmal ging ein Passwort hinaus – bei der Anmeldung.
    expect(gesendet.filter((g) => g.includes('streng-geheim'))).toHaveLength(1)
  })

  it('hält das Passwort auch aus dem Ereignisverlauf heraus', async () => {
    const { domainEvents, withTenant } = await import('@thealotta/db')
    const { eq } = await import('drizzle-orm')
    await withTenant(h.app.db, [family.householdId], async (tx) => {
      const zeilen = await tx.select().from(domainEvents).where(eq(domainEvents.householdId, family.householdId))
      const alles = JSON.stringify(zeilen)
      expect(alles, 'kein Passwort im Verlauf').not.toContain('streng-geheim')
      expect(alles, 'keine Bring-Adresse im Verlauf').not.toContain('a@b.c')
    })
  })

  it('meldet eine fehlende Liste, statt still nichts zu senden', async () => {
    const aufgabe = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, { title: 'Milch' })
    const r = await h.request(family.anna, 'POST', `${base()}/tasks/${aufgabe.id}/bring`, {})
    expect(r.statusCode).toBe(422)
    expect(JSON.parse(r.body).detail).toMatch(/noch keine Bring-Liste ausgewählt/)
  })
})
