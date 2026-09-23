import type { FastifyInstance } from 'fastify'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { createInvitationBody, criticality, isoDateTime, uuid } from '@thealotta/contracts'
import { notifications } from '@thealotta/db'
import { authorize } from '@thealotta/domain'
import { FamilyService, InvitationService } from '@thealotta/services'
import { inHousehold, type RouteDeps } from '../lib/route-helpers.js'

export interface FamilyRoutesDeps extends RouteDeps {
  family: FamilyService
  invitations: InvitationService
}

const param = (request: { params: unknown }, key: string): string => (request.params as Record<string, string>)[key]!

const createNeedBody = z.object({
  domainId: uuid,
  description: z.string().min(1).max(500),
  criticality: criticality.default('normal'),
  neededBy: isoDateTime.nullable().default(null),
})

export async function familyRoutes(app: FastifyInstance, deps: FamilyRoutesDeps): Promise<void> {
  app.addHook('preHandler', async (request) => {
    await app.authenticate(request)
  })

  /**
   * §32 / ADR-0012: Verteilung als Bänder, nie als Prozentwert. Die Antwort trägt die
   * Datenqualität mit – ohne sie wäre auch ein Band eine Scheingenauigkeit.
   */
  app.get('/households/:householdId/balance', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => reply.send(await deps.family.balance(tx, ctx))),
  )

  /** §25.2 Care Mode: was übernommen werden muss, was ruhen kann. */
  app.get('/households/:householdId/care-mode/:membershipId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) =>
      reply.send(await deps.family.careMode(tx, ctx, param(request, 'membershipId'), now)),
    ),
  )

  /** §19 Wissensübergabe: der Gesprächsleitfaden für einen Bereich. */
  app.get('/households/:householdId/domains/:domainId/handover', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) =>
      reply.send(await deps.family.handover(tx, ctx, param(request, 'domainId'))),
    ),
  )

  /* ── Needs (§4) ───────────────────────────────────────────────────── */

  app.get('/households/:householdId/needs', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) =>
      reply.send({
        items: await deps.family.listNeeds(tx, ctx),
        note: 'Ein Bedürfnis bleibt bestehen, auch wenn der auslösende Hinweis längst weg ist.',
      }),
    ),
  )

  app.post('/households/:householdId/needs', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = createNeedBody.parse(request.body)
      return reply.status(201).send(
        await deps.family.createNeed(tx, ctx, {
          ...body,
          neededBy: body.neededBy ? new Date(body.neededBy) : null,
        }),
      )
    }),
  )

  app.post('/households/:householdId/needs/:needId/resolve', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = z.object({ state: z.enum(['met', 'dropped']) }).parse(request.body)
      await deps.family.resolveNeed(tx, ctx, param(request, 'needId'), body.state)
      return reply.send({ ok: true })
    }),
  )

  /* ── In-App-Benachrichtigungen (§28) ──────────────────────────────── */

  app.get('/households/:householdId/notifications', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const rows = await tx
        .select()
        .from(notifications)
        .where(and(eq(notifications.householdId, ctx.householdId), eq(notifications.recipientMembershipId, ctx.membershipId)))
        .orderBy(desc(notifications.createdAt))
        .limit(60)

      return reply.send({
        items: rows.map((n) => ({
          id: n.id,
          kind: n.notificationKind,
          priority: n.priority,
          title: n.title,
          body: n.body,
          subjectType: n.subjectType,
          subjectId: n.subjectId,
          state: n.state,
          readAt: n.readAt,
          createdAt: n.createdAt,
          suppressedReason: n.suppressedReason,
        })),
        unread: rows.filter((n) => n.readAt === null).length,
        note:
          'Auch unterdrückte Nachrichten stehen hier. Was du nicht per Push bekommst, ' +
          'geht nicht verloren – es wartet nur leiser.',
      })
    }),
  )

  app.post('/households/:householdId/notifications/:notificationId/ack', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      await tx
        .update(notifications)
        .set({ readAt: now })
        .where(
          and(
            eq(notifications.householdId, ctx.householdId),
            eq(notifications.recipientMembershipId, ctx.membershipId),
            eq(notifications.id, param(request, 'notificationId')),
          ),
        )
      return reply.send({ ok: true })
    }),
  )

  app.post('/households/:householdId/notifications/read-all', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      await tx
        .update(notifications)
        .set({ readAt: now })
        .where(
          and(
            eq(notifications.householdId, ctx.householdId),
            eq(notifications.recipientMembershipId, ctx.membershipId),
            sql`${notifications.readAt} IS NULL`,
          ),
        )
      return reply.send({ ok: true })
    }),
  )

  /* ── Einladungen (§7.1) ───────────────────────────────────────────── */

  app.get('/households/:householdId/invitations', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) =>
      reply.send({ items: await deps.invitations.list(tx, ctx, now) }),
    ),
  )

  app.post('/households/:householdId/invitations', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = createInvitationBody.parse(request.body)
      const result = await deps.invitations.create(
        tx,
        ctx,
        { email: body.email, role: body.role, expiresAt: body.expiresAt ? new Date(body.expiresAt) : null },
        now,
      )
      // Der Link wird zurückgegeben, damit er auch ohne E-Mail-Versand weitergegeben werden kann.
      return reply.status(201).send({
        id: result.id,
        expiresAt: result.expiresAt,
        inviteUrl: `/beitreten/${result.token}`,
      })
    }),
  )

  app.delete('/households/:householdId/invitations/:invitationId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      await deps.invitations.revoke(tx, ctx, param(request, 'invitationId'), now)
      return reply.status(204).send()
    }),
  )

  void authorize
}
