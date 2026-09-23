import { and, eq, isNull, sql } from 'drizzle-orm'
import { attentionItems, capacityStates, householdMemberships, uuidv7, type Tx } from '@thealotta/db'
import { authorize, type EffectiveContext } from '@thealotta/domain'
import type { CapacityLevel } from '@thealotta/contracts'
import { recordEvent } from '@thealotta/db'
import { DomainService } from './domain.service.js'

const domainService = new DomainService()

/**
 * §23–§25: Kapazität ist eine Selbstauskunft, keine Bewertung.
 *
 * Sie verändert Sichtbarkeit und Priorisierung (INV-007), niemals Relevanz, Ownership oder
 * Berechtigungen. Es wird bewusst kein medizinischer Grund gespeichert (Q-13).
 */
/**
 * Begründungen gehen unverändert in die Oberfläche. Modellwerte wie „critical" dürfen dort
 * nicht auftauchen – Fachbegriffe des Modells sind für Nutzer bedeutungslos (§3.1, Risiko P6).
 */
const CRITICALITY_TEXT: Record<string, string> = {
  low: 'Der Bereich ist nebensächlich, aber er',
  normal: 'Der Bereich',
  high: 'Der Bereich ist wichtig und',
  critical: 'Hier hängt Versorgung oder Sicherheit dran – der Bereich',
}

export class CapacityService {
  async declare(
    tx: Tx,
    ctx: EffectiveContext,
    input: {
      level: CapacityLevel
      endsAt: Date | null
      acceptsNewAssignments: boolean
      criticalOnly: boolean
      mutePush: boolean
      reasonCategory: string
      note?: string
    },
    now: Date,
  ): Promise<{ id: string; coverageGaps: { domainId: string; path: string }[] }> {
    authorize(ctx, 'capacity:declare_self', { type: 'capacity_state', id: null, householdId: ctx.householdId })

    await tx
      .update(capacityStates)
      .set({ clearedAt: now })
      .where(and(eq(capacityStates.membershipId, ctx.membershipId), isNull(capacityStates.clearedAt)))

    const id = uuidv7()
    await tx.insert(capacityStates).values({
      id,
      householdId: ctx.householdId,
      membershipId: ctx.membershipId,
      level: input.level,
      acceptsNewAssignments: input.acceptsNewAssignments,
      criticalOnly: input.criticalOnly,
      mutePush: input.mutePush,
      reasonCategory: input.reasonCategory,
      note: input.note ?? null,
      endsAt: input.endsAt,
    })

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'capacity.declared',
      subjectType: 'capacity_state',
      subjectId: id,
      // Der Freitext bleibt privat – andere sehen nur die Stufe (docs/05 §2).
      payload: { level: input.level, endsAt: input.endsAt?.toISOString() ?? null, criticalOnly: input.criticalOnly },
    })

    // INV-014: Pausiert jemand, dürfen kritische Bereiche nicht ohne Verantwortung dastehen.
    const coverageGaps: { domainId: string; path: string }[] = []
    if (input.level === 'minimal' || input.level === 'paused') {
      const atRisk = await domainService.criticalAtRisk(tx, ctx, ctx.membershipId, now)
      const [me] = await tx
        .select({ displayName: householdMemberships.displayName })
        .from(householdMemberships)
        .where(eq(householdMemberships.id, ctx.membershipId))
        .limit(1)

      for (const domain of atRisk) {
        const created = await tx
          .insert(attentionItems)
          .values({
            householdId: ctx.householdId,
            domainId: domain.id,
            signalKind: 'coverage_gap',
            title: `${domain.name}: Verantwortung klären`,
            whyNow:
              `${me?.displayName ?? 'Eine Person'} hat für diesen Zeitraum reduzierte Kapazität angegeben. ` +
              `${CRITICALITY_TEXT[domain.criticality] ?? 'Der Bereich'} braucht eine klare Zuständigkeit.`,
            ifItWaits:
              'Ohne klare Zuständigkeit kann in diesem Bereich etwas liegen bleiben, das niemand bemerkt.',
            severity: 'important',
            origin: 'system_rule',
            originRef: `capacity:${id}`,
          })
          .onConflictDoNothing()
          .returning({ id: attentionItems.id })
        if (created.length > 0) coverageGaps.push({ domainId: domain.id, path: domain.path })
      }
    }

    return { id, coverageGaps }
  }

  async current(tx: Tx, membershipId: string, now: Date) {
    const [row] = await tx
      .select()
      .from(capacityStates)
      .where(and(eq(capacityStates.membershipId, membershipId), isNull(capacityStates.clearedAt)))
      .limit(1)
    // `endsAt` gehört mit ausgeliefert: Ohne das Ende kann die Oberfläche nicht zeigen,
    // wie lange die Angabe gilt – und eine Auszeit ohne sichtbares Ende ist eine, an die
    // man selbst denken muss (Audit 2, H2).
    const normal = {
      level: 'normal' as CapacityLevel,
      acceptsNewAssignments: true,
      criticalOnly: false,
      mutePush: false,
      endsAt: null as Date | null,
    }
    if (!row) return normal
    if (row.endsAt && row.endsAt.getTime() <= now.getTime()) return normal
    return {
      level: row.level as CapacityLevel,
      acceptsNewAssignments: row.acceptsNewAssignments,
      criticalOnly: row.criticalOnly,
      mutePush: row.mutePush,
      endsAt: row.endsAt,
    }
  }

  async clear(tx: Tx, ctx: EffectiveContext, now: Date): Promise<void> {
    await tx
      .update(capacityStates)
      .set({ clearedAt: now })
      .where(and(eq(capacityStates.membershipId, ctx.membershipId), isNull(capacityStates.clearedAt)))
    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'capacity.cleared',
      subjectType: 'capacity_state',
      subjectId: null,
      payload: {},
    })
  }

  /** §31: Wer hat gerade weniger Kapazität? Sichtbar ist die Stufe, nicht der Grund. */
  async overview(tx: Tx, ctx: EffectiveContext, now: Date) {
    const rows = await tx
      .select({
        membershipId: capacityStates.membershipId,
        level: capacityStates.level,
        endsAt: capacityStates.endsAt,
        displayName: householdMemberships.displayName,
      })
      .from(capacityStates)
      .innerJoin(householdMemberships, eq(householdMemberships.id, capacityStates.membershipId))
      .where(and(eq(capacityStates.householdId, ctx.householdId), isNull(capacityStates.clearedAt)))

    return rows
      .filter((r) => r.level !== 'normal' && (!r.endsAt || r.endsAt.getTime() > now.getTime()))
      .map((r) => ({ membershipId: r.membershipId, displayName: r.displayName, level: r.level as CapacityLevel }))
  }
}

void sql
