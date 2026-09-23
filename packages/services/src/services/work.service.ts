import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import {
  playbookSteps,
  playbooks,
  processes,
  taskDependencies,
  tasks,
  uuidv7,
  waitingStates,
  type Tx,
} from '@thealotta/db'
import {
  assertAutonomy,
  authorize,
  badRequest,
  conflict,
  next as nextState,
  nextActions,
  notFound,
  openTaskCount,
  processMachine,
  taskMachine,
  type EffectiveContext,
  type TaskLike,
} from '@thealotta/domain'
import type { DelegationKind, EnergyLevel, ProcessOutcome, WaitingKind } from '@thealotta/contracts'
import { recordEvent } from '@thealotta/db'
import { DomainService } from './domain.service.js'
import { StateService } from './state.service.js'

const domainService = new DomainService()
const stateService = new StateService()

function canRead(ctx: EffectiveContext, capability: 'process:read' | 'task:read', domainId: string | null): boolean {
  try {
    authorize(ctx, capability, { type: 'generic', id: null, householdId: ctx.householdId, domainId })
    return true
  } catch {
    return false
  }
}

export interface TaskInput {
  title: string
  description?: string
  domainId: string | null
  processId: string | null
  assigneeMembershipId: string | null
  dueAt: Date | null
  deferUntil: Date | null
  estimatedMinutes: number | null
  mentalEnergy: EnergyLevel
  activate: boolean
}

export class WorkService {
  /* ── Process ─────────────────────────────────────────────────────── */

