import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { calendarConnections, calendarEvents, tasks, uuidv7, withTenant } from '@thealotta/db'
import { syncIcsConnection, type CalendarSource } from '../src/jobs/calendar-sync.js'
import { seedWorkerFixture, type WorkerFixture } from './db-helpers.js'

/**
 * Kalender-Sync gegen die echte Datenbank (docs/22, INV-012).
 *
 * Geprüft wird genau das, was in der Praxis schiefgeht: doppelte Läufe, verspätete alte
 * Versionen, verschwundene Termine und Verbindungsausfälle.
 */
let f: WorkerFixture
const NOW = new Date('2026-09-07T09:00:00.000Z')

const ics = (events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//DE', ...events, 'END:VCALENDAR'].join('\r\n')

const vevent = (uid: string, summary: string, sequence = 0, start = '20260915T143000') =>
  [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SUMMARY:${summary}`,
    `DTSTART;TZID=Europe/Berlin:${start}`,
    'DTEND;TZID=Europe/Berlin:20260915T150000',
    `SEQUENCE:${sequence}`,
    'END:VEVENT',
  ].join('\r\n')

const sourceOf = (body: string): CalendarSource => ({ fetch: async () => ({ body, etag: 'etag-1' }) })

beforeAll(async () => {
  f = await seedWorkerFixture('calendar')
}, 180_000)
afterAll(async () => f?.handle.close())

const listEvents = () =>
  withTenant(f.db, [f.householdId], async (tx) =>
    tx.select().from(calendarEvents).where(eq(calendarEvents.connectionId, f.connectionId)),
  )

describe('Kalender-Sync', () => {
  it('legt Termine an', async () => {
    const result = await syncIcsConnection(
      f.db,
      sourceOf(ics([vevent('evt-1', 'Kinderarzt Kind A')])),
      { householdId: f.householdId, connectionId: f.connectionId, url: 'https://example.invalid/cal.ics' },
      NOW,
    )
    expect(result.upserted).toBe(1)
    const rows = await listEvents()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toBe('Kinderarzt Kind A')
    expect(rows[0]!.startsAt.toISOString()).toBe('2026-09-15T12:30:00.000Z')
  })

  it('ist idempotent: derselbe Lauf erzeugt keine Duplikate (§14.4)', async () => {
    for (let i = 0; i < 3; i += 1) {
      await syncIcsConnection(
        f.db,
        sourceOf(ics([vevent('evt-1', 'Kinderarzt Kind A')])),
        { householdId: f.householdId, connectionId: f.connectionId, url: 'https://example.invalid/cal.ics' },
        NOW,
      )
    }
    expect(await listEvents()).toHaveLength(1)
  })

  it('übernimmt Änderungen mit höherer SEQUENCE', async () => {
    await syncIcsConnection(
      f.db,
      sourceOf(ics([vevent('evt-1', 'Kinderarzt Kind A (verlegt)', 2, '20260916T100000')])),
      { householdId: f.householdId, connectionId: f.connectionId, url: 'https://example.invalid/cal.ics' },
      NOW,
    )
    const rows = await listEvents()
    expect(rows[0]!.title).toBe('Kinderarzt Kind A (verlegt)')
    expect(rows[0]!.sequence).toBe(2)
  })

  it('verwirft eine verspätet eintreffende ältere Version (Out-of-order-Schutz)', async () => {
    const result = await syncIcsConnection(
      f.db,
      sourceOf(ics([vevent('evt-1', 'Alter Stand', 1)])),
      { householdId: f.householdId, connectionId: f.connectionId, url: 'https://example.invalid/cal.ics' },
      NOW,
    )
    expect(result.skippedBySequence).toBe(1)
    const rows = await listEvents()
    expect(rows[0]!.title).toBe('Kinderarzt Kind A (verlegt)')
  })

  it('INV-012: ein extern verschwundener Termin wird storniert, nicht gelöscht', async () => {
    const taskId = uuidv7()
    await withTenant(f.db, [f.householdId], async (tx) => {
      await tx.insert(tasks).values({
        id: taskId,
        householdId: f.householdId,
        domainId: f.domainId,
        title: 'Fragen für den Arzttermin sammeln',
        state: 'ready',
      })
    })

    const result = await syncIcsConnection(
      f.db,
      sourceOf(ics([])),
      { householdId: f.householdId, connectionId: f.connectionId, url: 'https://example.invalid/cal.ics' },
      NOW,
    )
    expect(result.cancelled).toBe(1)

    const rows = await listEvents()
    expect(rows, 'Der Termin bleibt als Datensatz erhalten').toHaveLength(1)
    expect(rows[0]!.state).toBe('cancelled')

    const [task] = await withTenant(f.db, [f.householdId], async (tx) =>
      tx.select().from(tasks).where(eq(tasks.id, taskId)),
    )
    expect(task!.state, 'Die abgeleitete Arbeit bleibt unangetastet').toBe('ready')
  })

  it('markiert die Verbindung nach wiederholten Fehlern als gestört, ohne Daten zu verändern', async () => {
    const failing: CalendarSource = {
      fetch: async () => {
        throw new Error('network timeout')
      },
    }
    const eventsBefore = await listEvents()

    for (let i = 0; i < 3; i += 1) {
      await syncIcsConnection(
        f.db,
        failing,
        { householdId: f.householdId, connectionId: f.connectionId, url: 'https://example.invalid/cal.ics' },
        NOW,
      )
    }

    const [connection] = await withTenant(f.db, [f.householdId], async (tx) =>
      tx.select().from(calendarConnections).where(eq(calendarConnections.id, f.connectionId)),
    )
    expect(connection!.state).toBe('degraded')
    expect(connection!.consecutiveFailures).toBeGreaterThanOrEqual(3)
    // Backoff statt Dauerfeuer
    expect(connection!.nextSyncAt.getTime()).toBeGreaterThan(NOW.getTime())

    expect(await listEvents()).toHaveLength(eventsBefore.length)
  })

  it('erholt sich nach einem erfolgreichen Lauf wieder', async () => {
    await syncIcsConnection(
      f.db,
      sourceOf(ics([vevent('evt-2', 'Elternabend')])),
      { householdId: f.householdId, connectionId: f.connectionId, url: 'https://example.invalid/cal.ics' },
      NOW,
    )
    const [connection] = await withTenant(f.db, [f.householdId], async (tx) =>
      tx
        .select()
        .from(calendarConnections)
        .where(and(eq(calendarConnections.id, f.connectionId), eq(calendarConnections.householdId, f.householdId))),
    )
    expect(connection!.state).toBe('active')
    expect(connection!.consecutiveFailures).toBe(0)
  })
})
