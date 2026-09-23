import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { openAdminSql, prepareTestDatabase } from './setup.js'
import * as schema from '../src/schema.js'
import type postgres from 'postgres'

/**
 * ADR-0002: Quelle der Wahrheit für das DDL sind die SQL-Migrationen; `schema.ts` ist die
 * typisierte Sicht darauf. Dieser Test verhindert, dass beides auseinanderläuft – der einzige
 * ernsthafte Nachteil handgeschriebener Migrationen neben einem generierenden ORM.
 */
let sql: postgres.Sql

beforeAll(async () => {
  await prepareTestDatabase()
  sql = openAdminSql()
}, 120_000)
afterAll(async () => sql?.end({ timeout: 5 }))

describe('Schema-Parität zwischen Drizzle und Datenbank', () => {
  it('jede Drizzle-Tabelle existiert in der Datenbank', async () => {
    const rows = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `
    const inDb = new Set(rows.map((r) => r.table_name))
    const missing: string[] = []
    for (const table of Object.values(schema)) {
      if (typeof table !== 'object' || table === null) continue
      try {
        const cfg = getTableConfig(table as never)
        if (!inDb.has(cfg.name)) missing.push(cfg.name)
      } catch {
        /* kein Table-Objekt */
      }
    }
    expect(missing).toEqual([])
  })

  it('jede Drizzle-Spalte existiert mit passender NOT-NULL-Eigenschaft', async () => {
    const rows = await sql<{ table_name: string; column_name: string; is_nullable: string }[]>`
      SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public'
    `
    const dbCols = new Map<string, { nullable: boolean }>()
    for (const r of rows) dbCols.set(`${r.table_name}.${r.column_name}`, { nullable: r.is_nullable === 'YES' })

    const problems: string[] = []
    for (const table of Object.values(schema)) {
      if (typeof table !== 'object' || table === null) continue
      let cfg
      try {
        cfg = getTableConfig(table as never)
      } catch {
        continue
      }
      for (const col of cfg.columns) {
        const key = `${cfg.name}.${col.name}`
        const db = dbCols.get(key)
        if (!db) {
          problems.push(`${key}: fehlt in der Datenbank`)
          continue
        }
        if (col.notNull === db.nullable) {
          problems.push(`${key}: NOT NULL stimmt nicht überein (Drizzle notNull=${col.notNull}, DB nullable=${db.nullable})`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('keine Tabelle der Datenbank fehlt in Drizzle (außer bewusst ausgenommenen)', async () => {
    const ignored = new Set(['schema_migrations'])
    const rows = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `
    const inCode = new Set<string>()
    for (const table of Object.values(schema)) {
      if (typeof table !== 'object' || table === null) continue
      try {
        inCode.add(getTableConfig(table as never).name)
      } catch {
        /* ignorieren */
      }
    }
    const missing = rows.map((r) => r.table_name).filter((n) => !inCode.has(n) && !ignored.has(n))
    expect(missing).toEqual([])
  })
})
