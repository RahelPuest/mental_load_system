import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from '../helpers.js'

/**
 * INV-011 / §10 – Widersprüche werden sichtbar gemacht, nicht still aufgelöst.
 * Das ist der „Schuhgröße 29 vs. 30"-Fall aus der Spezifikation.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let definitionId: string
let domainId: string

const base = () => `/api/v1/households/${family.householdId}`

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'inv011')
  domainId = (await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Schuhe' })).id
  definitionId = (
    await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains/${domainId}/state-definitions`, {
      key: 'shoe_size',
      label: 'Schuhgröße',
      dataType: 'number',
      freshnessInterval: 'P6W',
    })
  ).id
  await h.json(family.anna, 'PUT', `${base()}/state-definitions/${definitionId}/value`, {
    valueKind: 'known',
    value: 29,
    confirm: true,
  })
}, 180_000)
afterAll(async () => h.stop())

describe('INV-011 – kein stilles Überschreiben', () => {
  it('zwei Menschen, zwei Werte, kurz hintereinander: beide bleiben sichtbar', async () => {
    const response = await h.request(family.ben, 'PUT', `${base()}/state-definitions/${definitionId}/value`, {
      valueKind: 'known',
      value: 30,
      confirm: true,
    })

    expect(response.statusCode).toBe(409)
    const body = response.json<{ applied: boolean; rule: string; value: { value: unknown; conflict: { observations: unknown[] } | null } }>()
    expect(body.applied).toBe(false)
    expect(body.rule).toBe('human_conflict_within_window')
    // Der zuvor bestätigte Wert bleibt stehen, statt überschrieben zu werden.
    expect(body.value.value).toBe(29)
    expect(body.value.conflict).not.toBeNull()
    expect(body.value.conflict!.observations.length).toBeGreaterThanOrEqual(2)
  })

  it('der Widerspruch erscheint als Aufmerksamkeitseintrag mit beiden Angaben', async () => {
    const attention = await h.json<{ items: { signalKind: string; whyNow: string; severity: string }[] }>(
      family.anna,
      'GET',
      `${base()}/attention?state=open`,
    )
    const conflict = attention.items.find((a) => a.signalKind === 'state_conflict')
    expect(conflict).toBeDefined()
    expect(conflict!.whyNow).toContain('Schuhgröße')
    expect(conflict!.severity).toBe('important')
  })

  it('ein Mensch entscheidet – erst dann steht der Wert fest', async () => {
    const before = await h.json<{ conflict: { observations: { id: string; value: unknown }[] } }>(
      family.anna,
      'GET',
      `${base()}/state-definitions/${definitionId}/value`,
    )
    const chosen = before.conflict.observations.find((o) => o.value === 30)!

    const stateValue = await h.json<{ items: unknown[] }>(family.anna, 'GET', `${base()}/domains/${domainId}/state-definitions`)
    expect(stateValue.items).toHaveLength(1)

    const valueRow = await h.json<{ version: number }>(family.anna, 'GET', `${base()}/state-definitions/${definitionId}/value`)
    expect(valueRow.version).toBeGreaterThan(1)

    // Die Auflösung erfolgt über die StateValue-ID; sie steckt in der Konfliktantwort.
    const { withTenant, stateValues } = await import('@thealotta/db')
    const { eq } = await import('drizzle-orm')
    const [row] = await withTenant(h.app.db, [family.householdId], async (tx) =>
      tx.select().from(stateValues).where(eq(stateValues.stateDefinitionId, definitionId)),
    )

    const resolved = await h.json<{ value: unknown; conflict: unknown }>(
      family.anna,
      'POST',
      `${base()}/state-values/${row!.id}/resolve-conflict`,
      { chosenObservationId: chosen.id, note: 'Nachgemessen: 30 stimmt.' },
    )
    expect(resolved.value).toBe(30)
    expect(resolved.conflict).toBeNull()
  })

  it('nach der Klärung ist der Aufmerksamkeitseintrag geschlossen', async () => {
    const attention = await h.json<{ items: { signalKind: string }[] }>(
      family.anna,
      'GET',
      `${base()}/attention?state=open`,
    )
    expect(attention.items.find((a) => a.signalKind === 'state_conflict')).toBeUndefined()
  })

  it('außerhalb des Konfliktfensters gilt die neuere menschliche Angabe als Korrektur', async () => {
    h.clock.advanceDays(3)
    const response = await h.json<{ applied: boolean; rule: string; value: { value: unknown } }>(
      family.ben,
      'PUT',
      `${base()}/state-definitions/${definitionId}/value`,
      { valueKind: 'known', value: 31, confirm: true },
    )
    expect(response.applied).toBe(true)
    expect(response.rule).toBe('newer_human_wins')
    expect(response.value.value).toBe(31)
  })

  it('INV-010: „weiß ich nicht" ist ein gültiger Wert und kein leeres Feld', async () => {
    const invalid = await h.request(family.anna, 'PUT', `${base()}/state-definitions/${definitionId}/value`, {
      valueKind: 'known',
    })
    expect(invalid.statusCode).toBe(422)

    h.clock.advanceDays(3)
    const unknown = await h.json<{ value: { valueKind: string; value: unknown } }>(
      family.anna,
      'PUT',
      `${base()}/state-definitions/${definitionId}/value`,
      { valueKind: 'unknown', confirm: true },
    )
    expect(unknown.value.valueKind).toBe('unknown')
    expect(unknown.value.value).toBeNull()
  })
})
