import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Jemand verlässt den Haushalt (Audit 2, H4, Variante B).
 *
 * Die entscheidende Zusage ist nicht, dass das Entfernen funktioniert, sondern **was mit der
 * Verantwortung geschieht**: Sie fällt auf „niemand" zurück und wird sichtbar. Sie wandert
 * nicht stillschweigend zu der Person, die entfernt – das wäre eine Zuweisung ohne Frage –
 * und sie blockiert das Ausscheiden nicht.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
const base = () => `/api/v1/households/${family.householdId}`

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'leave')
}, 180_000)
afterAll(async () => h.stop())

describe('Verantwortung fällt auf „niemand", statt weitergereicht zu werden', () => {
  it('gibt den Bereich frei und meldet ihn als unbesetzt', async () => {
    const domain = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, {
      name: 'Bens Bereich',
      criticality: 'normal',
    })
    // Ben übernimmt.
    await h.json(family.ben, 'POST', `${base()}/domains/${domain.id}/claim`, {})

    const vorher = await h.json<{ items: { id: string; effectiveOwner: { membershipId: string } | null }[] }>(
      family.anna,
      'GET',
      `${base()}/domains`,
    )
    expect(vorher.items.find((d) => d.id === domain.id)?.effectiveOwner?.membershipId).toBe(family.benMembershipId)

    const result = await h.json<{ vacatedDomains: { id: string }[] }>(
      family.anna,
      'DELETE',
      `${base()}/members/${family.benMembershipId}`,
    )
    expect(result.vacatedDomains.map((d) => d.id)).toContain(domain.id)

    const nachher = await h.json<{ items: { id: string; effectiveOwner: unknown | null }[] }>(
      family.anna,
      'GET',
      `${base()}/domains`,
    )
    const jetzt = nachher.items.find((d) => d.id === domain.id)
    expect(jetzt?.effectiveOwner, 'die Verantwortung darf nicht an Anna gefallen sein').toBeNull()
  })

  it('lässt Aufgaben stehen, nimmt ihnen aber den Namen', async () => {
    // Eigener Haushalt: Im vorigen Fall hat Ben den geteilten schon verlassen.
    const f2 = await familyFixture(h, 'leave-task')
    const b2 = `/api/v1/households/${f2.householdId}`
    const domain = await h.json<{ id: string }>(f2.anna, 'POST', `${b2}/domains`, { name: 'Aufgabenbereich' })
    const task = await h.json<{ id: string }>(f2.anna, 'POST', `${b2}/tasks`, {
      domainId: domain.id,
      title: 'Etwas erledigen',
    })
    await h.json(f2.anna, 'POST', `${b2}/tasks/${task.id}/assign`, {
      membershipId: f2.benMembershipId,
    })

    // Ben geht selbst – jeder darf gehen, dafür braucht es kein member:manage.
    await h.json(f2.ben, 'DELETE', `${b2}/members/${f2.benMembershipId}`)

    // Gelesen über den Bereich – seit Audit 1 (K1) stehen die Aufgaben dort.
    const nachher = await h.json<{ tasks: { id: string; assignee: unknown | null; state: string }[] }>(
      f2.anna,
      'GET',
      `${b2}/domains/${domain.id}/detail`,
    )
    const jetzt = nachher.tasks.find((t) => t.id === task.id)
    expect(jetzt, 'die Aufgabe darf nicht verschwinden').toBeTruthy()
    expect(jetzt?.assignee, 'sie darf niemandem mehr zugewiesen sein').toBeFalsy()
  })
})

describe('Wer geht, darf den Haushalt nicht handlungsunfähig zurücklassen', () => {
  it('weist die letzte verwaltende Person ab – mit einem Weg nach vorn', async () => {
    const solo = await familyFixture(h, 'leave-admin')
    const antwort = await h.request(
      solo.anna,
      'DELETE',
      `/api/v1/households/${solo.householdId}/members/${solo.annaMembershipId}`,
    )
    expect(antwort.statusCode).toBe(409)
    const body = JSON.parse(antwort.body) as { detail: string }
    expect(body.detail).toMatch(/Verwaltung übernehmen/)
    expect(body.detail, 'kein Modellbegriff im Text').not.toMatch(/admin|role/i)
  })
})