  async createProcess(
    tx: Tx,
    ctx: EffectiveContext,
    input: { domainId: string; title: string; goal?: string; playbookId: string | null; ownerMembershipId: string | null; dueAt: Date | null },
  ): Promise<{ id: string }> {
    const domain = await domainService.get(tx, ctx, input.domainId)
    authorize(ctx, 'process:manage', {
      type: 'process',
      id: null,
      householdId: ctx.householdId,
      domainId: input.domainId,
      sensitivity: domain.sensitivity,
    })

    const id = uuidv7()
    await tx.insert(processes).values({
      id,
      householdId: ctx.householdId,
      domainId: input.domainId,
      playbookId: input.playbookId,
      title: input.title,
      goal: input.goal ?? null,
      state: 'active',
      ownerMembershipId: input.ownerMembershipId ?? ctx.membershipId,
      dueAt: input.dueAt,
      createdBy: ctx.membershipId,
    })
    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'process.created',
      subjectType: 'process',
      subjectId: id,
      payload: { domainId: input.domainId, title: input.title },
    })

    if (input.playbookId) await this.instantiateSteps(tx, ctx, id, input.playbookId, input.domainId)
    return { id }
  }

  async getProcess(tx: Tx, ctx: EffectiveContext, processId: string, now: Date) {
    const [process] = await tx
      .select()
      .from(processes)
      .where(and(eq(processes.householdId, ctx.householdId), eq(processes.id, processId)))
      .limit(1)
    if (!process) throw notFound('Der Vorgang')
    authorize(ctx, 'process:read', {
      type: 'process',
      id: process.id,
      householdId: ctx.householdId,
      domainId: process.domainId,
    })

    const taskRows = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.householdId, ctx.householdId), eq(tasks.processId, processId)))
      .orderBy(tasks.position)

    const deps = taskRows.length
      ? await tx
          .select()
          .from(taskDependencies)
          .where(inArray(taskDependencies.taskId, taskRows.map((t) => t.id)))
      : []

    const taskLikes = taskRows.map(toTaskLike)
    const next = nextActions(
      taskLikes,
      deps.map((d) => ({ taskId: d.taskId, dependsOnTaskId: d.dependsOnTaskId })),
      now,
    )

    return {
      process,
      tasks: taskRows,
      // ADR-0006: berechnete Projektion, keine zweite Wahrheit.
      nextActions: next,
      openTaskCount: openTaskCount(taskLikes),
    }
  }

  async completeProcess(
    tx: Tx,
    ctx: EffectiveContext,
    processId: string,
    input: { outcome: ProcessOutcome; learnings?: string; forceCloseReason?: string },
    now: Date,
  ): Promise<void> {
    const { process, tasks: taskRows } = await this.getProcess(tx, ctx, processId, now)
    authorize(ctx, 'process:manage', {
      type: 'process',
      id: process.id,
      householdId: ctx.householdId,
      domainId: process.domainId,
    })

    const target = nextState(processMachine, process.state as never, 'complete')
    const open = openTaskCount(taskRows.map(toTaskLike))

    if (open > 0 && !input.forceCloseReason) {
      throw conflict(
        'open_tasks_remaining',
        `Es sind noch ${open} Schritte offen. Bitte entweder abschließen oder mit Begründung bewusst verwerfen.`,
        { openTasks: open },
      )
    }

    if (open > 0) {
      // Kein stiller Verlust: jeder verworfene Schritt bekommt Grund und Event (INV-001).
      const openRows = taskRows.filter((t) =>
        ['draft', 'ready', 'in_progress', 'blocked', 'waiting', 'deferred'].includes(t.state),
      )
      for (const t of openRows) {
        await tx
          .update(tasks)
          .set({ state: 'dropped', dropReason: `Vorgang abgeschlossen: ${input.forceCloseReason}`, version: sql`version + 1` })
          .where(eq(tasks.id, t.id))
        await recordEvent(tx, ctx.householdId, ctx.actor, {
          eventType: 'task.state_changed',
          subjectType: 'task',
          subjectId: t.id,
          payload: { from: t.state, to: 'dropped', reason: input.forceCloseReason },
        })
      }
    }

    await tx
      .update(processes)
      .set({
        state: target,
        outcome: input.outcome,
        outcomeReason: input.forceCloseReason ?? null,
        learnings: input.learnings ?? null,
        completedAt: now,
        version: sql`version + 1`,
      })
      .where(eq(processes.id, processId))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'process.completed',
      subjectType: 'process',
      subjectId: processId,
      payload: { outcome: input.outcome, forcedClose: Boolean(input.forceCloseReason) },
    })
  }

  /**
   * Eine Vorgangsliste ohne nächsten Schritt ist eine Titelliste.
   *
   * §14 verlangt Ziel, Stand und nächsten Schritt. Deshalb kommen Fortschritt und die
   * nächste offene Aufgabe gleich mit – in einer Abfrage, nicht als N+1 aus der Oberfläche.
   */
  /**
   * Die offenen Aufgaben eines Bereichs.
   *
   * Ein Bereich ist der Raum, in dem Verantwortung lebt – und zeigte bis hierher alles außer
   * dem, was gerade offen ist. Wer für „Schuhe" verantwortlich war, konnte nicht nachsehen,
   * was für „Schuhe" ansteht; er musste warten, bis die Jetzt-Ansicht es hochspült.
   *
   * Einzelne Aufgaben, keine Vorgangsschritte: Die stehen bei ihrem Vorgang, und zweimal
   * dasselbe zu zeigen hieße, dass man beide Listen abgleichen muss.
   */
  async listOpenTasks(tx: Tx, ctx: EffectiveContext, domainId: string) {
    if (!canRead(ctx, 'task:read', domainId)) return []

    const rows = await tx
      .select({
        id: tasks.id,
        title: tasks.title,
        state: tasks.state,
        dueAt: tasks.dueAt,
        deferUntil: tasks.deferUntil,
        assigneeMembershipId: tasks.assigneeMembershipId,
        estimatedMinutes: tasks.estimatedMinutes,
        // Wird zum Bearbeiten gebraucht: Ein Formular, das den aktuellen Wert nicht kennt,
        // kann ihn nur überschreiben, nicht zeigen.
        mentalEnergy: tasks.mentalEnergy,
        origin: tasks.origin,
        rationale: tasks.rationale,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.householdId, ctx.householdId),
          eq(tasks.domainId, domainId),
          isNull(tasks.processId),
          inArray(tasks.state, ['ready', 'in_progress', 'blocked', 'waiting', 'deferred']),
        ),
      )
      // Was fällig ist, zuerst; Undatiertes danach in der Reihenfolge seiner Entstehung.
      .orderBy(sql`due_at NULLS LAST`, sql`created_at`)
      .limit(100)

    return rows
  }

  async listProcesses(tx: Tx, ctx: EffectiveContext, filter: { state?: string; domainId?: string }) {
    const conditions = [eq(processes.householdId, ctx.householdId)]
    if (filter.state) conditions.push(eq(processes.state, filter.state))
    if (filter.domainId) conditions.push(eq(processes.domainId, filter.domainId))
    const rows = await tx.select().from(processes).where(and(...conditions)).orderBy(sql`created_at DESC`).limit(200)
    const visible = rows.filter((p) => canRead(ctx, 'process:read', p.domainId))
    if (visible.length === 0) return []

    const ids = visible.map((p) => p.id)
    const taskRows = await tx
      .select({
        id: tasks.id,
        processId: tasks.processId,
        title: tasks.title,
        state: tasks.state,
        position: tasks.position,
        assigneeMembershipId: tasks.assigneeMembershipId,
      })
      .from(tasks)
      .where(and(eq(tasks.householdId, ctx.householdId), inArray(tasks.processId, ids)))
      .orderBy(tasks.position)

    const byProcess = new Map<string, typeof taskRows>()
    for (const task of taskRows) {
      if (!task.processId) continue
      const list = byProcess.get(task.processId) ?? []
      list.push(task)
      byProcess.set(task.processId, list)
    }

    const OPEN = new Set(['ready', 'in_progress', 'blocked', 'waiting', 'deferred'])
    return visible.map((process) => {
      const list = byProcess.get(process.id) ?? []
      const done = list.filter((t) => t.state === 'done').length
      const next = list.find((t) => t.state === 'ready' || t.state === 'in_progress')
      const waiting = list.some((t) => t.state === 'waiting' || t.state === 'blocked')
      return {
        ...process,
        progress: { done, total: list.length, open: list.filter((t) => OPEN.has(t.state)).length },
        nextStep: next ? { id: next.id, title: next.title, assigneeMembershipId: next.assigneeMembershipId } : null,
        waiting,
      }
    })
  }

  /* ── Playbooks (§15) ─────────────────────────────────────────────── */

  /**
   * Ein Playbook ist eine Vorlage für einen wiederkehrenden Vorgang – nicht der Vorgang selbst.
   * Erst die Instanziierung erzeugt Tasks; die Vorlage bleibt unverändert und wiederverwendbar.
   */
  async createPlaybook(
    tx: Tx,
    ctx: EffectiveContext,
    input: {
      domainId: string | null
      title: string
      triggerDescription: string
      steps: {
        title: string
        description?: string
        estimatedMinutes: number | null
        mentalEnergy: EnergyLevel
            }[]
    },
  ): Promise<{ id: string }> {
    authorize(ctx, 'process:manage', {
      type: 'playbook',
      id: null,
      householdId: ctx.householdId,
      domainId: input.domainId,
    })

    const id = uuidv7()
    await tx.insert(playbooks).values({
      id,
      householdId: ctx.householdId,
      domainId: input.domainId,
      title: input.title,
      triggerDescription: input.triggerDescription,
      scope: input.domainId ? 'domain' : 'household',
      createdBy: ctx.membershipId,
    })

    await tx.insert(playbookSteps).values(
      input.steps.map((step, index) => ({
        householdId: ctx.householdId,
        playbookId: id,
        position: index + 1,
        title: step.title,
        description: step.description ?? null,
        estimatedMinutes: step.estimatedMinutes,
        mentalEnergy: step.mentalEnergy,
      })),
    )

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'playbook.created',
      subjectType: 'playbook',
      subjectId: id,
      payload: { title: input.title, steps: input.steps.length, domainId: input.domainId },
    })
    return { id }
  }

  async listPlaybooks(tx: Tx, ctx: EffectiveContext, domainId?: string) {
    const rows = await tx
      .select()
      .from(playbooks)
      .where(
        domainId
          ? and(eq(playbooks.householdId, ctx.householdId), eq(playbooks.domainId, domainId), isNull(playbooks.archivedAt))
          : and(eq(playbooks.householdId, ctx.householdId), isNull(playbooks.archivedAt)),
      )
    if (rows.length === 0) return []

    const steps = await tx
      .select()
      .from(playbookSteps)
      .where(inArray(playbookSteps.playbookId, rows.map((p) => p.id)))
      .orderBy(playbookSteps.position)

    return rows.map((playbook) => ({
      ...playbook,
      steps: steps.filter((s) => s.playbookId === playbook.id),
    }))
  }

  /** §15: Ein Process wird aus einem Playbook instanziiert – die Vorlage bleibt unberührt. */
  async instantiatePlaybook(
    tx: Tx,
    ctx: EffectiveContext,
    playbookId: string,
    input: { domainId: string; title?: string },
  ): Promise<{ id: string }> {
    const [playbook] = await tx
      .select()
      .from(playbooks)
      .where(and(eq(playbooks.householdId, ctx.householdId), eq(playbooks.id, playbookId)))
      .limit(1)
    if (!playbook) throw notFound('Der Ablauf')

    return this.createProcess(tx, ctx, {
      domainId: input.domainId,
      title: input.title ?? playbook.title,
      goal: playbook.triggerDescription || undefined,
      playbookId,
      ownerMembershipId: null,
      dueAt: null,
    })
  }

  /* ── Task ────────────────────────────────────────────────────────── */

  async createTask(tx: Tx, ctx: EffectiveContext, input: TaskInput): Promise<{ id: string }> {
    let domainId = input.domainId
    if (input.processId) {
      const [process] = await tx
        .select()
        .from(processes)
        .where(and(eq(processes.householdId, ctx.householdId), eq(processes.id, input.processId)))
        .limit(1)
      if (!process) throw notFound('Der Vorgang')
      domainId ??= process.domainId
    }

    authorize(ctx, 'task:create', {
      type: 'task',
      id: null,
      householdId: ctx.householdId,
      domainId,
    })

    if (input.assigneeMembershipId && input.assigneeMembershipId !== ctx.membershipId) {
      authorize(ctx, 'task:assign', { type: 'task', id: null, householdId: ctx.householdId, domainId })
    }

    const id = uuidv7()
    const position = input.processId ? await this.nextPosition(tx, input.processId) : 0

    await tx.insert(tasks).values({
      id,
      householdId: ctx.householdId,
      domainId,
      processId: input.processId,
      title: input.title,
      description: input.description ?? null,
      state: input.activate ? 'ready' : 'draft',
      position,
      assigneeMembershipId: input.assigneeMembershipId,
      dueAt: input.dueAt,
      deferUntil: input.deferUntil,
      estimatedMinutes: input.estimatedMinutes,
      mentalEnergy: input.mentalEnergy,
      origin: ctx.actor.kind === 'user' ? 'human' : 'system_rule',
      rationale: ctx.actor.kind === 'user' ? null : 'Automatisch aus einer aktivierten Regel erzeugt.',
      createdBy: ctx.membershipId,
    })


    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'task.created',
      subjectType: 'task',
      subjectId: id,
      payload: { title: input.title, domainId, processId: input.processId },
    })
    return { id }
  }

  /**
   * Titel und Ziel eines Vorgangs ändern.
   *
   * Dieselbe Lücke wie bei den Aufgaben: Ein Vorgang ließ sich starten, abschließen und
   * verwerfen – aber nicht berichtigen. Der Zustand bleibt außen vor; dafür gibt es die
   * Zustandsmaschine.
   */
  async updateProcess(
    tx: Tx,
    ctx: EffectiveContext,
    processId: string,
    input: { title?: string; goal?: string | null },
    now: Date,
  ): Promise<{ id: string }> {
    const { process } = await this.getProcess(tx, ctx, processId, now)
    authorize(ctx, 'process:manage', {
      type: 'process',
      id: process.id,
      householdId: ctx.householdId,
      domainId: process.domainId,
    })

    const aenderung: Record<string, unknown> = { updatedAt: now }
    if (input.title !== undefined) aenderung['title'] = input.title
    if (input.goal !== undefined) aenderung['goal'] = input.goal

    await tx
      .update(processes)
      .set(aenderung)
      .where(and(eq(processes.householdId, ctx.householdId), eq(processes.id, processId)))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'process.updated',
      subjectType: 'process',
      subjectId: processId,
      payload: { felder: Object.keys(input) },
    })
    return { id: processId }
  }

  /**
   * Die Angaben einer Aufgabe ändern.
   *
   * Bis hierher ließ sich eine Aufgabe abhaken, verschieben, abgeben, verwerfen – nur nicht
   * berichtigen. Ein Tippfehler im Titel oder eine Schätzung, die sich als falsch erwiesen
   * hat, waren damit unveränderlich, und die Schätzung trägt seit der Planung (docs/80)
   * echtes Gewicht: Sie entscheidet, was in einen Tag passt.
   *
   * Zustand, Zuweisung und Frist-Freigabe bleiben außen vor – dafür gibt es eigene Wege mit
   * eigenen Regeln (Zustandsmaschine, INV-012). Ein Formular, das beides mischt, verwischt
   * den Unterschied zwischen „das stimmt so nicht" und „das ist jetzt anders".
   */
  async updateTask(
    tx: Tx,
    ctx: EffectiveContext,
    taskId: string,
    input: { title?: string; estimatedMinutes?: number | null; mentalEnergy?: string; dueAt?: Date | null },
    now: Date,
  ): Promise<{ id: string }> {
    const row = await this.getTask(tx, ctx, taskId)
    /*
      `task:create`, nicht eine eigene Berechtigung zum Ändern.

      Dasselbe Verhältnis wie bei den Angaben: `updateDefinition` verlangt `state:define` –
      die Berechtigung zum Anlegen. Wer Arbeit in einem Bereich schaffen darf, darf ihre
      Beschreibung auch berichtigen. Eine zusätzliche Stufe dazwischen wäre eine Unterscheidung
      ohne Unterschied, und jede neue Berechtigung muss in der Matrix gepflegt werden (docs/04).
    */
    authorize(ctx, 'task:create', {
      type: 'task',
      id: row.id,
      householdId: ctx.householdId,
      domainId: row.domainId,
      assigneeMembershipId: row.assigneeMembershipId,
    })

    const aenderung: Record<string, unknown> = { updatedAt: now, version: sql`version + 1` }
    if (input.title !== undefined) aenderung['title'] = input.title
    if (input.estimatedMinutes !== undefined) aenderung['estimatedMinutes'] = input.estimatedMinutes
    if (input.mentalEnergy !== undefined) aenderung['mentalEnergy'] = input.mentalEnergy
    if (input.dueAt !== undefined) {
      aenderung['dueAt'] = input.dueAt
      /*
        `overdue_since` gehört zur Frist, nicht zur Aufgabe.

        Wird die Frist verschoben, ist die alte Überfälligkeit hinfällig – sonst stünde die
        Aufgabe mit neuem Termin und altem „seit 12 Tagen überfällig" da, und die Planung
        (docs/80) zöge sie aus einem Grund vor, den es nicht mehr gibt.
      */
      aenderung['overdueSince'] = input.dueAt && input.dueAt.getTime() < now.getTime() ? row.overdueSince : null
    }

    await tx
      .update(tasks)
      .set(aenderung)
      .where(and(eq(tasks.householdId, ctx.householdId), eq(tasks.id, taskId)))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'task.updated',
      subjectType: 'task',
      subjectId: taskId,
      payload: { felder: Object.keys(input) },
    })
    return { id: taskId }
  }

  async getTask(tx: Tx, ctx: EffectiveContext, taskId: string): Promise<typeof tasks.$inferSelect> {
    const [row] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.householdId, ctx.householdId), eq(tasks.id, taskId)))
      .limit(1)
    if (!row) throw notFound('Die Aufgabe')
    authorize(ctx, 'task:read', {
      type: 'task',
      id: row.id,
      householdId: ctx.householdId,
      domainId: row.domainId,
      assigneeMembershipId: row.assigneeMembershipId,
    })
    return row
  }

  /**
   * Abschluss ist idempotent: „schon erledigt" ist kein Fehler (docs/09 §2).
   * Optional werden dabei Zustände aktualisiert – der LEARN-Schritt der Produktpipeline.
   */
  async completeTask(
    tx: Tx,
    ctx: EffectiveContext,
    taskId: string,
    input: { note?: string; stateUpdates: { stateDefinitionId: string; valueKind: string; value?: unknown; note?: string }[] },
    now: Date,
  ): Promise<{ state: string; alreadyDone: boolean }> {
    const row = await this.getTask(tx, ctx, taskId)

    const own = row.assigneeMembershipId === ctx.membershipId
    authorize(ctx, own ? 'task:complete' : 'task:complete_others', {
      type: 'task',
      id: row.id,
      householdId: ctx.householdId,
      domainId: row.domainId,
      assigneeMembershipId: row.assigneeMembershipId,
    })

    if (row.state === 'done') {
      return { state: 'done', alreadyDone: true }
    }

    const target = nextState(taskMachine, row.state as never, 'complete')

    await tx
      .update(tasks)
      .set({ state: target, completedAt: now, completionNote: input.note ?? null, version: sql`version + 1` })
      .where(eq(tasks.id, taskId))

    await tx
      .update(waitingStates)
      .set({ releasedAt: now, releaseReason: 'task_completed' })
      .where(and(eq(waitingStates.taskId, taskId), isNull(waitingStates.releasedAt)))

    for (const update of input.stateUpdates) {
      await stateService.writeValue(
        tx,
        ctx,
        update.stateDefinitionId,
        { valueKind: update.valueKind as never, value: update.value, note: update.note, confirm: true },
        now,
      )
    }

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'task.state_changed',
      subjectType: 'task',
      subjectId: taskId,
      payload: { from: row.state, to: target, stateUpdates: input.stateUpdates.length },
    })

    await this.unblockDependents(tx, ctx, taskId)
    return { state: target, alreadyDone: false }
  }

  async transition(
    tx: Tx,
    ctx: EffectiveContext,
    taskId: string,
    event: 'start' | 'defer' | 'drop' | 'release' | 'reopen',
    input: { until?: Date; reason?: string },
    now: Date,
  ): Promise<{ state: string }> {
    const row = await this.getTask(tx, ctx, taskId)
    if (event === 'drop') {
      authorize(ctx, 'task:drop', { type: 'task', id: row.id, householdId: ctx.householdId, domainId: row.domainId })
      if (!input.reason) throw badRequest('validation_failed', 'Zum Verwerfen bitte kurz den Grund angeben.')
    }

    const target = nextState(taskMachine, row.state as never, event)
    await tx
      .update(tasks)
      .set({
        state: target,
        deferUntil: event === 'defer' ? input.until ?? null : row.deferUntil,
        dropReason: event === 'drop' ? input.reason! : row.dropReason,
        version: sql`version + 1`,
      })
      .where(eq(tasks.id, taskId))

    if (event === 'release') {
      await tx
        .update(waitingStates)
        .set({ releasedAt: now, releaseReason: input.reason ?? 'manuell freigegeben' })
        .where(and(eq(waitingStates.taskId, taskId), isNull(waitingStates.releasedAt)))
    }

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'task.state_changed',
      subjectType: 'task',
      subjectId: taskId,
      payload: { from: row.state, to: target, event, reason: input.reason ?? null },
    })
    return { state: target }
  }

  /**
   * Eine Aufgabe endgültig löschen – aber nur, solange sie nichts hinter sich hat.
   *
   * Der übliche Weg, eine Aufgabe loszuwerden, ist `drop`: Sie verschwindet aus den Listen,
   * der Grund steht dabei, und im Verlauf bleibt nachvollziehbar, warum damals etwas auf der
   * Liste stand. Das ist kein Umweg, sondern der Sinn – §4: Nichts verschwindet still.
   *
   * Für einen Vertipper ist das aber zu viel. Wer eine Aufgabe zwei Sekunden nach dem Anlegen
   * wieder loswerden will, soll nicht begründen müssen, warum das, was er gerade versehentlich
   * geschrieben hat, nicht mehr nötig ist. Deshalb dieselbe enge Bedingung wie bei Regeln:
   * löschen, solange nichts daran hängt – sonst verwerfen.
   */
  async remove(tx: Tx, ctx: EffectiveContext, taskId: string, now: Date): Promise<void> {
    const row = await this.getTask(tx, ctx, taskId)
    authorize(ctx, 'task:drop', {
      type: 'task',
      id: row.id,
      householdId: ctx.householdId,
      domainId: row.domainId,
      assigneeMembershipId: row.assigneeMembershipId,
    })

    /*
      Jede dieser Bedingungen hat denselben Grund: Es gäbe jemanden, dem die Aufgabe fehlen
      würde. Die Meldung nennt darum nicht nur das Nein, sondern den Weg – „Nicht mehr nötig"
      führt immer zum Ziel, nur eben mit Spur.
    */
    const verwerfen = 'Nimm sie stattdessen über „Nicht mehr nötig" aus der Übersicht – dann bleibt nachvollziehbar, was daraus wurde.'

    if (row.state !== 'draft' && row.state !== 'ready') {
      throw conflict(
        'has_history',
        `„${row.title}“ ist nicht mehr unberührt – daran wurde schon gearbeitet. ${verwerfen}`,
      )
    }
    if (row.processId) {
      throw conflict(
        'belongs_to_process',
        `„${row.title}“ ist ein Schritt in einem Vorgang. Ein Schritt einzeln zu löschen risse ` +
          'eine Lücke in die Reihenfolge – der Vorgang selbst lässt sich abschließen.',
      )
    }
    if (row.origin !== 'human') {
      throw conflict(
        'made_by_rule',
        `„${row.title}“ hat eine Regel angelegt. Gelöscht käme sie beim nächsten Lauf wieder – ` +
          'schalte die Regel ab, wenn sie nicht mehr passt.',
      )
    }

    const [abhaengig] = await tx
      .select({ id: taskDependencies.id })
      .from(taskDependencies)
      .where(or(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependsOnTaskId, taskId)))
      .limit(1)
    if (abhaengig) {
      throw conflict('has_dependents', `An „${row.title}“ hängt eine andere Aufgabe. ${verwerfen}`)
    }

    const [wartet] = await tx
      .select({ id: waitingStates.id })
      .from(waitingStates)
      .where(eq(waitingStates.taskId, taskId))
      .limit(1)
    if (wartet) {
      throw conflict('has_waiting', `Auf „${row.title}“ wurde schon einmal gewartet. ${verwerfen}`)
    }

    /*
      Der Eintrag im Verlauf steht **vor** dem Löschen: Die Aufgabe ist gleich weg, ihr Titel
      wäre danach nirgends mehr zu holen. §4 gilt auch hier – gelöscht heißt nicht spurlos,
      es heißt nur: nicht mehr in den Listen.
    */
    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'task.deleted',
      subjectType: 'task',
      subjectId: taskId,
      payload: { title: row.title, domainId: row.domainId, deletedAt: now.toISOString() },
    })
    await tx.delete(tasks).where(eq(tasks.id, taskId))
  }

  /** §27: Warten ist ein eigener Zustand mit Wiedervorlage – nicht „liegt halt rum". */
  async declareWaiting(
    tx: Tx,
    ctx: EffectiveContext,
    taskId: string,
    input: { waitingKind: WaitingKind; description: string; recheckAt: Date; waitingOnMembershipId: string | null; externalParty: string | null },
  ): Promise<{ state: string }> {
    const row = await this.getTask(tx, ctx, taskId)
    const target = nextState(taskMachine, row.state as never, 'wait')

    await tx.insert(waitingStates).values({
      householdId: ctx.householdId,
      taskId,
      waitingKind: input.waitingKind,
      waitingOnMembershipId: input.waitingOnMembershipId,
      externalParty: input.externalParty,
      description: input.description,
      recheckAt: input.recheckAt,
    })
    await tx.update(tasks).set({ state: target, version: sql`version + 1` }).where(eq(tasks.id, taskId))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'task.waiting_declared',
      subjectType: 'task',
      subjectId: taskId,
      payload: { waitingKind: input.waitingKind, recheckAt: input.recheckAt.toISOString() },
    })
    return { state: target }
  }

  /**
   * INV-002: Delegation ändert ausschließlich Felder der Aufgabe. Der Verantwortungsbereich
   * bleibt unberührt – dieser Service hat bewusst keinen Zugriff auf Ownership-Tabellen.
   */
  async assign(
    tx: Tx,
    ctx: EffectiveContext,
    taskId: string,
    input: { membershipId: string | null; delegationKind: DelegationKind; override: boolean; overrideReason?: string },
    capacityOf: (membershipId: string) => Promise<{ acceptsNewAssignments: boolean }>,
  ): Promise<void> {
    const row = await this.getTask(tx, ctx, taskId)
    authorize(ctx, 'task:assign', {
      type: 'task',
      id: row.id,
      householdId: ctx.householdId,
      domainId: row.domainId,
    })

    if (input.membershipId && input.membershipId !== ctx.membershipId) {
      const capacity = await capacityOf(input.membershipId)
      if (!capacity.acceptsNewAssignments && !input.override) {
        throw conflict(
          'recipient_not_accepting',
          'Diese Person nimmt gerade keine neuen Aufgaben an. Mit ausdrücklicher Begründung ist es trotzdem möglich.',
        )
      }
      if (!capacity.acceptsNewAssignments && input.override && !input.overrideReason) {
        throw badRequest('validation_failed', 'Für die Ausnahme bitte kurz den Grund angeben.')
      }
    }

    await tx
      .update(tasks)
      .set({
        assigneeMembershipId: input.membershipId,
        delegationKind: input.membershipId ? input.delegationKind : 'none',
        delegatedBy: input.membershipId ? ctx.membershipId : null,
        version: sql`version + 1`,
      })
      .where(eq(tasks.id, taskId))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'task.assigned',
      subjectType: 'task',
      subjectId: taskId,
      payload: {
        assigneeMembershipId: input.membershipId,
        delegationKind: input.delegationKind,
        overrideReason: input.overrideReason ?? null,
        // Ausdrücklich Teil der Nutzlast: Delegation ist keine Ownership-Änderung.
        ownershipUnchanged: true,
      },
    })
  }

  private async unblockDependents(tx: Tx, ctx: EffectiveContext, completedTaskId: string): Promise<void> {
    const dependents = await tx
      .select({ taskId: taskDependencies.taskId })
      .from(taskDependencies)
      .where(eq(taskDependencies.dependsOnTaskId, completedTaskId))

    for (const d of dependents) {
      const [task] = await tx.select().from(tasks).where(eq(tasks.id, d.taskId)).limit(1)
      if (!task || task.state !== 'blocked') continue

      const others = await tx
        .select({ dependsOnTaskId: taskDependencies.dependsOnTaskId })
        .from(taskDependencies)
        .where(eq(taskDependencies.taskId, d.taskId))
      const upstream = await tx
        .select({ id: tasks.id, state: tasks.state })
        .from(tasks)
        .where(inArray(tasks.id, others.map((o) => o.dependsOnTaskId)))
      const stillBlocked = upstream.some((u) =>
        ['draft', 'ready', 'in_progress', 'blocked', 'waiting', 'deferred'].includes(u.state),
      )
      if (stillBlocked) continue

      await tx.update(tasks).set({ state: 'ready', version: sql`version + 1` }).where(eq(tasks.id, d.taskId))
      await recordEvent(tx, ctx.householdId, ctx.actor, {
        eventType: 'task.state_changed',
        subjectType: 'task',
        subjectId: d.taskId,
        payload: { from: 'blocked', to: 'ready', reason: 'Vorbedingung erledigt' },
      })
    }
  }

  private async nextPosition(tx: Tx, processId: string): Promise<number> {
    const [row] = await tx
      .select({ max: sql<number>`coalesce(max(position), 0)` })
      .from(tasks)
      .where(eq(tasks.processId, processId))
    return (row?.max ?? 0) + 1
  }

  /** §15: Ein Playbook ist eine Vorlage; ein Process ist ein Lauf davon. */
  private async instantiateSteps(
    tx: Tx,
    ctx: EffectiveContext,
    processId: string,
    playbookId: string,
    domainId: string,
  ): Promise<void> {
    const steps = await tx
      .select()
      .from(playbookSteps)
      .where(and(eq(playbookSteps.householdId, ctx.householdId), eq(playbookSteps.playbookId, playbookId)))
      .orderBy(playbookSteps.position)
    if (steps.length === 0) return

    const created: string[] = []
    for (const step of steps) {
      const id = uuidv7()
      await tx.insert(tasks).values({
        id,
        householdId: ctx.householdId,
        domainId,
        processId,
        title: step.title,
        description: step.description,
        // Nur der erste Schritt ist sofort ausführbar; der Rest wartet auf seine Vorbedingung.
        state: created.length === 0 ? 'ready' : 'blocked',
        position: step.position,
        estimatedMinutes: step.estimatedMinutes,
        mentalEnergy: step.mentalEnergy,
        origin: 'human',
        createdBy: ctx.membershipId,
      })
      if (created.length > 0) {
        await tx.insert(taskDependencies).values({
          householdId: ctx.householdId,
          taskId: id,
          dependsOnTaskId: created[created.length - 1]!,
        })
      }
      created.push(id)
    }

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'playbook.instantiated',
      subjectType: 'process',
      subjectId: processId,
      payload: { playbookId, steps: steps.length },
    })
  }

  /**
   * §15: Vorschlag, keine Automatik (Autonomiestufe A1). Der Mensch entscheidet,
   * ob ein Playbook passt.
   */
  async suggestPlaybooks(tx: Tx, ctx: EffectiveContext, domainId: string, title: string) {
    assertAutonomy('playbook.suggest', ctx.actor)
    const rows = await tx
      .select()
      .from(playbooks)
      .where(and(eq(playbooks.householdId, ctx.householdId), isNull(playbooks.archivedAt)))

    const words = new Set(
      title
        .toLowerCase()
        .split(/[^a-zäöüß]+/)
        .filter((w) => w.length > 3),
    )
    return rows
      .map((p) => {
        const haystack = `${p.title} ${p.triggerDescription}`.toLowerCase()
        let score = p.domainId === domainId ? 2 : 0
        for (const w of words) if (haystack.includes(w)) score += 1
        return {
          id: p.id,
          title: p.title,
          triggerDescription: p.triggerDescription,
          score,
          reason:
            p.domainId === domainId
              ? `Dieses Playbook gehört zum selben Bereich.`
              : `Der Titel passt zu „${p.title}".`,
        }
      })
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
  }
}

export function toTaskLike(row: typeof tasks.$inferSelect): TaskLike {
  return {
    id: row.id,
    title: row.title,
    state: row.state,
    domainId: row.domainId,
    processId: row.processId,
    assigneeMembershipId: row.assigneeMembershipId,
    dueAt: row.dueAt,
    deferUntil: row.deferUntil,
    estimatedMinutes: row.estimatedMinutes,
    mentalEnergy: row.mentalEnergy as EnergyLevel,
    position: row.position,
    createdAt: row.createdAt,
  }
}
