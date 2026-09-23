import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { attentionItems, knowledgeItems, signals, tasks, withTenant } from '@thealotta/db'
import { Harness, familyFixture } from '../helpers.js'

/** INV-004 – Automatisch erzeugte Informationen sind von nutzerbestätigten unterscheidbar. */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'inv004')
}, 180_000)
afterAll(async () => h.stop())

describe('INV-004 – Herkunft ist immer erkennbar', () => {
  it('jede erzeugbare Tabelle trägt eine NOT-NULL-Herkunftsspalte', async () => {
    const rows = await withTenant(h.app.db, [family.householdId], async (tx) =>
      tx.execute(`
        SELECT c.relname AS table_name, a.attnotnull AS not_null
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'origin'
        WHERE n.nspname = 'public' AND c.relkind = 'r'
      `),
    )
    const list = rows as unknown as { table_name: string; not_null: boolean }[]
    expect(list.length).toBeGreaterThan(4)
    expect(list.filter((r) => !r.not_null).map((r) => r.table_name)).toEqual([])
  })

  it('ein vom Monitoring erzeugter Eintrag nennt Regel und Begründung', async () => {
    const base = `/api/v1/households/${family.householdId}`
    const domain = await h.json<{ id: string }>(family.anna, 'POST', `${base}/domains`, { name: 'Vorräte' })
    const definition = await h.json<{ id: string }>(family.anna, 'POST', `${base}/domains/${domain.id}/state-definitions`, {
      key: 'medikament_tage',
      label: 'Medikament (Tage Vorrat)',
      dataType: 'number',
      freshnessInterval: null,
      isCritical: true,
    })
    await h.json(family.anna, 'PUT', `${base}/state-definitions/${definition.id}/value`, {
      valueKind: 'known',
      value: 4,
      confirm: true,
    })
    const monitor = await h.json<{ id: string }>(family.anna, 'POST', `${base}/monitors`, {
      domainId: domain.id,
      stateDefinitionId: definition.id,
      name: 'Vorrat prüfen',
      ruleKind: 'state_threshold',
      config: { op: 'lt', value: 7 },
    })
    await h.json(family.anna, 'POST', `${base}/monitors/${monitor.id}/evaluate`)

    const rows = await withTenant(h.app.db, [family.householdId], async (tx) => {
      const items = await tx.select().from(attentionItems).where(eq(attentionItems.domainId, domain.id))
      const sigs = await tx.select().from(signals).where(eq(signals.domainId, domain.id))
      return { items, sigs }
    })

    expect(rows.items).toHaveLength(1)
    expect(rows.items[0]!.origin).toBe('system_rule')
    expect(rows.items[0]!.originRef).toBe(`monitor:${monitor.id}`)
    // §7.2: Begründungspflicht – strukturell über CHECK-Constraints erzwungen.
    expect(rows.items[0]!.whyNow.length).toBeGreaterThan(10)
    expect(String((rows.sigs[0]!.evidence as Record<string, unknown>)['rationale']).length).toBeGreaterThan(10)
  })

  it('von Menschen erfasstes Wissen ist bestätigt, automatisch erzeugtes nicht', async () => {
    const base = `/api/v1/households/${family.householdId}`
    const item = await h.json<{ id: string }>(family.anna, 'POST', `${base}/knowledge`, {
      title: 'Kinderarzt heißt Dr. Mayer',
      body: 'Praxis in der Hauptstraße.',
    })
    const rows = await withTenant(h.app.db, [family.householdId], async (tx) =>
      tx.select().from(knowledgeItems).where(eq(knowledgeItems.id, item.id)),
    )
    expect(rows[0]!.origin).toBe('human')
    expect(rows[0]!.confirmedAt).not.toBeNull()
  })

  it('die Datenbank verweigert automatisch erzeugte Aufgaben ohne Begründung', async () => {
    await expect(
      withTenant(h.app.db, [family.householdId], async (tx) =>
        tx.insert(tasks).values({
          householdId: family.householdId,
          title: 'Ohne Begründung',
          origin: 'system_rule',
          rationale: null,
        }),
      ),
    ).rejects.toThrow(/automatic_requires_rationale/)
  })
})
