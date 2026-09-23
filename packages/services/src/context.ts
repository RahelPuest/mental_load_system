import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import {
  accessGrants,
  capacityStates,
  domains,
  householdMemberships,
  responsibilityAssignments,
  temporaryCoverages,
  type Tx,
} from '@thealotta/db'
import type { ActorContext, EffectiveContext } from '@thealotta/domain'
import { crossTenant } from '@thealotta/domain'
import type { Capability, GrantEffect, GrantScopeType, HouseholdRole, Sensitivity } from '@thealotta/contracts'

/**
 * Lädt den vollständigen Autorisierungskontext einmal je Request.
 *
 * Danach ist jede Entscheidung eine reine Funktion (`decide`) – kein Nachladen, keine
 * versteckten Abfragen mitten in der Geschäftslogik, keine Möglichkeit, dass zwei Stellen
 * unterschiedliche Kontexte sehen.
 */
export async function loadEffectiveContext(
  tx: Tx,
  actor: ActorContext,
  householdId: string,
  userId: string,
  now: Date,
): Promise<EffectiveContext> {
  const [membership] = await tx
    .select()
    .from(householdMemberships)
    .where(
      and(
        eq(householdMemberships.householdId, householdId),
        eq(householdMemberships.userId, userId),
        eq(householdMemberships.status, 'active'),
      ),
    )
    .limit(1)

  // INV-005: Keine Mitgliedschaft ⇒ der Haushalt existiert für diesen Nutzer nicht.
  if (!membership) throw crossTenant()
  if (membership.expiresAt && membership.expiresAt.getTime() <= now.getTime()) throw crossTenant()

  const [grantRows, assignmentRows, coverageRows, domainRows, capacityRow] = await Promise.all([
    tx
      .select()
      .from(accessGrants)
      .where(
        and(
          eq(accessGrants.householdId, householdId),
          eq(accessGrants.membershipId, membership.id),
          isNull(accessGrants.revokedAt),
          or(isNull(accessGrants.expiresAt), gt(accessGrants.expiresAt, now)),
        ),
      ),
    tx
      .select()
      .from(responsibilityAssignments)
      .where(
        and(
          eq(responsibilityAssignments.householdId, householdId),
          eq(responsibilityAssignments.membershipId, membership.id),
          isNull(responsibilityAssignments.effectiveTo),
        ),
      ),
    tx
      .select()
      .from(temporaryCoverages)
      .where(
        and(
          eq(temporaryCoverages.householdId, householdId),
          eq(temporaryCoverages.coveringMembershipId, membership.id),
          sql`${temporaryCoverages.state} IN ('active','pending_return')`,
        ),
      ),
    tx.select({ id: domains.id, path: domains.path }).from(domains).where(eq(domains.householdId, householdId)),
    tx
      .select()
      .from(capacityStates)
      .where(and(eq(capacityStates.membershipId, membership.id), isNull(capacityStates.clearedAt)))
      .limit(1),
  ])

  const capacityActive =
    capacityRow[0] && (!capacityRow[0].endsAt || capacityRow[0].endsAt.getTime() > now.getTime())
      ? capacityRow[0]
      : null

  return {
    actor: { ...actor, membershipId: membership.id },
    evaluatedAt: now,
    householdIds: [householdId],
    householdId,
    membershipId: membership.id,
    role: membership.role as HouseholdRole,
    grants: grantRows.map((g) => ({
      id: g.id,
      membershipId: g.membershipId,
      scopeType: g.scopeType as GrantScopeType,
      scopeId: g.scopeId,
      capability: g.capability as Capability,
      maxSensitivity: g.maxSensitivity as Sensitivity,
      effect: g.effect as GrantEffect,
      expiresAt: g.expiresAt,
    })),
    assignments: assignmentRows.map((a) => ({
      domainId: a.domainId,
      membershipId: a.membershipId,
      assignmentKind: a.assignmentKind as never,
    })),
    activeCoverages: coverageRows.map((c) => ({
      id: c.id,
      domainId: c.domainId,
      coveringMembershipId: c.coveringMembershipId,
      originalMembershipId: c.originalMembershipId,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      state: c.state,
    })),
    domainPaths: new Map(domainRows.map((d) => [d.id, d.path])),
    capacity: capacityActive
      ? {
          level: capacityActive.level as never,
          acceptsNewAssignments: capacityActive.acceptsNewAssignments,
          criticalOnly: capacityActive.criticalOnly,
          mutePush: capacityActive.mutePush,
        }
      : { level: 'normal', acceptsNewAssignments: true, criticalOnly: false, mutePush: false },
  }
}
