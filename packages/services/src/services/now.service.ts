import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import {
  attentionItems,
  domains,
  householdMemberships,
  processes,
  questions,
  taskDependencies,
  tasks,
  waitingStates,
  type Tx,
} from '@thealotta/db'
import {
  authorize,
  buildPlan,
  nowLimitFor,
  rankAll,
  type Cue,
  type EffectiveContext,
  type PlanItem,
  type RankableItem,
} from '@thealotta/domain'
import type {
  Criticality,
  EnergyLevel,
  NowResponse,
  PlanEntry,
  PlanHorizon,
  PlanStrategy,
  PlanView,
  ScoreFactor,
} from '@thealotta/contracts'
import { DomainService } from './domain.service.js'

const domainService = new DomainService()

export interface NowQuery {
  now: Date
  timezone: string
  /**
   * Planung – nur gesetzt, wenn danach gefragt wurde (docs/80).
   *
   * Fehlt sie, antwortet die Ansicht genau wie bisher. Das ist Absicht: „Jetzt" beantwortet
   * „was soll ich tun", und diese Frage wird durch eine Liste nicht besser. Wer die Liste
   * will, bekommt sie zusätzlich – die Abschnitte bleiben daneben stehen, sonst wäre der
   * Überhang nicht mehr erreichbar (INV-007).
   */
  plan?: {
    settings: { horizon: PlanHorizon; strategy: PlanStrategy; aging: boolean; slack: boolean }
    firstSlotStart: Date
    cueBySubject: ReadonlyMap<string, Cue>
  }
}

/**
 * Die zentrale Ansicht (§22).
 *
 * Sie beantwortet nicht „was ist alles offen", sondern „was verdient gerade Aufmerksamkeit –
 * und warum". Jeder Eintrag trägt seine Begründung mit sich (INV-008), und die Zahl der
 * Einträge unter „Jetzt" ist hart begrenzt (Q-14), damit daraus keine Todo-Liste wird.
 */
