import { createHash } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { DomainError } from '@thealotta/domain'
import { idempotencyKeys, type Database } from '@thealotta/db'

/**
 * docs/09 §6: Zwei Taps auf „Speichern" in der U-Bahn erzeugen einen Eintrag.
 *
 * Ablauf:
 *   1. Schlüssel reservieren (INSERT ... ON CONFLICT DO NOTHING)
 *   2. bereits vorhanden + gleicher Inhalt + Antwort da  → gespeicherte Antwort
 *   3. bereits vorhanden + gleicher Inhalt + keine Antwort → 409 request_in_flight
 *   4. bereits vorhanden + anderer Inhalt                 → 422 idempotency_key_reused
 */
export interface IdempotencyOutcome<T> {
  replayed: boolean
  statusCode: number
  body: T
}

export async function withIdempotency<T>(
  db: Database,
  key: string | undefined,
  scope: { householdId?: string | null; userId?: string | null; body: unknown },
  handler: () => Promise<{ statusCode: number; body: T }>,
): Promise<IdempotencyOutcome<T>> {
  if (!key) {
    const result = await handler()
    return { replayed: false, ...result }
  }

  const requestHash = createHash('sha256').update(JSON.stringify(scope.body ?? null)).digest('hex')
  const expiresAt = new Date(Date.now() + 24 * 3_600_000)

  const inserted = await db
    .insert(idempotencyKeys)
    .values({
      key,
      householdId: scope.householdId ?? null,
      userId: scope.userId ?? null,
      requestHash,
      expiresAt,
    })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key })

  if (inserted.length === 0) {
    const [existing] = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key)).limit(1)
    if (!existing) throw new DomainError('request_in_flight', 409, 'Diese Anfrage wird gerade verarbeitet.')
    if (existing.requestHash !== requestHash) {
      throw new DomainError(
        'idempotency_key_reused',
        422,
        'Dieser Idempotency-Key wurde bereits mit anderem Inhalt verwendet.',
      )
    }
    if (existing.statusCode === null) {
      throw new DomainError('request_in_flight', 409, 'Diese Anfrage wird gerade verarbeitet.')
    }
    return { replayed: true, statusCode: existing.statusCode, body: existing.responseBody as T }
  }

  try {
    const result = await handler()
    await db
      .update(idempotencyKeys)
      .set({ statusCode: result.statusCode, responseBody: (result.body ?? null) as never })
      .where(eq(idempotencyKeys.key, key))
    return { replayed: false, ...result }
  } catch (error) {
    // Fehlgeschlagene Anfragen dürfen nicht „idempotent fehlschlagen" – der Schlüssel wird frei.
    await db.delete(idempotencyKeys).where(and(eq(idempotencyKeys.key, key), sql`status_code IS NULL`))
    throw error
  }
}
