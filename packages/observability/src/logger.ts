import { AsyncLocalStorage } from 'node:async_hooks'
import pino, { type Logger } from 'pino'
import { redact } from './redact.js'

export interface RequestContext {
  requestId: string
  correlationId: string
  userId?: string
  householdId?: string
  membershipId?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

export const runWithContext = <T>(ctx: RequestContext, fn: () => T): T => storage.run(ctx, fn)
export const currentContext = (): RequestContext | undefined => storage.getStore()

export interface LoggerOptions {
  level: string
  service: string
  version: string
  env: string
  pretty?: boolean
}

export function createLogger(opts: LoggerOptions): Logger {
  return pino({
    level: opts.level,
    base: { service: opts.service, version: opts.version, env: opts.env },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Die Allowlist läuft als Serializer über jedes Objekt, bevor es geschrieben wird.
    formatters: {
      level: (label) => ({ level: label }),
      log: (obj) => {
        const ctx = currentContext()
        const merged = ctx ? { requestId: ctx.requestId, correlationId: ctx.correlationId, ...obj } : obj
        return redact(merged) as Record<string, unknown>
      },
    },
    ...(opts.pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  })
}
