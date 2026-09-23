import { and, eq, isNull, sql } from 'drizzle-orm'
import {
  householdMemberships,
  households,
  invitations,
  recordAudit,
  recordEvent,
  uuidv7,
  withTenant,
  withoutTenant,
  type Database,
  type Tx,
} from '@thealotta/db'
import { generateToken, hashToken } from '@thealotta/crypto'
import { authorize, badRequest, conflict, notFound, type ActorContext, type EffectiveContext } from '@thealotta/domain'
import type { HouseholdRole } from '@thealotta/contracts'

export interface InvitationPreview {
  householdName: string
  role: HouseholdRole
  email: string
  expiresAt: Date
}

/**
 * §7.1: Ein Haushalt entsteht selten allein. Ohne Einladungsfluss könnte die zweite Person
 * nur direkt in der Datenbank entstehen – das Produkt wäre faktisch einbenutzerfähig.
 *
 * Das Token wird nur als Hash gespeichert und ist an die E-Mail-Adresse gebunden: Ein
 * weitergeleiteter Link nützt einer anderen Person nichts.
 */
export class InvitationService {
  constructor(private readonly db: Database) {}

  async create(
    tx: Tx,
    ctx: EffectiveContext,
    input: { email: string; role: HouseholdRole; expiresAt: Date | null },
    now: Date,
  ): Promise<{ id: string; token: string; expiresAt: Date }> {
    authorize(ctx, 'member:invite', { type: 'invitation', id: null, householdId: ctx.householdId })

    if (input.role === 'admin') {
      authorize(ctx, 'role:assign', { type: 'invitation', id: null, householdId: ctx.householdId })
    }
    if (input.role === 'guest' && !input.expiresAt) {
      throw badRequest('validation_failed', 'Gastzugänge brauchen ein Ablaufdatum.')
    }

    const existing = await tx
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          eq(invitations.householdId, ctx.householdId),
          eq(invitations.email, input.email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .limit(1)
    if (existing.length > 0) {
      throw conflict('invitation_exists', 'Für diese Adresse gibt es bereits eine offene Einladung.')
    }

    const token = generateToken()
    const id = uuidv7()
    const expiresAt = new Date(now.getTime() + 7 * 86_400_000)

    await tx.insert(invitations).values({
      id,
      householdId: ctx.householdId,
      email: input.email,
      role: input.role,
      tokenHash: hashToken(token),
      invitedBy: ctx.membershipId,
      expiresAt,
    })

    await recordAudit(tx, {
      action: 'membership.invited',
      householdId: ctx.householdId,
      userId: ctx.actor.userId,
      membershipId: ctx.membershipId,
      subjectType: 'invitation',
      subjectId: id,
      metadata: { role: input.role },
    })
    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'membership.invited',
      subjectType: 'invitation',
      subjectId: id,
      payload: { role: input.role },
    })

    return { id, token, expiresAt }
  }

  async list(tx: Tx, ctx: EffectiveContext, now: Date) {
    authorize(ctx, 'member:invite', { type: 'invitation', id: null, householdId: ctx.householdId })
    const rows = await tx
      .select()
      .from(invitations)
      .where(and(eq(invitations.householdId, ctx.householdId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role as HouseholdRole,
      expiresAt: row.expiresAt,
      expired: row.expiresAt.getTime() <= now.getTime(),
    }))
  }

  async revoke(tx: Tx, ctx: EffectiveContext, invitationId: string, now: Date): Promise<void> {
    authorize(ctx, 'member:invite', { type: 'invitation', id: invitationId, householdId: ctx.householdId })
    await tx
      .update(invitations)
      .set({ revokedAt: now })
      .where(and(eq(invitations.householdId, ctx.householdId), eq(invitations.id, invitationId)))
  }

  /**
   * Vorschau vor dem Beitritt: Wer lädt ein, in welchen Haushalt, mit welcher Rolle.
   * Niemand soll einem Link folgen und danach überrascht Mitglied sein.
   */
  async preview(token: string, now: Date): Promise<InvitationPreview> {
    return withoutTenant(this.db, 'invitation_lookup_is_pre_tenant', async (tx) => {
      const [row] = await tx
        .select({
          email: invitations.email,
          role: invitations.role,
          expiresAt: invitations.expiresAt,
          householdName: households.name,
        })
        .from(invitations)
        .innerJoin(households, eq(households.id, invitations.householdId))
        .where(and(eq(invitations.tokenHash, hashToken(token)), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
        .limit(1)

      if (!row || row.expiresAt.getTime() <= now.getTime()) {
        throw notFound('Diese Einladung')
      }
      return {
        householdName: row.householdName,
        role: row.role as HouseholdRole,
        email: row.email,
        expiresAt: row.expiresAt,
      }
    })
  }

  async accept(
    actor: ActorContext,
    token: string,
    user: { id: string; email: string; displayName: string },
    now: Date,
  ): Promise<{ householdId: string; membershipId: string }> {
    const invitation = await withoutTenant(this.db, 'invitation_lookup_is_pre_tenant', async (tx) => {
      const [row] = await tx
        .select()
        .from(invitations)
        .where(and(eq(invitations.tokenHash, hashToken(token)), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
        .limit(1)
      return row
    })

    if (!invitation || invitation.expiresAt.getTime() <= now.getTime()) {
      throw notFound('Diese Einladung')
    }
    // An die Adresse gebunden: Ein weitergeleiteter Link öffnet niemandem sonst die Tür.
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw badRequest(
        'invitation_email_mismatch',
        'Diese Einladung gilt für eine andere E-Mail-Adresse. Melde dich mit der eingeladenen Adresse an.',
      )
    }

    const membershipId = uuidv7()
    await withTenant(this.db, [invitation.householdId], async (tx) => {
      const existing = await tx
        .select({ id: householdMemberships.id })
        .from(householdMemberships)
        .where(
          and(
            eq(householdMemberships.householdId, invitation.householdId),
            eq(householdMemberships.userId, user.id),
            sql`${householdMemberships.status} <> 'left'`,
          ),
        )
        .limit(1)
      if (existing.length > 0) {
        throw conflict('already_member', 'Du gehörst bereits zu diesem Haushalt.')
      }

      await tx.insert(householdMemberships).values({
        id: membershipId,
        householdId: invitation.householdId,
        userId: user.id,
        displayName: user.displayName,
        role: invitation.role,
        status: 'active',
      })
      await tx.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, invitation.id))

      const boundActor: ActorContext = { ...actor, membershipId }
      await recordAudit(tx, {
        action: 'membership.accepted',
        householdId: invitation.householdId,
        userId: user.id,
        membershipId,
        subjectType: 'invitation',
        subjectId: invitation.id,
        metadata: { role: invitation.role },
      })
      await recordEvent(tx, invitation.householdId, boundActor, {
        eventType: 'membership.accepted',
        subjectType: 'household_membership',
        subjectId: membershipId,
        payload: { role: invitation.role },
      })
    })

    return { householdId: invitation.householdId, membershipId }
  }
}
