import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import { createDb, type Database } from '@thealotta/db'
import { EnvKeyProvider } from '@thealotta/crypto'
import {
  AgendaService,
  AuthService,
  AttentionService,
  CalendarService,
  ColorService,
  CapacityService,
  CoverageService,
  BringClient,
  BringService,
  TransferService,
  DomainService,
  FamilyService,
  HouseholdService,
  IntakeService,
  InvitationService,
  KnowledgeService,
  MealService,
  MonitorService,
  NowService,
  PlanningService,
  SearchService,
  SettingsService,
  StateService,
  WorkService,
} from '@thealotta/services'
import { createLogger, httpRequestDuration, registry } from '@thealotta/observability'
import { authPlugin } from './plugins/auth.js'
import { requestContextPlugin } from './plugins/request-context.js'
import { sendProblem, toProblem } from './lib/problem.js'
import { authRoutes } from './routes/auth.routes.js'
import { householdRoutes } from './routes/household.routes.js'
import { workRoutes } from './routes/work.routes.js'
import { governanceRoutes } from './routes/governance.routes.js'
import { familyRoutes } from './routes/family.routes.js'
import { mealRoutes } from './routes/meal.routes.js'
import { joinRoutes } from './routes/join.routes.js'
import { settingsRoutes } from './routes/settings.routes.js'
import type { Env } from './env.js'

export interface AppOptions {
  env: Env
  db?: Database
  /** Injizierbare Uhr: Tests springen Wochen vorwärts, ohne zu warten (docs/26 §4). */
  clock?: () => Date
  /** Wird für jede registrierte Route aufgerufen – der Isolationstest leitet daraus seine Abdeckung ab. */
  onRoute?: (route: { method: string | string[]; url: string }) => void
}

export interface BuiltApp {
  app: FastifyInstance
  db: Database
  close(): Promise<void>
}

export async function buildApp(opts: AppOptions): Promise<BuiltApp> {
  const { env } = opts
  const handle = opts.db ? null : createDb(env.DATABASE_URL, { max: env.DATABASE_POOL_MAX, onnotice: false })
  const db = opts.db ?? handle!.db
  const clock = opts.clock ?? (() => new Date())

  const logger = createLogger({
    level: env.LOG_LEVEL,
    service: env.SERVICE_NAME,
    version: process.env['GIT_SHA'] ?? 'dev',
    env: env.NODE_ENV,
  })

  const app = Fastify({
    loggerInstance: logger as unknown as FastifyBaseLogger,
    trustProxy: true,
    bodyLimit: 1_048_576,
    disableRequestLogging: env.NODE_ENV === 'test',
  })

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })

  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  if (origins.length > 0) {
    await app.register(cors, { origin: origins, credentials: true, exposedHeaders: ['etag', 'x-request-id'] })
  }

  await app.register(cookie)
  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_GLOBAL_PER_MIN,
    timeWindow: '1 minute',
    // Quick Capture ist der letzte Endpunkt, der abgeschaltet würde (docs/24 §6).
    allowList: () => false,
  })

  await app.register(requestContextPlugin)
  await app.register(authPlugin, { db, cookieSecure: env.COOKIE_SECURE })

  if (opts.onRoute) {
    app.addHook('onRoute', (route) => opts.onRoute!({ method: route.method, url: route.url }))
  }

  app.setErrorHandler((error, request, reply) => {
    const problem = toProblem(error, request)
    if (problem.status >= 500) request.log.error({ err: error }, 'unbehandelter Fehler')
    else request.log.info({ code: problem.code, statusCode: problem.status }, 'Anfrage abgelehnt')
    return sendProblem(reply, problem)
  })

  app.addHook('onResponse', (request, reply, done) => {
    httpRequestDuration
      .labels(request.routeOptions.url ?? 'unknown', request.method, String(reply.statusCode))
      .observe(reply.elapsedTime / 1000)
    done()
  })

  // Schlüsselanbieter für die Verschlüsselung von Kalender-Zugangsdaten (docs/22 §9).
  const keyProvider = new EnvKeyProvider(env.ENCRYPTION_KEYS, env.ENCRYPTION_ACTIVE_KEY_ID)
  const authService = new AuthService(db, env.SESSION_TTL_DAYS)
  const services = {
    domains: new DomainService(),
    state: new StateService(),
    monitors: new MonitorService(),
    attention: new AttentionService(),
    work: new WorkService(),
    now: new NowService(),
    intake: new IntakeService(),
    capacity: new CapacityService(),
    coverage: new CoverageService(),
    transfer: new TransferService(),
    /*
      `fetch` wird bei jedem Aufruf frisch geholt, nicht einmal beim Start gebunden. Sonst
      hinge die Anbindung an genau der Funktion, die zum Startzeitpunkt da war – und ließe
      sich im Test nicht ersetzen, ohne den echten Dienst anzurufen.
    */
    bring: new BringService(keyProvider, new BringClient((url, init) => fetch(url, init as never) as never)),
    knowledge: new KnowledgeService(),
    meals: new MealService(),
    settings: new SettingsService(),
    colors: new ColorService(),
    calendar: new CalendarService(keyProvider),
    search: new SearchService(),
    family: new FamilyService(),
    invitations: new InvitationService(db),
    planning: new PlanningService(),
  }
  const routeDeps = { db, clock }

  // Tagesrotierendes Salt: IP-Hashes lassen sich nicht über Tage hinweg korrelieren.
  const ipSalt = () => `${env.SESSION_SECRETS.slice(0, 16)}:${new Date().toISOString().slice(0, 10)}`

  await app.register(
    async (scope) => {
      await scope.register(authRoutes, {
        auth: authService,
        cookieSecure: env.COOKIE_SECURE,
        sessionTtlDays: env.SESSION_TTL_DAYS,
        ipSalt,
      })
      await scope.register(householdRoutes, { ...routeDeps, households: new HouseholdService(db), domains: services.domains })
      await scope.register(workRoutes, { ...routeDeps, ...services })
      await scope.register(settingsRoutes, {
        ...routeDeps,
        settings: services.settings,
        colors: services.colors,
        calendar: services.calendar,
        search: services.search,
        agenda: new AgendaService(services.calendar),
        planning: services.planning,
        vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null,
        bring: services.bring,
      })
      await scope.register(familyRoutes, { ...routeDeps, family: services.family, invitations: services.invitations })
      await scope.register(mealRoutes, { ...routeDeps, meals: services.meals, bring: services.bring })
      await scope.register(joinRoutes, { invitations: services.invitations, auth: authService, clock })
      await scope.register(governanceRoutes, {
        ...routeDeps,
        domains: services.domains,
        capacity: services.capacity,
        coverage: services.coverage,
        transfer: services.transfer,
      })
    },
    { prefix: '/api/v1' },
  )

  // Für Tests und Diagnose: die Datenbankinstanz ist am App-Objekt erreichbar.
  app.decorate('db', db)

  app.get('/health/live', async () => ({ status: 'ok' }))
  app.get('/health/ready', async (_request, reply) => {
    try {
      await db.execute('SELECT 1')
      return { status: 'ok', database: 'ok' }
    } catch {
      return reply.status(503).send({ status: 'degraded', database: 'unreachable' })
    }
  })
  app.get('/metrics', async (_request, reply) =>
    reply.type(registry.contentType).send(await registry.metrics()),
  )

  return {
    app,
    db,
    close: async () => {
      await app.close()
      if (handle) await handle.close()
    },
  }
}
