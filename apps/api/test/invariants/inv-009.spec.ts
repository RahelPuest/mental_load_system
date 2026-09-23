import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from '../helpers.js'

/**
 * INV-009 / INV-002 – Ownership und Ausführung sind unabhängige Dimensionen.
 *
 * Das ist der Kern des Produktversprechens: Wer eine Aufgabe erledigt, übernimmt damit nicht
 * die kognitive Verantwortung für den Bereich.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let domainId: string

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'inv009')
  const base = `/api/v1/households/${family.householdId}`
  domainId = (
    await h.json<{ id: string }>(family.anna, 'POST', `${base}/domains`, {
      name: 'Gesundheit Kind A',
      criticality: 'critical',
      sensitivity: 'health',
    })
  ).id
  await h.json(family.anna, 'POST', `${base}/domains/${domainId}/claim`, {})
}, 180_000)
afterAll(async () => h.stop())

const base = () => `/api/v1/households/${family.householdId}`

const ownerOf = async (): Promise<string | undefined> => {
  const domains = await h.json<{ items: { id: string; effectiveOwner: { displayName: string } | null }[] }>(
    family.anna,
    'GET',
    `${base()}/domains`,
  )
  return domains.items.find((d) => d.id === domainId)?.effectiveOwner?.displayName
}

describe('INV-009 – Verantwortung ≠ Ausführung', () => {
  it('Ben erledigt zehn Aufgaben im Bereich – Anna bleibt verantwortlich', async () => {
    expect(await ownerOf()).toBe('Anna')

    for (let i = 0; i < 10; i += 1) {
      const task = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, {
        title: `Arzttermin-Schritt ${i}`,
        domainId,
        assigneeMembershipId: family.benMembershipId,
      })
      await h.json(family.ben, 'POST', `${base()}/tasks/${task.id}/complete`, {})
    }

    expect(await ownerOf(), 'Ausführung verändert Ownership nicht').toBe('Anna')
  })

  it('INV-002: eine Delegation ändert nichts an der Verantwortung und sagt das auch', async () => {
    const task = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, {
      title: 'Rezept abholen',
      domainId,
    })
    const result = await h.json<{ ownershipUnchanged: boolean }>(
      family.anna,
      'POST',
      `${base()}/tasks/${task.id}/assign`,
      { membershipId: family.benMembershipId, delegationKind: 'delegated' },
    )
    expect(result.ownershipUnchanged).toBe(true)
    expect(await ownerOf()).toBe('Anna')

    const history = await h.json<{ items: { eventType: string; payload: Record<string, unknown> }[] }>(
      family.anna,
      'GET',
      `${base()}/history?subjectId=${task.id}`,
    )
    const assigned = history.items.find((e) => e.eventType === 'task.assigned')
    expect(assigned?.payload['ownershipUnchanged']).toBe(true)
  })

  it('Ben kann als Nicht-Owner die Verantwortung nicht an sich ziehen', async () => {
    const response = await h.request(family.ben, 'POST', `${base()}/domains/${domainId}/transfer`, {
      toMembershipId: family.benMembershipId,
      reason: 'Ich mache das jetzt.',
    })
    expect(response.statusCode).toBe(403)
    expect(await ownerOf()).toBe('Anna')
  })

  it('eine ausdrückliche Übergabe verändert die Verantwortung – und nur die', async () => {
    await h.json(family.anna, 'POST', `${base()}/domains/${domainId}/transfer`, {
      toMembershipId: family.benMembershipId,
      reason: 'Ben übernimmt ab jetzt die Gesundheitstermine.',
    })
    expect(await ownerOf()).toBe('Ben')

    // INV-013: Der Wechsel ist vollständig nachvollziehbar.
    const history = await h.json<{ items: { eventType: string }[] }>(
      family.anna,
      'GET',
      `${base()}/history?domainId=${domainId}`,
    )
    expect(history.items.map((e) => e.eventType)).toContain('ownership.transferred')
  })
})
