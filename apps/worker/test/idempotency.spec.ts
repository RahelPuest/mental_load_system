import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  attentionItems,
  monitors,
  outboxEvents,
  stateDefinitions,
  stateValues,
  tasks,
  temporaryCoverages,
  uuidv7,
  waitingStates,
  withTenant,
  withoutTenant,
} from '@thealotta/db'
import { evaluateMonitorJob } from '../src/jobs/monitor-evaluate.js'
import { runMaintenance } from '../src/jobs/maintenance.js'
import { relayOutbox } from '../src/jobs/outbox-relay.js'
import { seedWorkerFixture, type WorkerFixture } from './db-helpers.js'

/**
 * docs/24 §7 – Chaos-Eigenschaft: Jeder Job wird zweimal mit identischer Eingabe ausgeführt.
 * Der Endzustand muss identisch sein. Ein Worker-Absturz nach getaner Arbeit, aber vor der
 * Bestätigung, ist der Normalfall, nicht die Ausnahme.
 */
let f: WorkerFixture
const NOW = new Date('2026-09-07T09:00:00.000Z')

beforeAll(async () => {
  f = await seedWorkerFixture('idem')
}, 180_000)
afterAll(async () => f?.handle.close())

describe('Idempotenz der Hintergrundjobs', () => {
  it('monitor.evaluate erzeugt bei doppelter Ausführung genau ein Signal', async () => {
    const definitionId = uuidv7()
    const monitorId = uuidv7()

    await withTenant(f.db, [f.householdId], async (tx) => {
      await tx.insert(stateDefinitions).values({
        id: definitionId,
        householdId: f.householdId,
        domainId: f.domainId,
        key: 'schuhgroesse',
        label: 'Schuhgröße',
        dataType: 'number',
        freshnessInterval: '6 weeks',
      })
      await tx.insert(stateValues).values({
        householdId: f.householdId,
        stateDefinitionId: definitionId,
        valueKind: 'known',
        value: 29,
        verifiedAt: new Date(NOW.getTime() - 49 * 86_400_000),
        confirmedAt: new Date(NOW.getTime() - 49 * 86_400_000),
        origin: 'human',
      })
      await tx.insert(monitors).values({
        id: monitorId,
        householdId: f.householdId,
        domainId: f.domainId,
        stateDefinitionId: definitionId,
        name: 'Schuhgröße prüfen',
        ruleKind: 'state_freshness',
        nextEvaluationAt: NOW,
      })
    })

    const first = await evaluateMonitorJob(f.db, { householdId: f.householdId, monitorId }, NOW)
    const second = await evaluateMonitorJob(f.db, { householdId: f.householdId, monitorId }, NOW)

    expect(first.signalsCreated).toBe(1)
    expect(second.signalsCreated).toBe(0)

    const items = await withTenant(f.db, [f.householdId], async (tx) =>
      tx.select().from(attentionItems).where(eq(attentionItems.domainId, f.domainId)),
    )
    expect(items).toHaveLength(1)
  })

  it('maintenance.run führt zweimal ausgeführt zum identischen Zustand', async () => {
    const taskId = uuidv7()
    const deferredId = uuidv7()
    const waitingTaskId = uuidv7()
    const coverageId = uuidv7()

    await withTenant(f.db, [f.householdId], async (tx) => {
      await tx.insert(tasks).values([
        {
          id: taskId,
          householdId: f.householdId,
          domainId: f.domainId,
          title: 'Überschrittener Zeitpunkt',
          state: 'ready',
          dueAt: new Date(NOW.getTime() - 3 * 86_400_000),
        },
        {
          id: deferredId,
          householdId: f.householdId,
          domainId: f.domainId,
          title: 'Zurückgestellt',
          state: 'deferred',
          deferUntil: new Date(NOW.getTime() - 86_400_000),
        },
        {
          id: waitingTaskId,
          householdId: f.householdId,
          domainId: f.domainId,
          title: 'Wartet auf Antwort',
          state: 'waiting',
        },
      ])
      await tx.insert(waitingStates).values({
        householdId: f.householdId,
        taskId: waitingTaskId,
        waitingKind: 'external_party',
        description: 'Antwort der Praxis',
        recheckAt: new Date(NOW.getTime() - 3_600_000),
      })
      await tx.insert(temporaryCoverages).values({
        id: coverageId,
        householdId: f.householdId,
        domainId: f.domainId,
        coveringMembershipId: f.membershipId,
        startsAt: new Date(NOW.getTime() - 20 * 86_400_000),
        endsAt: new Date(NOW.getTime() - 86_400_000),
        state: 'active',
        returnMode: 'require_confirmation',
      })
    })

    const first = await runMaintenance(f.db, f.householdId, NOW)
    expect(first.overdueReassessed).toBeGreaterThanOrEqual(1)
    expect(first.deferReleased).toBe(1)
    expect(first.waitingRechecked).toBe(1)
    expect(first.coveragesExpired).toBe(1)

    const snapshot = await snapshotState()
    const second = await runMaintenance(f.db, f.householdId, NOW)

    // Der zweite Lauf findet nichts mehr zu tun – das ist die eigentliche Zusicherung.
    expect(second.deferReleased).toBe(0)
    expect(second.waitingRechecked).toBe(0)
    expect(second.coveragesExpired).toBe(0)
    expect(await snapshotState()).toEqual(snapshot)
  })

  it('INV-014: die abgelaufene Vertretung bleibt zuständig, bis jemand bestätigt (Q-07)', async () => {
    const [coverage] = await withTenant(f.db, [f.householdId], async (tx) =>
      tx.select().from(temporaryCoverages).where(eq(temporaryCoverages.householdId, f.householdId)),
    )
    expect(coverage!.state).toBe('pending_return')
    expect(coverage!.returnedAt).toBeNull()
  })

  it('outbox.relay stellt jedes Event genau einmal zu', async () => {
    /*
     * Der Relay arbeitet bewusst haushaltsübergreifend (ADR-0007). Die Prüfung darf das
     * nicht: parallel laufende Testdateien legen ständig eigene Events ab. Deshalb wird
     * die Zusage – jedes Event genau einmal, keins bleibt liegen – an den Events *dieses*
     * Haushalts festgemacht, nicht an einer globalen Zählung.
     */
    const mine = () =>
      withoutTenant(f.db, 'test_inspects_outbox', async (tx) =>
        tx
          .select({ id: outboxEvents.id, state: outboxEvents.state, publishedAt: outboxEvents.publishedAt })
          .from(outboxEvents)
          .where(eq(outboxEvents.householdId, f.householdId)),
      )

    const pendingIds = new Set(
      (await mine()).filter((r) => r.state === 'pending').map((r) => r.id),
    )
    expect(pendingIds.size, 'der Aufbau muss Events erzeugt haben').toBeGreaterThan(0)

    // Die Tabelle ist geteilt: andere Testdateien legen laufend eigene Events ab. Deshalb
    // so lange durchlaufen, bis die eigenen zugestellt sind – begrenzt, damit ein echter
    // Stillstand auffällt.
    const target = { publish: async () => undefined }
    for (let round = 0; round < 20; round += 1) {
      const open = (await mine()).filter((r) => pendingIds.has(r.id) && r.state === 'pending')
      if (open.length === 0) break
      await relayOutbox(f.db, target, 500)
    }

    const afterFirst = (await mine()).filter((r) => pendingIds.has(r.id))
    expect(afterFirst.filter((r) => r.state !== 'published'), 'nichts bleibt liegen').toEqual([])
    const stamps = new Map(afterFirst.map((r) => [r.id, r.publishedAt?.getTime()]))

    // Zweiter Lauf: dieselben Events dürfen nicht erneut zugestellt werden. Sichtbar wird
    // das daran, dass ihr Zustellzeitpunkt sich nicht verschiebt.
    await relayOutbox(f.db, target, 500)
    for (const row of (await mine()).filter((r) => pendingIds.has(r.id))) {
      expect(row.state).toBe('published')
      expect(row.publishedAt?.getTime(), 'erneut zugestellt').toBe(stamps.get(row.id))
    }
  })

  it('ein fehlschlagender Konsument verliert kein Event – es bleibt mit Backoff liegen', async () => {
    // Eindeutiges Thema je Lauf: die Testdatenbank wird zwischen Läufen nicht geleert.
    const topic = `test.event.${uuidv7()}`
    await withTenant(f.db, [f.householdId], async (tx) => {
      await tx.insert(outboxEvents).values({
        householdId: f.householdId,
        eventId: uuidv7(),
        topic,
        payload: {},
        correlationId: uuidv7(),
      })
    })

    const failing = {
      publish: async () => {
        throw new Error('Broker nicht erreichbar')
      },
    }
    /*
     * Der Relay arbeitet haushaltsübergreifend; die Zähler seines Rückgabewerts vermischen
     * fremde Events. Geprüft wird deshalb die Zusage selbst: das eigene Event bleibt liegen,
     * mit Versuchszähler, Backoff und Fehlergrund – und geht nicht verloren.
     */
    for (let round = 0; round < 20; round += 1) {
      const [row] = await withoutTenant(f.db, 'test_inspects_outbox', async (tx) =>
        tx.select().from(outboxEvents).where(eq(outboxEvents.topic, topic)),
      )
      if (row && row.attemptCount > 0) break
      await relayOutbox(f.db, failing, 200)
    }

    const rows = await withoutTenant(f.db, 'test_inspects_outbox', async (tx) =>
      tx.select().from(outboxEvents).where(eq(outboxEvents.topic, topic)),
    )
    expect(rows[0]!.state).toBe('pending')
    expect(rows[0]!.attemptCount).toBe(1)
    expect(rows[0]!.availableAt.getTime()).toBeGreaterThan(Date.now())
    expect(rows[0]!.lastError).toContain('Broker')
  })
})

async function snapshotState(): Promise<unknown> {
  return withTenant(f.db, [f.householdId], async (tx) => {
    const taskRows = await tx
      .select({ id: tasks.id, state: tasks.state, version: tasks.version, overdueSince: tasks.overdueSince })
      .from(tasks)
      .where(eq(tasks.householdId, f.householdId))
      .orderBy(tasks.id)
    const coverageRows = await tx
      .select({ id: temporaryCoverages.id, state: temporaryCoverages.state })
      .from(temporaryCoverages)
      .where(eq(temporaryCoverages.householdId, f.householdId))
      .orderBy(temporaryCoverages.id)
    return { taskRows, coverageRows }
  })
}
