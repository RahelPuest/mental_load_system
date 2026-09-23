import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { runWithContext } from '@thealotta/observability'
import { uuidv7 } from '@thealotta/db'

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string
  }
}

/**
 * Eine ID von der Nutzeraktion bis zur Push-Nachricht (docs/30 §7).
 * Sie landet in jedem Log, jedem Domain-Event und jedem Hintergrundjob.
 */
async function plugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('correlationId', '')

  app.addHook('onRequest', (request, reply, done) => {
    const incoming = request.headers['x-request-id']
    const correlationId = typeof incoming === 'string' && /^[0-9a-f-]{36}$/i.test(incoming) ? incoming : uuidv7()
    request.correlationId = correlationId
    reply.header('x-request-id', correlationId)
    runWithContext({ requestId: request.id, correlationId }, done)
  })
}

/**
 * `fastify-plugin` hebt die Kapselung auf: Hooks und Dekoratoren gelten sonst nur innerhalb
 * dieses Plugins und nicht für die Routen daneben.
 */
export const requestContextPlugin = fp(plugin, { name: 'request-context' })
