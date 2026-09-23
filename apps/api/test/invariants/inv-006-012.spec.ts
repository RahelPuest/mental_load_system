import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  calendarConnections,
  calendarEvents,
  notificationDeliveries,
  notifications,
  tasks,
  uuidv7,
  withTenant,
} from '@thealotta/db'
import { Harness, familyFixture } from '../helpers.js'

/**
 * INV-006 – Eine fehlgeschlagene Benachrichtigung verändert nicht den Lifecycle des Objekts.
 * INV-012 – Integrationsausfälle löschen oder schließen keine offenen Verantwortungen.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let taskId: string
let domainId: string

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'inv0612')
  const base = `/api/v1/households/${family.householdId}`
  domainId = (await h.json<{ id: string }>(family.anna, 'POST', `${base}/domains`, { name: 'Termine' })).id
  taskId = (
    await h.json<{ id: string }>(family.anna, 'POST', `${base}/tasks`, {
      title: 'Fragen für den Arzttermin sammeln',
      domainId,
    })
  ).id
}, 180_000)
afterAll(async () => h.stop())

const snapshotTask = () =>
  withTenant(h.app.db, [family.householdId], async (tx) => {
    const [row] = await tx.select().from(tasks).where(eq(tasks.id, taskId))
    return row!
  })

describe('INV-006 – Zustellprobleme bleiben im Zustellkanal', () => {
  it('eine bis zum Ende fehlgeschlagene Zustellung lässt die Aufgabe unverändert', async () => {
    const before = await snapshotTask()

    await withTenant(h.app.db, [family.householdId], async (tx) => {
      const notificationId = uuidv7()
      await tx.insert(notifications).values({
        id: notificationId,
        householdId: family.householdId,
        recipientMembershipId: family.annaMembershipId,
        notificationKind: 'task.due_soon',
        priority: 'high',
        title: 'Etwas braucht Aufmerksamkeit',
        dedupeKey: `task.due_soon:${taskId}`,
        subjectType: 'task',
        subjectId: taskId,
      })
      const deliveryId = uuidv7()
      await tx.insert(notificationDeliveries).values({
        id: deliveryId,
        householdId: family.householdId,
        notificationId,
        channel: 'push',
        state: 'queued',
      })
      // Fünf Fehlversuche bis zum endgültigen Scheitern.
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await tx
          .update(notificationDeliveries)
          .set({
            state: attempt < 5 ? 'queued' : 'failed',
            attemptCount: attempt,
            failureCode: 'push_endpoint_gone',
          })
          .where(eq(notificationDeliveries.id, deliveryId))
      }
    })

    const after = await snapshotTask()
    expect(after.state).toBe(before.state)
    expect(after.version).toBe(before.version)
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime())
  })

  it('die Aufgabe bleibt in der Ansicht sichtbar – die Zustellung war nur ein Kanal', async () => {
    const now = await h.json<{ sections: { items: { subjectId: string }[] }[] }>(
      family.anna,
      'GET',
      `/api/v1/households/${family.householdId}/now`,
    )
    expect(now.sections.flatMap((s) => s.items).map((i) => i.subjectId)).toContain(taskId)
  })
})

describe('INV-012 – Integrationsausfälle löschen nichts', () => {
  it('ein extern gelöschter Termin beendet keinen offenen Vorgang', async () => {
    const before = await snapshotTask()

    const connectionId = uuidv7()
    const eventId = uuidv7()
    await withTenant(h.app.db, [family.householdId], async (tx) => {
      await tx.insert(calendarConnections).values({
        id: connectionId,
        householdId: family.householdId,
        membershipId: family.annaMembershipId,
        provider: 'ics',
        displayName: 'Familienkalender',
        state: 'active',
      })
      await tx.insert(calendarEvents).values({
        id: eventId,
        householdId: family.householdId,
        connectionId,
        externalCalendarId: 'primary',
        externalId: 'evt-1',
        title: 'Kinderarzt Kind A',
        startsAt: new Date('2026-09-15T12:30:00.000Z'),
        endsAt: new Date('2026-09-15T13:00:00.000Z'),
        timeZone: 'Europe/Berlin',
        linkedDomainId: domainId,
      })

      // Der Sync meldet den Termin als gelöscht: Der Datensatz wird storniert, nicht entfernt.
      await tx.update(calendarEvents).set({ state: 'cancelled' }).where(eq(calendarEvents.id, eventId))
      // Zusätzlich fällt die Verbindung aus.
      await tx
        .update(calendarConnections)
        .set({ state: 'degraded', consecutiveFailures: 3, lastErrorCode: 'network_timeout' })
        .where(eq(calendarConnections.id, connectionId))
    })

    const after = await snapshotTask()
    expect(after.state).toBe(before.state)
    expect(after.version).toBe(before.version)

    const stillThere = await withTenant(h.app.db, [family.householdId], async (tx) =>
      tx.select().from(calendarEvents).where(eq(calendarEvents.id, eventId)),
    )
    // Der Termin bleibt als storniert erhalten – die Historie darf nicht verschwinden.
    expect(stillThere).toHaveLength(1)
    expect(stillThere[0]!.state).toBe('cancelled')
  })

  it('die Verbindung ist als gestört markiert, ohne die Arbeit zu berühren', async () => {
    const connections = await withTenant(h.app.db, [family.householdId], async (tx) =>
      tx.select().from(calendarConnections).where(eq(calendarConnections.householdId, family.householdId)),
    )
    expect(connections[0]!.state).toBe('degraded')

    const now = await h.json<{ sections: { items: { subjectId: string }[] }[] }>(
      family.anna,
      'GET',
      `/api/v1/households/${family.householdId}/now`,
    )
    expect(now.sections.flatMap((s) => s.items).map((i) => i.subjectId)).toContain(taskId)
  })
})