export class NowService {
  async build(tx: Tx, ctx: EffectiveContext, query: NowQuery): Promise<NowResponse> {
    const [domainRows, taskRows, attentionRows, questionRows, members] = await Promise.all([
      tx.select().from(domains).where(eq(domains.householdId, ctx.householdId)),
      tx
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.householdId, ctx.householdId),
            sql`${tasks.state} IN ('ready','in_progress','blocked','waiting','deferred')`,
          ),
        )
        .limit(500),
      tx
        .select()
        .from(attentionItems)
        .where(and(eq(attentionItems.householdId, ctx.householdId), sql`${attentionItems.state} IN ('open','acknowledged')`))
        .limit(200),
      tx
        .select()
        .from(questions)
        .where(and(eq(questions.householdId, ctx.householdId), eq(questions.state, 'open')))
        .limit(100),
      tx
        .select({ id: householdMemberships.id, displayName: householdMemberships.displayName })
        .from(householdMemberships)
        .where(eq(householdMemberships.householdId, ctx.householdId)),
    ])

    const domainById = new Map(domainRows.map((d) => [d.id, d]))
    const nameById = new Map(members.map((m) => [m.id, m.displayName]))
    const owners = await domainService.list(tx, ctx, query.now)
    const ownerByDomain = new Map(owners.map((o) => [o.id, o.effectiveOwner]))

    const waiting = taskRows.length
      ? await tx
          .select()
          .from(waitingStates)
          .where(and(inArray(waitingStates.taskId, taskRows.map((t) => t.id)), isNull(waitingStates.releasedAt)))
      : []
    const waitingByTask = new Map(waiting.map((w) => [w.taskId, w]))

    /*
     * Abhängigkeiten (Audit 2, K1).
     *
     * Ohne sie hielt diese Ansicht neun von zehn Einträgen für sofort machbar, obwohl vor
     * jedem noch ein anderer Schritt offen war – „Passform beurteilen" stand oben, während
     * „Anprobieren" und „Bestellen" darunter lagen. Die Domänenschicht rechnet das in
     * `nextActions()` korrekt; hier wurde es schlicht nicht gefragt.
     *
     * Gelesen wird der Titel des offenen Vorgängers, nicht nur ein Kennzeichen: „Ein früherer
     * Schritt fehlt noch" beantwortet die Frage nicht, „Vorher muss ‚Anprobieren' erledigt
     * sein" schon.
     */
    const taskById = new Map(taskRows.map((t) => [t.id, t]))
    const deps = taskRows.length
      ? await tx
          .select({ taskId: taskDependencies.taskId, dependsOnTaskId: taskDependencies.dependsOnTaskId })
          .from(taskDependencies)
          .where(inArray(taskDependencies.taskId, taskRows.map((t) => t.id)))
      : []
    const blockedBy = new Map<string, string>()
    for (const edge of deps) {
      if (blockedBy.has(edge.taskId)) continue
      const upstream = taskById.get(edge.dependsOnTaskId)
      // `taskRows` enthält nur offene Aufgaben – steht der Vorgänger nicht darin, ist er erledigt.
      if (upstream) blockedBy.set(edge.taskId, upstream.title)
    }

    // §22: „Warum jetzt?" muss bis zum ursprünglichen Auslöser zurückreichen. Ein Schritt
    // erbt deshalb die Begründung seines Vorgangs – sonst steht die Aufgabe kontextlos da.
    const processIds = [...new Set(taskRows.map((t) => t.processId).filter((v): v is string => v !== null))]
    const processRows = processIds.length
      ? await tx
          .select({ id: processes.id, title: processes.title, goal: processes.goal })
          .from(processes)
          .where(inArray(processes.id, processIds))
      : []
    const processById = new Map(processRows.map((p) => [p.id, p]))

    const items: { rankable: RankableItem; source: 'task' | 'attention' | 'question'; raw: unknown }[] = []

    for (const task of taskRows) {
      if (!canSee(ctx, 'task:read', task.domainId)) continue
      const domain = task.domainId ? domainById.get(task.domainId) : undefined
      const owner = task.domainId ? ownerByDomain.get(task.domainId) : null
      const process = task.processId ? processById.get(task.processId) : undefined

      const seeded: ScoreFactor[] = []
      if (process?.goal) {
        seeded.push({
          code: 'process_origin',
          label: `Schritt in „${process.title}"`,
          explanation: process.goal,
          contribution: 8,
        })
      }

      items.push({
        source: 'task',
        raw: task,
        rankable: {
          subjectType: 'task',
          subjectId: task.id,
          title: task.title,
          domainId: task.domainId,
          domainCriticality: (domain?.criticality ?? 'normal') as Criticality,
          dueAt: task.dueAt,
          deferUntil: task.deferUntil,
          estimatedMinutes: task.estimatedMinutes,
          mentalEnergy: task.mentalEnergy as EnergyLevel,
          isOwner: owner?.membershipId === ctx.membershipId,
          isAssignee: task.assigneeMembershipId === ctx.membershipId,
          isWaiting: task.state === 'waiting' || waitingByTask.has(task.id),
          blockedBy: blockedBy.get(task.id) ?? (task.state === 'blocked' ? 'einem früheren Schritt' : null),
          overdueSince: task.dueAt && task.dueAt.getTime() < query.now.getTime() ? task.dueAt : null,
          createdAt: task.createdAt,
          seededFactors: seeded,
        },
      })
    }

    for (const attention of attentionRows) {
      if (!canSee(ctx, 'attention:read', attention.domainId)) continue
      const domain = domainById.get(attention.domainId)
      const owner = ownerByDomain.get(attention.domainId)
      // Die Monitor-Begründung wird als vorgegebener Faktor übernommen – sie ist die
      // eigentliche Antwort auf „warum jetzt".
      const seeded: ScoreFactor[] = [
        {
          code: `signal:${attention.signalKind}`,
          label: attention.title,
          explanation: attention.whyNow,
          contribution: 20,
        },
      ]
      items.push({
        source: 'attention',
        raw: attention,
        rankable: {
          subjectType: 'attention_item',
          subjectId: attention.id,
          title: attention.title,
          domainId: attention.domainId,
          domainCriticality: (domain?.criticality ?? 'normal') as Criticality,
          severity: attention.severity as never,
          dueAt: null,
          deferUntil: null,
          estimatedMinutes: null,
          mentalEnergy: 'low',
          isOwner: owner?.membershipId === ctx.membershipId,
          isAssignee: false,
          isWaiting: false,
          blockedBy: null,
          overdueSince: null,
          createdAt: attention.createdAt,
          seededFactors: seeded,
        },
      })
    }

    for (const question of questionRows) {
      if (question.domainId && !canSee(ctx, 'knowledge:read', question.domainId)) continue
      items.push({
        source: 'question',
        raw: question,
        rankable: {
          subjectType: 'question',
          subjectId: question.id,
          title: question.body.slice(0, 120),
          domainId: question.domainId,
          domainCriticality: 'normal',
          dueAt: null,
          deferUntil: null,
          estimatedMinutes: 5,
          mentalEnergy: 'low',
          isOwner: false,
          isAssignee: question.directedTo === ctx.membershipId,
          isWaiting: false,
          blockedBy: null,
          overdueSince: null,
          createdAt: question.createdAt,
          seededFactors: [
            {
              code: 'open_question',
              label: 'Offene Frage',
              explanation:
                question.directedTo === ctx.membershipId
                  ? 'Diese Frage ist an dich gerichtet.'
                  : 'In der Familie ist eine Frage offen.',
              contribution: question.directedTo === ctx.membershipId ? 15 : 5,
            },
          ],
        },
      })
    }

    const ranked = rankAll(items.map((i) => i.rankable), { now: query.now, capacity: ctx.capacity.level })
    const bySubject = new Map(items.map((i) => [i.rankable.subjectId, i]))

    const toItem = (r: (typeof ranked)[number]) => {
      const entry = bySubject.get(r.item.subjectId)!
      const raw = entry.raw as Record<string, unknown>
      const domainId = (raw['domainId'] as string | null) ?? null
      const domain = domainId ? domainById.get(domainId) : undefined
      const owner = domainId ? ownerByDomain.get(domainId) : null
      const assigneeId = (raw['assigneeMembershipId'] as string | null) ?? null

      return {
        subjectType: r.item.subjectType,
        subjectId: r.item.subjectId,
        title: r.item.title,
        domain: domain ? { id: domain.id, path: prettyPath(domain.path, domainRows) } : null,
        owner: owner
          ? {
              membershipId: owner.membershipId,
              displayName: nameById.get(owner.membershipId) ?? 'unbekannt',
              isYou: owner.membershipId === ctx.membershipId,
            }
          : null,
        assignee: assigneeId
          ? {
              membershipId: assigneeId,
              displayName: nameById.get(assigneeId) ?? 'unbekannt',
              isYou: assigneeId === ctx.membershipId,
            }
          : null,
        why: r.factors,
        ifItWaits: r.ifItWaits,
        estimatedMinutes: r.item.estimatedMinutes,
        mentalEnergy: r.item.mentalEnergy,
        state: (raw['state'] as string) ?? 'open',
      }
    }

    const nowLimit = nowLimitFor(ctx.capacity.level)

    /*
     * Machbarkeit – ein Begriff, sechs sich ausschließende Abschnitte (Audit 2, K1/K2).
     *
     * Vorher hieß „machbar" schlicht „wartet nicht", und die Abschnitte wurden aus
     * überlappenden Filtern gebildet. Ergebnis: Blockierte Schritte standen unter „Kann ich
     * jetzt erledigen", zurückgestellte gleichzeitig dort und unter „Demnächst", und
     * „Geht auch mit wenig Energie" wiederholte fünf von fünf Einträgen der Liste darüber.
     *
     * Jetzt gilt: Jedes Element landet in genau einem Abschnitt. Die Reihenfolge der
     * Prüfungen ist die Reihenfolge der Abschnitte – wer wartet, wartet, auch wenn er
     * nebenbei wenig Energie braucht.
     */
    const t = (r: (typeof ranked)[number]) => r.item
    const istZurueckgestellt = (r: (typeof ranked)[number]) =>
      t(r).deferUntil !== null && t(r).deferUntil!.getTime() > query.now.getTime()
    const istBlockiert = (r: (typeof ranked)[number]) => t(r).blockedBy !== null
    const istWartend = (r: (typeof ranked)[number]) => t(r).isWaiting
    const brauchtKlaerung = (r: (typeof ranked)[number]) =>
      t(r).subjectType === 'question' || t(r).subjectType === 'attention_item'

    const eimer = new Map<string, (typeof ranked)[number][]>([
      ['waiting', []],
      ['soon', []],
      ['needs_clarification', []],
      ['actionable', []],
    ])
    for (const r of ranked) {
      const wohin = istWartend(r) || istBlockiert(r)
        ? 'waiting'
        : istZurueckgestellt(r)
          ? 'soon'
          : brauchtKlaerung(r)
            ? 'needs_clarification'
            : 'actionable'
      eimer.get(wohin)!.push(r)
    }

    /*
     * Auszeit wirkt auch hier (Audit 2, H1).
     *
     * `criticalOnly` filterte bisher nur Benachrichtigungskanäle. Wer „Pause" gewählt hatte,
     * bekam zwar kein Push mehr – öffnete er die Anwendung, stand alles unverändert da,
     * obwohl die Oberfläche beim Umschalten „es wird dir weniger gezeigt" versprach.
     *
     * Ausgeblendet wird nichts (INV-007): Was nicht dringt, rückt in einen Abschnitt, der die
     * Pause beim Namen nennt. Durch kommen Bereiche, die als wichtig oder kritisch markiert
     * sind, und alles, dessen Zeitpunkt bereits vorbei ist – eine Pause setzt keine Frist aus.
     */
    const dringtTrotzPause = (r: (typeof ranked)[number]) =>
      t(r).domainCriticality === 'critical' ||
      t(r).domainCriticality === 'high' ||
      (t(r).dueAt !== null && t(r).dueAt!.getTime() <= query.now.getTime())

    const alleMachbaren = eimer.get('actionable')!
    const pausiert = ctx.capacity.criticalOnly
    const actionable = pausiert ? alleMachbaren.filter(dringtTrotzPause) : alleMachbaren
    const ruhend = pausiert ? alleMachbaren.filter((r) => !dringtTrotzPause(r)) : []

    const nowItems = actionable.slice(0, nowLimit)
    const canDoNow = actionable.slice(nowLimit, nowLimit + 10)

    /*
     * „Demnächst" heißt jetzt nach dem Zeitpunkt, nicht nach der Zurückstellung: Was
     * zurückgestellt ist, gehört dorthin – und dazu, was in den nächsten Tagen fällig wird
     * und deshalb heute nicht drängt.
     */
    const baldFaellig = actionable.filter((r) => {
      const due = t(r).dueAt
      if (!due) return false
      const tage = (due.getTime() - query.now.getTime()) / (1000 * 60 * 60 * 24)
      return tage > 1 && tage <= 14
    })
    const soon = [...eimer.get('soon')!, ...baldFaellig.filter((r) => !nowItems.includes(r) && !canDoNow.includes(r))].slice(0, 15)

    /*
     * Der Plan, falls gefragt.
     *
     * Er entsteht aus derselben Rangliste wie die Abschnitte – nicht aus einer zweiten
     * Rechnung. Sonst gäbe es zwei Wahrheiten darüber, was wichtig ist, und die Begründung
     * am Eintrag (INV-008) würde zur Reihenfolge nicht passen.
     */
    const plan = query.plan ? this.plan(ctx, query, ranked, toItem) : null

    return {
      generatedAt: query.now.toISOString(),
      capacity: { level: ctx.capacity.level, source: ctx.capacity.level === 'normal' ? 'default' : 'self_declared' },
      plan,
      sections: [
        { key: 'now', label: 'Jetzt relevant', limit: nowLimit, items: nowItems.map(toItem) },
        { key: 'can_do_now', label: 'Kann ich jetzt erledigen', limit: null, items: canDoNow.map(toItem) },
        {
          key: 'needs_clarification',
          label: 'Braucht Klärung',
          limit: null,
          items: eimer.get('needs_clarification')!.slice(0, 10).map(toItem),
        },
        { key: 'waiting', label: 'Wartet auf etwas anderes', limit: null, items: eimer.get('waiting')!.slice(0, 20).map(toItem) },
        { key: 'soon', label: 'Demnächst relevant', limit: null, items: soon.map(toItem) },
        { key: 'resting', label: 'Ruht, solange du pausierst', limit: null, items: ruhend.slice(0, 30).map(toItem) },
      ],
    } as NowResponse
  }

  private plan(
    ctx: EffectiveContext,
    query: NowQuery,
    ranked: ReturnType<typeof rankAll>,
    toItem: (r: ReturnType<typeof rankAll>[number]) => unknown,
  ): PlanView {
    const p = query.plan!
    const ergebnis = buildPlan({
      ranked,
      now: query.now,
      firstSlotStart: p.firstSlotStart,
      capacity: ctx.capacity.level,
      horizon: p.settings.horizon,
      strategy: p.settings.strategy,
      aging: p.settings.aging,
      slack: p.settings.slack,
      cueBySubject: p.cueBySubject,
    })

    // Einmal aufbauen, nicht je Eintrag suchen: Bei 500 Aufgaben wäre das sonst quadratisch.
    const nachSubjekt = new Map(ranked.map((r) => [r.item.subjectId, r]))
    const toEntry = (item: PlanItem): PlanEntry =>
      ({
        ...(toItem(nachSubjekt.get(item.ranked.item.subjectId)!) as object),
        placedBecause: item.placedBecause,
        cue: item.cue,
      }) as PlanEntry

    return {
      horizon: p.settings.horizon,
      strategy: p.settings.strategy,
      aging: p.settings.aging,
      slack: p.settings.slack,
      note: ergebnis.note,
      slots: ergebnis.slots.map((slot) => ({
        key: slot.key,
        label: slotLabel(slot.from, slot.to, p.settings.horizon, query.timezone),
        from: slot.from.toISOString(),
        to: slot.to.toISOString(),
        budgetMinutes: slot.budgetMinutes,
        plannedMinutes: slot.plannedMinutes,
        entries: slot.items.map(toEntry),
      })),
      overflow: ergebnis.overflow.map(toEntry),
      notPlannable: ergebnis.notPlannable.map(toEntry),
    }
  }
}

