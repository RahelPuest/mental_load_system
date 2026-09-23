/**
 * Integritätsprüfung nach einem Restore (docs/29 §4).
 *
 * Ein Backup zählt erst als Backup, wenn der Restore getestet wurde – und ein Restore zählt
 * erst als gelungen, wenn die zurückgespielte Datenbank in sich stimmig ist. „pg_restore hat
 * keinen Fehler gemeldet" heißt nur, dass die Datei lesbar war.
 *
 *   DATABASE_URL=postgres://… npx tsx ops/scripts/verify-restore.ts
 *
 * Beendet sich mit 0, wenn alle Prüfungen bestehen, sonst mit 1. Die Ausgabe nennt jede
 * Prüfung beim Namen, auch die bestandenen: Wer einen Restore verantwortet, will sehen,
 * was geprüft wurde, nicht nur dass nichts schieflief.
 */
import { createDb } from '@thealotta/db'

interface Befund {
  name: string
  bestanden: boolean
  detail: string
}

const befunde: Befund[] = []
const pruefe = (name: string, bestanden: boolean, detail: string): void => {
  befunde.push({ name, bestanden, detail })
}

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL']
  if (!url) {
    console.error('DATABASE_URL fehlt.')
    return 1
  }
  const handle = createDb(url, { max: 1, onnotice: false })
  const sql = handle.sql

  try {
    /* ── 1 · Zeilenzahlen ───────────────────────────────────────────── */
    const tabellen = await sql<{ name: string; n: number }[]>`
      SELECT c.relname AS name, c.reltuples::bigint AS n
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `
    const [zaehlung] = await sql<{ count: number }[]>`SELECT count(*)::int FROM households`
    const [nutzerZeile] = await sql<{ count: number }[]>`SELECT count(*)::int FROM users`
    const haushalte = zaehlung!.count
    const nutzer = nutzerZeile!.count
    /*
      Kein „Erwartungsband" aus einer Konfigurationsdatei: Das wäre eine Zahl, die niemand
      pflegt, und ein Alarm, den bald jeder ignoriert. Die harte Aussage ist: Eine
      zurückgespielte Datenbank ohne Haushalt und ohne Nutzer ist kein Restore, sondern ein
      leeres Schema. Alles Feinere gehört in den Vergleich mit der laufenden Instanz, den
      der Sicherungsdienst macht.
    */
    pruefe(
      'Bestand vorhanden',
      haushalte > 0 && nutzer > 0,
      `${tabellen.length} Tabellen, ${haushalte} Haushalte, ${nutzer} Nutzer`,
    )

    /* ── 2 · Audit-Strom ────────────────────────────────────────────── */
    /*
      Geprüft wird die **Vollständigkeit** des Stroms, nicht seine Unverfälschtheit.

      Das ist keine Bequemlichkeit, sondern ein Befund: Die Hashkette aus Migration 0003
      lässt sich derzeit nicht zuverlässig nachrechnen. Zwei Gründe, beide gemessen an
      349 Zeilen des Entwicklungsbestands (docs/84):

        1. Der Hash enthält `occurred_at::text`. Wie ein `timestamptz` als Text erscheint,
           hängt von der Zeitzone der **Sitzung** ab. Unter UTC wichen 28 Zeilen ab, unter
           Europe/Berlin alle 349 – wer prüft, müsste die Zeitzone des Schreibers raten.
        2. Der Trigger liest den Vorgänger mit `ORDER BY seq DESC LIMIT 1` ohne Sperre.
           Bei gleichzeitigen Einfügungen greifen zwei Zeilen denselben Vorgänger: 14
           Vorgänger hatten mehr als einen Nachfolger. Die Kette ist dann keine Kette,
           sondern ein Baum.

      Was ein Restore-Test trotzdem beantworten kann und muss: Ist der Strom vollständig
      zurückgekommen? Eine abgeschnittene oder halb eingespielte Historie fällt hier auf.
    */
    const [strom] = await sql<{ gesamt: number; luecken: number; verwaiste: number; doppelte: number }[]>`
      WITH s AS (SELECT seq, prev_hash, row_hash, lag(seq) OVER (ORDER BY seq) AS vorher FROM audit_events)
      SELECT
        (SELECT count(*)::int FROM audit_events) AS gesamt,
        count(*) FILTER (WHERE vorher IS NOT NULL AND seq <> vorher + 1)::int AS luecken,
        (SELECT count(*)::int FROM audit_events a
           WHERE a.prev_hash IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM audit_events b WHERE b.row_hash = a.prev_hash)) AS verwaiste,
        (SELECT count(*)::int FROM (SELECT row_hash FROM audit_events GROUP BY row_hash HAVING count(*) > 1) d) AS doppelte
      FROM s
    `
    pruefe(
      'Audit-Strom vollständig',
      strom!.verwaiste === 0 && strom!.doppelte === 0,
      strom!.gesamt === 0
        ? 'keine Audit-Zeilen vorhanden'
        : `${strom!.gesamt} Zeilen · ${strom!.verwaiste} ohne vorhandenen Vorgänger · ` +
          `${strom!.doppelte} doppelte Hashes · ${strom!.luecken} Sprünge in der Nummernfolge`,
    )

    /* ── 3 · Bereichsbaum ───────────────────────────────────────────── */
    const [pfade] = await sql<{ ohne_pfad: number; verwaist: number }[]>`
      SELECT
        count(*) FILTER (WHERE path IS NULL)::int AS ohne_pfad,
        count(*) FILTER (
          WHERE parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM domains p WHERE p.id = d.parent_id)
        )::int AS verwaist
      FROM domains d
    `
    pruefe('Kein Bereich ohne Pfad, kein verwaister Elternbezug', pfade!.ohne_pfad === 0 && pfade!.verwaist === 0,
      `${pfade!.ohne_pfad} ohne Pfad, ${pfade!.verwaist} verwaist`)

    /*
      Zyklen: Ein Bereich, der über seine Eltern wieder bei sich selbst ankommt, lässt jede
      Auswertung endlos laufen. `ltree` macht das prüfbar, ohne rekursiv zu suchen – der
      eigene Pfad muss mit dem des Elternteils beginnen.
    */
    const [zyklen] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM domains d JOIN domains p ON p.id = d.parent_id
      WHERE NOT (d.path::text LIKE p.path::text || '.%')
    `
    pruefe('Keine Zyklen im Bereichsbaum', zyklen!.n === 0, `${zyklen!.n} Pfade passen nicht zum Elternteil`)

    /* ── 4 · Verantwortung ──────────────────────────────────────────── */
    const [besitz] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM (
        SELECT domain_id FROM responsibility_assignments
        WHERE assignment_kind = 'primary_owner' AND (effective_to IS NULL OR effective_to > now())
        GROUP BY domain_id HAVING count(*) > 1
      ) x
    `
    pruefe('Kein Bereich mit zwei Hauptverantwortlichen', besitz!.n === 0, `${besitz!.n} Bereiche doppelt belegt`)

    /* ── 5 · Ausgangspostfach ───────────────────────────────────────── */
    const [outbox] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM outbox_events WHERE state = 'published' AND published_at IS NULL
    `
    pruefe('Kein veröffentlichtes Ereignis ohne Zeitpunkt', outbox!.n === 0, `${outbox!.n} Zeilen widersprüchlich`)

    /* ── 6 · Angaben ────────────────────────────────────────────────── */
    /* INV-010: „weiß ich nicht" ist ein eigener Zustand – „bekannt ohne Wert" ist keiner. */
    const [werte] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM state_values WHERE value_kind = 'known' AND value IS NULL
    `
    pruefe('Jede bekannte Angabe hat einen Wert', werte!.n === 0, `${werte!.n} Angaben „bekannt" ohne Wert`)

    /* ── 7 · Fremdschlüssel ─────────────────────────────────────────── */
    /*
      `pg_restore` kann Constraints als NOT VALID anlegen; sie gelten dann erst für neue
      Zeilen. Eine Datenbank, die ihre eigenen Bezüge nicht einhält, sieht dabei gesund aus.
      Deshalb werden sie hier nachvalidiert – das ist die teuerste Prüfung und die einzige,
      die schreibt (ohne Daten zu ändern).
    */
    const offen = await sql<{ tabelle: string; name: string }[]>`
      SELECT rel.relname AS tabelle, con.conname AS name
      FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      WHERE ns.nspname = 'public' AND con.contype = 'f' AND NOT con.convalidated
    `
    let ungueltig = 0
    for (const c of offen) {
      try {
        await sql.unsafe(`ALTER TABLE public."${c.tabelle}" VALIDATE CONSTRAINT "${c.name}"`)
      } catch {
        ungueltig += 1
      }
    }
    pruefe(
      'Fremdschlüssel halten',
      ungueltig === 0,
      offen.length === 0 ? 'alle waren bereits validiert' : `${offen.length} nachvalidiert, ${ungueltig} gescheitert`,
    )

    return ausgeben()
  } finally {
    await handle.close()
  }
}

function ausgeben(): number {
  const gefallen = befunde.filter((b) => !b.bestanden)
  console.log('\nIntegritätsprüfung nach Restore (docs/29 §4)\n')
  for (const b of befunde) {
    console.log(`  ${b.bestanden ? '✓' : '✗'} ${b.name.padEnd(46)} ${b.detail}`)
  }
  if (gefallen.length === 0) {
    console.log(`\n${befunde.length} Prüfungen bestanden. Der zurückgespielte Bestand ist in sich stimmig.\n`)
    return 0
  }
  console.error(
    `\n${gefallen.length} von ${befunde.length} Prüfungen gescheitert. ` +
      'Dieser Restore darf nicht in Betrieb gehen.\n',
  )
  return 1
}

process.exitCode = await main()
