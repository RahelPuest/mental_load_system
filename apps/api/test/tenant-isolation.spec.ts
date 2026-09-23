import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * INV-005 – der wichtigste Sicherheitstest des Systems.
 *
 * Er läuft nicht gegen eine handgepflegte Routenliste, sondern gegen die tatsächlich
 * registrierten Routen. Eine neue Route ohne Isolation lässt die CI fehlschlagen,
 * ohne dass jemand daran denken muss.
 */
const h = new Harness()

let familyA: Awaited<ReturnType<typeof familyFixture>>
let familyB: Awaited<ReturnType<typeof familyFixture>>

beforeAll(async () => {
  await h.start()
  familyA = await familyFixture(h, 'tenant-a')
  familyB = await familyFixture(h, 'tenant-b')
}, 180_000)
afterAll(async () => h.stop())

const PLACEHOLDER = '00000000-0000-4000-8000-000000000000'

/** Füllt jeden Pfadparameter außer :householdId mit einer beliebigen, gültigen UUID. */
function fillParams(url: string, householdId: string): string {
  return url
    .replace(':householdId', householdId)
    .replace(/:([a-zA-Z]+)/g, PLACEHOLDER)
}

/** Ein Minimal-Body je Methode – der Tenant-Gate greift vor jeder Validierung. */
const bodyFor = (method: string): unknown => (method === 'GET' || method === 'DELETE' ? undefined : {})

describe('INV-005 – strikte Trennung zwischen Haushalten', () => {
  const paths = (householdId: string): { method: string; url: string; body?: unknown }[] => [
    { method: 'GET', url: `/api/v1/households/${householdId}/domains` },
    { method: 'GET', url: `/api/v1/households/${householdId}/persons` },
    { method: 'GET', url: `/api/v1/households/${householdId}/members` },
    { method: 'GET', url: `/api/v1/households/${householdId}/attention` },
    { method: 'GET', url: `/api/v1/households/${householdId}/monitors` },
    { method: 'GET', url: `/api/v1/households/${householdId}/now` },
    { method: 'GET', url: `/api/v1/households/${householdId}/inbox` },
    { method: 'GET', url: `/api/v1/households/${householdId}/knowledge` },
    { method: 'GET', url: `/api/v1/households/${householdId}/questions` },
    { method: 'GET', url: `/api/v1/households/${householdId}/decisions` },
    { method: 'GET', url: `/api/v1/households/${householdId}/coverages` },
    { method: 'GET', url: `/api/v1/households/${householdId}/overview` },
    { method: 'GET', url: `/api/v1/households/${householdId}/unowned` },
    { method: 'GET', url: `/api/v1/households/${householdId}/capacity/me` },
    { method: 'GET', url: `/api/v1/households/${householdId}/audit` },
    { method: 'POST', url: `/api/v1/households/${householdId}/capture`, body: { text: 'Test' } },
    {
      method: 'POST',
      url: `/api/v1/households/${householdId}/domains`,
      body: { name: 'Eindringling' },
    },
    {
      method: 'POST',
      url: `/api/v1/households/${householdId}/persons`,
      body: { displayName: 'X', personKind: 'child' },
    },
    {
      method: 'POST',
      url: `/api/v1/households/${householdId}/tasks`,
      body: { title: 'Eindringling' },
    },
    {
      method: 'POST',
      url: `/api/v1/households/${householdId}/questions`,
      body: { body: 'Wie geht das?' },
    },
  ]

  it('jeder Zugriff auf einen fremden Haushalt liefert 404 – nie 403', async () => {
    const failures: string[] = []
    for (const route of paths(familyB.householdId)) {
      const response = await h.request(familyA.anna, route.method, route.url, route.body)
      if (response.statusCode !== 404) {
        failures.push(`${route.method} ${route.url} → ${response.statusCode}`)
      }
    }
    // 403 würde die Existenz des fremden Objekts bestätigen; 404 verrät nichts.
    expect(failures).toEqual([])
  })

  it('JEDE registrierte Haushaltsroute ist abgedeckt – nicht nur eine gepflegte Liste', async () => {
    const householdScoped = h.routes.filter((r) => r.url.includes(':householdId'))
    expect(householdScoped.length).toBeGreaterThan(20)

    const failures: string[] = []
    for (const route of householdScoped) {
      const url = fillParams(route.url, familyB.householdId)
      const response = await h.request(familyA.anna, route.method, url, bodyFor(route.method))
      if (response.statusCode !== 404) failures.push(`${route.method} ${url} → ${response.statusCode}`)
    }
    expect(failures).toEqual([])
  })

  it('der eigene Haushalt bleibt für dieselben Routen erreichbar', async () => {
    const failures: string[] = []
    for (const route of paths(familyA.householdId)) {
      const response = await h.request(familyA.anna, route.method, route.url, route.body)
      if (response.statusCode === 404) failures.push(`${route.method} ${route.url}`)
    }
    expect(failures).toEqual([])
  })

  it('Objekt-IDs aus einem fremden Haushalt sind auch mit gültigem eigenen Pfad unsichtbar', async () => {
    const created = await h.json<{ id: string }>(familyB.anna, 'POST', `/api/v1/households/${familyB.householdId}/domains`, {
      name: 'Privates',
    })
    const foreignDomainId = created.id

    const response = await h.request(
      familyA.anna,
      'GET',
      `/api/v1/households/${familyA.householdId}/domains/${foreignDomainId}/state-definitions`,
    )
    expect(response.statusCode).toBe(404)
  })

  it('ohne Anmeldung ist gar nichts erreichbar', async () => {
    for (const route of paths(familyA.householdId)) {
      const response = await h.request(null, route.method, route.url, route.body)
      expect([401, 403], `${route.method} ${route.url}`).toContain(response.statusCode)
    }
  })

  it('mutierende Anfragen ohne CSRF-Token werden abgewiesen', async () => {
    const response = await h.app.inject({
      method: 'POST',
      url: `/api/v1/households/${familyA.householdId}/capture`,
      payload: { text: 'ohne CSRF' },
      headers: { cookie: familyA.anna.cookies, 'content-type': 'application/json' },
    })
    expect(response.statusCode).toBe(403)
  })
})
