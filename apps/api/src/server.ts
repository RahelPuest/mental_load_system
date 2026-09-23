import { loadDotEnvForDevelopment } from '@thealotta/contracts'
import { loadEnv } from './env.js'
import { buildApp } from './app.js'

/**
 * Prozess-Bootstrap. Fehlende Konfiguration führt zum sofortigen Abbruch – nicht zu
 * schwer auffindbaren Laufzeitfehlern (docs/20 §8).
 */
async function main(): Promise<void> {
  loadDotEnvForDevelopment()
  const env = loadEnv()
  const { app, close } = await buildApp({ env })

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ reason: signal }, 'fahre herunter')
    await close()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  await app.listen({ port: env.PORT, host: env.HOST })
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
