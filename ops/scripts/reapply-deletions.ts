/**
 * Löschungen nach einem Restore erneut anwenden (docs/29 §3 Schritt 4, docs/05 §5).
 *
 * **Warum das Pflicht ist.** Ein Restore auf den Zeitpunkt T bringt alles zurück, was nach T
 * gelöscht wurde. Wer sein Konto löschen ließ, wäre danach wieder da – und das ist kein
 * Betriebsfehler, sondern ein Datenschutzvorfall. Deshalb hält `deletion_tombstones` fest,
 * **was** gelöscht wurde (Kennung und Zeitpunkt, keine Inhalte), 90 Tage lang. Dieses Skript
 * liest sie und wendet die Löschung auf den zurückgespielten Bestand erneut an.
 *
 *   DATABASE_URL=postgres://… npx tsx ops/scripts/reapply-deletions.ts [--jetzt]
 *
 * Ohne `--jetzt` wird nur berichtet, was geschähe. Das ist Absicht: Ein Skript, das beim
 * ersten Aufruf löscht, wird im Ernstfall aus Angst nicht benutzt.
 */
import { createDb } from '@thealotta/db'

/**
 * Was zu einem Grabstein gehört.
 *
 * Die Zuordnung steht hier und nicht in der Datenbank, weil sie eine fachliche Aussage ist:
 * „Eine Person löschen heißt, diese Zeilen zu entfernen." Ändert sich das Modell, muss auch
 * diese Liste angefasst werden – und genau das soll auffallen.
 */
const WEGE: Record<string, { tabelle: string; spalte: string }[]> = {
  user: [
    { tabelle: 'user_sessions', spalte: 'user_id' },
    { tabelle: 'household_memberships', spalte: 'user_id' },
    { tabelle: 'users', spalte: 'id' },
  ],
  person: [
    { tabelle: 'persons', spalte: 'id' },
  ],
  household: [
    { tabelle: 'households', spalte: 'id' },
  ],
  membership: [
    { tabelle: 'household_memberships', spalte: 'id' },
  ],
}

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL']
  if (!url) {
    console.error('DATABASE_URL fehlt.')
    return 1
  }
  const jetzt = process.argv.includes('--jetzt')
  const handle = createDb(url, { max: 1, onnotice: false })
  const sql = handle.sql

  try {
    const grabsteine = await sql<{ subject_type: string; subject_id: string; deleted_at: Date }[]>`
      SELECT subject_type, subject_id, deleted_at FROM deletion_tombstones ORDER BY deleted_at
    `

    if (grabsteine.length === 0) {
      console.log('\nKeine Grabsteine vorhanden – es ist nichts erneut anzuwenden.\n')
      /*
        Das ist derzeit der Normalfall, und zwar aus einem Grund, der hierher gehört:
        `deletion_requests` werden angelegt und lassen sich abbrechen, aber **niemand führt
        sie aus**. Es gibt keinen Job, der fällige Anträge abarbeitet, und damit schreibt
        auch nichts Grabsteine. Die API verspricht „die Löschung wird in 30 Tagen
        ausgeführt"; eingelöst wird das nicht (docs/84).

        Dieses Skript ist deshalb heute wirkungslos – aber nicht überflüssig: Es ist der
        Schritt, der im Restore-Runbook verlangt wird, und es ist fertig, sobald der
        Ausführer existiert. Ein Restore-Runbook mit einer Lücke an Schritt 4 wäre
        gefährlicher als eines, dessen Schritt 4 nichts findet.
      */
      const [offen] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM deletion_requests
        WHERE state = 'scheduled' AND cancelled_at IS NULL AND execute_after <= now()
      `
      if ((offen?.n ?? 0) > 0) {
        console.warn(
          `⚠ ${offen!.n} Löschanträge sind fällig und wurden nie ausgeführt.\n` +
            '  Sie erzeugen deshalb auch keine Grabsteine. Siehe docs/84.\n',
        )
      }
      return 0
    }

    console.log(`\n${grabsteine.length} Grabsteine gefunden.\n`)
    let betroffen = 0
    let unbekannt = 0

    for (const g of grabsteine) {
      const wege = WEGE[g.subject_type]
      if (!wege) {
        console.warn(`  ? ${g.subject_type} ${g.subject_id} – für diese Art ist kein Weg hinterlegt`)
        unbekannt += 1
        continue
      }

      for (const w of wege) {
        const [zeile] = await sql.unsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n FROM "${w.tabelle}" WHERE "${w.spalte}" = $1`,
          [g.subject_id],
        )
        const n = zeile?.n ?? 0
        if (n === 0) continue
        betroffen += n
        if (jetzt) {
          await sql.unsafe(`DELETE FROM "${w.tabelle}" WHERE "${w.spalte}" = $1`, [g.subject_id])
          console.log(`  ✓ ${w.tabelle}: ${n} Zeile(n) erneut gelöscht (${g.subject_type} ${g.subject_id})`)
        } else {
          console.log(`  · ${w.tabelle}: ${n} Zeile(n) wären zu löschen (${g.subject_type} ${g.subject_id})`)
        }
      }
    }

    if (unbekannt > 0) {
      console.error(`\n✗ ${unbekannt} Grabsteine ohne hinterlegten Weg – diese Löschungen bleiben unangewendet.\n`)
      return 1
    }
    if (betroffen === 0) {
      console.log('\nNichts zurückgekehrt: Der Restore liegt vor allen festgehaltenen Löschungen.\n')
      return 0
    }
    console.log(
      jetzt
        ? `\n${betroffen} Zeilen erneut gelöscht.\n`
        : `\n${betroffen} Zeilen wären zu löschen. Zum Ausführen: --jetzt\n`,
    )
    return 0
  } finally {
    await handle.close()
  }
}

process.exitCode = await main()
