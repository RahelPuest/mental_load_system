/**
 * Wer pflegt das System? (docs/60, Befund R2)
 *
 * Der schwerste Befund des Evidenz-Audits ist eine **Vermutung**: Wenn die Einrichtung von
 * Thealotta selbst kognitive Hausarbeit ist, verschiebt das Werkzeug die Last zu derselben Person,
 * die sie ohnehin trägt – statt sie zu reduzieren. Feldforschung an 44 Familien beschreibt
 * genau das für Familienkalender (monozentrische Nutzung, Neustaedter u. a. 2009).
 *
 * Dieses Skript beantwortet die Frage, **bevor** etwas gebaut wird. Es zeigt bewusst nichts
 * im Produkt an: Eine Kennzahl über Personen in der Oberfläche wäre ein Kontrollwerkzeug, und
 * INV-P02 verbietet Rankings zwischen Personen aus gutem Grund.
 *
 *   DATABASE_URL=… pnpm tsx ops/scripts/pflegekonzentration.ts [haushalt-uuid]
 *
 * Gelesen wird nur. Gemessen wird, **wer Struktur anlegt** – nicht, wer Aufgaben erledigt.
 * Das ist der Unterschied zwischen Verantwortung tragen und ausführen (INV-009), und genau
 * er ist hier der Punkt.
 */
import { argv, env, exit } from 'node:process'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import {
  createDb,
  householdMemberships,
  households,
  inboxItems,
  knowledgeItems,
  dishes,
  dishIngredients,
  dishPreferences,
  mealPlanEntries,
  monitors,
  playbooks,
  processes,
  tasks,
  temporaryCoverages,
  withoutTenant,
} from '@thealotta/db'

const url = env['DATABASE_URL']
if (!url) {
  console.error('DATABASE_URL fehlt.')
  exit(1)
}

const handle = createDb(url, { max: 2, onnotice: false })

/**
 * Was zählt als Pflege des Systems?
 *
 * Regeln, Abläufe und Vertretungen sind **Struktur**: Sie einzurichten ist die Arbeit, um die
 * es geht. Aufgaben, Notizen und Vorgänge sind **Inhalt** – sie entstehen im Alltag und sagen
 * weniger darüber aus, wer das System trägt. Beide Gruppen werden getrennt ausgewiesen, damit
 * der Unterschied sichtbar bleibt.
 */
const STRUKTUR = [
  { tabelle: monitors, wort: 'Regeln' },
  { tabelle: playbooks, wort: 'Abläufe' },
  { tabelle: temporaryCoverages, wort: 'Vertretungen' },
  /*
    Die Gerichtesammlung kam nach dem ersten Audit dazu (docs/63) und ist seither die
    **pflegeintensivste Struktur des Produkts** (docs/68, Befund E2): Zeiten, Schritte,
    Zutaten mit Menge und Einheit, Eignung, Bewertung je Person. Der Nutzen – Einkaufsliste,
    Mengenskalierung, gewichtete Vorschläge – wächst proportional zu dieser Pflege.

    Sie gehört deshalb zur Struktur und nicht zum Inhalt: Wer sie anlegt, richtet das System
    ein. Wer eine Woche plant, benutzt es.
  */
  { tabelle: dishes, wort: 'Gerichte' },
]
const INHALT = [
  { tabelle: tasks, wort: 'Aufgaben' },
  { tabelle: knowledgeItems, wort: 'Notizen' },
  { tabelle: processes, wort: 'Vorgänge' },
  { tabelle: inboxItems, wort: 'Eingang' },
  { tabelle: mealPlanEntries, wort: 'Essensplätze' },
]

type Tabelle = { createdBy: never; householdId: never }

