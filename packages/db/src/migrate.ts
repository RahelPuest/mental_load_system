import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

/**
 * Migrationsläufer.
 *
 * Bewusst schlicht und ohne Framework: Migrationen sind nummerierte SQL-Dateien, werden genau
 * einmal angewendet und über eine Prüfsumme gegen nachträgliche Änderung geschützt (ADR-0014).
 * Ausgeführt wird mit der Wartungsrolle, nie aus der laufenden Anwendung.
 */
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

export interface MigrationResult {
  applied: string[]
  skipped: string[]
}

export async function runMigrations(connectionString: string, log = console.log): Promise<MigrationResult> {
  const client = postgres(connectionString, { max: 1, prepare: false, onnotice: (n) => log(`  postgres: ${n.message}`) })
  const applied: string[] = []
  const skipped: string[] = []

  try {
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now(),
        checksum   text NOT NULL
      )
    `)

    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    const rows = await client<{ version: string; checksum: string }[]>`
      SELECT version, checksum FROM schema_migrations
    `
    const known = new Map(rows.map((r) => [r.version, r.checksum]))

    for (const file of files) {
      const version = file.replace(/\.sql$/, '')
      const body = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
      const checksum = createHash('sha256').update(body).digest('hex')

      const previous = known.get(version)
      if (previous) {
        if (previous !== checksum) {
          throw new Error(
            `Migration ${version} wurde nach der Anwendung verändert. ` +
              `Angewendete Migrationen sind unveränderlich – bitte eine neue Migration anlegen.`,
          )
        }
        skipped.push(version)
        continue
      }

      log(`→ wende ${version} an`)
      // Migrationen laufen unter Umgehung der RLS: sie legen Policies erst an.
      await client.begin(async (tx) => {
        await tx.unsafe(`SELECT set_config('app.bypass_rls', 'on', true)`)
        await tx.unsafe(body)
        await tx.unsafe(`INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)`, [version, checksum])
      })
      applied.push(version)
    }

    return { applied, skipped }
  } finally {
    await client.end({ timeout: 5 })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env['DATABASE_URL']
  if (!url) {
    console.error('DATABASE_URL fehlt')
    process.exit(1)
  }
  runMigrations(url)
    .then((r) => {
      console.log(`Fertig. Angewendet: ${r.applied.length}, bereits vorhanden: ${r.skipped.length}`)
      process.exit(0)
    })
    .catch((e: unknown) => {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    })
}
