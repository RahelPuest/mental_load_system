import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { COLOR_TONES } from '@thealotta/contracts'
import { Harness, familyFixture } from './helpers.js'

/**
 * Farben für Personen und Bereiche.
 *
 * Die entscheidende Eigenschaft ist nicht, dass Speichern funktioniert, sondern dass eine
 * Farbe **nur für den Betrachter** gilt. Auf dieser Zusage beruht, dass jede Person die Farbe
 * jeder anderen einstellen darf, ohne dass jemand gefragt werden müsste. Wäre sie falsch,
 * würde Ben stillschweigend Annas Ansicht verändern.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let domainId: string
const base = () => `/api/v1/households/${family.householdId}`

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'colors')
  domainId = (await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Farbtest' })).id
}, 180_000)
afterAll(async () => h.stop())

describe('Farben gelten für den Betrachter', () => {
  it('ohne Wahl ist die Liste leer – die Voreinstellung wird nicht gespeichert', async () => {
    const map = await h.json<{ members: Record<string, string>; domains: Record<string, string> }>(
      family.ben,
      'GET',
      `${base()}/colors`,
    )
    expect(map.members, 'eine ungewählte Farbe darf keine Zeile erzeugen').toEqual({})
    expect(map.domains).toEqual({})
  })

  it('was Anna wählt, sieht Ben nicht', async () => {
    await h.json(family.anna, 'PUT', `${base()}/colors/member/${family.benMembershipId}`, { tone: 'indigo' })

    const annaSees = await h.json<{ members: Record<string, string> }>(family.anna, 'GET', `${base()}/colors`)
    expect(annaSees.members[family.benMembershipId]).toBe('indigo')

    const benSees = await h.json<{ members: Record<string, string> }>(family.ben, 'GET', `${base()}/colors`)
    expect(benSees.members, 'Annas Wahl ist in Bens Ansicht gelandet').toEqual({})
  })

  it('Ben darf für sich selbst eine andere Farbe für dieselbe Person wählen', async () => {
    await h.json(family.ben, 'PUT', `${base()}/colors/member/${family.benMembershipId}`, { tone: 'rost' })

    const annaSees = await h.json<{ members: Record<string, string> }>(family.anna, 'GET', `${base()}/colors`)
    const benSees = await h.json<{ members: Record<string, string> }>(family.ben, 'GET', `${base()}/colors`)
    expect(annaSees.members[family.benMembershipId], 'Bens Wahl hat Annas überschrieben').toBe('indigo')
    expect(benSees.members[family.benMembershipId]).toBe('rost')
  })

  it('eine zweite Wahl ersetzt die erste, statt eine zweite Zeile anzulegen', async () => {
    await h.json(family.anna, 'PUT', `${base()}/colors/domain/${domainId}`, { tone: 'oliv' })
    await h.json(family.anna, 'PUT', `${base()}/colors/domain/${domainId}`, { tone: 'pflaume' })

    const map = await h.json<{ domains: Record<string, string> }>(family.anna, 'GET', `${base()}/colors`)
    expect(map.domains[domainId]).toBe('pflaume')
  })

  it('null setzt zurück – und hinterlässt keinen Sonderwert', async () => {
    await h.json(family.anna, 'PUT', `${base()}/colors/domain/${domainId}`, { tone: null })

    const map = await h.json<{ domains: Record<string, string> }>(family.anna, 'GET', `${base()}/colors`)
    expect(Object.hasOwn(map.domains, domainId), 'zurückgesetzt heißt: keine Zeile').toBe(false)
  })
})

describe('Was nicht geht, geht nicht still schief', () => {
  it('ein Ton außerhalb des Vokabulars wird abgewiesen', async () => {
    const res = await h.request(family.anna, 'PUT', `${base()}/colors/member/${family.annaMembershipId}`, {
      tone: 'neongelb',
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })

  it('eine fremde Ziel-ID wird abgewiesen, statt eine wirkungslose Zeile anzulegen', async () => {
    const res = await h.request(family.anna, 'PUT', `${base()}/colors/member/${domainId}`, { tone: 'blau' })
    expect(res.statusCode, 'ein Bereich ist kein Mitglied').toBe(404)
  })

  it('jeder Ton des Vokabulars wird angenommen – die Datenbank kennt dieselbe Liste', async () => {
    for (const tone of COLOR_TONES) {
      const res = await h.request(family.anna, 'PUT', `${base()}/colors/member/${family.annaMembershipId}`, { tone })
      expect(res.statusCode, `„${tone}" wurde abgelehnt – CHECK-Constraint und Vokabular laufen auseinander`).toBe(200)
    }
  })
})
