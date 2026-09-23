import { Queue, Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { createDb } from '@thealotta/db'
import { loadDotEnvForDevelopment, parseEnv, workerEnvSchema } from '@thealotta/contracts'
import { createLogger, jobAttempts, jobDuration } from '@thealotta/observability'
import { relayOutbox } from './jobs/outbox-relay.js'
import {
  monitorEvaluateInput,
  runMaintenance,
  scanDueMonitors,
  scanHouseholdsNeedingMaintenance,
} from './jobs/maintenance.js'
import { evaluateMonitorJob, type MonitorEvaluateInput } from './jobs/monitor-evaluate.js'
import { dispatchNotifications } from './jobs/notification-dispatch.js'
import { syncIcsConnection } from './jobs/calendar-sync.js'
import { safeFetchText } from './calendar/safe-fetch.js'
import { emailSender, inAppSender, pushSender } from './senders.js'
import type { ChannelSender } from './jobs/notification-dispatch.js'

loadDotEnvForDevelopment()
const env = parseEnv(workerEnvSchema)
const logger = createLogger({
  level: env.LOG_LEVEL,
  service: 'thealotta-worker',
  version: process.env['GIT_SHA'] ?? 'dev',
  env: env.NODE_ENV,
})

const handle = createDb(env.DATABASE_URL, { max: env.DATABASE_POOL_MAX, onnotice: false })
const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })

/**
 * Zwei Ebenen (docs/10, Scheduling-Modell):
 *   1. Scanner-Jobs finden *fällige Arbeit* über einen Index,
 *   2. Einheiten-Jobs erledigen sie.
 * Damit skaliert das System mit der Menge fälliger Arbeit, nicht mit der Zahl der Haushalte.
 */
const queues = {
  default: new Queue('default', { connection }),
  sync: new Queue('sync', { connection }),
  notify: new Queue('notify', { connection }),
}

const senders: ChannelSender[] = [inAppSender]
if (env.SMTP_URL) senders.push(emailSender(handle.db, env.SMTP_URL, env.SMTP_FROM))
if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  senders.push(
    pushSender(handle.db, {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT,
    }),
  )
}

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 7 * 86_400 },
}

async function instrument<T>(queue: string, name: string, fn: () => Promise<T>): Promise<T> {
  const end = jobDuration.labels(queue, name).startTimer()
  try {
    const result = await fn()
    jobAttempts.labels(queue, name, 'success').inc()
    return result
  } catch (error) {
    jobAttempts.labels(queue, name, 'failure').inc()
    logger.error({ queue, job: name, err: error }, 'Job fehlgeschlagen')
    throw error
  } finally {
    end()
  }
}

const defaultWorker = new Worker(
  'default',
  async (job: Job) => {
    const now = new Date()
    switch (job.name) {
      case 'outbox.relay':
        return instrument('default', job.name, () =>
          relayOutbox(handle.db, {
            async publish(topic, payload) {
              // Themenbezogene Folgeverarbeitung; unbekannte Themen sind kein Fehler.
              if (topic === 'capacity.declared' || topic === 'signal.raised') {
                await queues.notify.add('notification.plan', payload, defaultJobOptions)
              }
            },
          }),
        )

      case 'monitor.scan': {
        const due = await scanDueMonitors(handle.db)
        for (const monitor of due) {
          await queues.default.add('monitor.evaluate', monitorEvaluateInput(monitor), {
            ...defaultJobOptions,
            // Fachlicher Idempotenzschlüssel statt Job-ID: ein doppelt eingereihter Job
            // wird von BullMQ verworfen, und selbst wenn nicht, ist die Auswertung idempotent.
            jobId: `monitor:${monitor.id}:${Math.floor(Date.now() / 60_000)}`,
          })
        }
        return { scheduled: due.length }
      }

      case 'monitor.evaluate': {
        // Die Nutzlast kommt aus Redis und ist damit `unknown`. Statt sie zu behaupten, wird
        // sie geprüft: Ein Job aus einer älteren Fassung trägt noch die alte Form, und ein
        // Job ohne Kennung darf nicht als Datenbankabfrage mit `undefined` enden.
        const data = job.data as Partial<MonitorEvaluateInput> & { id?: string }
        const input = {
          householdId: data.householdId ?? '',
          monitorId: data.monitorId ?? data.id ?? '',
        }
        if (!input.householdId || !input.monitorId) {
          logger.error({ queue: 'default', job: job.name, data: Object.keys(job.data ?? {}) }, 'Monitor-Job ohne Kennung verworfen')
          return null
        }
        return instrument('default', job.name, () => evaluateMonitorJob(handle.db, input, now))
      }

      case 'maintenance.scan': {
        const households = await scanHouseholdsNeedingMaintenance(handle.db)
        for (const householdId of households) {
          await queues.default.add('maintenance.run', { householdId }, defaultJobOptions)
        }
        return { scheduled: households.length }
      }

      case 'maintenance.run':
        return instrument('default', job.name, () =>
          runMaintenance(handle.db, (job.data as { householdId: string }).householdId, now),
        )

      default:
        logger.warn({ job: job.name }, 'unbekannter Job')
        return null
    }
  },
  { connection, concurrency: env.WORKER_CONCURRENCY },
)

const syncWorker = new Worker(
  'sync',
  async (job: Job) => {
    const now = new Date()
    if (job.name !== 'calendar.sync') return null
    const data = job.data as { householdId: string; connectionId: string; url: string }
    return instrument('sync', job.name, () =>
      syncIcsConnection(
        handle.db,
        {
          async fetch(url) {
            const response = await safeFetchText(url, {
              timeoutMs: env.ICS_FETCH_TIMEOUT_MS,
              maxBytes: env.ICS_MAX_BYTES,
            })
            return { body: response.body, etag: response.etag }
          },
        },
        data,
        now,
      ),
    )
  },
  { connection, concurrency: 2 },
)

const notifyWorker = new Worker(
  'notify',
  async (job: Job) => {
    const now = new Date()
    if (job.name !== 'notification.dispatch' && job.name !== 'notification.plan') return null
    const householdId = (job.data as { householdId: string }).householdId
    if (!householdId) return null
    return instrument('notify', job.name, () => dispatchNotifications(handle.db, householdId, senders, now))
  },
  { connection, concurrency: 3 },
)

async function scheduleRepeatables(): Promise<void> {
  await queues.default.add('outbox.relay', {}, { repeat: { every: 2_000 }, ...defaultJobOptions })
  await queues.default.add('monitor.scan', {}, { repeat: { every: 5 * 60_000 }, ...defaultJobOptions })
  await queues.default.add('maintenance.scan', {}, { repeat: { every: 5 * 60_000 }, ...defaultJobOptions })
}

async function main(): Promise<void> {
  await scheduleRepeatables()
  logger.info({ queues: Object.keys(queues) }, 'Worker gestartet')
}

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ reason: signal }, 'fahre herunter')
  await Promise.allSettled([defaultWorker.close(), syncWorker.close(), notifyWorker.close()])
  await Promise.allSettled(Object.values(queues).map((q) => q.close()))
  await connection.quit()
  await handle.close()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

main().catch((error: unknown) => {
  logger.error({ err: error }, 'Worker konnte nicht starten')
  process.exit(1)
})
