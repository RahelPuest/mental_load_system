import { z } from 'zod'

/**
 * Umgebungsvariablen werden beim Start validiert. Fehlt ein Secret, bricht der Prozess
 * sofort ab statt später zur Laufzeit zu scheitern (§20.8). Für Secrets gibt es keine Defaults.
 */
const encryptionKeys = z
  .string()
  .transform((raw, ctx) => {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object')
      for (const [id, key] of Object.entries(parsed)) {
        if (Buffer.from(key, 'base64').length !== 32) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `ENCRYPTION_KEYS["${id}"] muss 32 Byte base64 sein` })
        }
      }
      return parsed
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ENCRYPTION_KEYS muss JSON {keyId: base64} sein' })
      return z.NEVER
    }
  })

export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SERVICE_NAME: z.string().default('thealotta'),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  REDIS_URL: z.string().url().optional(),
  ENCRYPTION_KEYS: encryptionKeys,
  ENCRYPTION_ACTIVE_KEY_ID: z.string().min(1),
})

export const apiEnvSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  /** Kommagetrennt; der erste Wert signiert, alle werden zum Verifizieren akzeptiert (Rotation). */
  SESSION_SECRETS: z.string().min(32),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  COOKIE_SECURE: z.coerce.boolean().default(true),
  CORS_ORIGINS: z.string().default(''),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  RATE_LIMIT_GLOBAL_PER_MIN: z.coerce.number().int().default(300),
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().default(10),
  /**
   * Nur der öffentliche Teil: Der Browser braucht ihn, um sich für Push anzumelden.
   * Der private Schlüssel gehört ausschließlich in den Worker, der die Nachrichten sendet.
   */
  VAPID_PUBLIC_KEY: z.string().optional(),
})

export const workerEnvSchema = baseEnvSchema.extend({
  REDIS_URL: z.string().url(),
  WORKER_QUEUES: z.string().default('default,sync,notify'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:ops@example.invalid'),
  SMTP_URL: z.string().optional(),
  SMTP_FROM: z.string().default('Thealotta <noreply@example.invalid>'),
  /** SSRF-Schutz: erlaubt nur diese Schemata beim Abruf nutzergesteuerter Kalender-URLs. */
  ICS_FETCH_TIMEOUT_MS: z.coerce.number().int().default(10_000),
  ICS_MAX_BYTES: z.coerce.number().int().default(10 * 1024 * 1024),
  FEATURE_GOOGLE_CALENDAR: z.coerce.boolean().default(false),
})

export type ApiEnv = z.infer<typeof apiEnvSchema>
export type WorkerEnv = z.infer<typeof workerEnvSchema>

export function parseEnv<T extends z.ZodTypeAny>(schema: T, source: NodeJS.ProcessEnv = process.env): z.infer<T> {
  const result = schema.safeParse(source)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')
    throw new Error(`Ungültige Umgebungskonfiguration:\n${issues}`)
  }
  return result.data
}
