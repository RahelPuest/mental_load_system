import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from '../helpers.js'

/**
 * INV-013 – Jede relevante Ownership-Änderung ist historisch nachvollziehbar.
 * INV-014 – Eine Pause hinterlässt keine kritischen Verantwortungen ohne Owner.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let criticalDomainId: string
let normalDomainId: string

const base = () => `/api/v1/households/${family.householdId}`

beforeAll(async () => {
  await h.start()
  h.clock.set(new Date('2026-03-01T09:00:00.000Z'))
  family = await familyFixture(h, 'inv1314')

  criticalDomainId = (
    await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, {
      name: 'Medikamente Kind A',
      criticality: 'critical',
    })
  ).id
  normalDomainId = (
    await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Spielzeug', criticality: 'low' })
  ).id
  await h.json(family.anna, 'POST', `${base()}/domains/${criticalDomainId}/claim`, {})
  await h.json(family.anna, 'POST', `${base()}/domains/${normalDomainId}/claim`, {})
}, 180_000)
afterAll(async () => h.stop())

describe('INV-013 – Ownership ist zu jedem Zeitpunkt rekonstruierbar', () => {
  it('nach mehreren Wechseln lässt sich jeder Zeitpunkt exakt beantworten', async () => {
    const t0 = h.clock.now()

    h.clock.advanceDays(10)
    const t1 = h.clock.now()
    await h.json(family.anna, 'POST', `${base()}/domains/${criticalDomainId}/transfer`, {
      toMembershipId: family.benMembershipId,
      reason: 'Anna ist im März beruflich stark eingespannt.',
    })

    h.clock.advanceDays(20)
    const t2 = h.clock.now()
    await h.json(family.ben, 'POST', `${base()}/domains/${criticalDomainId}/transfer`, {
      toMembershipId: family.annaMembershipId,
      reason: 'Rückgabe nach der Projektphase.',
    })

    const at = async (when: Date) =>
      h.json<{ owners: { membershipId: string }[] }>(
        family.anna,
        'GET',
        `${base()}/domains/${criticalDomainId}/ownership-history?at=${when.toISOString()}`,
      )

    expect((await at(new Date(t0.getTime() + 1000))).owners[0]!.membershipId).toBe(family.annaMembershipId)
    expect((await at(new Date(t1.getTime() + 1000))).owners[0]!.membershipId).toBe(family.benMembershipId)
    expect((await at(new Date(t2.getTime() + 1000))).owners[0]!.membershipId).toBe(family.annaMembershipId)
  })

  it('keine Zeile wird gelöscht – die vollständige Kette bleibt erhalten', async () => {
    const full = await h.json<{ owners: { from: string; to: string | null; endReason: string | null }[] }>(
      family.anna,
      'GET',
      `${base()}/domains/${criticalDomainId}/ownership-history`,
    )
    expect(full.owners).toHaveLength(3)
    expect(full.owners.filter((o) => o.to !== null)).toHaveLength(2)
    expect(full.owners[0]!.endReason).toContain('beruflich')
  })

  it('der Event-Strom erzählt dieselbe Geschichte', async () => {
    const history = await h.json<{ items: { eventType: string }[] }>(
      family.anna,
      'GET',
      `${base()}/history?domainId=${criticalDomainId}`,
    )
    const types = history.items.map((e) => e.eventType)
    expect(types.filter((t) => t === 'ownership.transferred')).toHaveLength(2)
    expect(types).toContain('ownership.assigned')
  })
})

describe('INV-014 – kritische Verantwortung fällt nicht in ein Loch', () => {
  it('wer pausiert, löst für kritische Bereiche einen sichtbaren Klärungsbedarf aus', async () => {
    const result = await h.json<{ coverageGaps: { domainId: string }[]; note: string }>(
      family.anna,
      'PUT',
      `${base()}/capacity/me`,
      {
        level: 'paused',
        acceptsNewAssignments: false,
        criticalOnly: true,
        mutePush: true,
        reasonCategory: 'unspecified',
      },
    )

    expect(result.coverageGaps.map((g) => g.domainId)).toContain(criticalDomainId)
    expect(result.coverageGaps.map((g) => g.domainId)).not.toContain(normalDomainId)
    // §1.10: keine Rechtfertigung, keine Bewertung.
    expect(result.note).not.toMatch(/leider|solltest|aber/i)
  })

  it('der Klärungsbedarf erscheint als Aufmerksamkeitseintrag mit Begründung', async () => {
    const attention = await h.json<{ items: { domainId: string; signalKind: string; whyNow: string; severity: string }[] }>(
      family.anna,
      'GET',
      `${base()}/attention?state=open`,
    )
    const gap = attention.items.find((a) => a.signalKind === 'coverage_gap')
    expect(gap).toBeDefined()
    expect(gap!.whyNow).toContain('reduzierte Kapazität')
    expect(gap!.severity).toBe('important')
  })

  it('INV-007: die Pause verändert weder Verantwortung noch Rechte', async () => {
    const domains = await h.json<{ items: { id: string; effectiveOwner: { displayName: string } | null }[] }>(
      family.anna,
      'GET',
      `${base()}/domains`,
    )
    expect(domains.items.find((d) => d.id === criticalDomainId)?.effectiveOwner?.displayName).toBe('Anna')

    // Anna kann weiterhin alles tun, was sie vorher durfte.
    const created = await h.request(family.anna, 'POST', `${base()}/domains`, { name: 'Trotzdem möglich' })
    expect(created.statusCode).toBe(201)
  })

  it('eine Zuweisung an eine pausierte Person braucht eine ausdrückliche Ausnahme', async () => {
    const task = await h.json<{ id: string }>(family.ben, 'POST', `${base()}/tasks`, {
      title: 'Etwas für Anna',
      domainId: normalDomainId,
    })

    const refused = await h.request(family.ben, 'POST', `${base()}/tasks/${task.id}/assign`, {
      membershipId: family.annaMembershipId,
      delegationKind: 'delegated',
    })
    expect(refused.statusCode).toBe(409)
    expect(refused.json<{ code: string }>().code).toBe('recipient_not_accepting')

    const allowed = await h.request(family.ben, 'POST', `${base()}/tasks/${task.id}/assign`, {
      membershipId: family.annaMembershipId,
      delegationKind: 'delegated',
      override: true,
      overrideReason: 'Kurz abgesprochen, Anna übernimmt das trotzdem.',
    })
    expect(allowed.statusCode).toBe(200)
  })

  it('eine temporäre Vertretung schließt die Lücke, ohne die dauerhafte Verantwortung zu ändern', async () => {
    const coverage = await h.json<{ id: string; state: string }>(family.anna, 'POST', `${base()}/coverages`, {
      domainId: criticalDomainId,
      coveringMembershipId: family.benMembershipId,
      startsAt: h.clock.now().toISOString(),
      endsAt: new Date(h.clock.now().getTime() + 14 * 86_400_000).toISOString(),
      returnMode: 'require_confirmation',
    })
    expect(coverage.state).toBe('active')

    const domains = await h.json<{
      items: { id: string; effectiveOwner: { displayName: string; viaCoverage: boolean } | null }[]
    }>(family.anna, 'GET', `${base()}/domains`)
    const domain = domains.items.find((d) => d.id === criticalDomainId)!
    expect(domain.effectiveOwner?.displayName).toBe('Ben')
    expect(domain.effectiveOwner?.viaCoverage).toBe(true)

    // INV-003: Die dauerhafte Zuweisung ist unverändert.
    const history = await h.json<{ owners: { membershipId: string; to: string | null }[] }>(
      family.anna,
      'GET',
      `${base()}/domains/${criticalDomainId}/ownership-history`,
    )
    const active = history.owners.filter((o) => o.to === null)
    expect(active).toHaveLength(1)
    expect(active[0]!.membershipId).toBe(family.annaMembershipId)
  })
})
