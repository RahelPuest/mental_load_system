import type { FastifyReply, FastifyRequest } from 'fastify'
import { withTenant, type Database, type Tx } from '@thealotta/db'
import { badRequest, type ActorContext, type EffectiveContext } from '@thealotta/domain'
import type { ZodTypeAny, z } from 'zod'
import { loadEffectiveContext } from '@thealotta/services'

export interface HandlerContext {
  tx: Tx
  ctx: EffectiveContext
  now: Date
  request: FastifyRequest
}

export interface RouteDeps {
  db: Database
  clock: () => Date
}

/**
 * Einheitliches Muster für jede fachliche Route (docs/20 §3):
 *   Tenant-Kontext setzen → Berechtigungskontext laden → Handler → alles in EINER Transaktion.
 *
 * Dadurch kann keine Route vergessen, den Tenant zu setzen oder Events außerhalb der
 * Transaktion zu schreiben.
 */
/**
 * Die Antwort darf den Client erst erreichen, wenn die Transaktion wirklich festgeschrieben
 * ist.
 *
 * Vorher rief jeder Handler `reply.send()` **innerhalb** der Transaktion auf. Fastify
 * schickt die Antwort dann sofort – noch vor dem COMMIT. Zwei Folgen:
 *
 *  1. Scheitert das COMMIT, hat der Client bereits „201 Created" gelesen, obwohl nichts
 *     gespeichert wurde. Genau das schließt INV-001 aus: nichts geht still verloren.
 *  2. Ein unmittelbar folgender Aufruf sieht die eigene Schreiboperation noch nicht.
 *     Unter Last war das reproduzierbar – die Integrationstests haben es als sprunghafte
 *     404er und veraltete Werte gezeigt (docs/44, Befund C3).
 *
 * Deshalb wird `send` für die Dauer der Transaktion gepuffert und erst danach ausgeführt.
 */
export async function inHousehold<T>(
  deps: RouteDeps,
  request: FastifyRequest,
  reply: FastifyReply,
  handler: (c: HandlerContext) => Promise<T>,
): Promise<T> {
  const user = request.user
  if (!user) throw badRequest('unauthenticated', 'Nicht angemeldet.')
  const householdId = (request.params as { householdId?: string }).householdId
  if (!householdId) throw badRequest('validation_failed', 'Haushalt fehlt im Pfad.')

  const now = deps.clock()
  const actor: ActorContext = {
    kind: 'user',
    userId: user.userId,
    membershipId: null,
    correlationId: request.correlationId,
  }

  /*
   * Fastifys `Reply` ist ein Thenable: `await reply` wartet darauf, dass die Antwort den
   * Client erreicht hat. Handler schreiben `return reply.send(...)`, und dieses Objekt
   * wurde bisher zum Rückgabewert der Transaktion – wodurch die Transaktion auf das
   * Absenden wartete und das Absenden damit *vor* dem COMMIT erzwang.
   *
   * Deshalb zwei Dinge: `send` puffert nur, und der Ersatz gibt eine schlichte Marke
   * zurück statt des Reply-Objekts. So kann kein Thenable in die Transaktion geraten.
   */
  const realSend = reply.send.bind(reply)
  const SENT = Object.freeze({ __thealottaDeferredSend: true })
  let buffered: [unknown] | null = null
  const stub = ((body?: unknown) => {
    buffered = [body]
    return SENT
  }) as unknown as typeof reply.send
  reply.send = stub

  try {
    const wrapped = await withTenant(deps.db, [householdId], async (tx) => {
      const ctx = await loadEffectiveContext(tx, actor, householdId, user.userId, now)
      return { value: await handler({ tx, ctx, now, request }) }
    })
    reply.send = realSend
    if (buffered) {
      // Ab hier ist festgeschrieben; erst jetzt erfährt der Client davon.
      realSend((buffered as [unknown])[0])
      // Fastify darf danach nichts mehr senden wollen.
      return undefined as T
    }
    return wrapped.value
  } catch (error) {
    reply.send = realSend
    throw error
  }
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data)
}

export const created = (reply: FastifyReply, body: unknown) => reply.status(201).send(body)
