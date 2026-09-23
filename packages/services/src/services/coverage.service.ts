import { and, eq, sql } from 'drizzle-orm'
import { temporaryCoverages, uuidv7, type Tx } from '@thealotta/db'
import {
  assertAutonomy,
  authorize,
  badRequest,
  conflict,
  coverageExpireTarget,
  coverageMachine,
  next as nextState,
  notFound,
  type EffectiveContext,
} from '@thealotta/domain'
import { recordEvent } from '@thealotta/db'
import { DomainService } from './domain.service.js'

const domainService = new DomainService()

/**
 * §25.1: Verantwortung kann für einen Zeitraum übergeben werden – ohne die dauerhafte
 * Zuständigkeit zu verändern (INV-003). Läuft der Zeitraum ab, ohne dass jemand die Rückgabe
 * bestätigt, bleibt die Vertretung zuständig (Q-07/INV-014). Eine Verantwortung fällt nie
 * in ein Loch.
 */
export class CoverageService {
  async create(
    tx: Tx,
    ctx: EffectiveContext,
    input: {
      domainId: string
      coveringMembershipId: string
      startsAt: Date
      endsAt: Date
      returnMode: 'auto_return' | 'require_confirmation'
      reasonCategory: string
      note?: string
    },
    now: Date,
  ): Promise<{ id: string; state: string }> {
    const domain = await domainService.get(tx, ctx, input.domainId)
    // Wer den Bereich dauerhaft trägt – aus derselben Quelle, die auch die Oberfläche zeigt.
    const dauerhaft =
      (await domainService.list(tx, ctx, now)).find((d) => d.id === input.domainId)?.effectiveOwner ?? null
    authorize(ctx, 'coverage:create', {
      type: 'temporary_coverage',
      id: null,
      householdId: ctx.householdId,
      domainId: input.domainId,
      sensitivity: domain.sensitivity,
    })
    if (input.endsAt.getTime() <= input.startsAt.getTime()) {
      throw badRequest('validation_failed', 'Das Ende der Vertretung muss nach dem Beginn liegen.')
    }

    const state = input.startsAt.getTime() <= now.getTime() ? 'active' : 'scheduled'
    const id = uuidv7()

    try {
      await tx.insert(temporaryCoverages).values({
        id,
        householdId: ctx.householdId,
        domainId: input.domainId,
        coveringMembershipId: input.coveringMembershipId,
        /*
          Wer die Verantwortung dauerhaft trägt, wird hier festgehalten – bisher stand da
          immer `null`. Ohne diesen Wert ist nach dem Ende der Vertretung nicht mehr
          nachvollziehbar, zu wem sie zurückkehrt (INV-003: die dauerhafte Zuständigkeit
          ändert sich durch eine Vertretung nicht).
        */
        originalMembershipId: dauerhaft?.membershipId ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        returnMode: input.returnMode,
        state,
        reasonCategory: input.reasonCategory,
        note: input.note ?? null,
        createdBy: ctx.membershipId,
      })
    } catch (error) {
      // Der Exclusion-Constraint verhindert überlappende Vertretungen desselben Bereichs.
      if (String(error).includes('coverage_no_overlap')) {
        throw conflict('coverage_overlap', 'Für diesen Bereich besteht im gewählten Zeitraum bereits eine Vertretung.')
      }
      throw error
    }

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: state === 'active' ? 'ownership.coverage_started' : 'ownership.coverage_scheduled',
      subjectType: 'temporary_coverage',
      subjectId: id,
      payload: {
        domainId: input.domainId,
        coveringMembershipId: input.coveringMembershipId,
        startsAt: input.startsAt.toISOString(),
        endsAt: input.endsAt.toISOString(),
        returnMode: input.returnMode,
        // Ausdrücklich: die dauerhafte Zuständigkeit ändert sich nicht.
        permanentOwnershipUnchanged: true,
      },
    })
    return { id, state }
  }

  async list(tx: Tx, ctx: EffectiveContext, state?: string) {
    return tx
      .select()
      .from(temporaryCoverages)
      .where(
        state
          ? and(eq(temporaryCoverages.householdId, ctx.householdId), eq(temporaryCoverages.state, state))
          : eq(temporaryCoverages.householdId, ctx.householdId),
      )
  }

  /** Wird vom Hintergrundjob aufgerufen; `auto_return` endet direkt, sonst bleibt es sichtbar offen. */
  async expire(tx: Tx, ctx: EffectiveContext, coverageId: string, now: Date): Promise<{ state: string }> {
    const row = await this.load(tx, ctx, coverageId)
    const target = coverageExpireTarget(row.returnMode)
    nextState(coverageMachine, row.state as never, target === 'returned' ? 'confirm_return' : 'expire')

    await tx
      .update(temporaryCoverages)
      .set({ state: target, returnedAt: target === 'returned' ? now : null, version: sql`version + 1` })
      .where(eq(temporaryCoverages.id, coverageId))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: target === 'returned' ? 'ownership.coverage_returned' : 'ownership.coverage_return_pending',
      subjectType: 'temporary_coverage',
      subjectId: coverageId,
      payload: { domainId: row.domainId, returnMode: row.returnMode },
    })
    return { state: target }
  }

  async confirmReturn(tx: Tx, ctx: EffectiveContext, coverageId: string, now: Date): Promise<void> {
    assertAutonomy('ownership.release', ctx.actor)
    const row = await this.load(tx, ctx, coverageId)
    const target = nextState(coverageMachine, row.state as never, 'confirm_return')

    await tx
      .update(temporaryCoverages)
      .set({ state: target, returnedAt: now, version: sql`version + 1` })
      .where(eq(temporaryCoverages.id, coverageId))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'ownership.coverage_returned',
      subjectType: 'temporary_coverage',
      subjectId: coverageId,
      payload: { domainId: row.domainId, confirmedBy: ctx.membershipId },
    })
  }

  async activateDue(tx: Tx, ctx: EffectiveContext, now: Date): Promise<number> {
    const rows = await tx
      .update(temporaryCoverages)
      .set({ state: 'active', version: sql`version + 1` })
      .where(
        and(
          eq(temporaryCoverages.householdId, ctx.householdId),
          eq(temporaryCoverages.state, 'scheduled'),
          sql`${temporaryCoverages.startsAt} <= ${now}`,
        ),
      )
      .returning({ id: temporaryCoverages.id })
    for (const r of rows) {
      await recordEvent(tx, ctx.householdId, ctx.actor, {
        eventType: 'ownership.coverage_started',
        subjectType: 'temporary_coverage',
        subjectId: r.id,
        payload: {},
      })
    }
    return rows.length
  }

  private async load(tx: Tx, ctx: EffectiveContext, coverageId: string) {
    const [row] = await tx
      .select()
      .from(temporaryCoverages)
      .where(and(eq(temporaryCoverages.householdId, ctx.householdId), eq(temporaryCoverages.id, coverageId)))
      .limit(1)
    if (!row) throw notFound('Die Vertretung')
    return row
  }
}
