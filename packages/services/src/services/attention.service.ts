import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  attentionItemSignals,
  attentionItems,
  monitorSuppressions,
  processes,
  signals,
  uuidv7,
  type Tx,
} from '@thealotta/db'
import {
  assertAutonomy,
  attentionMachine,
  authorize,
  badRequest,
  next as nextState,
  notFound,
  type EffectiveContext,
} from '@thealotta/domain'
import { recordEvent } from '@thealotta/db'
import { DomainService } from './domain.service.js'

const domainService = new DomainService()

export interface AttentionView {
  id: string
  domainId: string
  signalKind: string
  title: string
  whyNow: string
  ifItWaits: string
  state: string
  severity: string
  snoozedUntil: Date | null
  processId: string | null
  version: number
  supportingSignals: { id: string; detectedAt: Date; rationale: string; resolved: boolean }[]
}

export class AttentionService {
  async list(tx: Tx, ctx: EffectiveContext, filter: { state?: string; domainId?: string }): Promise<AttentionView[]> {
    const conditions = [eq(attentionItems.householdId, ctx.householdId)]
    if (filter.state) conditions.push(eq(attentionItems.state, filter.state))
    if (filter.domainId) conditions.push(eq(attentionItems.domainId, filter.domainId))

    const rows = await tx
      .select()
      .from(attentionItems)
      .where(and(...conditions))
      .orderBy(sql`created_at DESC`)
      .limit(200)

    const visible = rows.filter((r) => canRead(ctx, r.domainId))
    if (visible.length === 0) return []

    const links = await tx
      .select({
        attentionItemId: attentionItemSignals.attentionItemId,
        id: signals.id,
        detectedAt: signals.detectedAt,
        evidence: signals.evidence,
        resolvedAt: signals.resolvedAt,
        supersededAt: signals.supersededAt,
      })
      .from(attentionItemSignals)
      .innerJoin(signals, eq(signals.id, attentionItemSignals.signalId))
      .where(inArray(attentionItemSignals.attentionItemId, visible.map((v) => v.id)))

    return visible.map((r) => ({
      id: r.id,
      domainId: r.domainId,
      signalKind: r.signalKind,
      title: r.title,
      whyNow: r.whyNow,
      ifItWaits: r.ifItWaits,
      state: r.state,
      severity: r.severity,
      snoozedUntil: r.snoozedUntil,
      processId: r.processId,
      version: r.version,
      supportingSignals: links
        .filter((l) => l.attentionItemId === r.id)
        .map((l) => ({
          id: l.id,
          detectedAt: l.detectedAt,
          rationale: String((l.evidence as Record<string, unknown>)['rationale'] ?? ''),
          resolved: l.resolvedAt !== null || l.supersededAt !== null,
        })),
    }))
  }

  async get(tx: Tx, ctx: EffectiveContext, id: string): Promise<typeof attentionItems.$inferSelect> {
    const [row] = await tx
      .select()
      .from(attentionItems)
      .where(and(eq(attentionItems.householdId, ctx.householdId), eq(attentionItems.id, id)))
      .limit(1)
    if (!row) throw notFound('Der Hinweis')
    authorize(ctx, 'attention:read', {
      type: 'attention_item',
      id: row.id,
      householdId: ctx.householdId,
      domainId: row.domainId,
    })
    return row
  }

