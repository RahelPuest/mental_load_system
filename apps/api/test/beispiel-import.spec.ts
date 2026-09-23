import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Die Beispieldatei muss sich einlesen lassen.
 *
 * Eine Vorlage, die beim ersten Versuch abgewiesen wird, ist schlimmer als keine: Wer sie
 * benutzt, sucht den Fehler bei sich. Dieser Test liest `ops/beispiele/mental-load.json`
 * genauso ein, wie es die Oberfläche täte, und prüft, dass Baum, Regeln und Angaben ankommen.
 */
const h = new Harness()
let ziel: Awaited<ReturnType<typeof familyFixture>>

beforeAll(async () => {
  await h.start()
  ziel = await familyFixture(h, 'beispiel')
}, 180_000)
afterAll(async () => h.stop())

describe('Beispieldatei „Mental Load"', () => {
  it('wird vollständig eingelesen', async () => {
    const doc = JSON.parse(readFileSync('ops/beispiele/mental-load.json', 'utf8')) as unknown
    const base = `/api/v1/households/${ziel.householdId}`

    const ergebnis = await h.json<{ angelegt: Record<string, number>; uebersprungen: string[] }>(
      ziel.anna,
      'POST',
      `${base}/import`,
      doc,
    )

    expect(ergebnis.angelegt).toMatchObject({
      Bereiche: 21,
      Angaben: 10,
      Regeln: 15,
      Aufgaben: 14,
      Notizen: 3,
    })
    expect(ergebnis.uebersprungen, 'nichts darf hängenbleiben').toEqual([])
  })

  it('behält den Baum – Unterbereiche hängen unter ihrem Elternteil', async () => {
    const base = `/api/v1/households/${ziel.householdId}`
    const { items } = await h.json<{ items: { name: string; path: string }[] }>(ziel.anna, 'GET', `${base}/domains`)

    const finde = (name: string) => items.find((d) => d.name === name)
    expect(finde('Kinder')?.path).toBe('kinder')
    expect(finde('Gesundheit')?.path).toBe('kinder.gesundheit')
    expect(finde('Essen vorbereiten')?.path).toBe('kinder.kita.essen')
    expect(finde('Yoga')?.path).toBe('kinder.thea.yoga')
    expect(finde('Me Time für Ines')?.path).toBe('familie.me_time')
  })

  /*
   * Der Test, der gefehlt hat.
   *
   * Der Import war „erfolgreich" – die Zahlen stimmten, der Baum stand, die Regeln waren da.
   * Trotzdem lief jede Bereichsseite mit Angaben in ein 404: Zu einer Angabe gehört ein Wert,
   * notfalls „unbekannt" (INV-010), und den legte der Import nicht an. Fünf von einundzwanzig
   * Bereichen waren betroffen – gerade so wenige, dass es nach Zufall aussah.
   *
   * Zählen genügt also nicht. Man muss die Seiten auch aufmachen.
   */
  it('jede eingelesene Bereichsseite lässt sich auch öffnen', async () => {
    const base = `/api/v1/households/${ziel.householdId}`
    const { items } = await h.json<{ items: { id: string; name: string }[] }>(ziel.anna, 'GET', `${base}/domains`)
    expect(items.length).toBe(21)

    const kaputt: string[] = []
    for (const d of items) {
      const r = await h.request(ziel.anna, 'GET', `${base}/domains/${d.id}/detail`)
      if (r.statusCode !== 200) kaputt.push(`${d.name} → ${r.statusCode}`)
    }
    expect(kaputt, kaputt.join(' · ')).toEqual([])
  })

  it('gibt jeder Angabe einen Wert – notfalls „unbekannt"', async () => {
    const base = `/api/v1/households/${ziel.householdId}`
    const { items } = await h.json<{ items: { id: string; name: string }[] }>(ziel.anna, 'GET', `${base}/domains`)
    const gesundheit = items.find((d) => d.name === 'Gesundheit')!

    const detail = await h.json<{ states: { definition: { label: string }; valueKind: string }[] }>(
      ziel.anna,
      'GET',
      `${base}/domains/${gesundheit.id}/detail`,
    )
    expect(detail.states.length).toBe(4)
    for (const s of detail.states) {
      expect(s.valueKind, `${s.definition.label} hat keinen Wert`).toBe('unknown')
    }
  })

  it('bringt Regeln mit, die der Auswerter versteht', async () => {
    const base = `/api/v1/households/${ziel.householdId}`
    const { items } = await h.json<{ items: { name: string; ruleKind: string; config: Record<string, unknown> }[] }>(
      ziel.anna,
      'GET',
      `${base}/monitors`,
    )

    const essen = items.find((m) => m.name === 'Kita-Essen vorbereiten')
    expect(essen?.ruleKind).toBe('schedule')
    expect(essen?.config['weekdays']).toEqual([1, 2, 3, 4, 5])

    // Eine Frischeregel muss an ihrer Angabe hängen, sonst hat sie nichts zu prüfen.
    const u = items.find((m) => m.name === 'U-Untersuchung nachprüfen')
    expect(u?.ruleKind).toBe('state_freshness')
  })
})
