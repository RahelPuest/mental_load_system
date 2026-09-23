import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import {
  answerQuestionBody,
  assignTaskBody,
  captureBody,
  completeProcessBody,
  completeTaskBody,
  createDecisionBody,
  updateDecisionBody,
  updateProcessBody,
  updateKnowledgeBody,
  updateQuestionBody,
  updateTaskBody,
  createKnowledgeBody,
  createMonitorBody,
  createProcessBody,
  createQuestionBody,
  createStateDefinitionBody,
  updateStateDefinitionBody,
  createTaskBody,
  deferTaskBody,
  dismissAttentionBody,
  dropTaskBody,
  markIrrelevantBody,
  nowQuery,
  processInboxBody,
  promoteAttentionBody,
  putCapacityBody,
  putStateValueBody,
  resolveConflictBody,
  snoozeAttentionBody,
  waitTaskBody,
  createCoverageBody,
  createPlaybookBody,
  instantiatePlaybookBody,
  updateMonitorBody,
} from '@thealotta/contracts'
import { households } from '@thealotta/db'
import { authorize, badRequest, notFound } from '@thealotta/domain'
import { inHousehold, type RouteDeps } from '../lib/route-helpers.js'
import { recordEvent } from '../lib/events.js'
import {
  AttentionService,
  CapacityService,
  CoverageService,
  DomainService,
  IntakeService,
  KnowledgeService,
  MonitorService,
  NowService,
  PlanningService,
  StateService,
  startOfDayIn,
  WorkService,
} from '@thealotta/services'

export interface WorkRoutesDeps extends RouteDeps {
  domains: DomainService
  state: StateService
  monitors: MonitorService
  attention: AttentionService
  work: WorkService
  now: NowService
  planning: PlanningService
  intake: IntakeService
  capacity: CapacityService
  coverage: CoverageService
  knowledge: KnowledgeService
}

const param = (request: { params: unknown }, key: string): string => (request.params as Record<string, string>)[key]!