  async triage(
    tx: Tx,
    ctx: EffectiveContext,
    id: string,
    event: 'confirm' | 'snooze' | 'dismiss' | 'mark_irrelevant',
    input: { until?: Date; reason?: string },
    now: Date,
  ): Promise<{ state: string }> {
    const row = await this.get(tx, ctx, id)

    // §7.6 / ADR-0008: "Passt bei uns dauerhaft nicht" schaltet Monitoring ab – A3, nie automatisch.
    const capability = event === 'mark_irrelevant' ? 'attention:suppress' : 'attention:triage'
    if (event === 'mark_irrelevant') assertAutonomy('attention.mark_irrelevant', ctx.actor)
    authorize(ctx, capability, {
      type: 'attention_item',
      id: row.id,
      householdId: ctx.householdId,
      domainId: row.domainId,
    })

    const target = nextState(attentionMachine, row.state as never, event)

    if (event === 'snooze') {
      if (!input.until) throw badRequest('validation_failed', 'Für „später erinnern" fehlt der Zeitpunkt.')
      if (input.until.getTime() <= now.getTime()) {
        throw badRequest('validation_failed', 'Der Zeitpunkt muss in der Zukunft liegen.')
      }
    }
    if (event === 'mark_irrelevant' && !input.reason) {
      throw badRequest('validation_failed', 'Bitte kurz angeben, warum diese Regel hier nicht passt.')
    }

    await tx
      .update(attentionItems)
      .set({
        state: target,
        snoozedUntil: event === 'snooze' ? input.until! : null,
        resolvedBy: event === 'confirm' ? row.resolvedBy : ctx.membershipId,
        resolvedAt: event === 'confirm' || event === 'snooze' ? row.resolvedAt : now,
        resolutionNote: input.reason ?? row.resolutionNote,
        version: sql`version + 1`,
      })
      .where(eq(attentionItems.id, id))

    if (event === 'mark_irrelevant') {
      await this.suppressSources(tx, ctx, id, input.reason!)
    }

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: `attention.${event === 'mark_irrelevant' ? 'marked_irrelevant' : `${event}ed`}`,
      subjectType: 'attention_item',
      subjectId: id,
      payload: { from: row.state, to: target, reason: input.reason ?? null },
    })
    return { state: target }
  }

  /**
   * `dismiss` heißt „jetzt nicht", `mark_irrelevant` heißt „diese Regel passt bei uns nicht".
   * Nur letzteres verändert das Monitoring – sonst müsste die Familie dieselbe Regel
   * jede Woche neu wegklicken (§4, §7.6).
   */
  private async suppressSources(tx: Tx, ctx: EffectiveContext, attentionItemId: string, reason: string): Promise<void> {
    const rows = await tx
      .select({ monitorId: signals.monitorId, bucket: signals.bucket })
      .from(attentionItemSignals)
      .innerJoin(signals, eq(signals.id, attentionItemSignals.signalId))
      .where(eq(attentionItemSignals.attentionItemId, attentionItemId))

    const seen = new Set<string>()
    for (const r of rows) {
      if (!r.monitorId || seen.has(r.monitorId)) continue
      seen.add(r.monitorId)
      await tx.insert(monitorSuppressions).values({
        householdId: ctx.householdId,
        monitorId: r.monitorId,
        // '*' unterdrückt alle künftigen Buckets dieses Monitors, nicht nur den aktuellen.
        bucketPattern: '*',
        reason,
        createdBy: ctx.membershipId,
      })
    }
  }

  /**
   * §4: Aus einem Hinweis wird erst durch eine menschliche Entscheidung ein Vorgang.
   * Das ist die Stelle, an der aus „könnte relevant sein" ein „wir kümmern uns darum" wird.
   */
  async promote(
    tx: Tx,
    ctx: EffectiveContext,
    id: string,
    input: { processTitle?: string; playbookId?: string | null },
    now: Date,
  ): Promise<{ processId: string; attentionState: string }> {
    const row = await this.get(tx, ctx, id)
    authorize(ctx, 'process:manage', {
      type: 'process',
      id: null,
      householdId: ctx.householdId,
      domainId: row.domainId,
    })

    const target = nextState(attentionMachine, row.state as never, 'promote')
    const processId = uuidv7()

    await tx.insert(processes).values({
      id: processId,
      householdId: ctx.householdId,
      domainId: row.domainId,
      playbookId: input.playbookId ?? null,
      attentionItemId: id,
      title: input.processTitle ?? row.title,
      goal: row.whyNow,
      state: 'active',
      ownerMembershipId: ctx.membershipId,
      origin: 'human',
      createdBy: ctx.membershipId,
    })

    await tx
      .update(attentionItems)
      .set({ state: target, processId, resolvedBy: ctx.membershipId, resolvedAt: now, version: sql`version + 1` })
      .where(eq(attentionItems.id, id))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'process.created',
      subjectType: 'process',
      subjectId: processId,
      payload: { domainId: row.domainId, fromAttentionItem: id, title: input.processTitle ?? row.title },
    })
    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'attention.promoted',
      subjectType: 'attention_item',
      subjectId: id,
      payload: { processId },
    })

    return { processId, attentionState: target }
  }

  /** Abgelaufene Snoozes holen das Thema zurück – nichts verschwindet still (INV-001). */
  async wakeSnoozed(tx: Tx, ctx: EffectiveContext, now: Date): Promise<number> {
    const rows = await tx
      .update(attentionItems)
      .set({ state: 'open', snoozedUntil: null, version: sql`version + 1` })
      .where(
        and(
          eq(attentionItems.householdId, ctx.householdId),
          eq(attentionItems.state, 'snoozed'),
          sql`${attentionItems.snoozedUntil} <= ${now}`,
        ),
      )
      .returning({ id: attentionItems.id })
    return rows.length
  }
}

function canRead(ctx: EffectiveContext, domainId: string): boolean {
  try {
    authorize(ctx, 'attention:read', { type: 'attention_item', id: null, householdId: ctx.householdId, domainId })
    return true
  } catch {
    return false
  }
}

void domainService
