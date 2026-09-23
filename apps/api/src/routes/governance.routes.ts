import type { TransferService } from '@thealotta/services'
import type { FastifyInstance } from 'fastify'
import { and, desc, eq, sql } from 'drizzle-orm'
import { APP_SLUG, createDeletionRequestBody, createExportBody } from '@thealotta/contracts'
import { auditEvents, deletionRequests, domainEvents, exportJobs, uuidv7 } from '@thealotta/db'
import { authorize, badRequest } from '@thealotta/domain'
import { inHousehold, type RouteDeps } from '../lib/route-helpers.js'
import { recordAudit, recordEvent } from '../lib/events.js'
import { CapacityService, CoverageService, DomainService } from '@thealotta/services'

export interface GovernanceRoutesDeps extends RouteDeps {
  domains: DomainService
  capacity: CapacityService
  coverage: CoverageService
  transfer: TransferService
}

export async function governanceRoutes(app: FastifyInstance, deps: GovernanceRoutesDeps): Promise<void> {
  app.addHook('preHandler', async (request) => {
    await app.authenticate(request)
  })

  /**
   * §31: Familienübersicht. Ausdrücklich kein Leistungsvergleich – der Hinweistext ist
   * Teil der Antwort, nicht Dekoration im Frontend.
   */
  app.get('/households/:householdId/overview', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const [domainList, reducedCapacity, coverages] = await Promise.all([
        deps.domains.list(tx, ctx, now),
        deps.capacity.overview(tx, ctx, now),
        deps.coverage.list(tx, ctx),
      ])

      return reply.send({
        domains: domainList.map((d) => ({
          id: d.id,
          path: d.path,
          name: d.name,
          criticality: d.criticality,
          effectiveOwner: d.effectiveOwner
            ? {
                membershipId: d.effectiveOwner.membershipId,
                displayName: d.effectiveOwner.displayName,
                inheritedFrom: d.effectiveOwner.inheritedFrom,
                viaCoverage: d.effectiveOwner.viaCoverage,
              }
            : null,
        })),
        unownedCritical: domainList
          .filter((d) => !d.effectiveOwner && (d.criticality === 'high' || d.criticality === 'critical'))
          .map((d) => ({ id: d.id, path: d.path })),
        activeCoverages: coverages
          .filter((c) => c.state === 'active' || c.state === 'pending_return')
          .map((c) => ({ id: c.id, domainId: c.domainId, until: c.endsAt.toISOString(), state: c.state })),
        reducedCapacity,
        note:
          'Diese Übersicht zeigt, wo Verantwortung liegt und wo sie unklar ist. ' +
          'Sie ist kein Vergleich zwischen Personen und misst keine Leistung.',
      })
    }),
  )

  /** §33: objektzentrierte Historie. Ein Aktivitätsprofil einzelner Personen gibt es bewusst nicht (§34). */
  app.get('/households/:householdId/history', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const query = request.query as {
        subjectType?: string
        subjectId?: string
        domainId?: string
        limit?: string
        /* Zeitpunkt des ältesten schon geladenen Ereignisses – alles davor ist die nächste Seite. */
        before?: string
      }
      authorize(ctx, 'history:read', { type: 'domain_event', id: null, householdId: ctx.householdId })

      if (!query.subjectId && !query.domainId) {
        throw badRequest(
          'validation_failed',
          'Bitte ein Objekt oder einen Bereich angeben. Eine reine Personenhistorie gibt es in diesem System nicht.',
        )
      }

      const conditions = [eq(domainEvents.householdId, ctx.householdId)]
      if (query.subjectId) conditions.push(eq(domainEvents.subjectId, query.subjectId))
      if (query.subjectType) conditions.push(eq(domainEvents.subjectType, query.subjectType))
      if (query.domainId) conditions.push(sql`${domainEvents.payload}->>'domainId' = ${query.domainId}`)
      /*
        Nachladen statt festem Limit: Der Verlauf eines Bereichs wächst mit jeder Handlung,
        und eine Ansicht, die immer alles zieht, wird mit der Zeit die längste der Anwendung
        (gemessen 1580 px auf dem Handy, Review C5).
      */
      // Als Zeichenkette mit ausdrücklichem Typ: Ein `Date` in einer rohen `sql`-Vorlage
      // kann der Treiber nicht serialisieren – das endet in einem 500, nicht in einem Fehler
      // beim Übersetzen. Schon einmal in diesem Projekt passiert.
      if (query.before) {
        conditions.push(sql`${domainEvents.occurredAt} < ${query.before}::timestamptz`)
      }

      const limit = Math.min(Number(query.limit ?? 100), 200)
      const rows = await tx
        .select()
        .from(domainEvents)
        .where(and(...conditions))
        .orderBy(desc(domainEvents.occurredAt))
        .limit(limit + 1)

      // Eine Zeile mehr geholt als gezeigt: So steht fest, ob es weitergeht, ohne zu zählen.
      const hatMehr = rows.length > limit
      return reply.send({ items: hatMehr ? rows.slice(0, limit) : rows, hasMore: hatMehr })
    }),
  )

  app.get('/households/:householdId/audit', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      authorize(ctx, 'audit:read', { type: 'audit_event', id: null, householdId: ctx.householdId })
      const rows = await tx
        .select({
          id: auditEvents.id,
          action: auditEvents.action,
          outcome: auditEvents.outcome,
          subjectType: auditEvents.subjectType,
          subjectId: auditEvents.subjectId,
          metadata: auditEvents.metadata,
          occurredAt: auditEvents.occurredAt,
        })
        .from(auditEvents)
        .where(eq(auditEvents.householdId, ctx.householdId))
        .orderBy(desc(auditEvents.occurredAt))
        .limit(200)
      return reply.send({ items: rows })
    }),
  )

  /*
   * Daten mitnehmen – als Datei, nicht als Versprechen.
   *
   * Der alte Weg legte einen Auftrag mit `state: 'queued'` an, den niemand je abholte. Ein
   * Haushalt ist klein genug, um ihn direkt auszuliefern; eine Warteschlange wäre Apparat
   * ohne Zweck. Der alte Endpunkt bleibt bestehen, weil er im Ledger auftaucht – der neue
   * ist der, den die Oberfläche benutzt.
   */
  app.get('/households/:householdId/export', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const doc = await deps.transfer.exportHousehold(tx, ctx, now)
      const name = `${APP_SLUG}-${doc.household.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${now.toISOString().slice(0, 10)}.json`
      /*
        Von Hand serialisiert, damit die Datei eingerückt ist.
        
        Fastify schreibt eine einzige Zeile – bei diesem Haushalt 22 957 Zeichen. Das ist für
        eine Maschine gleichwertig und für einen Menschen unbrauchbar, und eine Datei, die
        man mitnehmen kann, sollte man auch aufmachen können. Zwei Leerzeichen Einrückung
        kosten etwa ein Fünftel mehr Umfang; bei 20 kB ist das kein Argument.
      */
      return reply
        .header('content-type', 'application/json; charset=utf-8')
        .header('content-disposition', `attachment; filename="${name}"`)
        .send(JSON.stringify(doc, null, 2))
    }),
  )

  /*
   * Alles leeren – zum Neuanfangen, nicht zum Verschwinden.
   *
   * Kein `DELETE` auf den Haushalt: Der geht weiter über einen Antrag mit Karenzzeit (§40).
   * Hier fallen nur die Inhalte, und zwar genau die, die ein Export mitnimmt.
   */
  app.post('/households/:householdId/clear', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = (request.body ?? {}) as { confirmation?: string }
      return reply.send(await deps.transfer.clearHousehold(tx, ctx, String(body.confirmation ?? ''), now))
    }),
  )

  app.post('/households/:householdId/import', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) =>
      reply.send(await deps.transfer.importHousehold(tx, ctx, request.body, now)),
    ),
  )

  app.post('/households/:householdId/exports', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = createExportBody.parse(request.body ?? {})
      authorize(ctx, 'export:request', { type: 'export_job', id: null, householdId: ctx.householdId })
      const id = uuidv7()
      await tx.insert(exportJobs).values({
        id,
        householdId: ctx.householdId,
        requestedBy: ctx.membershipId,
        scope: body.scope,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      })
      await recordAudit(tx, {
        action: 'export.requested',
        householdId: ctx.householdId,
        userId: ctx.actor.userId,
        membershipId: ctx.membershipId,
        subjectType: 'export_job',
        subjectId: id,
        metadata: { scope: body.scope },
      })
      await recordEvent(tx, ctx.householdId, ctx.actor, {
        eventType: 'export.requested',
        subjectType: 'export_job',
        subjectId: id,
        payload: { scope: body.scope },
      })
      return reply.status(202).send({ id, state: 'queued' })
    }),
  )

  app.get('/households/:householdId/exports/:exportId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const exportId = (request.params as { exportId: string }).exportId
      const [row] = await tx
        .select()
        .from(exportJobs)
        .where(and(eq(exportJobs.householdId, ctx.householdId), eq(exportJobs.id, exportId)))
        .limit(1)
      if (!row) return reply.status(404).send({ code: 'not_found' })
      return reply.send(row)
    }),
  )

  /**
   * §40: Löschung läuft immer über einen Antrag mit Karenzzeit – nie über einen direkten
   * DELETE-Endpunkt. Das schützt gegen Versehen und macht die Löschung nachvollziehbar.
   */
  app.post('/households/:householdId/deletion-requests', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = createDeletionRequestBody.parse(request.body)
      authorize(
        ctx,
        body.scope === 'household' ? 'household:delete' : 'person:manage',
        { type: 'deletion_request', id: null, householdId: ctx.householdId },
      )

      const id = uuidv7()
      const graceDays = body.mode === 'hard' ? 30 : 30
      await tx.insert(deletionRequests).values({
        id,
        householdId: ctx.householdId,
        requestedBy: ctx.membershipId,
        scope: body.scope,
        subjectId: body.subjectId,
        mode: body.mode,
        executeAfter: new Date(Date.now() + graceDays * 86_400_000),
      })
      await recordAudit(tx, {
        action: 'deletion.requested',
        householdId: ctx.householdId,
        userId: ctx.actor.userId,
        membershipId: ctx.membershipId,
        subjectType: 'deletion_request',
        subjectId: id,
        metadata: { scope: body.scope, mode: body.mode },
      })
      return reply.status(202).send({
        id,
        executeAfter: new Date(Date.now() + graceDays * 86_400_000).toISOString(),
        note: `Die Löschung wird in ${graceDays} Tagen ausgeführt und kann bis dahin abgebrochen werden.`,
      })
    }),
  )

  app.delete('/households/:householdId/deletion-requests/:deletionId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const deletionId = (request.params as { deletionId: string }).deletionId
      await tx
        .update(deletionRequests)
        .set({ state: 'cancelled', cancelledAt: now })
        .where(and(eq(deletionRequests.householdId, ctx.householdId), eq(deletionRequests.id, deletionId)))
      await recordAudit(tx, {
        action: 'deletion.cancelled',
        householdId: ctx.householdId,
        userId: ctx.actor.userId,
        membershipId: ctx.membershipId,
        subjectType: 'deletion_request',
        subjectId: deletionId,
      })
      return reply.status(204).send()
    }),
  )
}
