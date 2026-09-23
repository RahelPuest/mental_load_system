import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Daten mitnehmen und zurückbringen.
 *
 * Die entscheidende Zusage ist nicht, dass eine Datei entsteht, sondern **was in ihr steht
 * und was nicht**: Struktur, Wissen, Regeln und laufende Arbeit gehen mit – Zugänge,
 * Passwörter und Zuständigkeiten nicht. Eine Sicherungsdatei ist kein Konto, und wer welchen
 * Bereich trägt, entscheidet der Haushalt, nicht die Datei.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
const base = () => `/api/v1/households/${family.householdId}`

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'transfer')

  const eltern = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, {
    name: 'Kinder',
    criticality: 'high',
  })
  const kind = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, {
    name: 'Schuhe',
    parentId: eltern.id,
  })
  await h.json(family.anna, 'POST', `${base()}/domains/${kind.id}/claim`, {})
  await h.json(family.anna, 'POST', `${base()}/knowledge`, {
    domainId: kind.id,
    title: 'Marke X passt gut',
    body: 'Seit zwei Paaren',
    kind: 'fact',
  })
  await h.json(family.anna, 'POST', `${base()}/questions`, { domainId: kind.id, body: 'Passen die noch?' })
  await h.json(family.anna, 'POST', `${base()}/tasks`, { domainId: kind.id, title: 'Füße messen' })
}, 180_000)
afterAll(async () => h.stop())

describe('Export', () => {
  it('enthält Struktur, Wissen und Arbeit', async () => {
    const doc = await h.json<Record<string, unknown[]>>(family.anna, 'GET', `${base()}/export`)
    expect(doc['format']).toBe('thealotta.household')
    expect(doc['version']).toBe(1)
    expect((doc['bereiche'] as unknown[]).length).toBeGreaterThanOrEqual(2)
    expect((doc['wissen'] as { title: string }[]).map((k) => k.title)).toContain('Marke X passt gut')
    expect((doc['fragen'] as { body: string }[]).map((f) => f.body)).toContain('Passen die noch?')
    expect((doc['aufgaben'] as { title: string }[]).map((t) => t.title)).toContain('Füße messen')
  })

  it('enthält keine Zugangsdaten', async () => {
    const roh = JSON.stringify(await h.json(family.anna, 'GET', `${base()}/export`))
    for (const verboten of ['passwordHash', 'userId', 'token', 'secret', '@example.invalid']) {
      expect(roh, `„${verboten}" darf nicht in der Datei stehen`).not.toContain(verboten)
    }
  })

  it('bietet die Datei zum Speichern an', async () => {
    const antwort = await h.request(family.anna, 'GET', `${base()}/export`)
    expect(antwort.headers['content-disposition']).toMatch(/attachment; filename="thealotta-.*\.json"/)
  })

  it('ist lesbar formatiert und trägt keine leeren Felder', async () => {
    const roh = (await h.request(family.anna, 'GET', `${base()}/export`)).body

    /*
     * Eine Datei, die man mitnehmen kann, sollte man auch aufmachen können. Fastify schreibt
     * ohne Zutun eine einzige Zeile – bei einem gefüllten Haushalt über 20 000 Zeichen.
     */
    expect(roh.split('\n').length, 'die Datei steht in einer einzigen Zeile').toBeGreaterThan(20)
    expect(roh.startsWith('{\n  "format"'), 'zwei Leerzeichen Einrückung').toBe(true)

    // Leere Felder sagen nichts und machen die Datei nur länger.
    expect(roh, 'leere Felder gehören nicht in die Datei').not.toContain(': null')

    // Drei Felder, die im Audit aus dem Produkt fielen – die Spalten stehen noch, die
    // Bedeutung nicht mehr.
    for (const tot of ['physicalEnergy', 'focusRequired', 'socialLoad']) {
      expect(roh, `„${tot}" wurde entfernt und darf nicht wieder mitkommen`).not.toContain(tot)
    }
  })
})