/**
 * Die Beschriftung eines Abschnitts.
 *
 * „Heute" und „Morgen" statt eines Datums, solange es eindeutig ist – ein Datum verlangt,
 * dass man rechnet. Ab der übernächsten Woche steht der Zeitraum, weil „in drei Wochen"
 * niemandem beim Planen hilft.
 */
function slotLabel(from: Date, to: Date, horizon: PlanHorizon, timezone: string): string {
  const tag = (d: Date) => new Intl.DateTimeFormat('de-DE', { timeZone: timezone, day: '2-digit', month: '2-digit' }).format(d)
  const wochentag = (d: Date) => new Intl.DateTimeFormat('de-DE', { timeZone: timezone, weekday: 'long' }).format(d)
  if (horizon === 'month') return `${tag(from)} – ${tag(new Date(to.getTime() - 1))}`
  return `${wochentag(from)}, ${tag(from)}`
}

function canSee(ctx: EffectiveContext, capability: 'task:read' | 'attention:read' | 'knowledge:read', domainId: string | null): boolean {
  try {
    authorize(ctx, capability, { type: 'generic', id: null, householdId: ctx.householdId, domainId })
    return true
  } catch {
    return false
  }
}

/** „kinder.kind_a.kleidung.schuhe" → „Kinder / Kind A / Kleidung / Schuhe" */
function prettyPath(path: string, all: (typeof domains.$inferSelect)[]): string {
  const parts = path.split('.')
  const names: string[] = []
  for (let i = 1; i <= parts.length; i += 1) {
    const prefix = parts.slice(0, i).join('.')
    names.push(all.find((d) => d.path === prefix)?.name ?? parts[i - 1]!)
  }
  return names.join(' / ')
}
