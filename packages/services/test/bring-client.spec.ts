import { describe, expect, it } from 'vitest'
import { BringClient, BringError, type FetchLike } from '../src/bring/client.js'

/**
 * Der Bring-Adapter, geprüft ohne Bring.
 *
 * Die Schnittstelle ist nicht offiziell – sie kann sich ändern, und dann muss Thealotta das
 * **melden** statt still nichts zu tun. Genau das prüfen diese Tests: Jede Art von Fehlschlag
 * wird zu einem Grund, den man einem Menschen zeigen kann.
 *
 * `fetch` wird hereingereicht, nicht importiert. Deshalb ruft hier nichts einen fremden
 * Dienst an – auch nicht versehentlich.
 */
function fake(antworten: Record<string, { status?: number; body?: string; wirft?: unknown }>): {
  hole: FetchLike
  rufe: { url: string; method: string; body?: string; auth?: string }[]
} {
  const rufe: { url: string; method: string; body?: string; auth?: string }[] = []
  const hole: FetchLike = async (url, init) => {
    rufe.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body,
      auth: init?.headers?.['Authorization'],
    })
    const treffer = Object.entries(antworten).find(([teil]) => url.includes(teil))?.[1]
    if (!treffer) return { ok: false, status: 500, text: async () => '' }
    if (treffer.wirft) throw treffer.wirft
    const status = treffer.status ?? 200
    return { ok: status < 400, status, text: async () => treffer.body ?? '' }
  }
  return { hole, rufe }
}

const ANMELDUNG = JSON.stringify({
  uuid: 'u-1',
  access_token: 'zugang-1',
  refresh_token: 'erneuerung-1',
  expires_in: 3600,
})

describe('Anmeldung', () => {
  it('gibt Tokens zurück und schickt das Passwort nur einmal hin', async () => {
    const { hole, rufe } = fake({ 'v2/bringauth': { body: ANMELDUNG } })
    const t = await new BringClient(hole).anmelden('a@b.c', 'geheim')

    expect(t).toEqual({ zugang: 'zugang-1', erneuerung: 'erneuerung-1', benutzerUuid: 'u-1', gueltigFuer: 3600 })
    expect(rufe).toHaveLength(1)
    expect(rufe[0]!.body).toContain('password=geheim')
  })

  it('unterscheidet falsches Passwort von einer geänderten Schnittstelle', async () => {
    const abgelehnt = fake({ 'v2/bringauth': { status: 401 } })
    await expect(new BringClient(abgelehnt.hole).anmelden('a@b.c', 'falsch')).rejects.toMatchObject({
      grund: 'anmeldung_abgelehnt',
    })

    // Bring antwortet freundlich, aber anders als erwartet.
    const anders = fake({ 'v2/bringauth': { body: JSON.stringify({ token: 'neu' }) } })
    await expect(new BringClient(anders.hole).anmelden('a@b.c', 'richtig')).rejects.toMatchObject({
      grund: 'unerwartete_antwort',
    })
  })

  it('macht aus einem Netzfehler keinen stillen Fehlschlag', async () => {
    const { hole } = fake({ 'v2/bringauth': { wirft: new Error('ECONNREFUSED') } })
    await expect(new BringClient(hole).anmelden('a@b.c', 'x')).rejects.toBeInstanceOf(BringError)
  })
})

describe('Erneuern', () => {
  it('behält den alten Refresh-Token, wenn Bring keinen neuen schickt', async () => {
    const { hole } = fake({
      'v2/bringauth/token': { body: JSON.stringify({ uuid: 'u-1', access_token: 'zugang-2' }) },
    })
    const t = await new BringClient(hole).erneuern('erneuerung-1')
    expect(t.zugang).toBe('zugang-2')
    expect(t.erneuerung, 'sonst wäre die Verbindung nach einmal Erneuern tot').toBe('erneuerung-1')
  })
})

describe('Listen und Artikel', () => {
  it('liest die Listen und lässt Unvollständiges weg', async () => {
    const { hole, rufe } = fake({
      '/lists': {
        body: JSON.stringify({
          lists: [{ listUuid: 'l-1', name: 'Zuhause' }, { name: 'ohne Kennung' }, { listUuid: 'l-2' }],
        }),
      },
    })
    const listen = await new BringClient(hole).listen('u-1', 'zugang-1')

    expect(listen).toEqual([{ uuid: 'l-1', name: 'Zuhause' }, { uuid: 'l-2', name: 'Liste' }])
    expect(rufe[0]!.auth).toBe('Bearer zugang-1')
  })

  it('setzt einen Artikel mit Zusatz auf die Liste', async () => {
    const { hole, rufe } = fake({ 'bringlists/l-1': { body: '' } })
    await new BringClient(hole).hinzufuegen('l-1', 'zugang-1', { name: 'Brot', zusatz: 'aus Thealotta' })

    expect(rufe[0]!.method).toBe('PUT')
    expect(rufe[0]!.body).toContain('purchase=Brot')
    expect(rufe[0]!.body).toContain('specification=aus+Thealotta')
  })

  it('sagt es, wenn die Liste nicht mehr existiert', async () => {
    const { hole } = fake({ 'bringlists/weg': { status: 404 } })
    await expect(
      new BringClient(hole).hinzufuegen('weg', 'zugang-1', { name: 'Brot' }),
    ).rejects.toMatchObject({ grund: 'liste_unbekannt' })
  })
})