export async function workRoutes(app: FastifyInstance, deps: WorkRoutesDeps): Promise<void> {
  app.addHook('preHandler', async (request) => {
    await app.authenticate(request)
  })

  /**
   * Alles zu einem Bereich in einer Anfrage.
   *
   * §41 verlangt geringe Navigationstiefe: Wer einen Bereich öffnet, soll Zustand, Wissen,
   * offene Fragen, Beobachtungsregeln und laufende Vorgänge zusammen sehen – nicht über
   * fünf Reiter verteilt.
   */
  app.get('/households/:householdId/domains/:domainId/detail', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const domainId = param(request, 'domainId')
      const domains = await deps.domains.list(tx, ctx, now)
      const domain = domains.find((d) => d.id === domainId)
      if (!domain) throw notFound('Der Bereich')

      const definitions = await deps.state.listDefinitions(tx, ctx, domainId)
      const values = await Promise.all(
        definitions.map(async (definition) => ({
          definition,
          value: await deps.state.readValue(tx, ctx, definition.id, now),
        })),
      )

      const [monitors, knowledge, questions, decisions, processes, attention, openTasks] = await Promise.all([
        deps.monitors.list(tx, ctx, domainId),
        deps.knowledge.listKnowledge(tx, ctx, domainId),
        deps.knowledge.listQuestions(tx, ctx, 'open'),
        deps.knowledge.listDecisions(tx, ctx, domainId),
        deps.work.listProcesses(tx, ctx, { domainId }),
        deps.attention.list(tx, ctx, { domainId }),
        // Ein Bereich zeigte alles außer dem, was in ihm gerade offen ist (Audit K1).
        deps.work.listOpenTasks(tx, ctx, domainId),
      ])

      return reply.send({
        domain,
        children: domains.filter((d) => d.parentId === domainId),
        states: values.map((v) => ({ ...v.value, definition: v.definition })),
        monitors,
        knowledge,
        questions: questions.filter((q) => q.domainId === domainId),
        decisions,
        processes,
        tasks: openTasks,
        attention: attention.filter((a) => ['open', 'acknowledged', 'snoozed'].includes(a.state)),
      })
    }),
  )

  /* ── State ────────────────────────────────────────────────────────── */

  app.get('/households/:householdId/domains/:domainId/state-definitions', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const items = await deps.state.listDefinitions(tx, ctx, param(request, 'domainId'))
      return reply.send({ items })
    }),
  )

  app.post('/households/:householdId/domains/:domainId/state-definitions', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = createStateDefinitionBody.parse(request.body)
      const row = await deps.state.defineState(tx, ctx, param(request, 'domainId'), body)
      return reply.status(201).send(row)
    }),
  )

  /**
   * Eine bestehende Angabe ändern (docs/77).
   *
   * Nicht am Bereich, sondern an der Angabe: Sie hat eine eigene Kennung, und der Bereich
   * ändert sich dabei nicht.
   */
  app.patch('/households/:householdId/state-definitions/:stateDefinitionId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = updateStateDefinitionBody.parse(request.body)
      const row = await deps.state.updateDefinition(tx, ctx, param(request, 'stateDefinitionId'), body, now)
      return reply.send(row)
    }),
  )

  app.get('/households/:householdId/state-definitions/:stateDefinitionId/value', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const view = await deps.state.readValue(tx, ctx, param(request, 'stateDefinitionId'), now)
      return reply.header('etag', `"${view.version}"`).send(view)
    }),
  )

  app.put('/households/:householdId/state-definitions/:stateDefinitionId/value', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = putStateValueBody.parse(request.body)
      const result = await deps.state.writeValue(
        tx,
        ctx,
        param(request, 'stateDefinitionId'),
        { ...body, observedAt: body.observedAt ? new Date(body.observedAt) : undefined },
        now,
      )
      // Ein Konflikt ist kein Fehler: beide Angaben bleiben sichtbar, bis jemand entscheidet.
      return reply.status(result.view.conflict ? 409 : 200).send({
        value: result.view,
        applied: result.rule !== 'machine_blocked_by_confirmed_human' && result.rule !== 'human_conflict_within_window',
        rule: result.rule,
        conflictCreated: result.conflictCreated,
      })
    }),
  )

  app.post('/households/:householdId/state-values/:stateValueId/resolve-conflict', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = resolveConflictBody.parse(request.body)
      const view = await deps.state.resolveConflict(tx, ctx, param(request, 'stateValueId'), body, now)
      return reply.send(view)
    }),
  )

  /* ── Monitoring & Attention ───────────────────────────────────────── */

  app.get('/households/:householdId/monitors', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const domainId = (request.query as { domainId?: string }).domainId
      const items = await deps.monitors.list(tx, ctx, domainId)
      /*
        Die Bilanz kommt mit der Liste, nicht auf Anfrage je Regel: Zwanzig Regeln wären
        sonst zwanzig Abfragen. Sie beantwortet die Frage „kann ich mich darauf verlassen?",
        die sich sonst niemand beantworten kann (docs/60 Q1).
      */
      const bilanz = await deps.monitors.statistik(tx, ctx, items.map((m) => m.id))
      return reply.send({
        items: items.map((m) => ({ ...m, bilanz: bilanz.get(m.id) ?? null })),
      })
    }),
  )

  app.post('/households/:householdId/monitors', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = createMonitorBody.parse(request.body)
      return reply.status(201).send(await deps.monitors.create(tx, ctx, body, now))
    }),
  )

  /** Manuelle Auswertung – für Diagnose und Tests. Im Betrieb übernimmt das der Worker. */
  /*
   * Eine Regel, die man anlegen, aber nicht loswerden kann, ist eine Falle – erst recht, seit
   * sie Aufgaben erzeugt. Abschalten ist der übliche Weg; gelöscht wird nur, was nie etwas
   * bewirkt hat.
   */
  /*
   * Eine Regel ändern – nicht nur an- und abschalten.
   *
   * Vorher nahm dieser Endpunkt ausschließlich `enabled`. Zusammen mit `remove()`, das ab dem
   * ersten Signal verweigert, war eine einmal gelaufene Regel für immer eingefroren: Wer den
   * Rhythmus falsch gewählt hatte, konnte sie nur noch abschalten.
   */
  app.patch('/households/:householdId/monitors/:monitorId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = updateMonitorBody.parse(request.body ?? {})
      const monitorId = param(request, 'monitorId')

      const { enabled, ...rest } = body
      if (Object.values(rest).some((v) => v !== undefined)) {
        await deps.monitors.update(tx, ctx, monitorId, rest, now)
      }
      // An- und Abschalten bleibt ein eigener Vorgang: Es ist kein Ändern der Regel,
      // sondern ein Aussetzen – und trägt deshalb sein eigenes Ereignis.
      if (enabled !== undefined) {
        await deps.monitors.setEnabled(tx, ctx, monitorId, enabled, now)
      }
      return reply.send({ ok: true })
    }),
  )

  app.delete('/households/:householdId/monitors/:monitorId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      await deps.monitors.remove(tx, ctx, param(request, 'monitorId'), now)
      return reply.send({ ok: true })
    }),
  )

  app.post('/households/:householdId/monitors/:monitorId/evaluate', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      authorize(ctx, 'monitor:read', { type: 'monitor', id: null, householdId: ctx.householdId })
      return reply.send(await deps.monitors.evaluate(tx, ctx, param(request, 'monitorId'), now))
    }),
  )

  app.get('/households/:householdId/attention', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const query = request.query as { state?: string; domainId?: string }
      return reply.send({ items: await deps.attention.list(tx, ctx, query) })
    }),
  )

  for (const [path, event] of [
    ['confirm', 'confirm'],
    ['dismiss', 'dismiss'],
    ['snooze', 'snooze'],
    ['mark-irrelevant', 'mark_irrelevant'],
  ] as const) {
    app.post(`/households/:householdId/attention/:attentionId/${path}`, async (request, reply) =>
      inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
        const input =
          event === 'snooze'
            ? { until: new Date(snoozeAttentionBody.parse(request.body).until), reason: undefined }
            : event === 'mark_irrelevant'
              ? { reason: markIrrelevantBody.parse(request.body).reason }
              : { reason: dismissAttentionBody.parse(request.body ?? {}).reason }
        const result = await deps.attention.triage(tx, ctx, param(request, 'attentionId'), event, input, now)
        return reply.send(result)
      }),
    )
  }

  app.post('/households/:householdId/attention/:attentionId/promote', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = promoteAttentionBody.parse(request.body ?? {})
      const result = await deps.attention.promote(tx, ctx, param(request, 'attentionId'), body, now)
      return reply.status(201).send(result)
    }),
  )

  /* ── Playbooks (§15) ──────────────────────────────────────────────── */

  app.get('/households/:householdId/playbooks', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const domainId = (request.query as { domainId?: string }).domainId
      return reply.send({
        items: await deps.work.listPlaybooks(tx, ctx, domainId),
        // „Playbook" ist ein Wort aus dem Modell. In der Oberfläche heißt die Sache „Ablauf" –
        // und dieser Satz wird dort unverändert angezeigt (Audit 2, M1).
        note:
          'Ein Ablauf ist eine Vorlage. Er wird nicht abgearbeitet – aus ihm entsteht ' +
          'jedes Mal ein neuer Vorgang mit eigenen Schritten.',
      })
    }),
  )

  app.post('/households/:householdId/playbooks', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = createPlaybookBody.parse(request.body)
      return reply.status(201).send(await deps.work.createPlaybook(tx, ctx, body))
    }),
  )

  app.post('/households/:householdId/playbooks/:playbookId/instantiate', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = instantiatePlaybookBody.parse(request.body)
      return reply.status(201).send(await deps.work.instantiatePlaybook(tx, ctx, param(request, 'playbookId'), body))
    }),
  )

  /** Autonomiestufe A1: ein Vorschlag mit Begründung, nie eine automatische Auswahl. */
  app.get('/households/:householdId/playbook-suggestions', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const query = request.query as { domainId?: string; title?: string }
      if (!query.domainId) throw badRequest('validation_failed', 'Für Vorschläge fehlt der Bereich.')
      return reply.send({ items: await deps.work.suggestPlaybooks(tx, ctx, query.domainId, query.title ?? '') })
    }),
  )

  /* ── Arbeit ───────────────────────────────────────────────────────── */

  app.get('/households/:householdId/processes', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const query = request.query as { state?: string; domainId?: string }
      return reply.send({ items: await deps.work.listProcesses(tx, ctx, query) })
    }),
  )

  app.post('/households/:householdId/processes', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = createProcessBody.parse(request.body)
      return reply.status(201).send(
        await deps.work.createProcess(tx, ctx, { ...body, dueAt: body.dueAt ? new Date(body.dueAt) : null }),
      )
    }),
  )

  app.get('/households/:householdId/processes/:processId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const result = await deps.work.getProcess(tx, ctx, param(request, 'processId'), now)
      return reply.send({
        process: result.process,
        tasks: result.tasks,
        nextActions: result.nextActions,
        openTaskCount: result.openTaskCount,
        // §12 / INV-P04: Die Frage nach dem nächsten Schritt ist immer beantwortbar.
        nextStepHint:
          result.nextActions.length > 0
            ? result.nextActions[0]!.title
            : 'Für diesen Vorgang ist gerade kein nächster Schritt festgelegt.',
      })
    }),
  )

  app.patch('/households/:householdId/processes/:processId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = updateProcessBody.parse(request.body)
      return reply.send(await deps.work.updateProcess(tx, ctx, param(request, 'processId'), body, now))
    }),
  )

  app.post('/households/:householdId/processes/:processId/complete', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = completeProcessBody.parse(request.body ?? {})
      await deps.work.completeProcess(tx, ctx, param(request, 'processId'), body, now)
      return reply.send({ ok: true })
    }),
  )

  app.post('/households/:householdId/tasks', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = createTaskBody.parse(request.body)
      return reply.status(201).send(
        await deps.work.createTask(tx, ctx, {
          ...body,
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
          deferUntil: body.deferUntil ? new Date(body.deferUntil) : null,
        }),
      )
    }),
  )

  /*
   * Berichtigen – für Aufgaben, Notizen, Fragen und Entscheidungen.
   *
   * Bis hierher gab es zu all dem nur Anlegen und Lebenszyklus: abhaken, beantworten,
   * verwerfen. Wer sich vertippt hatte, konnte den Eintrag weder ändern noch loswerden.
   */
  app.patch('/households/:householdId/tasks/:taskId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = updateTaskBody.parse(request.body)
      return reply.send(
        await deps.work.updateTask(
          tx,
          ctx,
          param(request, 'taskId'),
          { ...body, dueAt: body.dueAt === undefined ? undefined : body.dueAt ? new Date(body.dueAt) : null },
          now,
        ),
      )
    }),
  )

  app.post('/households/:householdId/tasks/:taskId/complete', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = completeTaskBody.parse(request.body ?? {})
      const result = await deps.work.completeTask(tx, ctx, param(request, 'taskId'), body, now)
      return reply.send(result)
    }),
  )

  /**
   * §57: Rückgängig statt Bestätigungsdialog. Ein versehentliches „Erledigt" darf nichts
   * kosten – die Zustandsmaschine erlaubt den Weg zurück ausdrücklich (docs/03 §1).
   */
  app.post('/households/:householdId/tasks/:taskId/reopen', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) =>
      reply.send(await deps.work.transition(tx, ctx, param(request, 'taskId'), 'reopen', {}, now)),
    ),
  )

  app.post('/households/:householdId/tasks/:taskId/start', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) =>
      reply.send(await deps.work.transition(tx, ctx, param(request, 'taskId'), 'start', {}, now)),
    ),
  )

  app.post('/households/:householdId/tasks/:taskId/defer', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = deferTaskBody.parse(request.body)
      return reply.send(
        await deps.work.transition(tx, ctx, param(request, 'taskId'), 'defer', { until: new Date(body.until), reason: body.reason }, now),
      )
    }),
  )

  app.post('/households/:householdId/tasks/:taskId/drop', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = dropTaskBody.parse(request.body)
      return reply.send(await deps.work.transition(tx, ctx, param(request, 'taskId'), 'drop', body, now))
    }),
  )

  /*
    Löschen statt verwerfen – für den Vertipper.

    `drop` verlangt einen Grund und hinterlässt eine Spur; das ist richtig für eine Aufgabe,
    die einmal etwas bedeutet hat. Für eine, die zwei Sekunden alt und noch unberührt ist,
    ist es Zeremonie. Der Dienst prüft, welcher der beiden Fälle vorliegt.
  */
  app.delete('/households/:householdId/tasks/:taskId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      await deps.work.remove(tx, ctx, param(request, 'taskId'), now)
      return reply.code(204).send()
    }),
  )

  app.post('/households/:householdId/tasks/:taskId/wait', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = waitTaskBody.parse(request.body)
      return reply.send(
        await deps.work.declareWaiting(tx, ctx, param(request, 'taskId'), {
          ...body,
          recheckAt: new Date(body.recheckAt),
        }),
      )
    }),
  )

  app.post('/households/:householdId/tasks/:taskId/release-wait', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) =>
      reply.send(await deps.work.transition(tx, ctx, param(request, 'taskId'), 'release', {}, now)),
    ),
  )

  app.post('/households/:householdId/tasks/:taskId/assign', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = assignTaskBody.parse(request.body)
      await deps.work.assign(tx, ctx, param(request, 'taskId'), body, (membershipId) =>
        deps.capacity.current(tx, membershipId, now),
      )
      return reply.send({ ok: true, ownershipUnchanged: true })
    }),
  )

  /* ── Now View & Quick Capture ─────────────────────────────────────── */

  app.get('/households/:householdId/now', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const query = nowQuery.parse(request.query)
      const [household] = await tx.select().from(households).where(eq(households.id, ctx.householdId)).limit(1)
      const timezone = household?.timezone ?? 'Europe/Berlin'
      const at = query.at ? new Date(query.at) : now

      /*
       * Der Plan wird nur gebaut, wenn danach gefragt wurde (docs/80).
       *
       * Gefragt ist er, sobald einer der vier Werte im Aufruf steht – oder wenn der
       * Betrachter ihn sich einmal gemerkt hat. Ohne beides bleibt „Jetzt" unverändert:
       * drei Einträge und eine Begründung, keine Liste.
       */
      const explizit =
        query.horizon !== undefined ||
        query.strategy !== undefined ||
        query.aging !== undefined ||
        query.slack !== undefined
      const gemerkt = await deps.planning.settingsFor(tx, ctx.householdId, ctx.membershipId)
      const hatVorgabe = await deps.planning.hasPreference(tx, ctx.householdId, ctx.membershipId)

      let plan: Parameters<typeof deps.now.build>[2]['plan'] = undefined
      if (explizit || hatVorgabe) {
        const settings = {
          horizon: query.horizon ?? gemerkt.horizon,
          strategy: query.strategy ?? gemerkt.strategy,
          aging: query.aging ?? gemerkt.aging,
          slack: query.slack ?? gemerkt.slack,
        }
        if (query.remember) await deps.planning.remember(tx, ctx.householdId, ctx.membershipId, settings)
        plan = {
          settings,
          firstSlotStart: startOfDayIn(timezone, at),
          cueBySubject: await deps.planning.cueBySubject(tx, ctx.householdId),
        }
      }

      const view = await deps.now.build(tx, ctx, { now: at, timezone, plan })
      return reply.send(view)
    }),
  )

  app.post('/households/:householdId/capture', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = captureBody.parse(request.body)
      const result = await deps.intake.capture(tx, ctx, {
        text: body.text,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      })
      return reply.status(201).send(result)
    }),
  )

  app.get('/households/:householdId/inbox', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const state = (request.query as { state?: string }).state
      return reply.send({ items: await deps.intake.list(tx, ctx, state) })
    }),
  )

  app.post('/households/:householdId/inbox/:inboxItemId/process', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = processInboxBody.parse(request.body)
      const inboxItemId = param(request, 'inboxItemId')
      const fields = body.payload as Record<string, never>

      let objectId: string
      switch (body.targetType) {
        case 'task': {
          const parsed = createTaskBody.parse(fields)
          objectId = (
            await deps.work.createTask(tx, ctx, {
              ...parsed,
              dueAt: parsed.dueAt ? new Date(parsed.dueAt) : null,
              deferUntil: parsed.deferUntil ? new Date(parsed.deferUntil) : null,
            })
          ).id
          break
        }
        case 'question': {
          const parsed = createQuestionBody.parse(fields)
          objectId = (await deps.knowledge.ask(tx, ctx, parsed)).id
          break
        }
        case 'knowledge': {
          const parsed = createKnowledgeBody.parse(fields)
          objectId = (await deps.knowledge.addKnowledge(tx, ctx, parsed, now)).id
          break
        }
        case 'decision': {
          const parsed = createDecisionBody.parse(fields)
          objectId = (
            await deps.knowledge.recordDecision(tx, ctx, {
              ...parsed,
              reviewAfter: parsed.reviewAfter ? new Date(parsed.reviewAfter) : null,
            })
          ).id
          break
        }
        case 'process': {
          const parsed = createProcessBody.parse(fields)
          objectId = (
            await deps.work.createProcess(tx, ctx, { ...parsed, dueAt: parsed.dueAt ? new Date(parsed.dueAt) : null })
          ).id
          break
        }
        case 'monitor': {
          const parsed = createMonitorBody.parse(fields)
          objectId = (await deps.monitors.create(tx, ctx, parsed, now)).id
          break
        }
        default:
          throw badRequest('validation_failed', `Verarbeitung nach „${body.targetType}" ist noch nicht verfügbar.`)
      }

      await deps.intake.markProcessed(tx, ctx, inboxItemId, { targetType: body.targetType, objectId }, now)
      return reply.status(201).send({ targetType: body.targetType, objectId })
    }),
  )

  /* ── Kapazität & Vertretung ───────────────────────────────────────── */

  app.get('/households/:householdId/capacity/me', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) =>
      reply.send(await deps.capacity.current(tx, ctx.membershipId, now)),
    ),
  )

  app.put('/households/:householdId/capacity/me', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = putCapacityBody.parse(request.body)
      const result = await deps.capacity.declare(
        tx,
        ctx,
        { ...body, endsAt: body.endsAt ? new Date(body.endsAt) : null },
        now,
      )
      return reply.send({
        ...result,
        // §1.10: keine wertende Sprache, keine Rechtfertigung nötig.
        note: 'Deine Angabe verändert nur, was dir angezeigt wird – nicht, wofür du verantwortlich bist.',
      })
    }),
  )

  app.delete('/households/:householdId/capacity/me', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      await deps.capacity.clear(tx, ctx, now)
      return reply.status(204).send()
    }),
  )

  app.post('/households/:householdId/coverages', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = createCoverageBody.parse(request.body)
      return reply.status(201).send(
        await deps.coverage.create(
          tx,
          ctx,
          { ...body, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt) },
          now,
        ),
      )
    }),
  )

  app.get('/households/:householdId/coverages', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) =>
      reply.send({ items: await deps.coverage.list(tx, ctx, (request.query as { state?: string }).state) }),
    ),
  )

  app.post('/households/:householdId/coverages/:coverageId/confirm-return', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      await deps.coverage.confirmReturn(tx, ctx, param(request, 'coverageId'), now)
      return reply.send({ ok: true })
    }),
  )

  /* ── Wissen ───────────────────────────────────────────────────────── */

  app.get('/households/:householdId/knowledge', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) =>
      reply.send({ items: await deps.knowledge.listKnowledge(tx, ctx, (request.query as { domainId?: string }).domainId) }),
    ),
  )

  app.post('/households/:householdId/knowledge', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = createKnowledgeBody.parse(request.body)
      return reply.status(201).send(await deps.knowledge.addKnowledge(tx, ctx, body, now))
    }),
  )

  app.patch('/households/:householdId/knowledge/:knowledgeId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = updateKnowledgeBody.parse(request.body)
      return reply.send(await deps.knowledge.updateKnowledge(tx, ctx, param(request, 'knowledgeId'), body, now))
    }),
  )

  app.get('/households/:householdId/questions', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) =>
      reply.send({ items: await deps.knowledge.listQuestions(tx, ctx, (request.query as { state?: string }).state ?? 'open') }),
    ),
  )

  app.post('/households/:householdId/questions', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = createQuestionBody.parse(request.body)
      return reply.status(201).send(await deps.knowledge.ask(tx, ctx, body))
    }),
  )

  app.post('/households/:householdId/questions/:questionId/answer', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = answerQuestionBody.parse(request.body)
      return reply.send(await deps.knowledge.answer(tx, ctx, param(request, 'questionId'), body, now))
    }),
  )

  app.patch('/households/:householdId/questions/:questionId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = updateQuestionBody.parse(request.body)
      return reply.send(await deps.knowledge.updateQuestion(tx, ctx, param(request, 'questionId'), body, now))
    }),
  )

  app.get('/households/:householdId/decisions', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) =>
      reply.send({ items: await deps.knowledge.listDecisions(tx, ctx, (request.query as { domainId?: string }).domainId) }),
    ),
  )

  app.post('/households/:householdId/decisions', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = createDecisionBody.parse(request.body)
      return reply.status(201).send(
        await deps.knowledge.recordDecision(tx, ctx, {
          ...body,
          reviewAfter: body.reviewAfter ? new Date(body.reviewAfter) : null,
        }),
      )
    }),
  )

  app.patch('/households/:householdId/decisions/:decisionId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = updateDecisionBody.parse(request.body)
      return reply.send(await deps.knowledge.updateDecision(tx, ctx, param(request, 'decisionId'), body, now))
    }),
  )

  void recordEvent
}
