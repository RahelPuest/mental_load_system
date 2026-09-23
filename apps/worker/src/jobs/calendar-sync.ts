import { and, eq, sql } from 'drizzle-orm'
import {
  calendarConnections,
  calendarEvents,
  calendarSelections,
  recordEvent,
  withTenant,
  type Database,
  type Tx,
} from '@thealotta/db'
import { calendarSyncAge, calendarSyncFailures } from '@thealotta/observability'
import { integrationActor } from '../context.js'
import { parseIcs, type IcsEvent } from '../calendar/ics.js'

export interface CalendarSource {
  /** Liefert den Rohinhalt eines Kalenders. In Tests ein Fixture, im Betrieb ein HTTP-Abruf. */
  fetch(url: string): Promise<{ body: string; etag: string | null }>
}

export interface SyncResult {
  upserted: number
  cancelled: number
  skippedBySequence: number
  connectionState: string
}

/**
 * Kalender-Sync (docs/22).
 *
 * Drei Eigenschaften, die hier zählen:
 *  1. **Idempotent** – der Schlüssel (Connection, Kalender, UID, RECURRENCE-ID) macht
 *     wiederholte Läufe folgenlos.
 *  2. **Out-of-order-sicher** – eine kleinere SEQUENCE als gespeichert wird verworfen.
 *  3. **Nicht löschend** – extern verschwundene Termine werden storniert, nie entfernt (INV-012).
 */
export async function syncIcsConnection(
  db: Database,
  source: CalendarSource,
  input: { householdId: string; connectionId: string; url: string },
  now: Date,
): Promise<SyncResult> {
  const actor = integrationActor(`calendar_connection:${input.connectionId}`)

  return withTenant(db, [input.householdId], async (tx) => {
    const [connection] = await tx
      .select()
      .from(calendarConnections)
      .where(and(eq(calendarConnections.householdId, input.householdId), eq(calendarConnections.id, input.connectionId)))
      .limit(1)
    if (!connection) throw new Error('Kalenderverbindung nicht gefunden')

    try {
      const fetched = await source.fetch(input.url)
      const parsed = parseIcs(fetched.body)
      const result = await applyEvents(tx, input.householdId, connection.id, parsed.events, actor, now)

      await tx
        .update(calendarConnections)
        .set({
          state: 'active',
          consecutiveFailures: 0,
          lastErrorCode: null,
          lastSyncAt: now,
          syncToken: fetched.etag,
          nextSyncAt: new Date(now.getTime() + 15 * 60_000),
          version: sql`version + 1`,
        })
        .where(eq(calendarConnections.id, connection.id))

      calendarSyncAge.labels('ics').set(0)
      return { ...result, connectionState: 'active' }
    } catch (error) {
      // INV-012: Ein Fehler markiert die Verbindung – er verändert keine fachlichen Objekte.
      const failures = connection.consecutiveFailures + 1
      const state = failures >= 3 ? 'degraded' : connection.state
      const backoffMinutes = Math.min(360, 15 * 2 ** Math.min(failures, 5))

      await tx
        .update(calendarConnections)
        .set({
          state,
          consecutiveFailures: failures,
          lastErrorCode: error instanceof Error ? error.name : 'unknown_error',
          nextSyncAt: new Date(now.getTime() + backoffMinutes * 60_000),
          version: sql`version + 1`,
        })
        .where(eq(calendarConnections.id, connection.id))

      calendarSyncFailures.labels('ics', error instanceof Error ? error.name : 'unknown').inc()
      return { upserted: 0, cancelled: 0, skippedBySequence: 0, connectionState: state }
    }
  })
}

async function applyEvents(
  tx: Tx,
  householdId: string,
  connectionId: string,
  events: readonly IcsEvent[],
  actor: ReturnType<typeof integrationActor>,
  now: Date,
): Promise<{ upserted: number; cancelled: number; skippedBySequence: number }> {
  const selections = await tx
    .select()
    .from(calendarSelections)
    .where(eq(calendarSelections.connectionId, connectionId))
  const calendarId = selections[0]?.externalCalendarId ?? 'primary'

  let upserted = 0
  let skippedBySequence = 0
  const seen = new Set<string>()

  for (const event of events) {
    const key = `${event.uid}|${event.recurrenceId}`
    seen.add(key)

    const [existing] = await tx
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.connectionId, connectionId),
          eq(calendarEvents.externalCalendarId, calendarId),
          eq(calendarEvents.externalId, event.uid),
          eq(calendarEvents.recurrenceId, event.recurrenceId),
        ),
      )
      .limit(1)

    if (existing && event.sequence < existing.sequence) {
      // Verspätete Zustellung einer älteren Version – bewusst verwerfen (docs/09 §7).
      skippedBySequence += 1
      continue
    }

    const values = {
      householdId,
      connectionId,
      externalCalendarId: calendarId,
      externalId: event.uid,
      recurrenceId: event.recurrenceId,
      sequence: event.sequence,
      title: event.summary,
      location: event.location,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timeZone: event.timeZone,
      allDay: event.allDay,
      rrule: event.rrule,
      exdates: event.exdates,
      state: event.status,
      lastSeenAt: now,
    }

    if (existing) {
      await tx
        .update(calendarEvents)
        .set({ ...values, version: sql`version + 1` })
        .where(eq(calendarEvents.id, existing.id))
    } else {
      const [created] = await tx.insert(calendarEvents).values(values).returning({ id: calendarEvents.id })
      await recordEvent(tx, householdId, actor, {
        eventType: 'calendar.event_upserted',
        subjectType: 'calendar_event',
        subjectId: created!.id,
        // Termintitel sind Klasse-D-Daten und gehören nicht in den Ledger (docs/05 §1).
        payload: { externalId: event.uid, startsAt: event.startsAt.toISOString() },
      })
    }
    upserted += 1
  }

  // Reconciliation: lokal vorhandene, extern verschwundene Termine werden storniert –
  // niemals gelöscht (INV-012).
  const local = await tx
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.connectionId, connectionId), sql`${calendarEvents.state} <> 'cancelled'`))

  let cancelled = 0
  for (const row of local) {
    if (seen.has(`${row.externalId}|${row.recurrenceId}`)) continue
    await tx
      .update(calendarEvents)
      .set({ state: 'cancelled', version: sql`version + 1` })
      .where(eq(calendarEvents.id, row.id))
    await recordEvent(tx, householdId, actor, {
      eventType: 'calendar.event_cancelled',
      subjectType: 'calendar_event',
      subjectId: row.id,
      payload: { externalId: row.externalId, reason: 'extern nicht mehr vorhanden' },
    })
    cancelled += 1
  }

  return { upserted, cancelled, skippedBySequence }
}
