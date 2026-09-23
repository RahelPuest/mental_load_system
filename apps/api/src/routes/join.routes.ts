import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { ActorContext } from '@thealotta/domain'
import type { AuthService, InvitationService } from '@thealotta/services'

export interface JoinRoutesDeps {
  invitations: InvitationService
  auth: AuthService
  clock: () => Date
}

/**
 * Beitritt liegt außerhalb des Haushaltskontexts: Wer beitritt, gehört noch nicht dazu.
 * Deshalb eigene Routen ohne `inHousehold`.
 */
export async function joinRoutes(app: FastifyInstance, deps: JoinRoutesDeps): Promise<void> {
  /** Vorschau ohne Anmeldung: Niemand soll einem Link folgen und danach überrascht Mitglied sein. */
  app.get('/invitations/:token/preview', async (request, reply) => {
    const token = (request.params as { token: string }).token
    const preview = await deps.invitations.preview(token, deps.clock())
    return reply.send({
      householdName: preview.householdName,
      role: preview.role,
      // Nur andeuten, für wen die Einladung gilt – die volle Adresse gehört nicht in eine
      // Antwort, die ohne Anmeldung erreichbar ist.
      emailHint: preview.email.replace(/^(.).*(@.*)$/, '$1…$2'),
      expiresAt: preview.expiresAt,
    })
  })

  app.post('/invitations/:token/accept', async (request, reply) => {
    const user = await app.authenticate(request)
    const token = (request.params as { token: string }).token
    z.object({ confirm: z.literal(true) }).parse(request.body)

    const actor: ActorContext = {
      kind: 'user',
      userId: user.userId,
      membershipId: null,
      correlationId: request.correlationId,
    }
    const result = await deps.invitations.accept(
      actor,
      token,
      { id: user.userId, email: user.email, displayName: user.displayName },
      deps.clock(),
    )
    return reply.status(201).send(result)
  })

  app.post('/auth/password', async (request, reply) => {
    const user = await app.authenticate(request)
    const body = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(12).max(200) })
      .parse(request.body)
    await deps.auth.changePassword(user.userId, body.currentPassword, body.newPassword)
    return reply.send({
      ok: true,
      note: 'Passwort geändert. Aus Sicherheitsgründen wurden alle Sitzungen beendet – bitte neu anmelden.',
    })
  })
}
