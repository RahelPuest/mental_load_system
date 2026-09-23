import { and, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import {
  attentionItemSignals,
  attentionItems,
  calendarEvents,
  domainEvents,
  monitorSuppressions,
  monitors,
  signals,
  stateDefinitions,
  stateValues,
  tasks,
  uuidv7,
  type Tx,
} from '@thealotta/db'
import {
  authorize,
  evaluateMonitor,
  conflict,
  notFound,
  planAggregation,
  type EffectiveContext,
  type MonitorEvaluationContext,
  type MonitorLike,
  type SignalDraft,
  type StateDefinitionLike,
  type StateValueLike,
  badRequest,
} from '@thealotta/domain'
import type { MonitorResponse, MonitorRuleKind, ValueKind } from '@thealotta/contracts'
import { recordEvent } from '@thealotta/db'
import { DomainService } from './domain.service.js'
import { pgIntervalToIso } from './state.service.js'

const domainService = new DomainService()

export interface EvaluationOutcome {
  monitorId: string
  signalsCreated: number
  signalsSkipped: number
  bucketsResolved: number
  attentionCreated: string[]
  attentionUpdated: string[]
  /** Aufgaben, die aus dieser Auswertung entstanden sind (`defaultResponse: create_task`). */
  tasksCreated: string[]
  nextEvaluationAt: Date
}

export class MonitorService {
  async create(
    tx: Tx,
    ctx: EffectiveContext,
    input: {
      domainId: string
      stateDefinitionId: string | null
      name: string
      ruleKind: MonitorRuleKind
      config: Record<string, unknown>
      defaultResponse: MonitorResponse
      enabled: boolean
    },
    now: Date,
  ): Promise<{ id: string }> {
    const domain = await domainService.get(tx, ctx, input.domainId)
    authorize(ctx, 'monitor:manage', {
      type: 'monitor',
      id: null,
      householdId: ctx.householdId,
      domainId: input.domainId,
      sensitivity: domain.sensitivity,
    })

    const id = uuidv7()
    await tx.insert(monitors).values({
      id,
      householdId: ctx.householdId,
      domainId: input.domainId,
      stateDefinitionId: input.stateDefinitionId,
      name: input.name,
      ruleKind: input.ruleKind,
      config: input.config as never,
      defaultResponse: input.defaultResponse,
      enabled: input.enabled,
      createdBy: ctx.membershipId,
      nextEvaluationAt: now,
    })

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'monitor.created',
      subjectType: 'monitor',
      subjectId: id,
      payload: { domainId: input.domainId, ruleKind: input.ruleKind, name: input.name },
    })
    return { id }
  }

  /**
   * Eine Regel nachträglich ändern.
   *
   * Bisher ging das nicht: `PATCH` nahm ausschließlich `enabled`. Weder Name noch Rhythmus,
   * Schwelle oder Zielangabe ließen sich anpassen – und `remove()` verweigert, sobald Signale
   * existieren. Eine Regel, die einmal gelaufen war, war damit für immer eingefroren; wer den
   * Rhythmus falsch gewählt hatte, konnte sie nur noch abschalten.
   *
   * Das ist genau die Sackgasse, die dieses Produkt an anderen Stellen vermeidet: Nichts soll
   * unumkehrbar sein, nur weil es einmal benutzt wurde.
   *
   * **Die Vergangenheit bleibt.** Signale und Hinweise sind Belege dafür, was die Regel
   * *damals* gesehen hat – sie werden nicht nachträglich umgedeutet. Was sich ändert, gilt ab
   * jetzt, und die Änderung steht im Verlauf (INV-013 sinngemäß: nachvollziehbar statt still).
   */
  async update(
    tx: Tx,
    ctx: EffectiveContext,
    monitorId: string,
    input: {
      name?: string
      ruleKind?: MonitorRuleKind
      config?: Record<string, unknown>
      defaultResponse?: MonitorResponse
      stateDefinitionId?: string | null
    },
    now: Date,
  ): Promise<void> {
    const [monitor] = await tx
      .select()
      .from(monitors)
      .where(and(eq(monitors.householdId, ctx.householdId), eq(monitors.id, monitorId)))
      .limit(1)
    if (!monitor) throw notFound('Die Regel')

    const domain = await domainService.get(tx, ctx, monitor.domainId)
    authorize(ctx, 'monitor:manage', {
      type: 'monitor',
      id: monitorId,
      householdId: ctx.householdId,
      domainId: monitor.domainId,
      sensitivity: domain.sensitivity,
    })

    /*
     * Eine Regel darf nur auf eine Angabe **ihres eigenen Bereichs** zeigen. Sonst prüfte sie
     * etwas, das mit ihr nichts zu tun hat – und der Bereich wäre kein Bereich mehr.
     */
    if (input.stateDefinitionId) {
      const [angabe] = await tx
        .select({ domainId: stateDefinitions.domainId })
        .from(stateDefinitions)
        .where(
          and(
            eq(stateDefinitions.householdId, ctx.householdId),
            eq(stateDefinitions.id, input.stateDefinitionId),
          ),
        )
        .limit(1)
      if (!angabe) throw notFound('Die Angabe')
      if (angabe.domainId !== monitor.domainId) {
        throw badRequest(
          'validation_failed',
          'Diese Angabe gehört zu einem anderen Bereich. Eine Regel prüft, was in ihrem eigenen Bereich steht.',
        )
      }
    }

    const neueArt = input.ruleKind ?? (monitor.ruleKind as MonitorRuleKind)
    const neueConfig = input.config ?? (monitor.config as Record<string, unknown>)

    /*
     * Ändert sich der Rhythmus, muss der nächste Prüfzeitpunkt neu bestimmt werden – sonst
     * liefe die geänderte Regel noch einmal nach dem alten Takt. „Jetzt" ist die einfache und
     * ehrliche Antwort: Die nächste Auswertung entscheidet nach den neuen Regeln.
     */
    const taktGeaendert =
      input.ruleKind !== undefined || (input.config !== undefined && JSON.stringify(input.config) !== JSON.stringify(monitor.config))

    await tx
      .update(monitors)
      .set({
        name: input.name ?? monitor.name,
        ruleKind: neueArt,
        config: neueConfig as never,
        defaultResponse: input.defaultResponse ?? (monitor.defaultResponse as MonitorResponse),
        stateDefinitionId:
          input.stateDefinitionId === undefined ? monitor.stateDefinitionId : input.stateDefinitionId,
        nextEvaluationAt: taktGeaendert ? now : monitor.nextEvaluationAt,
        // Ein Fehler der alten Fassung sagt über die neue nichts.
        lastError: taktGeaendert ? null : monitor.lastError,
        consecutiveFailures: taktGeaendert ? 0 : monitor.consecutiveFailures,
        version: sql`version + 1`,
      })
      .where(eq(monitors.id, monitorId))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'monitor.updated',
      subjectType: 'monitor',
      subjectId: monitorId,
      payload: {
        domainId: monitor.domainId,
        vorher: { ruleKind: monitor.ruleKind, name: monitor.name, config: monitor.config },
        nachher: { ruleKind: neueArt, name: input.name ?? monitor.name, config: neueConfig },
      },
    })
  }

  async list(tx: Tx, ctx: EffectiveContext, domainId?: string) {
    const rows = await tx
      .select()
      .from(monitors)
      .where(
        domainId
          ? and(eq(monitors.householdId, ctx.householdId), eq(monitors.domainId, domainId))
          : eq(monitors.householdId, ctx.householdId),
      )
    return rows.filter((m) => {
      try {
        authorize(ctx, 'monitor:read', { type: 'monitor', id: m.id, householdId: ctx.householdId, domainId: m.domainId })
        return true
      } catch {
        return false
      }
    })
  }

  /**
   * Was eine Regel bisher bewirkt hat (docs/60, Q1).
   *
   * Eine Regel zeigte bisher nur „zuletzt geprüft". Ob sie je etwas gefunden hat, ob daraus
   * etwas folgte oder ob sie regelmäßig weggeklickt wird, war nirgends zu sehen – und damit
   * konnte niemand lernen, wann er sich auf sie verlassen kann.
   *
   * Kalibriertes Vertrauen setzt genau das voraus: Informationen nicht nur über den **Zweck**
   * einer Automation, sondern über ihren **Verlauf** und ihre **Leistung** (Lee & See 2004,
   * Human Factors 46(1)). Ohne Rückmeldung entsteht entweder blindes Vertrauen oder blindes
   * Misstrauen – beides schlechter als ein begründetes Urteil.
   *
   * Ausdrücklich **keine** Bewertung von Personen: Gezählt wird, was die Regel getan hat,
   * nicht wer darauf reagiert hat (INV-P02).
   */
  async statistik(
    tx: Tx,
    ctx: EffectiveContext,
    monitorIds: readonly string[],
  ): Promise<Map<string, { gemeldet: number; gefuehrtZu: number; weggeklickt: number; seit: Date | null }>> {
    const out = new Map<string, { gemeldet: number; gefuehrtZu: number; weggeklickt: number; seit: Date | null }>()
    if (monitorIds.length === 0) return out

    /*
     * Ein Signal ist die Beobachtung einer Regel. Was daraus wurde, steht am Hinweis, den es
     * stützt – deshalb der Weg über die Verbindungstabelle statt über einen Zähler an der
     * Regel selbst. Ein Zähler wäre schneller und würde bei jedem Löschen falsch.
     */
    const zeilen = await tx
      .select({
        monitorId: signals.monitorId,
        zustand: attentionItems.state,
        erkanntAm: signals.detectedAt,
      })
      .from(signals)
      .leftJoin(attentionItemSignals, eq(attentionItemSignals.signalId, signals.id))
      .leftJoin(attentionItems, eq(attentionItems.id, attentionItemSignals.attentionItemId))
      .where(and(eq(signals.householdId, ctx.householdId), inArray(signals.monitorId, [...monitorIds])))

    for (const z of zeilen) {
      if (!z.monitorId) continue
      const e = out.get(z.monitorId) ?? { gemeldet: 0, gefuehrtZu: 0, weggeklickt: 0, seit: null }
      e.gemeldet += 1
      // „Geführt zu" heißt: Aus dem Hinweis wurde Arbeit oder er wurde bewusst geschlossen.
      if (z.zustand === 'converted' || z.zustand === 'acknowledged') e.gefuehrtZu += 1
      // „Weggeklickt" heißt: als nicht relevant abgetan – das ist die Rückmeldung an die Regel.
      if (z.zustand === 'dismissed' || z.zustand === 'irrelevant') e.weggeklickt += 1
      if (!e.seit || z.erkanntAm < e.seit) e.seit = z.erkanntAm
      out.set(z.monitorId, e)
    }
    return out
  }

  /**
   * Eine Regel abschalten oder entfernen.
   *
   * Eine Regel, die man anlegen, aber nicht wieder loswerden kann, ist eine Falle – erst recht,
   * seit sie Aufgaben erzeugt. Abschalten ist der übliche Weg: Die Regel bleibt samt ihrer
   * Vergangenheit stehen und meldet sich nur nicht mehr. Entfernt wird nur, was nie etwas
   * bewirkt hat; sonst hingen Signale und Hinweise an einer Regel, die es nicht mehr gibt.
   */
  async setEnabled(tx: Tx, ctx: EffectiveContext, monitorId: string, enabled: boolean, now: Date): Promise<void> {
    const [monitor] = await tx
      .select()
      .from(monitors)
      .where(and(eq(monitors.householdId, ctx.householdId), eq(monitors.id, monitorId)))
      .limit(1)
    if (!monitor) throw notFound('Die Regel')
    authorize(ctx, 'monitor:manage', {
      type: 'monitor',
      id: monitorId,
      householdId: ctx.householdId,
      domainId: monitor.domainId,
    })

    await tx.update(monitors).set({ enabled, updatedAt: now }).where(eq(monitors.id, monitorId))
    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: enabled ? 'monitor.enabled' : 'monitor.disabled',
      subjectType: 'monitor',
      subjectId: monitorId,
      payload: { name: monitor.name },
    })
  }

  async remove(tx: Tx, ctx: EffectiveContext, monitorId: string, now: Date): Promise<void> {
    const [monitor] = await tx
      .select()
      .from(monitors)
      .where(and(eq(monitors.householdId, ctx.householdId), eq(monitors.id, monitorId)))
      .limit(1)
    if (!monitor) throw notFound('Die Regel')
    authorize(ctx, 'monitor:manage', {
      type: 'monitor',
      id: monitorId,
      householdId: ctx.householdId,
      domainId: monitor.domainId,
    })

    const [signal] = await tx.select({ id: signals.id }).from(signals).where(eq(signals.monitorId, monitorId)).limit(1)
    if (signal) {
      throw conflict(
        'has_history',
        `„${monitor.name}“ hat sich schon einmal gemeldet. Schalte die Regel ab – dann bleibt ` +
          'nachvollziehbar, warum damals etwas auf der Liste stand.',
      )
    }

    await tx.delete(monitorSuppressions).where(eq(monitorSuppressions.monitorId, monitorId))
    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'monitor.deleted',
      subjectType: 'monitor',
      subjectId: monitorId,
      payload: { name: monitor.name, ruleKind: monitor.ruleKind, deletedAt: now.toISOString() },
    })
    await tx.delete(monitors).where(eq(monitors.id, monitorId))
  }

  /**
   * Auswertung eines Monitors: reine Domänenlogik entscheidet, Persistenz ist idempotent.
   *
   * Der doppelte Lauf desselben Zustands erzeugt kein zweites Signal – dafür sorgt der
   * partielle Unique-Index auf `dedupe_key` zusammen mit ON CONFLICT DO NOTHING (§11).
   */
  async evaluate(tx: Tx, ctx: EffectiveContext, monitorId: string, now: Date): Promise<EvaluationOutcome> {
    const [monitor] = await tx
      .select()
      .from(monitors)
      .where(and(eq(monitors.householdId, ctx.householdId), eq(monitors.id, monitorId)))
      .limit(1)
    if (!monitor) throw notFound('Die Regel')

    const evalContext = await this.buildContext(tx, ctx, monitor, now)
    const monitorLike: MonitorLike = {
      id: monitor.id,
      householdId: monitor.householdId,
      domainId: monitor.domainId,
      stateDefinitionId: monitor.stateDefinitionId,
      name: monitor.name,
      ruleKind: monitor.ruleKind as MonitorRuleKind,
      config: (monitor.config ?? {}) as Record<string, unknown>,
      enabled: monitor.enabled,
      lastEvaluatedAt: monitor.lastEvaluatedAt,
      nextEvaluationAt: monitor.nextEvaluationAt,
    }

    const result = evaluateMonitor(monitorLike, evalContext)

    let created = 0
    let skipped = 0
    const attentionCreated: string[] = []
    const attentionUpdated: string[] = []
    const tasksCreated: string[] = []

    for (const draft of result.signals) {
      const signalId = await this.persistSignal(tx, ctx, draft)
      if (!signalId) {
        skipped += 1
        continue
      }
      created += 1

      /*
       * Zwei Arten von Antwort auf ein Signal – und bis hierher wurde nur eine davon
       * ausgeführt.
       *
       * `defaultResponse` steht seit jeher in der Tabelle und wurde beim Anlegen brav
       * gespeichert, aber nie gelesen: Jede Regel erzeugte einen Hinweis. „Regelmäßige
       * Aufgabe" war damit nicht möglich – man bekam einen Hinweis, dass etwas dran wäre,
       * und musste die Aufgabe von Hand anlegen.
       */
      if (monitor.defaultResponse === 'create_task') {
        const taskId = await this.createTaskFor(tx, ctx, monitor, draft, now)
        if (taskId) tasksCreated.push(taskId)
      } else {
        const outcome = await this.attachToAttention(tx, ctx, draft, signalId, draft.severity)
        if (outcome.created) attentionCreated.push(outcome.attentionItemId)
        else if (outcome.attentionItemId) attentionUpdated.push(outcome.attentionItemId)
      }
    }

    for (const bucket of result.resolvedBuckets) {
      await tx
        .update(signals)
        .set({ resolvedAt: now })
        .where(and(eq(signals.monitorId, monitor.id), eq(signals.bucket, bucket), isNull(signals.resolvedAt)))
    }

    await tx
      .update(monitors)
      .set({ lastEvaluatedAt: now, nextEvaluationAt: result.nextEvaluationAt, consecutiveFailures: 0, lastError: null })
      .where(eq(monitors.id, monitor.id))

    return {
      monitorId: monitor.id,
      signalsCreated: created,
      signalsSkipped: skipped,
      bucketsResolved: result.resolvedBuckets.length,
      attentionCreated,
      attentionUpdated,
      tasksCreated,
      nextEvaluationAt: result.nextEvaluationAt,
    }
  }

  /** Gibt die Signal-ID zurück oder null, wenn dieselbe Evidenz bereits ein Signal hat. */
  private async persistSignal(tx: Tx, ctx: EffectiveContext, draft: SignalDraft): Promise<string | null> {
    const suppressed = await tx
      .select({ id: monitorSuppressions.id })
      .from(monitorSuppressions)
      .where(
        and(
          eq(monitorSuppressions.monitorId, draft.monitorId),
          or(isNull(monitorSuppressions.until), gt(monitorSuppressions.until, new Date())),
          eq(monitorSuppressions.bucketPattern, draft.bucket),
        ),
      )
      .limit(1)
    if (suppressed.length > 0) return null

    const inserted = await tx
      .insert(signals)
      .values({
        householdId: ctx.householdId,
        monitorId: draft.monitorId,
        domainId: draft.domainId,
        signalKind: draft.signalKind,
        severity: draft.severity,
        dedupeKey: draft.dedupeKey,
        bucket: draft.bucket,
        evidence: draft.evidence as never,
      })
      .onConflictDoNothing()
      .returning({ id: signals.id })

    if (inserted.length === 0) return null

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'signal.raised',
      subjectType: 'signal',
      subjectId: inserted[0]!.id,
      payload: { signalKind: draft.signalKind, monitorId: draft.monitorId, domainId: draft.domainId },
    })
    return inserted[0]!.id
  }

  /**
   * §4/ADR-0004: Bündelung je (Bereich, Signalart). Zehn veraltete Angaben in einem Bereich
   * ergeben einen Eintrag mit zehn Belegen – nicht zehn Listeneinträge.
   */
  private async attachToAttention(
    tx: Tx,
    ctx: EffectiveContext,
    draft: SignalDraft,
    signalId: string,
    severity: string,
  ): Promise<{ attentionItemId: string; created: boolean }> {
    const existing = await tx
      .select()
      .from(attentionItems)
      .where(
        and(
          eq(attentionItems.householdId, ctx.householdId),
          eq(attentionItems.domainId, draft.domainId),
          eq(attentionItems.signalKind, draft.signalKind),
        ),
      )

    const plan = planAggregation(draft, existing.map((a) => ({
      id: a.id,
      domainId: a.domainId,
      signalKind: a.signalKind,
      state: a.state,
      snoozedUntil: a.snoozedUntil,
      whyNow: a.whyNow,
      title: a.title,
    })))

    if (plan.kind === 'skip') {
      return { attentionItemId: '', created: false }
    }

    if (plan.kind === 'attach') {
      await tx
        .insert(attentionItemSignals)
        .values({ attentionItemId: plan.attentionItemId, signalId, householdId: ctx.householdId })
        .onConflictDoNothing()
      // Die Begründung wird aktualisiert: Der Nutzer soll den aktuellen Stand lesen.
      await tx
        .update(attentionItems)
        .set({ whyNow: plan.whyNow, version: sql`version + 1` })
        .where(eq(attentionItems.id, plan.attentionItemId))
      return { attentionItemId: plan.attentionItemId, created: false }
    }

    const id = uuidv7()
    await tx.insert(attentionItems).values({
      id,
      householdId: ctx.householdId,
      domainId: draft.domainId,
      signalKind: draft.signalKind,
      title: draft.title,
      whyNow: draft.whyNow,
      ifItWaits: draft.ifItWaits,
      severity,
      origin: 'system_rule',
      originRef: `monitor:${draft.monitorId}`,
    })
    await tx.insert(attentionItemSignals).values({ attentionItemId: id, signalId, householdId: ctx.householdId })

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'attention.created',
      subjectType: 'attention_item',
      subjectId: id,
      payload: { domainId: draft.domainId, signalKind: draft.signalKind, severity },
    })
    return { attentionItemId: id, created: true }
  }

  /**
   * Aus einem Signal eine Aufgabe machen.
   *
   * Die Aufgabe trägt `originRef: monitor:<id>` – daran erkennt man später, woher sie kam,
   * und daran hängt „N Tage nach einer anderen Aufgabe" seine Frist.
   *
   * Läuft noch eine offene Aufgabe aus derselben Regel, entsteht keine zweite. Wer die Wäsche
   * seit drei Wochen nicht gemacht hat, braucht keine drei Wäsche-Aufgaben, sondern eine, die
   * seit drei Wochen offen ist (INV-001: nichts geht verloren, aber auch nichts vermehrt sich).
   */
  private async createTaskFor(
    tx: Tx,
    ctx: EffectiveContext,
    monitor: typeof monitors.$inferSelect,
    draft: SignalDraft,
    now: Date,
  ): Promise<string | null> {
    const originRef = `monitor:${monitor.id}`

    const [offen] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.householdId, ctx.householdId),
          eq(tasks.originRef, originRef),
          isNull(tasks.completedAt),
          sql`${tasks.state} NOT IN ('done', 'dropped')`,
        ),
      )
      .limit(1)
    if (offen) return null

    /*
     * Fällig ist die Aufgabe am Termin, nicht zum Zeitpunkt der Auswertung.
     *
     * Der Auswerter läuft im Hintergrund, wann er eben läuft. Stünde dort „jetzt", wäre eine
     * Aufgabe „am 15." mal am 15. und mal am 16. fällig – je nachdem, wann der Job drankam.
     */
    const dueOn = draft.evidence['dueOn']
    const id = uuidv7(now.getTime())
    await tx.insert(tasks).values({
      id,
      householdId: ctx.householdId,
      domainId: monitor.domainId,
      title: draft.title,
      state: 'ready',
      dueAt: typeof dueOn === 'string' ? new Date(dueOn) : now,
      // `system_rule`, nicht `system`: Das Vokabular kennt vier Herkünfte, und die Datenbank
      // prüft sie (ADR-0013).
      origin: 'system_rule',
      originRef,
      rationale: draft.whyNow,
    })

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'task.created_from_monitor',
      subjectType: 'task',
      subjectId: id,
      payload: { monitorId: monitor.id, title: draft.title, why: draft.whyNow },
    })
    return id
  }

  private async buildContext(
    tx: Tx,
    ctx: EffectiveContext,
    monitor: typeof monitors.$inferSelect,
    now: Date,
  ): Promise<MonitorEvaluationContext> {
    const suppressions = await tx
      .select({ bucketPattern: monitorSuppressions.bucketPattern, until: monitorSuppressions.until })
      .from(monitorSuppressions)
      .where(eq(monitorSuppressions.monitorId, monitor.id))

    let stateDefinition: StateDefinitionLike | null = null
    let stateValue: StateValueLike | null = null

    if (monitor.stateDefinitionId) {
      const [def] = await tx.select().from(stateDefinitions).where(eq(stateDefinitions.id, monitor.stateDefinitionId)).limit(1)
      const [val] = await tx.select().from(stateValues).where(eq(stateValues.stateDefinitionId, monitor.stateDefinitionId)).limit(1)
      if (def) {
        stateDefinition = {
          id: def.id,
          key: def.key,
          label: def.label,
          freshnessInterval: def.freshnessInterval ? pgIntervalToIso(def.freshnessInterval) : null,
          isCritical: def.isCritical,
        }
      }
      if (val) {
        stateValue = {
          stateDefinitionId: val.stateDefinitionId,
          valueKind: val.valueKind as ValueKind,
          value: val.value,
          verifiedAt: val.verifiedAt,
          staleAt: val.staleAt,
          confirmedAt: val.confirmedAt,
          origin: val.origin,
        }
      }
    }

    let upcomingEvents: MonitorEvaluationContext['upcomingEvents']
    if (monitor.ruleKind === 'lead_time_before_event') {
      const rows = await tx
        .select({
          id: calendarEvents.id,
          title: calendarEvents.title,
          startsAt: calendarEvents.startsAt,
          sequence: calendarEvents.sequence,
        })
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.householdId, ctx.householdId),
            eq(calendarEvents.linkedDomainId, monitor.domainId),
            gt(calendarEvents.startsAt, now),
            sql`${calendarEvents.state} <> 'cancelled'`,
          ),
        )
        .limit(50)
      upcomingEvents = rows
    }

    let lastActivityAt: Date | null = null
    if (monitor.ruleKind === 'absence') {
      const [row] = await tx
        .select({ occurredAt: domainEvents.occurredAt })
        .from(domainEvents)
        .where(and(eq(domainEvents.householdId, ctx.householdId), sql`payload->>'domainId' = ${monitor.domainId}`))
        .orderBy(sql`occurred_at DESC`)
        .limit(1)
      lastActivityAt = row?.occurredAt ?? null
    }

    /*
     * Für „N Tage nach einer anderen Aufgabe": der Zeitpunkt, zu dem die Aufgabe der
     * vorangehenden Regel zuletzt erledigt wurde. Aufgaben aus einer Regel tragen deren
     * Kennung in `originRef` – daran hängt die Kette.
     */
    let precedingCompletedAt: Date | null = null
    if (monitor.ruleKind === 'dependency_recheck') {
      const afterMonitorId = (monitor.config as Record<string, unknown>)['afterMonitorId']
      if (typeof afterMonitorId === 'string') {
        const [row] = await tx
          .select({ completedAt: tasks.completedAt })
          .from(tasks)
          .where(
            and(
              eq(tasks.householdId, ctx.householdId),
              eq(tasks.originRef, `monitor:${afterMonitorId}`),
              isNotNull(tasks.completedAt),
            ),
          )
          .orderBy(sql`completed_at DESC`)
          .limit(1)
        precedingCompletedAt = row?.completedAt ?? null
      }
    }

    /*
     * Für Reihen mit „endet nach N Malen": wie oft schon etwas entstanden ist. Gezählt werden
     * die Signale, nicht die Aufgaben – eine Aufgabe kann gelöscht werden, der Anlass bleibt.
     */
    let occurrencesSoFar: number | undefined
    if (monitor.ruleKind === 'schedule' && typeof (monitor.config as Record<string, unknown>)['count'] === 'number') {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(signals)
        .where(eq(signals.monitorId, monitor.id))
      occurrencesSoFar = Number(row?.n ?? 0)
    }

    return {
      clock: { now: () => now },
      stateDefinition,
      stateValue,
      suppressions,
      upcomingEvents,
      lastActivityAt,
      precedingCompletedAt,
      occurrencesSoFar,
    }
  }

  /** Scanner: fällige Monitore über alle Haushalte (wird vom Worker genutzt). */
  static dueMonitorsQuery(limit: number) {
    return sql`
      SELECT id, household_id FROM monitors
      WHERE enabled = true AND next_evaluation_at <= now()
      ORDER BY next_evaluation_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `
  }
}

void lte
