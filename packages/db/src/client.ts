import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'
import * as schema from './schema.js'

export type Database = PostgresJsDatabase<typeof schema>
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export interface DbHandle {
  db: Database
  sql: postgres.Sql
  close(): Promise<void>
}

export function createDb(connectionString: string, opts: { max?: number; onnotice?: boolean } = {}): DbHandle {
  const client = postgres(connectionString, {
    max: opts.max ?? 10,
    // Transaktionsgebundene Session-Variablen erfordern, dass eine Transaktion eine Verbindung hält.
    prepare: false,
    onnotice: opts.onnotice === false ? () => {} : undefined,
    types: {
      // ltree und interval kommen als Text zurück – so bleibt die Behandlung explizit.
    },
  })
  const db = drizzle(client, { schema })
  return { db, sql: client, close: () => client.end({ timeout: 5 }) }
}

/**
 * ADR-0003, Schicht 2: Jede fachliche Transaktion läuft mit gesetztem Tenant-Kontext.
 *
 * `set_config(..., true)` bedeutet LOCAL – die Einstellung endet mit der Transaktion und kann
 * nicht in eine gepoolte Folgeverbindung durchsickern.
 */
export async function withTenant<T>(
  db: Database,
  householdIds: readonly string[],
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (householdIds.length === 0) {
    throw new Error('withTenant ohne Household-Kontext aufgerufen')
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.household_ids', ${householdIds.join(',')}, true)`)
    return fn(tx)
  })
}

/**
 * Nur für Wartung, Migration und Restore. Anwendungscode darf das nicht verwenden –
 * eine Lint-Regel (`no-restricted-imports`) verbietet den Import außerhalb von ops/ und worker-Jobs,
 * die ausdrücklich haushaltsübergreifend arbeiten (z. B. der Outbox-Relay).
 */
export async function withoutTenant<T>(db: Database, reason: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!reason || reason.length < 8) throw new Error('withoutTenant verlangt eine Begründung')
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.bypass_rls', 'on', true)`)
    return fn(tx)
  })
}

export { schema, sql }
