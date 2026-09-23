import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openAdminSql, prepareTestDatabase } from './setup.js'
import type postgres from 'postgres'

/**
 * INV-006 und INV-012 sind hier keine Konvention, sondern Berechtigung:
 * Der Zusteller kann keine Aufgabe ändern, der Kalender-Sync keine Arbeit löschen –
 * selbst wenn ein Fehler im Code es versuchen würde.
 */
let sql: postgres.Sql

beforeAll(async () => {
  await prepareTestDatabase()
  sql = openAdminSql()
}, 120_000)
afterAll(async () => sql?.end({ timeout: 5 }))

const has = async (sqlc: postgres.Sql, role: string, table: string, priv: string): Promise<boolean> => {
  const [row] = await sqlc<{ ok: boolean }[]>`
    SELECT has_table_privilege(${role}, ${table}, ${priv}) AS ok
  `
  return row?.ok ?? false
}

describe('Rollen-Grant-Matrix (docs/20 §5)', () => {
  it('thealotta_app darf fachliche Daten schreiben', async () => {
    expect(await has(sql, 'thealotta_app', 'tasks', 'INSERT')).toBe(true)
    expect(await has(sql, 'thealotta_app', 'tasks', 'UPDATE')).toBe(true)
    expect(await has(sql, 'thealotta_app', 'domains', 'UPDATE')).toBe(true)
  })

  it('der Ledger ist auch für die API unantastbar', async () => {
    // Was geschehen ist, bleibt: weder zu ändern noch zu löschen.
    for (const table of ['domain_events', 'audit_events']) {
      expect(await has(sql, 'thealotta_app', table, 'INSERT'), `${table} INSERT`).toBe(true)
      expect(await has(sql, 'thealotta_app', table, 'UPDATE'), `${table} UPDATE`).toBe(false)
      expect(await has(sql, 'thealotta_app', table, 'DELETE'), `${table} DELETE`).toBe(false)
    }
  })

  it('Belege lassen sich beenden, aber nicht umschreiben', async () => {
    /*
     * `signals` und `state_observations` standen bis Migration 0008 in derselben Zeile wie
     * der Ledger: kein UPDATE, kein DELETE. Der Unterschied, auf den es ankommt:
     *
     *   Einen Beleg **ändern** hieße, die Vergangenheit anders darzustellen.
     *   Ihn **löschen** heißt, ihn zu beenden – zusammen mit der Sache, zu der er gehört.
     *
     * Ohne das Löschrecht kann ein Haushalt seine Daten nicht vollständig entfernen: Beide
     * Tabellen hängen mit `ON DELETE RESTRICT` an Bereichen und Angaben, und damit bliebe
     * jeder Bereich stehen, an dem je eine Regel gelaufen ist.
     *
     * `UPDATE` bleibt entzogen – bis auf die spaltengenaue Ausnahme aus 0004
     * (`superseded_at`, `resolved_at`), mit der ein Signal seinen Lebenslauf beendet.
     */
    for (const table of ['state_observations', 'signals']) {
      expect(await has(sql, 'thealotta_app', table, 'INSERT'), `${table} INSERT`).toBe(true)
      expect(await has(sql, 'thealotta_app', table, 'DELETE'), `${table} DELETE`).toBe(true)
    }
    expect(await has(sql, 'thealotta_app', 'state_observations', 'UPDATE'), 'Beobachtung UPDATE').toBe(false)
  })

  it('INV-006: thealotta_notifier kann fachliche Objekte nicht verändern', async () => {
    for (const table of ['tasks', 'processes', 'attention_items', 'domains', 'state_values']) {
      expect(await has(sql, 'thealotta_notifier', table, 'SELECT'), `${table} SELECT`).toBe(true)
      expect(await has(sql, 'thealotta_notifier', table, 'UPDATE'), `${table} UPDATE`).toBe(false)
      expect(await has(sql, 'thealotta_notifier', table, 'INSERT'), `${table} INSERT`).toBe(false)
      expect(await has(sql, 'thealotta_notifier', table, 'DELETE'), `${table} DELETE`).toBe(false)
    }
    expect(await has(sql, 'thealotta_notifier', 'notification_deliveries', 'UPDATE')).toBe(true)
  })

  it('INV-012: thealotta_sync kann keine Arbeit löschen oder abschließen', async () => {
    for (const table of ['tasks', 'processes', 'attention_items', 'domains']) {
      expect(await has(sql, 'thealotta_sync', table, 'UPDATE'), `${table} UPDATE`).toBe(false)
      expect(await has(sql, 'thealotta_sync', table, 'DELETE'), `${table} DELETE`).toBe(false)
    }
    expect(await has(sql, 'thealotta_sync', 'calendar_events', 'UPDATE')).toBe(true)
    expect(await has(sql, 'thealotta_sync', 'calendar_events', 'DELETE')).toBe(true)
  })

  it('thealotta_monitor darf beobachten und Signale erzeugen – sonst nichts', async () => {
    expect(await has(sql, 'thealotta_monitor', 'state_values', 'SELECT')).toBe(true)
    expect(await has(sql, 'thealotta_monitor', 'state_values', 'UPDATE')).toBe(false)
    expect(await has(sql, 'thealotta_monitor', 'signals', 'INSERT')).toBe(true)
    expect(await has(sql, 'thealotta_monitor', 'tasks', 'INSERT')).toBe(false)
    expect(await has(sql, 'thealotta_monitor', 'attention_items', 'INSERT')).toBe(false)
  })

  it('keine Anwendungsrolle darf Tabellen leeren oder verwerfen', async () => {
    for (const role of ['thealotta_app', 'thealotta_monitor', 'thealotta_notifier', 'thealotta_sync']) {
      expect(await has(sql, role, 'tasks', 'TRUNCATE'), `${role} TRUNCATE`).toBe(false)
    }
  })
})
