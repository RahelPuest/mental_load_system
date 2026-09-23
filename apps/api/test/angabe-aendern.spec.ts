import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Eine bestehende Angabe ändern (docs/77).
 *
 * Bis dahin ließ sich nur ihr **Wert** setzen. Ein Tippfehler im Namen war damit endgültig:
 * Die Angabe hieß für immer „Schugröße", und der einzige Ausweg wäre eine neue gewesen –
 * womit der Verlauf der alten an der falschen Beschriftung hängen bliebe.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let domainId: string
const base = () => `/api/v1/households/${family.householdId}`

const angabe = (label: string, dataType = 'text', freshnessInterval: string | null = null) =>
  h.json<{ id: string; key: string; label: string }>(family.anna, 'POST', `${base()}/domains/${domainId}/state-definitions`, {
    key: `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    label,
    dataType,
    freshnessInterval,
  })

const lies = async (id: string) => {
  const liste = await h.json<{ items: { id: string; label: string; key: string; dataType: string; freshnessInterval: string | null; isCritical: boolean }[] }>(
    family.anna,
    'GET',
    `${base()}/domains/${domainId}/state-definitions`,
  )
  return liste.items.find((d) => d.id === id)
}

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'angabe-aendern')
  domainId = (await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Kleidung' })).id
}, 180_000)
afterAll(async () => h.stop())

describe('Der Name lässt sich ändern', () => {
  it('ein Tippfehler ist nicht endgültig', async () => {
    const a = await angabe('Schugröße')
    const geaendert = await h.json<{ label: string }>(family.anna, 'PATCH', `${base()}/state-definitions/${a.id}`, {
      label: 'Schuhgröße',
    })
    expect(geaendert.label).toBe('Schuhgröße')
    expect((await lies(a.id))?.label).toBe('Schuhgröße')
  })

  it('der technische Schlüssel bleibt, wo er ist', async () => {
    const a = await angabe('Erst so')
    await h.json(family.anna, 'PATCH', `${base()}/state-definitions/${a.id}`, { label: 'Dann anders' })

    /*
      Regeln, Import und Export verweisen auf den Schlüssel. Ihn mit dem Namen mitzuziehen
      hieße, diese Verweise stillschweigend zu lösen.
    */
    expect((await lies(a.id))?.key).toBe(a.key)
  })

  it('auch Frist und Wichtigkeit lassen sich ändern', async () => {
    const a = await angabe('Alles dran', 'text', 'P1W')
    await h.json(family.anna, 'PATCH', `${base()}/state-definitions/${a.id}`, {
      freshnessInterval: 'P6W',
      isCritical: true,
    })
    const jetzt = await lies(a.id)
    expect(jetzt?.isCritical).toBe(true)
    expect(jetzt?.freshnessInterval, 'die Frist blieb bei einer Woche').toContain('P6W')
  })
})

describe('Die Art hängt am Wert', () => {
  it('lässt sich ändern, solange nur „unbekannt" dasteht', async () => {
    const a = await angabe('Noch nichts drin', 'text')
    const geaendert = await h.json<{ dataType: string }>(family.anna, 'PATCH', `${base()}/state-definitions/${a.id}`, {
      dataType: 'number',
    })
    /*
      Jede neue Angabe startet auf „unbekannt" (INV-010). Ihre Art gleich danach zu berichtigen
      ist der Normalfall – dort steht nichts, was seine Bedeutung verlieren könnte.
    */
    expect(geaendert.dataType).toBe('number')
  })

  it('nicht mehr, sobald ein Wert vorliegt – und sagt warum', async () => {
    const a = await angabe('Hat einen Wert', 'text')
    await h.json(family.anna, 'PUT', `${base()}/state-definitions/${a.id}/value`, {
      valueKind: 'known',
      value: 'blau',
      confirm: true,
    })

    const abgelehnt = await h.request(family.anna, 'PATCH', `${base()}/state-definitions/${a.id}`, {
      dataType: 'number',
    })
    expect(abgelehnt.statusCode).toBe(409)
    const fehler = abgelehnt.json<{ code: string; detail: string }>()
    expect(fehler.code).toBe('has_value')
    expect(fehler.detail, 'die Meldung nennt den Ausweg nicht').toMatch(/weiß ich nicht/)
  })

  it('der Name geht trotzdem, auch wenn ein Wert dasteht', async () => {
    const a = await angabe('Mit Wert', 'text')
    await h.json(family.anna, 'PUT', `${base()}/state-definitions/${a.id}/value`, {
      valueKind: 'known',
      value: 'grün',
      confirm: true,
    })
    await h.json(family.anna, 'PATCH', `${base()}/state-definitions/${a.id}`, { label: 'Anders benannt' })
    expect((await lies(a.id))?.label).toBe('Anders benannt')
  })
})

describe('Die Frist wirkt sofort, nicht erst beim nächsten Schreiben', () => {
  it('eine kürzere Frist macht eine bestätigte Angabe veraltet', async () => {
    const a = await angabe('Wird schnell alt', 'text', 'P1Y')
    await h.json(family.anna, 'PUT', `${base()}/state-definitions/${a.id}/value`, {
      valueKind: 'known',
      value: 'steht',
      confirm: true,
    })

    const vorher = await h.json<{ isStale: boolean }>(family.anna, 'GET', `${base()}/state-definitions/${a.id}/value`)
    expect(vorher.isStale, 'ein Jahr ist schon um').toBe(false)

    /*
      `stale_at` steckt im Wert und wurde aus der damaligen Frist gerechnet. Ohne Neurechnen
      altert die Angabe weiter nach der alten Regel – und die Oberfläche zeigt eine Frist,
      nach der niemand rechnet.
    */
    await h.json(family.anna, 'PATCH', `${base()}/state-definitions/${a.id}`, { freshnessInterval: 'P1D' })
    h.clock.advanceDays(3)
    const nachher = await h.json<{ isStale: boolean }>(family.anna, 'GET', `${base()}/state-definitions/${a.id}/value`)
    expect(nachher.isStale, 'die alte Frist gilt weiter').toBe(true)
    h.clock.advanceDays(-3)
  })
})

describe('Der Verlauf erzählt davon', () => {
  it('die Änderung steht im Verlauf der Angabe', async () => {
    const a = await angabe('Vorher')
    await h.json(family.anna, 'PATCH', `${base()}/state-definitions/${a.id}`, { label: 'Nachher' })

    const verlauf = await h.json<{ items: { eventType: string; before: { label?: string } | null }[] }>(
      family.anna,
      'GET',
      `${base()}/history?subjectId=${a.id}`,
    )
    const eintrag = verlauf.items.find((e) => e.eventType === 'state.definition_updated')
    expect(eintrag, 'die Änderung ist nirgends nachzulesen').toBeTruthy()
    expect(eintrag?.before?.label, 'der alte Name ist verloren').toBe('Vorher')
  })
})
