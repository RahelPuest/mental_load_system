import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Eine Aufgabe wieder loswerden.
 *
 * Es gab dafür genau einen Weg – `drop`, mit Begründungspflicht – und der war von der
 * Oberfläche aus nur aus der Jetzt-Ansicht erreichbar. Die zeigt drei Einträge auf einmal;
 * was darunter lag, war weder abzuhaken noch zu entfernen.
 *
 * Jetzt zwei Wege, und die Grenze dazwischen ist der Punkt dieser Datei: **Was einmal etwas
 * bedeutet hat, wird verworfen und nicht gelöscht.** Nur die unberührte Aufgabe verschwindet
 * still – ein Vertipper soll nicht begründet werden müssen.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let bereichId: string
const base = () => `/api/v1/households/${family.householdId}`

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'aufgabe-weg')
  bereichId = (await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Küche' })).id
}, 180_000)
afterAll(async () => h.stop())

async function neueAufgabe(title: string): Promise<string> {
  const r = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, { domainId: bereichId, title })
  return r.id
}

async function titelImBereich(): Promise<string[]> {
  const d = await h.json<{ tasks?: { title: string }[] }>(
    family.anna,
    'GET',
    `${base()}/domains/${bereichId}/detail`,
  )
  return (d.tasks ?? []).map((t) => t.title)
}

describe('Löschen', () => {
  it('entfernt eine unberührte Aufgabe ganz', async () => {
    const id = await neueAufgabe('Vertipperr')
    const antwort = await h.request(family.anna, 'DELETE', `${base()}/tasks/${id}`)
    expect(antwort.statusCode).toBe(204)
    expect(await titelImBereich()).not.toContain('Vertipperr')
  })

  it('schreibt trotzdem in den Verlauf – gelöscht heißt nicht spurlos', async () => {
    const id = await neueAufgabe('Kurz da gewesen')
    await h.request(family.anna, 'DELETE', `${base()}/tasks/${id}`)

    /*
      §4: Nichts verschwindet still. Die Aufgabe ist weg, der Satz „es gab sie einmal" nicht –
      sonst stünde später in der Chronik eine Lücke, die niemand erklären kann.
    */
    const { items } = await h.json<{ items: { eventType: string; payload: Record<string, unknown> }[] }>(
      family.anna,
      'GET',
      `${base()}/history?domainId=${bereichId}&limit=50`,
    )
    const eintrag = items.find((e) => e.eventType === 'task.deleted')
    expect(eintrag, 'kein Eintrag über das Löschen').toBeTruthy()
    expect(eintrag!.payload['title']).toBe('Kurz da gewesen')
  })
})

describe('Nicht löschen, sondern verwerfen', () => {
  it('verweigert die Aufgabe, an der schon gearbeitet wurde – und nennt den Weg', async () => {
    const id = await neueAufgabe('Angefangen')
    await h.json(family.anna, 'POST', `${base()}/tasks/${id}/start`, {})

    const antwort = await h.request(family.anna, 'DELETE', `${base()}/tasks/${id}`)
    expect(antwort.statusCode).toBe(409)
    expect(antwort.body, 'die Meldung sagt nur Nein statt wohin').toContain('Nicht mehr nötig')

    // Und nichts ist halb passiert: Die Aufgabe steht unverändert da.
    expect(await titelImBereich()).toContain('Angefangen')
  })

  it('verweigert die erledigte Aufgabe', async () => {
    const id = await neueAufgabe('Schon fertig')
    await h.json(family.anna, 'POST', `${base()}/tasks/${id}/complete`, {})

    const antwort = await h.request(family.anna, 'DELETE', `${base()}/tasks/${id}`)
    expect(antwort.statusCode).toBe(409)
  })

  it('verweigert den Schritt eines Vorgangs – eine Reihenfolge bekommt kein Loch', async () => {
    const vorgang = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/processes`, {
      domainId: bereichId,
      title: 'Neue Spülmaschine',
      goal: 'Eine, die passt',
    })
    const schritt = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, {
      domainId: bereichId,
      processId: vorgang.id,
      title: 'Maße nehmen',
    })

    const antwort = await h.request(family.anna, 'DELETE', `${base()}/tasks/${schritt.id}`)
    expect(antwort.statusCode).toBe(409)
    expect(antwort.body).toContain('Vorgang')
  })

  it('verweigert, was eine Regel angelegt hat – gelöscht käme es wieder', async () => {
    const regel = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/monitors`, {
      domainId: bereichId,
      name: 'Spülmaschine ausräumen',
      ruleKind: 'schedule',
      // Anker in der Vergangenheit: Die Regel ist bei der ersten Auswertung sofort fällig.
      config: { every: 'P1D', anchor: '2020-01-01T00:00:00.000Z' },
      defaultResponse: 'create_task',
    })
    const out = await h.json<{ tasksCreated: string[] }>(
      family.anna,
      'POST',
      `${base()}/monitors/${regel.id}/evaluate`,
    )
    const erzeugt = out.tasksCreated[0]
    expect(erzeugt, 'die Regel hat keine Aufgabe angelegt – der Test prüft nichts').toBeTruthy()

    const antwort = await h.request(family.anna, 'DELETE', `${base()}/tasks/${erzeugt!}`)
    expect(antwort.statusCode).toBe(409)
    expect(antwort.body, 'die Meldung nennt nicht die Regel als Ursache').toContain('Regel')
  })

  it('verwerfen bleibt möglich, wo löschen es nicht ist', async () => {
    const id = await neueAufgabe('Läuft schon')
    await h.json(family.anna, 'POST', `${base()}/tasks/${id}/start`, {})
    await h.json(family.anna, 'POST', `${base()}/tasks/${id}/drop`, { reason: 'hat sich anders erledigt' })

    // Verworfen heißt: aus den offenen Listen raus, nicht aus der Welt.
    expect(await titelImBereich()).not.toContain('Läuft schon')
  })
})
