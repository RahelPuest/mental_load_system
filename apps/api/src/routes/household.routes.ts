import type { FastifyInstance } from 'fastify'
import { and, eq, isNull } from 'drizzle-orm'
import {
  createDomainBody,
  updateDomainBody,
  moveDomainBody,
  repositionDomainBody,
  moveDomainItemsBody,
  createGrantBody,
  createHouseholdBody,
  createPersonBody,
  createAssignmentBody,
  transferOwnershipBody,
} from '@thealotta/contracts'
import { accessGrants, householdMemberships, persons, uuidv7 } from '@thealotta/db'
import { assertAutonomy, authorize, type ActorContext } from '@thealotta/domain'
import { inHousehold, type RouteDeps } from '../lib/route-helpers.js'
import { recordAudit, recordEvent } from '../lib/events.js'
import { DomainService, HouseholdService } from '@thealotta/services'

export interface HouseholdRoutesDeps extends RouteDeps {
  households: HouseholdService
  domains: DomainService
}

export async function householdRoutes(app: FastifyInstance, deps: HouseholdRoutesDeps): Promise<void> {
  app.addHook('preHandler', async (request) => {
    await app.authenticate(request)
  })

  app.get('/households', async (request, reply) => {
    const list = await deps.households.listForUser(request.user!.userId)
    return reply.send({ items: list })
  })

  app.post('/households', async (request, reply) => {
    const body = createHouseholdBody.parse(request.body)
    const actor: ActorContext = {
      kind: 'user',
      userId: request.user!.userId,
      membershipId: null,
      correlationId: request.correlationId,
    }
    const result = await deps.households.create(actor, request.user!.userId, request.user!.displayName, body)
    return reply.status(201).send(result)
  })

  /* ── Personen ─────────────────────────────────────────────────────── */

  app.get('/households/:householdId/persons', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      authorize(ctx, 'person:read', { type: 'person', id: null, householdId: ctx.householdId })
      const rows = await tx.select().from(persons).where(eq(persons.householdId, ctx.householdId))
      return reply.send({ items: rows })
    }),
  )

  app.post('/households/:householdId/persons', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = createPersonBody.parse(request.body)
      authorize(ctx, 'person:manage', { type: 'person', id: null, householdId: ctx.householdId })
      const id = uuidv7()
      await tx.insert(persons).values({
        id,
        householdId: ctx.householdId,
        displayName: body.displayName,
        personKind: body.personKind,
        birthDate: body.birthDate ?? null,
        sensitivityDefault: body.sensitivityDefault,
      })
      await recordEvent(tx, ctx.householdId, ctx.actor, {
        eventType: 'person.created',
        subjectType: 'person',
        subjectId: id,
        payload: { personKind: body.personKind },
      })
      return reply.status(201).send({ id })
    }),
  )

  /* ── Mitglieder & Rechte ──────────────────────────────────────────── */

  app.get('/households/:householdId/members', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const rows = await tx
        .select({
          id: householdMemberships.id,
          displayName: householdMemberships.displayName,
          role: householdMemberships.role,
          status: householdMemberships.status,
          linkedPersonId: householdMemberships.linkedPersonId,
        })
        .from(householdMemberships)
        .where(eq(householdMemberships.householdId, ctx.householdId))
      return reply.send({ items: rows })
    }),
  )

  /**
   * §44: Berechtigungen müssen verständlich sein. Die Antwort liefert deshalb neben den
   * Rohdaten auch den Bereichspfad und einen Klartextsatz, damit die Oberfläche keine
   * Berechtigungsmatrix zeigen muss.
   */
  app.get('/households/:householdId/grants', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      authorize(ctx, 'grant:manage', { type: 'access_grant', id: null, householdId: ctx.householdId })
      const rows = await tx
        .select()
        .from(accessGrants)
        .where(and(eq(accessGrants.householdId, ctx.householdId), isNull(accessGrants.revokedAt)))
      const domainList = await deps.domains.list(tx, ctx, now)
      const nameOf = (id: string | null) => domainList.find((d) => d.id === id)?.name ?? null

      return reply.send({
        items: rows
          .filter((g) => !g.expiresAt || g.expiresAt.getTime() > now.getTime())
          .map((g) => ({
            id: g.id,
            membershipId: g.membershipId,
            capability: g.capability,
            scopeType: g.scopeType,
            scopeId: g.scopeId,
            scopeName: nameOf(g.scopeId),
            maxSensitivity: g.maxSensitivity,
            effect: g.effect,
            expiresAt: g.expiresAt,
          })),
      })
    }),
  )

  app.post('/households/:householdId/grants', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = createGrantBody.parse(request.body)
      // ADR-0008: Rechtevergabe ist A3 – ausschließlich menschliche Entscheidung.
      assertAutonomy('grant.create', ctx.actor)
      authorize(ctx, 'grant:manage', { type: 'access_grant', id: null, householdId: ctx.householdId })

      const id = uuidv7()
      await tx.insert(accessGrants).values({
        id,
        householdId: ctx.householdId,
        membershipId: body.membershipId,
        scopeType: body.scopeType,
        scopeId: body.scopeId,
        capability: body.capability,
        maxSensitivity: body.maxSensitivity,
        effect: body.effect,
        grantedBy: ctx.membershipId,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      })

      const selfElevated = body.membershipId === ctx.membershipId
      await recordAudit(tx, {
        action: selfElevated ? 'grant.self_elevated' : 'grant.created',
        householdId: ctx.householdId,
        userId: ctx.actor.userId,
        membershipId: ctx.membershipId,
        subjectType: 'access_grant',
        subjectId: id,
        metadata: { capability: body.capability, scopeType: body.scopeType, maxSensitivity: body.maxSensitivity },
      })
      await recordEvent(tx, ctx.householdId, ctx.actor, {
        eventType: 'grant.created',
        subjectType: 'access_grant',
        subjectId: id,
        payload: { capability: body.capability, scopeType: body.scopeType, selfElevated },
      })
      return reply.status(201).send({ id, selfElevated })
    }),
  )

  app.delete('/households/:householdId/grants/:grantId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      assertAutonomy('grant.revoke', ctx.actor)
      authorize(ctx, 'grant:manage', { type: 'access_grant', id: null, householdId: ctx.householdId })
      const grantId = (request.params as { grantId: string }).grantId
      await tx
        .update(accessGrants)
        .set({ revokedAt: now })
        .where(and(eq(accessGrants.householdId, ctx.householdId), eq(accessGrants.id, grantId)))
      await recordAudit(tx, {
        action: 'grant.revoked',
        householdId: ctx.householdId,
        userId: ctx.actor.userId,
        membershipId: ctx.membershipId,
        subjectType: 'access_grant',
        subjectId: grantId,
      })
      return reply.status(204).send()
    }),
  )

  /* ── Bereiche & Verantwortung ─────────────────────────────────────── */

  app.get('/households/:householdId/domains', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const items = await deps.domains.list(tx, ctx, now)
      return reply.send({ items })
    }),
  )

  app.post('/households/:householdId/domains', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = createDomainBody.parse(request.body)
      const domain = await deps.domains.create(tx, ctx, body)
      return reply.status(201).send(domain)
    }),
  )

  /*
   * Ändern, archivieren, löschen.
   *
   * Archivieren ist der übliche Weg: Der Bereich verschwindet aus den Listen und behält
   * alles. Löschen geht nur, wenn dabei nichts verloren gehen kann – der Dienst prüft das
   * und sagt sonst, was im Weg steht.
   */
  app.patch('/households/:householdId/domains/:domainId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = updateDomainBody.parse(request.body)
      const domain = await deps.domains.update(tx, ctx, (request.params as { domainId: string }).domainId, body, now)
      return reply.send(domain)
    }),
  )

  app.post('/households/:householdId/domains/:domainId/move', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = moveDomainBody.parse(request.body)
      await deps.domains.move(tx, ctx, (request.params as { domainId: string }).domainId, body.direction, now)
      return reply.send({ ok: true })
    }),
  )

  app.post('/households/:householdId/domains/:domainId/reposition', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = repositionDomainBody.parse(request.body)
      await deps.domains.reposition(tx, ctx, (request.params as { domainId: string }).domainId, body, now)
      return reply.send({ ok: true })
    }),
  )

  /**
   * Inhalte in einen anderen Bereich umhängen (docs/72).
   *
   * Der Bereich in der Adresse ist die Quelle, nicht das Ziel: Man steht in dem Bereich, aus
   * dem etwas weggeht, und der Dienst prüft auch, dass die Einträge wirklich dort stehen.
   */
  app.post('/households/:householdId/domains/:domainId/move-items', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = moveDomainItemsBody.parse(request.body)
      const result = await deps.domains.moveItems(
        tx,
        ctx,
        (request.params as { domainId: string }).domainId,
        body,
        now,
      )
      return reply.send(result)
    }),
  )

  app.post('/households/:householdId/domains/:domainId/archive', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      await deps.domains.archive(tx, ctx, (request.params as { domainId: string }).domainId, now)
      return reply.send({ ok: true })
    }),
  )

  app.post('/households/:householdId/domains/:domainId/unarchive', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      await deps.domains.unarchive(tx, ctx, (request.params as { domainId: string }).domainId, now)
      return reply.send({ ok: true })
    }),
  )

  app.delete('/households/:householdId/domains/:domainId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      await deps.domains.remove(tx, ctx, (request.params as { domainId: string }).domainId, now)
      return reply.send({ ok: true })
    }),
  )

  app.get('/households/:householdId/unowned', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const items = await deps.domains.unowned(tx, ctx, now)
      return reply.send({
        items,
        note: 'Bereiche ohne eindeutige Verantwortung. Das ist kein Fehler – nur etwas, das jemand entscheiden sollte.',
      })
    }),
  )

  app.post('/households/:householdId/domains/:domainId/assignments', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = createAssignmentBody.parse(request.body)
      const domainId = (request.params as { domainId: string }).domainId
      const result = await deps.domains.assign(tx, ctx, domainId, body, now)
      return reply.status(201).send(result)
    }),
  )

  /**
   * „Alle sind zuständig" – jede aktive Person bekommt eine gleichrangige Verantwortung.
   *
   * Das ist ausdrücklich erlaubt und ausdrücklich nicht der Normalfall: Wo alle zuständig
   * sind, bemerkt oft niemand, wenn etwas liegen bleibt. Die Oberfläche sagt das einmal;
   * die Entscheidung trifft der Haushalt.
   */
  app.post('/households/:householdId/domains/:domainId/share-all', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const domainId = (request.params as { domainId: string }).domainId
      const result = await deps.domains.shareWithAll(tx, ctx, domainId, now)
      return reply.status(201).send(result)
    }),
  )

  app.post('/households/:householdId/domains/:domainId/claim', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const domainId = (request.params as { domainId: string }).domainId
      const result = await deps.domains.assign(
        tx,
        ctx,
        domainId,
        { membershipId: ctx.membershipId, assignmentKind: 'primary_owner' },
        now,
      )
      return reply.status(201).send(result)
    }),
  )

  app.get('/households/:householdId/domains/:domainId/ownership-history', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const at = (request.query as { at?: string }).at
      const domainId = (request.params as { domainId: string }).domainId
      return reply.send(await deps.domains.ownershipHistory(tx, ctx, domainId, at ? new Date(at) : undefined))
    }),
  )

  app.post('/households/:householdId/domains/:domainId/transfer', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = transferOwnershipBody.parse(request.body)
      const domainId = (request.params as { domainId: string }).domainId
      const result = await deps.domains.transfer(tx, ctx, domainId, body, now)
      return reply.status(201).send(result)
    }),
  )
}
