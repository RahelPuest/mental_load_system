import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import {
  attentionItems,
  householdMemberships,
  households,
  notificationPreferences,
  pushSubscriptions,
  questions,
  capacityStates,
  recordAudit,
  recordEvent,
  responsibilityAssignments,
  tasks,
  temporaryCoverages,
  uuidv7,
  type Tx,
} from '@thealotta/db'
import { assertAutonomy, authorize, badRequest, conflict, notFound, type EffectiveContext } from '@thealotta/domain'
import { DomainService } from './domain.service.js'
import {
  NOTIFICATION_KINDS,
  UNDISMISSABLE_NOTIFICATION_KINDS,
  type HouseholdRole,
  type NotificationChannel,
  type NotificationKind,
  type NotificationPriority,
} from '@thealotta/contracts'

/**
 * Einstellungen: Haushalt, Benachrichtigungen, Geräte.
 *
 * §34 verlangt, dass Nutzer kontrollieren können, was gespeichert wird und wer was sieht.
 * Diese Schalter sind deshalb Produktfunktion, nicht versteckte Konfiguration.
 */
export class SettingsService {
  async getHousehold(tx: Tx, ctx: EffectiveContext) {
    const [row] = await tx.select().from(households).where(eq(households.id, ctx.householdId)).limit(1)
    if (!row) throw notFound('Der Haushalt')
    return row
  }