async function zaehle(
  haushaltId: string,
  gruppe: { tabelle: unknown; wort: string }[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  for (const { tabelle } of gruppe) {
    const t = tabelle as Tabelle
    const zeilen = (await withoutTenant(handle.db, 'pflegekonzentration', async (tx) =>
      tx
        .select({ wer: t.createdBy, n: sql<number>`count(*)::int` })
        .from(tabelle as never)
        .where(and(eq(t.householdId, haushaltId as never), isNotNull(t.createdBy)))
        .groupBy(t.createdBy),
    )) as unknown as { wer: string; n: number }[]
    for (const z of zeilen) out.set(String(z.wer), (out.get(String(z.wer)) ?? 0) + Number(z.n))
  }
  return out
}

/**
 * Die Essensplanung im Einzelnen (docs/68, Messung 1 und 2).
 *
 * Drei Zahlen, die der Gesamtanteil oben nicht zeigt:
 *
 * 1. **Zutatentiefe** – wie viele Zutatenzeilen an den Gerichten einer Person hängen. Ein
 *    Gericht anzulegen kostet einen Namen; es *nutzbar* zu machen kostet die Zutaten. Erst
 *    diese Zahl sagt, wie viel Arbeit tatsächlich in der Sammlung steckt.
 * 2. **Bewertungen je Person** – die Vorschläge gewichten nach Meinung (lieben +2 … lieber
 *    nicht −3). Bewertet nur eine Person, bildet der Vorschlag einen Gaumen ab und behauptet
 *    einen Haushalt.
 * 3. **Festhalten** – Anteil der Plätze mit `locked`. Die Frage aus B3: Wird das Merkmal
 *    überhaupt benutzt? Wenn nicht, gehört es auf den Prüfstand und nicht seine Anzeige.
 *
 * Wie oben: nur lesen, nichts anzeigen, keine Zahl über Personen ins Produkt.
 */
async function essensplanung(haushaltId: string, nameVon: Map<string, string>): Promise<void> {
  const zutaten = (await withoutTenant(handle.db, 'pflegekonzentration', async (tx) =>
    tx
      .select({ wer: dishes.createdBy, n: sql<number>`count(*)::int` })
      .from(dishIngredients)
      .innerJoin(dishes, eq(dishes.id, dishIngredients.dishId))
      .where(and(eq(dishIngredients.householdId, haushaltId), isNotNull(dishes.createdBy)))
      .groupBy(dishes.createdBy),
  )) as { wer: string | null; n: number }[]

  const bewertungen = await withoutTenant(handle.db, 'pflegekonzentration', async (tx) =>
    tx
      .select({ wer: dishPreferences.membershipId, n: sql<number>`count(*)::int` })
      .from(dishPreferences)
      .where(eq(dishPreferences.householdId, haushaltId))
      .groupBy(dishPreferences.membershipId),
  )

  const plaetze = await withoutTenant(handle.db, 'pflegekonzentration', async (tx) =>
    tx
      .select({
        gesamt: sql<number>`count(*)::int`,
        fest: sql<number>`count(*) filter (where ${mealPlanEntries.locked})::int`,
      })
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.householdId, haushaltId)),
  )

  const summe = (rows: { n: number }[]) => rows.reduce((a, b) => a + Number(b.n), 0)
  const zeile = (titel: string, rows: { wer: string | null; n: number }[]): void => {
    const gesamt = summe(rows)
    if (gesamt === 0) {
      console.log(`  ${titel}: nichts vorhanden`)
      return
    }
    const sortiert = [...rows].sort((a, b) => Number(b.n) - Number(a.n))
    console.log(
      `  ${titel}: ` +
        sortiert
          .map((x) => `${nameVon.get(String(x.wer)) ?? 'unbekannt'} ${x.n} (${Math.round((Number(x.n) / gesamt) * 100)} %)`)
          .join(' · '),
    )
    const spitze = Math.round((Number(sortiert[0]!.n) / gesamt) * 100)
    if (spitze >= 80) console.log(`    → ${spitze} % von einer Person`)
  }

  zeile('Zutaten   ', zutaten)
  zeile('Meinungen ', bewertungen.map((b) => ({ wer: b.wer, n: b.n })))

  const p = plaetze[0]
  if (p && Number(p.gesamt) > 0) {
    const anteilFest = Math.round((Number(p.fest) / Number(p.gesamt)) * 100)
    console.log(
      `  Festhalten: ${p.fest} von ${p.gesamt} Plätzen (${anteilFest} %)` +
        (Number(p.fest) === 0
          ? ' – wird nicht benutzt; vor einer Anzeige wäre das Merkmal selbst zu prüfen (docs/68 B3)'
          : ''),
    )
  } else {
    console.log('  Festhalten: keine geplanten Plätze')
  }
}

const gewaehlt = argv[2]
const alle = await withoutTenant(handle.db, 'pflegekonzentration', async (tx) =>
  tx.select({ id: households.id, name: households.name }).from(households),
)
const zuPruefen = gewaehlt ? alle.filter((h) => h.id === gewaehlt) : alle

for (const h of zuPruefen) {
  const mitglieder = await withoutTenant(handle.db, 'pflegekonzentration', async (tx) =>
    tx
      .select({ id: householdMemberships.id, name: householdMemberships.displayName })
      .from(householdMemberships)
      .where(and(eq(householdMemberships.householdId, h.id), eq(householdMemberships.status, 'active'))),
  )
  const nameVon = new Map(mitglieder.map((m) => [m.id, m.name]))

  console.log(`\n══ ${h.name}  (${mitglieder.length} Mitglieder)`)

  const zeige = (titel: string, werte: Map<string, number>): number | null => {
    const gesamt = [...werte.values()].reduce((a, b) => a + b, 0)
    if (gesamt === 0) {
      console.log(`  ${titel}: nichts angelegt`)
      return null
    }
    const sortiert = [...werte].sort((a, b) => b[1] - a[1])
    console.log(
      `  ${titel}: ` +
        sortiert
          .map(([wer, n]) => `${nameVon.get(wer) ?? 'unbekannt'} ${n} (${Math.round((n / gesamt) * 100)} %)`)
          .join(' · '),
    )
    return Math.round((sortiert[0]![1] / gesamt) * 100)
  }

  const struktur = await zaehle(h.id, STRUKTUR)
  const inhalt = await zaehle(h.id, INHALT)
  const anteil = zeige('Struktur', struktur)
  zeige('Inhalt  ', inhalt)

  await essensplanung(h.id, nameVon)

  /*
   * Die eine Zahl, auf die es ankommt. Ein hoher Wert heißt **nicht**, dass jemand etwas
   * falsch macht – er heißt, dass das Werkzeug die Arbeit möglicherweise bündelt statt sie
   * zu verteilen. Genau das wäre der Befund, der eine Produktänderung rechtfertigt.
   *
   * Die Bezeichnungen folgen der Typologie aus der Kalenderforschung (Neustaedter u. a.),
   * damit die Zahl an etwas anschließt und nicht für sich allein steht.
   */
  if (anteil !== null) {
    const urteil =
      anteil >= 80
        ? 'monozentrisch – eine Person trägt das System'
        : anteil >= 60
          ? 'perizentrisch – eine Person überwiegt deutlich'
          : 'polyzentrisch – die Pflege verteilt sich'
    console.log(`  → Struktur zu ${anteil} % von einer Person: ${urteil}`)
  }
}

await handle.close()
