import { and, eq, gt, isNull } from 'drizzle-orm'
import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { DomainError } from '@thealotta/domain'
import { hashToken, safeEqual } from '@thealotta/crypto'
import { userSessions, users, type Database } from '@thealotta/db'

export const SESSION_COOKIE = 'thealotta_session'
export const CSRF_COOKIE = 'thealotta_csrf'
export const CSRF_HEADER = 'x-csrf-token'

/**
 * Die Namen von vor der Umbenennung (§24).
 *
 * Sie werden noch **gelesen**, nie mehr geschrieben. Ohne diesen Umzug wäre jede offene
 * Sitzung mit dem Update beendet gewesen: Der Browser hätte weiter `mira_session` gesendet,
 * der Server hätte nach `thealotta_session` gesucht und alle ausgeloggt. Eine Umbenennung ist
 * das nicht wert.
 *
 * Beim ersten Aufruf, der Sitzungsdaten schreibt, setzt der Server den neuen Namen und löscht
 * den alten – danach ist der Zustand sauber. Diese beiden Zeilen dürfen weg, sobald keine
 * Sitzung von vor der Umbenennung mehr gültig sein kann (Sitzungsdauer: `SESSION_TTL_DAYS`).
 */
export const LEGACY_SESSION_COOKIE = 'mira_session'
export const LEGACY_CSRF_COOKIE = 'mira_csrf'

/** Das Sitzungsmerkmal – unter neuem Namen, sonst unter dem alten. */
export function readSessionCookie(request: FastifyRequest): string | undefined {
  return request.cookies[SESSION_COOKIE] ?? request.cookies[LEGACY_SESSION_COOKIE]
}

export function readCsrfCookie(request: FastifyRequest): string | undefined {
  return request.cookies[CSRF_COOKIE] ?? request.cookies[LEGACY_CSRF_COOKIE]
}

export interface AuthenticatedUser {
  userId: string
  sessionId: string
  familyId: string
  displayName: string
  email: string
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export interface AuthPluginOptions {
  db: Database
  cookieSecure: boolean
}

async function plugin(app: FastifyInstance, opts: AuthPluginOptions): Promise<void> {
  app.decorateRequest('user', undefined)

  /**
   * Double-Submit-CSRF zusätzlich zu SameSite=Lax.
   * SameSite allein schützt nicht gegen alle Browser-/Proxy-Konstellationen.
   */
  app.addHook('onRequest', async (request) => {
    if (!MUTATING.has(request.method)) return
    if (request.url.startsWith('/api/v1/auth/login') || request.url.startsWith('/api/v1/auth/register')) return
    if (!readSessionCookie(request)) return // unauthentifiziert: nichts zu schützen

    const cookie = readCsrfCookie(request)
    const header = request.headers[CSRF_HEADER]
    if (!cookie || typeof header !== 'string' || !safeEqual(cookie, header)) {
      throw new DomainError('forbidden', 403, 'CSRF-Token fehlt oder stimmt nicht überein.')
    }
  })

  app.decorate('authenticate', async (request: FastifyRequest): Promise<AuthenticatedUser> => {
    const token = readSessionCookie(request)
    if (!token) throw new DomainError('unauthenticated', 401, 'Bitte anmelden.')

    const now = new Date()
    const [row] = await opts.db
      .select({
        sessionId: userSessions.id,
        familyId: userSessions.familyId,
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        status: users.status,
      })
      .from(userSessions)
      .innerJoin(users, eq(users.id, userSessions.userId))
      .where(
        and(
          eq(userSessions.refreshTokenHash, hashToken(token)),
          isNull(userSessions.revokedAt),
          gt(userSessions.expiresAt, now),
        ),
      )
      .limit(1)

    if (!row || row.status !== 'active') throw new DomainError('unauthenticated', 401, 'Sitzung ist abgelaufen.')

    const user: AuthenticatedUser = {
      userId: row.userId,
      sessionId: row.sessionId,
      familyId: row.familyId,
      displayName: row.displayName,
      email: row.email,
    }
    request.user = user
    return user
  })

  void opts.cookieSecure
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest): Promise<AuthenticatedUser>
  }
}

/** Ohne fastify-plugin wären `authenticate` und der CSRF-Hook nur in diesem Scope sichtbar. */
export const authPlugin = fp(plugin, { name: 'auth', dependencies: ['request-context'] })
