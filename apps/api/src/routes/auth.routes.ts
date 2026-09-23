import type { FastifyInstance } from 'fastify'
import { hashIp } from '@thealotta/crypto'
import { loginBody, passwordResetConfirmBody, passwordResetRequestBody, registerBody } from '@thealotta/contracts'
import {
  CSRF_COOKIE,
  LEGACY_CSRF_COOKIE,
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  readSessionCookie,
} from '../plugins/auth.js'
import { AuthService } from '@thealotta/services'

export interface AuthRoutesDeps {
  auth: AuthService
  cookieSecure: boolean
  sessionTtlDays: number
  /** Rotiert täglich – IP-Adressen werden nie im Klartext gespeichert (docs/11 §6). */
  ipSalt: () => string
}

export async function authRoutes(app: FastifyInstance, deps: AuthRoutesDeps): Promise<void> {
  const cookieOptions = (maxAgeDays: number) => ({
    httpOnly: true,
    secure: deps.cookieSecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeDays * 86_400,
  })

  app.post('/auth/register', async (request, reply) => {
    const body = registerBody.parse(request.body)
    const result = await deps.auth.register(body)
    return reply.status(201).send({ userId: result.userId })
  })

  app.post('/auth/login', async (request, reply) => {
    const body = loginBody.parse(request.body)
    const meta = {
      ipHash: request.ip ? hashIp(request.ip, deps.ipSalt()) : undefined,
      userAgentHash: request.headers['user-agent'] ? hashIp(String(request.headers['user-agent']), deps.ipSalt()) : undefined,
    }
    const { session } = await deps.auth.login(body, meta)

    reply.setCookie(SESSION_COOKIE, session.token, cookieOptions(deps.sessionTtlDays))
    // Bewusst lesbar: Double-Submit-CSRF braucht den Wert im JavaScript des Clients.
    reply.setCookie(CSRF_COOKIE, session.csrfToken, { ...cookieOptions(deps.sessionTtlDays), httpOnly: false })
    /* Der alte Name geht mit demselben Zug weg – zwei Merkmale wären zwei Wahrheiten. */
    reply.clearCookie(LEGACY_SESSION_COOKIE, { path: '/' })
    reply.clearCookie(LEGACY_CSRF_COOKIE, { path: '/' })
    return reply.send({ ok: true, csrfToken: session.csrfToken, expiresAt: session.expiresAt.toISOString() })
  })

  app.post('/auth/refresh', async (request, reply) => {
    const token = readSessionCookie(request)
    if (!token) return reply.status(401).send({ code: 'unauthenticated' })
    const meta = { ipHash: request.ip ? hashIp(request.ip, deps.ipSalt()) : undefined }
    const session = await deps.auth.rotate(token, meta)
    reply.setCookie(SESSION_COOKIE, session.token, cookieOptions(deps.sessionTtlDays))
    reply.setCookie(CSRF_COOKIE, session.csrfToken, { ...cookieOptions(deps.sessionTtlDays), httpOnly: false })
    /* Der alte Name geht mit demselben Zug weg – zwei Merkmale wären zwei Wahrheiten. */
    reply.clearCookie(LEGACY_SESSION_COOKIE, { path: '/' })
    reply.clearCookie(LEGACY_CSRF_COOKIE, { path: '/' })
    return reply.send({ ok: true, csrfToken: session.csrfToken })
  })

  app.post('/auth/logout', async (request, reply) => {
    const token = readSessionCookie(request)
    if (token) await deps.auth.logout(token)
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    reply.clearCookie(CSRF_COOKIE, { path: '/' })
    /* Auch die Namen von vor der Umbenennung – sonst bliebe ein totes Merkmal im Browser. */
    reply.clearCookie(LEGACY_SESSION_COOKIE, { path: '/' })
    reply.clearCookie(LEGACY_CSRF_COOKIE, { path: '/' })
    return reply.send({ ok: true })
  })

  app.post('/auth/password-reset/request', async (request, reply) => {
    const body = passwordResetRequestBody.parse(request.body)
    const result = await deps.auth.requestPasswordReset(body.email)
    // Immer 202: die API verrät nicht, ob es das Konto gibt.
    return reply.status(202).send({ ok: true, ...(process.env['NODE_ENV'] === 'test' && result ? { token: result.token } : {}) })
  })

  app.post('/auth/password-reset/confirm', async (request, reply) => {
    const body = passwordResetConfirmBody.parse(request.body)
    await deps.auth.confirmPasswordReset(body.token, body.password)
    return reply.send({ ok: true })
  })

  app.get('/auth/me', async (request, reply) => {
    const user = await app.authenticate(request)
    const memberships = await deps.auth.memberships(user.userId)
    return reply.send({
      user: { id: user.userId, displayName: user.displayName, email: user.email },
      memberships,
    })
  })
}