describe('Import', () => {
  it('legt die Struktur im Zielhaushalt neu an, mit neuen Kennungen', async () => {
    const doc = await h.json<Record<string, { id: string; name?: string; parentId?: string }[]>>(
      family.anna,
      'GET',
      `${base()}/export`,
    )
    const ziel = await familyFixture(h, 'transfer-ziel')
    const zielBase = `/api/v1/households/${ziel.householdId}`

    const ergebnis = await h.json<{ angelegt: Record<string, number>; uebersprungen: string[] }>(
      ziel.anna,
      'POST',
      `${zielBase}/import`,
      doc,
    )
    expect(ergebnis.angelegt['Bereiche']).toBeGreaterThanOrEqual(2)
    expect(ergebnis.angelegt['Notizen']).toBe(1)

    const bereiche = await h.json<{ items: { id: string; name: string; path: string }[] }>(
      ziel.anna,
      'GET',
      `${zielBase}/domains`,
    )
    const schuhe = bereiche.items.find((b) => b.name === 'Schuhe')
    expect(schuhe, 'der Bereich muss angekommen sein').toBeTruthy()
    expect(
      (doc['bereiche'] ?? []).some((b) => b.id === schuhe?.id),
      'die Kennungen müssen neu vergeben sein',
    ).toBe(false)

    // Der Baum bleibt ein Baum: „Schuhe" hängt unter „Kinder".
    const kinder = bereiche.items.find((b) => b.name === 'Kinder')
    expect(schuhe!.path.startsWith(`${kinder!.path}.`), `Pfad: ${schuhe!.path}`).toBe(true)
  })

  it('bringt keine Zuständigkeiten mit und sagt das', async () => {
    const doc = await h.json(family.anna, 'GET', `${base()}/export`)
    const ziel = await familyFixture(h, 'transfer-ziel2')
    const ergebnis = await h.json<{ uebersprungen: string[] }>(
      ziel.anna,
      'POST',
      `/api/v1/households/${ziel.householdId}/import`,
      doc,
    )
    expect(ergebnis.uebersprungen.join(' ')).toMatch(/Zuständigkeiten/)

    const bereiche = await h.json<{ items: { name: string; effectiveOwner: unknown | null }[] }>(
      ziel.anna,
      'GET',
      `/api/v1/households/${ziel.householdId}/domains`,
    )
    expect(bereiche.items.find((b) => b.name === 'Schuhe')?.effectiveOwner).toBeNull()
  })

  it('lässt sich zweimal einlesen, ohne am Pfad zu scheitern', async () => {
    /*
     * Ein zweiter Import ist nichts Ungewöhnliches: Man probiert eine Datei aus, räumt das
     * Ergebnis nicht vollständig weg und liest sie noch einmal ein. Vorher scheiterte das an
     * der Eindeutigkeit des Pfades – mit einem 500er, der nichts darüber sagte, woran es lag.
     */
    const doc = await h.json(family.anna, 'GET', `${base()}/export`)
    const ziel = await familyFixture(h, 'transfer-zweimal')
    const url = `/api/v1/households/${ziel.householdId}/import`

    const eins = await h.json<{ angelegt: Record<string, number> }>(ziel.anna, 'POST', url, doc)
    const zwei = await h.json<{ angelegt: Record<string, number> }>(ziel.anna, 'POST', url, doc)
    expect(zwei.angelegt['Bereiche']).toBe(eins.angelegt['Bereiche'])

    // Und der Baum ist danach zweimal da, nicht halb.
    const { items } = await h.json<{ items: { name: string; path: string }[] }>(
      ziel.anna,
      'GET',
      `/api/v1/households/${ziel.householdId}/domains`,
    )
    const schuhe = items.filter((d) => d.name === 'Schuhe')
    expect(schuhe).toHaveLength(2)
    expect(new Set(schuhe.map((d) => d.path)).size, 'zwei Bereiche, zwei Pfade').toBe(2)
  })

  it('hinterlässt einen Haushalt, in dem sich jede Ansicht öffnen lässt', async () => {
    /*
     * Ein Import kann zählen wie er will – wenn die Anwendung danach in ein 404 läuft, war er
     * nicht erfolgreich. Genau das ist passiert: Angaben kamen ohne ihren Wert an, und jede
     * Bereichsseite mit Angaben brach ab (INV-010). Zahlen prüfen genügt nicht; die Ansichten
     * müssen sich auch öffnen lassen.
     */
    const doc = await h.json(family.anna, 'GET', `${base()}/export`)
    const ziel = await familyFixture(h, 'transfer-ansichten')
    const b = `/api/v1/households/${ziel.householdId}`
    await h.json(ziel.anna, 'POST', `${b}/import`, doc)

    const kaputt: string[] = []
    const pruefe = async (pfad: string) => {
      const r = await h.request(ziel.anna, 'GET', `${b}${pfad}`)
      if (r.statusCode !== 200) kaputt.push(`${pfad} → ${r.statusCode}`)
    }

    for (const pfad of ['/now', '/domains', '/overview', '/monitors', '/knowledge', '/questions', '/decisions']) {
      await pruefe(pfad)
    }

    const { items } = await h.json<{ items: { id: string }[] }>(ziel.anna, 'GET', `${b}/domains`)
    for (const d of items) await pruefe(`/domains/${d.id}/detail`)

    const vorgaenge = await h.json<{ items: { id: string }[] }>(ziel.anna, 'GET', `${b}/processes`)
    for (const v of vorgaenge.items) await pruefe(`/processes/${v.id}`)

    expect(kaputt, kaputt.join(' · ')).toEqual([])
  })

  it('weist fremde Dateien ab, statt sie halb einzulesen', async () => {
    const ziel = await familyFixture(h, 'transfer-fremd')
    const url = `/api/v1/households/${ziel.householdId}/import`

    const fremd = await h.request(ziel.anna, 'POST', url, { format: 'etwas-anderes', version: 1 })
    expect(fremd.statusCode).toBe(422)
    expect(JSON.parse(fremd.body).detail).toMatch(/keine Thealotta-Sicherungsdatei/)

    const alt = await h.request(ziel.anna, 'POST', url, { format: 'thealotta.household', version: 99 })
    expect(alt.statusCode).toBe(422)
    expect(JSON.parse(alt.body).detail).toMatch(/Fassung/)
  })

  /*
    Eine Sicherung, die nach einer Umbenennung nicht mehr zurückzuspielen ist, ist keine
    Sicherung (docs/64 §24). Geschrieben wird die neue Kennung, gelesen werden beide.
  */
  it('liest auch eine Datei mit der Kennung von vor der Umbenennung', async () => {
    const quelle = await familyFixture(h, 'transfer-alt-quelle')
    const doc = await h.json<Record<string, unknown>>(quelle.anna, 'GET', `/api/v1/households/${quelle.householdId}/export`)

    const ziel = await familyFixture(h, 'transfer-alt-ziel')
    const antwort = await h.request(ziel.anna, 'POST', `/api/v1/households/${ziel.householdId}/import`, {
      ...doc,
      format: 'mira.household',
    })
    expect(antwort.statusCode, antwort.body).toBe(200)
  })
})
