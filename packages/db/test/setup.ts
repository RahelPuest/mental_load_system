import postgres from 'postgres'
import { runMigrations } from '../src/migrate.js'
import { createDb, type DbHandle } from '../src/client.js'

/**
 * Integrationstests laufen gegen eine echte Postgres-Instanz – RLS, partielle Unique-Indizes und
 * Exclusion-Constraints lassen sich nicht sinnvoll mocken. `pnpm stack:up` startet sie lokal.
 */
export const ADMIN_URL = process.env['DATABASE_ADMIN_URL'] ?? 'postgres://thealotta:thealotta_dev_only@localhost:55432/thealotta'
export const TEST_DB = process.env['TEST_DATABASE_NAME'] ?? 'thealotta_test'

const swapDatabase = (url: string, name: string) => url.replace(/\/[^/?]+(\?|$)/, `/${name}$1`)

/** Superuser: legt die Datenbank an und wendet Migrationen an. */
export const TEST_ADMIN_URL = swapDatabase(ADMIN_URL, TEST_DB)

/**
 * Anwendungsrolle: alle Testabfragen laufen hierüber. Entscheidend, weil Postgres RLS für
 * Superuser und Tabelleneigentümer umgeht – ein Test als Superuser würde die Isolation
 * scheinbar bestätigen, obwohl sie nie greift.
 */
export const TEST_URL = swapDatabase(
  process.env['TEST_DATABASE_URL'] ?? 'postgres://thealotta_app_user:thealotta_dev_only@localhost:55432/thealotta',
  TEST_DB,
)

/** Prozessübergreifender Setup-Lock (beliebige, aber feste Zahl). */
const SETUP_LOCK = 918_273_645

let prepared: Promise<void> | null = null

export function prepareTestDatabase(): Promise<void> {
  prepared ??= (async () => {
    const admin = postgres(ADMIN_URL, { max: 1, prepare: false, onnotice: () => {} })
    try {
      // Testdateien laufen in getrennten Prozessen. Ohne Serialisierung kollidieren
      // CREATE DATABASE und GRANT ('tuple concurrently updated').
      await admin`SELECT pg_advisory_lock(${SETUP_LOCK})`
      const exists = await admin`SELECT 1 FROM pg_database WHERE datname = ${TEST_DB}`
      if (exists.length === 0) await admin.unsafe(`CREATE DATABASE ${TEST_DB}`)
      await admin.unsafe(
        `GRANT CONNECT ON DATABASE ${TEST_DB} TO thealotta_app_user, thealotta_monitor_user, thealotta_notifier_user, thealotta_sync_user`,
      )
      await runMigrations(TEST_ADMIN_URL, () => {})
    } finally {
      await admin`SELECT pg_advisory_unlock(${SETUP_LOCK})`.catch(() => undefined)
      await admin.end({ timeout: 5 })
    }
  })()
  return prepared
}

export async function openTestDb(): Promise<DbHandle> {
  await prepareTestDatabase()
  return createDb(TEST_URL, { max: 5, onnotice: false })
}

/** Leert alle fachlichen Tabellen zwischen Testfällen – schneller als die DB neu anzulegen. */
/** Läuft als Superuser: TRUNCATE ist der Anwendungsrolle bewusst nicht erlaubt. */
export async function truncateAll(_handle?: DbHandle): Promise<void> {
  const admin = postgres(TEST_ADMIN_URL, { max: 1, prepare: false, onnotice: () => {} })
  try {
    await truncateWith(admin)
  } finally {
    await admin.end({ timeout: 5 })
  }
}

async function truncateWith(client: postgres.Sql): Promise<void> {
  const rows = await client<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
  `
  const names = rows.map((r) => `public."${r.tablename}"`).join(', ')
  await client.unsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`)
}

/** Wiederverwendbarer Admin-Zugang für Tests, die bewusst an der RLS vorbei aufsetzen. */
export function openAdminSql(): postgres.Sql {
  return postgres(TEST_ADMIN_URL, { max: 2, prepare: false, onnotice: () => {} })
}

export const isDbAvailable = async (): Promise<boolean> => {
  try {
    const c = postgres(ADMIN_URL, { max: 1, prepare: false, connect_timeout: 3, onnotice: () => {} })
    await c`SELECT 1`
    await c.end({ timeout: 2 })
    return true
  } catch {
    return false
  }
}
