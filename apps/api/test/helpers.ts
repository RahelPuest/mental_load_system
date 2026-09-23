import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { createDb, type DbHandle } from '@thealotta/db'
import { FixedClock } from '@thealotta/domain'
import { prepareTestDatabase, TEST_URL, truncateAll } from '../../../packages/db/test/setup.js'
import { apiEnvSchema, parseEnv } from '@thealotta/contracts'

export const TEST_ENV_SOURCE: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: process.env['TEST_LOG_LEVEL'] ?? 'silent',
  SERVICE_NAME: 'thealotta-api-test',
  DATABASE_URL: TEST_URL,
  DATABASE_POOL_MAX: '5',
  ENCRYPTION_KEYS: '{"k1":"ZGV2ZWxvcG1lbnRfb25seV9rZXlfMzJfYnl0ZXNfISE="}',
  ENCRYPTION_ACTIVE_KEY_ID: 'k1',
  SESSION_SECRETS: 'test_secret_that_is_definitely_long_enough_1234',
  COOKIE_SECURE: 'false',
  CORS_ORIGINS: '',
  PORT: '0',
}

export interface Session {
  cookies: string
  csrfToken: string
  userId: string
  email: string
}

/**
 * Testumgebung mit kontrollierter Uhr.
 *
 * Freshness-, Monitoring- und Vertretungslogik sind zeitabhängig; ohne steuerbare Zeit wären
 * die zentralen Szenarien nicht deterministisch testbar (docs/26 §4).
 */
export interface RegisteredRoute {
  method: string
  url: string
}

export class Harness {
  readonly clock = new FixedClock(new Date('2026-09-07T08:00:00.000Z'))
  app!: FastifyInstance
  /** Alle tatsächlich registrierten Routen – Grundlage des Tenant-Isolationstests. */
  readonly routes: RegisteredRoute[] = []
  private handle!: DbHandle
  private close!: () => Promise<void>

  async start(): Promise<void> {
    await prepareTestDatabase()
    this.handle = createDb(TEST_URL, { max: 5, onnotice: false })
    const built = await buildApp({
      env: parseEnv(apiEnvSchema, TEST_ENV_SOURCE),
      db: this.handle.db,
      clock: () => this.clock.now(),
      onRoute: (route) => {
        const methods = Array.isArray(route.method) ? route.method : [route.method]
        for (const m of methods) this.routes.push({ method: m, url: route.url })
      },
    })
    this.app = built.app
    this.close = async () => {
      await built.app.close()
      await this.handle.close()
    }
    await this.app.ready()
  }

  async stop(): Promise<void> {
    await this.close?.()
  }

  async reset(): Promise<void> {
    await truncateAll()
  }

  async register(email: string, displayName: string, password = 'Korrekt-Pferd-Batterie-Klammer-7'): Promise<Session> {
    const registerResponse = await this.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password, displayName },
    })
    if (registerResponse.statusCode !== 201) {
      throw new Error(`Registrierung fehlgeschlagen: ${registerResponse.statusCode} ${registerResponse.body}`)
    }
    const userId = registerResponse.json<{ userId: string }>().userId

    const loginResponse = await this.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    })
    if (loginResponse.statusCode !== 200) {
      throw new Error(`Login fehlgeschlagen: ${loginResponse.statusCode} ${loginResponse.body}`)
    }
    const setCookies = loginResponse.headers['set-cookie']
    const cookieList = Array.isArray(setCookies) ? setCookies : [setCookies ?? '']
    const cookies = cookieList.map((c) => String(c).split(';')[0]).join('; ')

    return { cookies, csrfToken: loginResponse.json<{ csrfToken: string }>().csrfToken, userId, email }
  }

  request(session: Session | null, method: string, url: string, payload?: unknown) {
    const headers: Record<string, string> = {}
    if (session) {
      headers['cookie'] = session.cookies
      headers['x-csrf-token'] = session.csrfToken
    }
    // Content-Type nur setzen, wenn wirklich ein Body mitgeht – sonst lehnt Fastify ab.
    if (payload !== undefined) headers['content-type'] = 'application/json'
    return this.app.inject({ method: method as never, url, payload: payload as never, headers })
  }

  async json<T>(session: Session | null, method: string, url: string, payload?: unknown): Promise<T> {
    const response = await this.request(session, method, url, payload)
    if (response.statusCode >= 400) {
      throw new Error(`${method} ${url} → ${response.statusCode}: ${response.body}`)
    }
    return response.json<T>()
  }
}

/**
 * Je Prozess eindeutig. Testdateien laufen parallel und teilen sich eine Datenbank;
 * ein globales TRUNCATE würde die Fixtures der Nachbardateien wegräumen. Eindeutige
 * Identitäten sind der robustere Weg als Aufräumen.
 */
const RUN_ID = `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** Legt einen Haushalt mit zwei Erwachsenen an – die Ausgangslage fast aller Szenarien. */
export async function familyFixture(h: Harness, label = 'family') {
  const suffix = `${label}-${RUN_ID}`
  const anna = await h.register(`anna-${suffix}@example.invalid`, 'Anna')
  const ben = await h.register(`ben-${suffix}@example.invalid`, 'Ben')

  const household = await h.json<{ householdId: string; membershipId: string }>(anna, 'POST', '/api/v1/households', {
    name: `Familie ${suffix}`,
    timezone: 'Europe/Berlin',
    template: 'none',
  })

  // Ben tritt bei: im Test direkt über die Datenbank, weil der Einladungsfluss E-Mail braucht.
  const { householdMemberships, uuidv7, withTenant } = await import('@thealotta/db')
  const benMembershipId = uuidv7()
  await withTenant(h.app.db, [household.householdId], async (tx) => {
    await tx.insert(householdMemberships).values({
      id: benMembershipId,
      householdId: household.householdId,
      userId: ben.userId,
      displayName: 'Ben',
      role: 'adult',
      status: 'active',
    })
  })

  return {
    anna,
    ben,
    householdId: household.householdId,
    annaMembershipId: household.membershipId,
    benMembershipId,
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    db: import('@thealotta/db').Database
  }
}
