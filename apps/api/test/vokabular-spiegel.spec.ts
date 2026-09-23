import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import {
  CRITICALITY,
  HOUSEHOLD_ROLES,
  MEMBERSHIP_STATUSES,
  MONITOR_RULE_KINDS,
  TASK_STATES,
} from '@thealotta/contracts'
import { Harness } from './helpers.js'

/**
 * ADR-0013: Kontrollierte Vokabulare leben in `@thealotta/contracts`, die Datenbank spiegelt sie.
 *
 * Bisher stand das nur in der Entscheidung. Prompt gab es ein Vokabular, das ausschließlich
 * in der Datenbank existierte: `household_memberships.status` erlaubte seit jeher `left` –
 * in den Verträgen kam der Wert nicht vor, und deshalb wusste niemand im Code, dass es einen
 * Zustand „gehört nicht mehr dazu" überhaupt gibt (Audit 2, H4).
 *
 * Eine Invariante ohne Durchsetzungspunkt ist eine Absichtserklärung. Dieser Test ist der
 * Durchsetzungspunkt: Er liest die CHECK-Bedingungen aus der laufenden Datenbank und
 * vergleicht sie Wert für Wert mit dem Vertrag.
 */
const h = new Harness()
beforeAll(async () => h.start(), 180_000)
afterAll(async () => h.stop())

const SPIEGEL: { tabelle: string; spalte: string; vertrag: readonly string[] }[] = [
  { tabelle: 'household_memberships', spalte: 'role', vertrag: HOUSEHOLD_ROLES },
  { tabelle: 'household_memberships', spalte: 'status', vertrag: MEMBERSHIP_STATUSES },
  { tabelle: 'tasks', spalte: 'state', vertrag: TASK_STATES },
  { tabelle: 'domains', spalte: 'criticality', vertrag: CRITICALITY },
  { tabelle: 'monitors', spalte: 'rule_kind', vertrag: MONITOR_RULE_KINDS },
]

/** Aus `CHECK ((x = ANY (ARRAY['a'::text, 'b'::text])))` die Werte herausziehen. */
function werteAus(definition: string): string[] {
  return [...definition.matchAll(/'([^']+)'::text/g)].map((m) => m[1]!)
}

describe('Vokabular: Vertrag und Datenbank sagen dasselbe', () => {
  for (const { tabelle, spalte, vertrag } of SPIEGEL) {
    it(`${tabelle}.${spalte}`, async () => {
      const rows = await h.app.db.execute<{ def: string }>(sql`
        SELECT pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE conrelid = ${tabelle}::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE ${'%' + spalte + ' = ANY%'}
      `)
      const treffer = [...rows].map((r) => r.def)
      expect(treffer, `keine CHECK-Bedingung für ${tabelle}.${spalte} gefunden`).toHaveLength(1)

      expect([...werteAus(treffer[0]!)].sort(), `${tabelle}.${spalte} weicht vom Vertrag ab`).toEqual(
        [...vertrag].sort(),
      )
    })
  }
})
