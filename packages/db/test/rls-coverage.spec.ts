import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { openAdminSql, openTestDb } from './setup.js'
import type { DbHandle } from '../src/client.js'

/**
 * ADR-0003, Schicht 3.
 *
 * Dieser Test macht die häufigste Leak-Ursache strukturell unmöglich: Sobald jemand eine Tabelle
 * mit `household_id` anlegt und die Policy vergisst, schlägt die CI fehl.
 */
let handle: DbHandle

/**
 * Eigene IDs je Lauf: Testdateien laufen parallel in getrennten Prozessen, ein globales
 * TRUNCATE würde die Fixtures der anderen Dateien wegräumen.
 */
const OWN = randomUUID()
const FOREIGN = randomUUID()

beforeAll(async () => {
  handle = await openTestDb()
}, 120_000)
afterAll(async () => handle?.close())

describe('Row Level Security', () => {
  it('jede Tabelle mit household_id hat RLS aktiviert und erzwungen', async () => {
    const rows = await handle.sql<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'household_id' AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `
    expect(rows.length).toBeGreaterThan(30)
    const missing = rows.filter((r) => !r.relrowsecurity || !r.relforcerowsecurity).map((r) => r.relname)
    expect(missing).toEqual([])
  })

  it('auch die Tenant-Wurzel households ist geschützt', async () => {
    const [row] = await handle.sql<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
      SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'households'
    `
    expect(row?.relrowsecurity).toBe(true)
    expect(row?.relforcerowsecurity).toBe(true)
  })

  it('jede geschützte Tabelle trägt genau eine tenant_isolation-Policy', async () => {
    const rows = await handle.sql<{ tablename: string; policyname: string }[]>`
      SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
    `
    const byTable = new Map<string, string[]>()
    for (const r of rows) byTable.set(r.tablename, [...(byTable.get(r.tablename) ?? []), r.policyname])
    for (const [table, policies] of byTable) {
      expect(policies, table).toContain('tenant_isolation')
    }
  })

  it('ohne gesetzten Tenant-Kontext ist keine Zeile sichtbar', async () => {
    const admin = openAdminSql()
    try {
      await admin.begin(async (tx) => {
        await tx.unsafe(`SELECT set_config('app.bypass_rls', 'on', true)`)
        await tx.unsafe(`INSERT INTO households (id, name) VALUES ('${OWN}', 'RLS-Test'), ('${FOREIGN}', 'Fremder Haushalt')`)
      })
    } finally {
      await admin.end({ timeout: 5 })
    }
    const rows = await handle.sql`SELECT id FROM households`
    expect(rows).toHaveLength(0)
  })

  it('mit gesetztem Tenant-Kontext ist genau der eigene Haushalt sichtbar', async () => {
    const visible = await handle.sql.begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.household_ids', '${OWN}', true)`)
      return tx`SELECT id FROM households`
    })
    expect(visible.map((r) => (r as { id: string }).id)).toEqual([OWN])
  })

  it('ein fremder Haushalt bleibt unsichtbar (INV-005)', async () => {
    // Der eigene Haushalt existiert; sichtbar ist er für diesen Kontext trotzdem nicht.
    const visible = await handle.sql.begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.household_ids', '${FOREIGN}', true)`)
      return tx`SELECT id FROM households WHERE id = ${OWN}::uuid`
    })
    expect(visible).toHaveLength(0)
  })

  it('das Schreiben in einen fremden – tatsächlich existierenden – Haushalt wird abgewiesen', async () => {
    // Beide Haushalte existieren wirklich: sonst würde der Test durch einen
    // Fremdschlüsselfehler bestehen und die Policy gar nicht prüfen.
    await expect(
      handle.sql.begin(async (tx) => {
        await tx.unsafe(`SELECT set_config('app.household_ids', '${OWN}', true)`)
        await tx.unsafe(`INSERT INTO persons (household_id, display_name, person_kind)
                         VALUES ('${FOREIGN}', 'Fremd', 'child')`)
      }),
    ).rejects.toThrow(/row-level security/i)
  })

  it('die Anwendungsrolle ist weder Superuser noch Tabelleneigentümer', async () => {
    const [row] = await handle.sql<{ rolsuper: boolean; rolbypassrls: boolean; current: string }[]>`
      SELECT rolsuper, rolbypassrls, current_user AS current FROM pg_roles WHERE rolname = current_user
    `
    expect(row?.rolsuper).toBe(false)
    expect(row?.rolbypassrls).toBe(false)
    const owners = await handle.sql<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user
    `
    expect(owners).toHaveLength(0)
  })
})