  async updateHousehold(
    tx: Tx,
    ctx: EffectiveContext,
    input: {
      name?: string
      timezone?: string
      notificationContentLevel?: 'minimal' | 'titles'
      balanceViewEnabled?: boolean
    },
  ) {
    authorize(ctx, 'household:manage', { type: 'household', id: ctx.householdId, householdId: ctx.householdId })
    const before = await this.getHousehold(tx, ctx)

    const [updated] = await tx
      .update(households)
      .set({
        name: input.name ?? before.name,
        timezone: input.timezone ?? before.timezone,
        notificationContentLevel: input.notificationContentLevel ?? before.notificationContentLevel,
        balanceViewEnabled: input.balanceViewEnabled ?? before.balanceViewEnabled,
        version: sql`version + 1`,
      })
      .where(eq(households.id, ctx.householdId))
      .returning()

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'household.updated',
      subjectType: 'household',
      subjectId: ctx.householdId,
      before: { name: before.name, timezone: before.timezone },
      after: { name: updated!.name, timezone: updated!.timezone },
      payload: {
        notificationContentLevel: updated!.notificationContentLevel,
        balanceViewEnabled: updated!.balanceViewEnabled,
      },
    })
    return updated!
  }

  /**
   * Rollenwechsel ist eine A3-Operation: Das System nimmt ihn nie von selbst vor,
   * und er wird zusätzlich im Sicherheitsprotokoll festgehalten (docs/11 §2).
   */

  /**
   * Jemand verlässt den Haushalt – oder wird entfernt.
   *
   * Ohne diesen Weg endete jeder Lebensfall, den es wirklich gibt, in einer Sackgasse:
   * Beziehung endet, Person zieht aus, Kind wechselt den Haushalt. Die Verantwortung blieb
   * an einem Zugang hängen, den niemand mehr benutzt, und die Anwendung meldete weiter
   * „Anna denkt mit", wo niemand mehr mitdachte (Audit 2, H4).
   *
   * **Was mit der Verantwortung geschieht (entschiedene Variante B):** Sie fällt auf
   * „niemand" zurück und wird sichtbar – unter „Wo niemand mitdenkt". Sie wird
   * ausdrücklich *nicht* an die entfernende Person weitergereicht: Verantwortung
   * zuzuweisen, ohne zu fragen, ist das Gegenteil dessen, was diese Anwendung tut. Und sie
   * blockiert das Ausscheiden nicht – wer geht, geht; wer im Streit geht, kann den
   * Haushalt nicht als Geisel nehmen.
   *
   * Für kritische Bereiche entsteht dabei derselbe Hinweis wie bei einer Auszeit
   * (INV-014): Eine Lücke fällt nicht still auf, sie meldet sich.
   *
   * Nichts wird gelöscht. Die Mitgliedschaft geht auf `left`, der Name bleibt lesbar –
   * sonst wäre der Verlauf voller „unbekannt", und INV-013 verlangt, dass die Historie
   * rekonstruierbar bleibt.
   */
  async removeMember(
    tx: Tx,
    ctx: EffectiveContext,
    membershipId: string,
    now: Date,
  ): Promise<{ vacatedDomains: { id: string; name: string; criticality: string }[]; unassignedTasks: number }> {
    const selbst = membershipId === ctx.membershipId
    // Gehen darf jeder. Andere hinausbitten darf nur, wer den Haushalt verwaltet.
    if (!selbst) {
      assertAutonomy('role.assign', ctx.actor)
      authorize(ctx, 'member:manage', {
        type: 'household_membership',
        id: membershipId,
        householdId: ctx.householdId,
      })
    }

    const [target] = await tx
      .select()
      .from(householdMemberships)
      .where(and(eq(householdMemberships.householdId, ctx.householdId), eq(householdMemberships.id, membershipId)))
      .limit(1)
    if (!target) throw notFound('Das Mitglied')
    if (target.status === 'left') {
      throw conflict('already_left', 'Diese Person gehört bereits nicht mehr zum Haushalt.')
    }

    const aktive = await tx
      .select({ id: householdMemberships.id, role: householdMemberships.role })
      .from(householdMemberships)
      .where(
        and(eq(householdMemberships.householdId, ctx.householdId), eq(householdMemberships.status, 'active')),
      )

    if (aktive.length <= 1) {
      throw conflict(
        'last_member',
        'Du bist die einzige Person im Haushalt. Statt zu gehen, kannst du den Haushalt löschen – dann verschwinden auch die Daten.',
      )
    }
    if (target.role === 'admin' && aktive.filter((m) => m.role === 'admin').length <= 1) {
      throw conflict(
        'last_admin',
        'Vorher muss jemand anderes die Verwaltung übernehmen – sonst kann niemand mehr Personen oder Rechte ändern.',
      )
    }

    /* ── Verantwortung endet, sie wandert nicht ─────────────────────── */
    const offene = await tx
      .select({ id: responsibilityAssignments.id, domainId: responsibilityAssignments.domainId })
      .from(responsibilityAssignments)
      .where(
        and(
          eq(responsibilityAssignments.householdId, ctx.householdId),
          eq(responsibilityAssignments.membershipId, membershipId),
          isNull(responsibilityAssignments.effectiveTo),
        ),
      )

    if (offene.length > 0) {
      // INV-013: beendet, nicht gelöscht.
      await tx
        .update(responsibilityAssignments)
        .set({ effectiveTo: now, endReason: 'member_left' })
        .where(inArray(responsibilityAssignments.id, offene.map((a) => a.id)))
    }

    /* ── Vertretungen, die diese Person übernommen hatte ────────────── */
    await tx
      .update(temporaryCoverages)
      .set({ state: 'cancelled', version: sql`version + 1` })
      .where(
        and(
          eq(temporaryCoverages.householdId, ctx.householdId),
          eq(temporaryCoverages.coveringMembershipId, membershipId),
          inArray(temporaryCoverages.state, ['scheduled', 'active', 'pending_return']),
        ),
      )

    /* ── Aufgaben bleiben, nur ohne Namen ───────────────────────────── */
    const abgegeben = await tx
      .update(tasks)
      .set({ assigneeMembershipId: null, version: sql`version + 1` })
      .where(
        and(
          eq(tasks.householdId, ctx.householdId),
          eq(tasks.assigneeMembershipId, membershipId),
          sql`${tasks.state} IN ('draft','ready','in_progress','blocked','waiting','deferred')`,
        ),
      )
      .returning({ id: tasks.id })

    // Eine Frage an jemanden, der nicht mehr da ist, wartet für immer. Sie bleibt offen,
    // richtet sich aber wieder an alle.
    await tx
      .update(questions)
      .set({ directedTo: null })
      .where(and(eq(questions.householdId, ctx.householdId), eq(questions.directedTo, membershipId)))

    await tx
      .update(capacityStates)
      .set({ clearedAt: now })
      .where(and(eq(capacityStates.membershipId, membershipId), isNull(capacityStates.clearedAt)))

    await tx
      .update(pushSubscriptions)
      .set({ disabledAt: now })
      .where(and(eq(pushSubscriptions.membershipId, membershipId), isNull(pushSubscriptions.disabledAt)))

    await tx
      .update(householdMemberships)
      .set({ status: 'left', leftAt: now, version: sql`version + 1` })
      .where(eq(householdMemberships.id, membershipId))

    /* ── Was jetzt ohne Zuständige dasteht ──────────────────────────── */
    const vacated = offene.length > 0 ? await this.vacatedDomains(tx, ctx, offene.map((a) => a.domainId)) : []

    for (const domain of vacated.filter((d) => d.criticality === 'high' || d.criticality === 'critical')) {
      await tx
        .insert(attentionItems)
        .values({
          householdId: ctx.householdId,
          domainId: domain.id,
          signalKind: 'coverage_gap',
          title: `${domain.name}: Verantwortung klären`,
          whyNow:
            `${target.displayName} gehört nicht mehr zum Haushalt. Für diesen Bereich denkt gerade niemand mit.`,
          ifItWaits: 'Ohne klare Zuständigkeit kann hier etwas liegen bleiben, das niemand bemerkt.',
          severity: 'important',
          origin: 'system_rule',
          originRef: `member_left:${membershipId}:${domain.id}`,
        })
        .onConflictDoNothing()
    }

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: selbst ? 'membership.left' : 'membership.removed',
      subjectType: 'household_membership',
      subjectId: membershipId,
      payload: {
        vacatedDomains: vacated.map((d) => d.id),
        releasedAssignments: offene.length,
        unassignedTasks: abgegeben.length,
      },
    })
    await recordAudit(tx, {
      action: selbst ? 'membership.left' : 'membership.removed',
      householdId: ctx.householdId,
      userId: ctx.actor.userId,
      membershipId: ctx.membershipId,
      subjectType: 'household_membership',
      subjectId: membershipId,
      metadata: { vacatedDomains: vacated.length, unassignedTasks: abgegeben.length },
    })

    return { vacatedDomains: vacated, unassignedTasks: abgegeben.length }
  }

  /**
   * Welche der betroffenen Bereiche haben jetzt wirklich niemanden mehr?
   *
   * Nicht jeder freigewordene Bereich steht ohne Zuständige da: Verantwortung wird vererbt,
   * und für einen Unterbereich kann weiter der übergeordnete Bereich einstehen. Gefragt wird
   * deshalb nach dem *wirksamen* Zuständigen, nicht nach der aufgehobenen Zuweisung.
   */
  private async vacatedDomains(tx: Tx, ctx: EffectiveContext, domainIds: string[]) {
    const alle = await new DomainService().list(tx, ctx, new Date())
    const betroffen = new Set(domainIds)
    return alle
      .filter((d) => betroffen.has(d.id) && d.effectiveOwner === null && d.archivedAt === null)
      .map((d) => ({ id: d.id, name: d.name, criticality: d.criticality as string }))
  }

  async changeRole(tx: Tx, ctx: EffectiveContext, membershipId: string, role: HouseholdRole) {
    assertAutonomy('role.assign', ctx.actor)
    authorize(ctx, 'role:assign', { type: 'household_membership', id: membershipId, householdId: ctx.householdId })

    const [target] = await tx
      .select()
      .from(householdMemberships)
      .where(and(eq(householdMemberships.householdId, ctx.householdId), eq(householdMemberships.id, membershipId)))
      .limit(1)
    if (!target) throw notFound('Das Mitglied')

    // Der letzte Admin darf sich nicht selbst herabstufen – sonst wäre der Haushalt
    // ohne verwaltungsfähige Person.
    if (target.role === 'admin' && role !== 'admin') {
      const admins = await tx
        .select({ id: householdMemberships.id })
        .from(householdMemberships)
        .where(
          and(
            eq(householdMemberships.householdId, ctx.householdId),
            eq(householdMemberships.role, 'admin'),
            eq(householdMemberships.status, 'active'),
          ),
        )
      if (admins.length <= 1) {
        throw conflict('last_admin', 'Es muss mindestens eine Person die Verwaltung übernehmen können.')
      }
    }

    if (role === 'guest' && !target.expiresAt) {
      throw badRequest('validation_failed', 'Gastzugänge brauchen ein Ablaufdatum.')
    }

    await tx
      .update(householdMemberships)
      .set({ role, version: sql`version + 1` })
      .where(eq(householdMemberships.id, membershipId))

    await recordAudit(tx, {
      action: 'membership.role_changed',
      householdId: ctx.householdId,
      userId: ctx.actor.userId,
      membershipId: ctx.membershipId,
      subjectType: 'household_membership',
      subjectId: membershipId,
      metadata: { from: target.role, to: role },
    })
    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'membership.role_changed',
      subjectType: 'household_membership',
      subjectId: membershipId,
      payload: { from: target.role, to: role },
    })
  }

  /* ── Benachrichtigungen (§28) ─────────────────────────────────────── */

  async listNotificationPreferences(tx: Tx, ctx: EffectiveContext) {
    const rows = await tx
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.membershipId, ctx.membershipId))

    const byKind = new Map(rows.map((r) => [r.notificationKind, r]))

    // Für jede Art wird ein vollständiger Eintrag geliefert – auch für nicht konfigurierte.
    // Der Nutzer soll sehen, was es überhaupt gibt, statt eine leere Liste vorzufinden.
    return NOTIFICATION_KINDS.map((kind) => {
      const existing = byKind.get(kind)
      const undismissable = UNDISMISSABLE_NOTIFICATION_KINDS.includes(kind)
      return {
        notificationKind: kind,
        priorityFloor: (existing?.priorityFloor ?? 'low') as NotificationPriority,
        channels: (existing?.channels as NotificationChannel[] | undefined) ?? defaultChannels(kind),
        quietHours: existing?.quietHours ?? null,
        configurable: !undismissable,
        explanation: NOTIFICATION_EXPLANATIONS[kind],
      }
    })
  }

  async setNotificationPreferences(
    tx: Tx,
    ctx: EffectiveContext,
    input: {
      notificationKind: NotificationKind
      priorityFloor: NotificationPriority
      channels: NotificationChannel[]
      quietHours: { start: string; end: string; timezone: string } | null
    }[],
  ) {
    for (const entry of input) {
      if (UNDISMISSABLE_NOTIFICATION_KINDS.includes(entry.notificationKind)) {
        // Sicherheits- und Systemmeldungen bleiben zustellbar; nur der Kanal ist wählbar.
        if (entry.channels.length === 0) {
          throw badRequest(
            'validation_failed',
            'Sicherheits- und Systemmeldungen brauchen mindestens einen Kanal. Du kannst sie auf „nur in der App" beschränken.',
          )
        }
      }

      await tx
        .insert(notificationPreferences)
        .values({
          householdId: ctx.householdId,
          membershipId: ctx.membershipId,
          notificationKind: entry.notificationKind,
          priorityFloor: entry.priorityFloor,
          channels: entry.channels as never,
          quietHours: entry.quietHours as never,
        })
        .onConflictDoUpdate({
          target: [notificationPreferences.membershipId, notificationPreferences.notificationKind],
          set: {
            priorityFloor: entry.priorityFloor,
            channels: entry.channels as never,
            quietHours: entry.quietHours as never,
            updatedAt: new Date(),
          },
        })
    }
  }

  async registerPushSubscription(
    tx: Tx,
    ctx: EffectiveContext,
    input: { endpoint: string; keys: { p256dh: string; auth: string } },
  ): Promise<{ id: string }> {
    const id = uuidv7()
    await tx
      .insert(pushSubscriptions)
      .values({
        id,
        householdId: ctx.householdId,
        membershipId: ctx.membershipId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { membershipId: ctx.membershipId, disabledAt: null, disabledReason: null },
      })
    return { id }
  }

  async listPushSubscriptions(tx: Tx, ctx: EffectiveContext) {
    return tx
      .select({
        id: pushSubscriptions.id,
        createdAt: pushSubscriptions.createdAt,
        lastSuccessAt: pushSubscriptions.lastSuccessAt,
        disabledAt: pushSubscriptions.disabledAt,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.membershipId, ctx.membershipId))
  }

  async removePushSubscription(tx: Tx, ctx: EffectiveContext, id: string): Promise<void> {
    await tx
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.membershipId, ctx.membershipId), eq(pushSubscriptions.id, id)))
  }
}

