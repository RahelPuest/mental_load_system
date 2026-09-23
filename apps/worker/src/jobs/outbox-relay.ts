import { eq, sql } from 'drizzle-orm'
import { outboxEvents, withoutTenant, type Database } from '@thealotta/db'
import { outboxLagSeconds, outboxPending } from '@thealotta/observability'

export interface RelayTarget {
  publish(topic: string, payload: Record<string, unknown>): Promise<void>
}

export interface RelayResult {
  published: number
  failed: number
  dead: number
}

const MAX_ATTEMPTS = 20

/**
 * ADR-0007 – Transaktionale Outbox.
 *
 * Der Relay ist der einzige Job, der haushaltsübergreifend arbeitet: er transportiert Events,
 * ohne ihren Inhalt zu interpretieren. `FOR UPDATE SKIP LOCKED` erlaubt beliebig viele
 * parallele Relays ohne Doppelzustellung.
 */
export async function relayOutbox(db: Database, target: RelayTarget, batchSize = 100): Promise<RelayResult> {
  const result: RelayResult = { published: 0, failed: 0, dead: 0 }

  await withoutTenant(db, 'outbox_relay_is_cross_tenant_by_design', async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, topic, payload, attempt_count, correlation_id, household_id
      FROM outbox_events
      WHERE state = 'pending' AND available_at <= now()
      ORDER BY available_at
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `)

    const list = rows as unknown as {
      id: string
      topic: string
      payload: Record<string, unknown>
      attempt_count: number
      correlation_id: string
      household_id: string
    }[]

    for (const row of list) {
      try {
        await target.publish(row.topic, { ...row.payload, correlationId: row.correlation_id })
        await tx
          .update(outboxEvents)
          .set({ state: 'published', publishedAt: new Date() })
          .where(eq(outboxEvents.id, row.id))
        result.published += 1
      } catch (error) {
        const attempts = row.attempt_count + 1
        const dead = attempts >= MAX_ATTEMPTS
        // Exponentielles Backoff mit Deckel; das Event bleibt in der Tabelle – kein Verlust.
        const delaySeconds = Math.min(3600, 2 ** Math.min(attempts, 12))
        await tx
          .update(outboxEvents)
          .set({
            state: dead ? 'dead' : 'pending',
            attemptCount: attempts,
            availableAt: new Date(Date.now() + delaySeconds * 1000),
            lastError: error instanceof Error ? error.message.slice(0, 500) : 'unbekannter Fehler',
          })
          .where(eq(outboxEvents.id, row.id))
        if (dead) result.dead += 1
        else result.failed += 1
      }
    }
  })

  await updateLagMetrics(db)
  return result
}

async function updateLagMetrics(db: Database): Promise<void> {
  await withoutTenant(db, 'outbox_metrics_are_global', async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT count(*)::int AS pending,
             coalesce(extract(epoch FROM now() - min(created_at)), 0)::float AS lag_seconds
      FROM outbox_events WHERE state = 'pending'
    `)) as unknown as { pending: number; lag_seconds: number }[]
    outboxPending.set(rows[0]?.pending ?? 0)
    outboxLagSeconds.set(rows[0]?.lag_seconds ?? 0)
  })
}

/** Idempotenz-Sperre für Outbox-Konsumenten: (consumer, event_id) ist eindeutig. */
export async function markProcessed(db: Database, consumer: string, eventId: string): Promise<boolean> {
  return withoutTenant(db, 'processed_events_are_global', async (tx) => {
    const inserted = await tx.execute(sql`
      INSERT INTO processed_events (consumer_name, event_id) VALUES (${consumer}, ${eventId})
      ON CONFLICT DO NOTHING RETURNING consumer_name
    `)
    return (inserted as unknown as unknown[]).length > 0
  })
}