function defaultChannels(kind: NotificationKind): NotificationChannel[] {
  if (kind.startsWith('security.')) return ['in_app', 'email']
  if (kind === 'domain.unowned_critical' || kind === 'capacity.coverage_gap' || kind === 'state.conflict') {
    return ['in_app', 'push']
  }
  return ['in_app']
}

/** Klartext statt Fachbegriffen: Die Einstellungsseite erklärt, was jede Art bedeutet (§41). */
const NOTIFICATION_EXPLANATIONS: Record<NotificationKind, string> = {
  'attention.new': 'Etwas in einem deiner Bereiche könnte Aufmerksamkeit brauchen.',
  'attention.escalated': 'Ein Hinweis ist dringender geworden.',
  'task.assigned_to_you': 'Jemand hat dir eine Aufgabe zugewiesen.',
  'task.due_soon': 'Für eine Aufgabe rückt der vorgesehene Zeitpunkt näher.',
  'task.waiting_released': 'Etwas, worauf gewartet wurde, ist eingetroffen.',
  'question.directed_to_you': 'Eine Frage ist an dich gerichtet.',
  'question.answered': 'Eine deiner Fragen wurde beantwortet.',
  'process.stalled': 'Ein Vorgang hat gerade keinen nächsten Schritt.',
  'ownership.assigned_to_you': 'Dir wurde die Verantwortung für einen Bereich übertragen.',
  'ownership.coverage_starting': 'Eine Vertretung beginnt.',
  'ownership.coverage_return_due': 'Eine Vertretung endet und wartet auf Bestätigung.',
  'domain.unowned_critical': 'Ein wichtiger Bereich hat gerade keine klare Zuständigkeit.',
  'state.conflict': 'Zu einer Angabe gibt es zwei unterschiedliche Werte.',
  'calendar.connection_unhealthy': 'Eine Kalenderverbindung liefert keine Daten mehr.',
  'capacity.coverage_gap': 'Jemand hat weniger Kapazität; wichtige Bereiche brauchen Klärung.',
  'system.export_ready': 'Dein Datenexport steht bereit.',
  'system.deletion_scheduled': 'Eine Löschung wurde beantragt.',
  'security.new_login': 'Neue Anmeldung an deinem Konto.',
  'security.grant_changed': 'Berechtigungen wurden geändert.',
  'security.sensitive_access': 'Jemand hat auf besonders geschützte Inhalte zugegriffen.',
}
