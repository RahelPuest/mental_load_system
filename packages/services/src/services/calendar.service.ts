import { and, eq, gte, lte, sql } from 'drizzle-orm'
import {
  calendarConnections,
  calendarEvents,
  calendarSelections,
  recordAudit,
  recordEvent,
  uuidv7,
  type Tx,
} from '@thealotta/db'
import { encrypt, type KeyProvider } from '@thealotta/crypto'
import { authorize, badRequest, notFound, type EffectiveContext } from '@thealotta/domain'
import type { CalendarProvider, CalendarShareLevel } from '@thealotta/contracts'

/**
 * Kalenderverbindungen (§14.3).
 *
 * Der Nutzer kontrolliert vollständig, welcher Kalender gelesen wird und wie viel andere
 * davon sehen. Termininhalte sind per Default verborgen – ein Terminkalender verrät
 * Aufenthaltsort und Gesundheit.
 */
export class CalendarService {
  constructor(private readonly keys: KeyProvider) {}

  async list(tx: Tx, ctx: EffectiveContext) {
    const connections = await tx
      .select({
        id: calendarConnections.id,
        provider: calendarConnections.provider,
        displayName: calendarConnections.displayName,
        state: calendarConnections.state,
        lastSyncAt: calendarConnections.lastSyncAt,
        lastErrorCode: calendarConnections.lastErrorCode,
        consecutiveFailures: calendarConnections.consecutiveFailures,
        nextSyncAt: calendarConnections.nextSyncAt,
        membershipId: calendarConnections.membershipId,
      })
      .from(calendarConnections)
      .where(eq(calendarConnections.householdId, ctx.householdId))

    // Verbindungen anderer Personen werden nur benannt, nicht im Detail gezeigt.
    const own = connections.filter((c) => c.membershipId === ctx.membershipId)
    const others = connections.filter((c) => c.membershipId !== ctx.membershipId)

    const selections = own.length
      ? await tx
          .select()
          .from(calendarSelections)
          .where(eq(calendarSelections.householdId, ctx.householdId))
      : []

    return {
      own: own.map((c) => ({
        ...c,
        selections: selections.filter((s) => s.connectionId === c.id),
      })),
      othersCount: others.length,
    }
  }

  /**
   * Die URL wird verschlüsselt abgelegt (AES-256-GCM, an die Verbindung gebunden). Der
   * eigentliche SSRF-Schutz greift beim Abruf im Worker – hier wird nur grob vorgeprüft,
   * damit offensichtlicher Unsinn nicht erst später auffällt.
   */
  async connect(
    tx: Tx,
    ctx: EffectiveContext,
    input: { provider: CalendarProvider; displayName: string; config: { url?: string; username?: string; password?: string } },
  ): Promise<{ id: string }> {
    authorize(ctx, 'calendar:connect', { type: 'calendar_connection', id: null, householdId: ctx.householdId })

    if (input.provider === 'google') {
      throw badRequest(
        'not_available',
        'Die Google-Anbindung ist in dieser Installation nicht aktiviert. Ein ICS-Link funktioniert sofort.',
      )
    }
    if (!input.config.url) throw badRequest('validation_failed', 'Für einen ICS- oder CalDAV-Kalender fehlt die Adresse.')
    if (!/^https?:\/\//.test(input.config.url)) {
      throw badRequest('validation_failed', 'Die Adresse muss mit http:// oder https:// beginnen.')
    }

    const id = uuidv7()
    const ciphertext = encrypt(this.keys, JSON.stringify(input.config), `calendar_connection:${id}`)

    await tx.insert(calendarConnections).values({
      id,
      householdId: ctx.householdId,
      membershipId: ctx.membershipId,
      provider: input.provider,
      displayName: input.displayName,
      credentialsCiphertext: ciphertext.data,
      credentialsKeyId: ciphertext.keyId,
      state: 'active',
      nextSyncAt: new Date(),
    })

    // Ein ICS-Link ist genau ein Kalender – die Auswahl entsteht direkt mit.
    await tx.insert(calendarSelections).values({
      householdId: ctx.householdId,
      connectionId: id,
      externalCalendarId: 'primary',
      displayName: input.displayName,
      readEnabled: true,
      writeEnabled: false,
      shareLevel: 'busy',
    })

    await recordAudit(tx, {
      action: 'calendar.connected',
      householdId: ctx.householdId,
      userId: ctx.actor.userId,
      membershipId: ctx.membershipId,
      subjectType: 'calendar_connection',
      subjectId: id,
      metadata: { provider: input.provider },
    })
    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'calendar.connected',
      subjectType: 'calendar_connection',
      subjectId: id,
      payload: { provider: input.provider },
    })
    return { id }
  }

  async updateSelection(
    tx: Tx,
    ctx: EffectiveContext,
    connectionId: string,
    input: { externalCalendarId: string; readEnabled: boolean; writeEnabled: boolean; shareLevel: CalendarShareLevel },
  ): Promise<void> {
    const connection = await this.own(tx, ctx, connectionId)
    await tx
      .update(calendarSelections)
      .set({
        readEnabled: input.readEnabled,
        writeEnabled: input.writeEnabled,
        shareLevel: input.shareLevel,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(calendarSelections.connectionId, connection.id),
          eq(calendarSelections.externalCalendarId, input.externalCalendarId),
        ),
      )

    await recordAudit(tx, {
      action: 'calendar.scope_changed',
      householdId: ctx.householdId,
      userId: ctx.actor.userId,
      membershipId: ctx.membershipId,
      subjectType: 'calendar_connection',
      subjectId: connection.id,
      metadata: { shareLevel: input.shareLevel, readEnabled: input.readEnabled },
    })
  }

  /** Setzt den Sync auf „jetzt fällig". Die eigentliche Arbeit macht der Worker. */
  async requestSync(tx: Tx, ctx: EffectiveContext, connectionId: string, now: Date): Promise<void> {
    const connection = await this.own(tx, ctx, connectionId)
    await tx
      .update(calendarConnections)
      .set({ nextSyncAt: now, consecutiveFailures: 0, version: sql`version + 1` })
      .where(eq(calendarConnections.id, connection.id))
  }

  async disconnect(tx: Tx, ctx: EffectiveContext, connectionId: string): Promise<void> {
    const connection = await this.own(tx, ctx, connectionId)
    // INV-012: Die gespiegelten Termine bleiben als Historie erhalten.
    await tx
      .update(calendarConnections)
      .set({ state: 'disconnected', credentialsCiphertext: null, credentialsKeyId: null, version: sql`version + 1` })
      .where(eq(calendarConnections.id, connection.id))

    await recordAudit(tx, {
      action: 'calendar.disconnected',
      householdId: ctx.householdId,
      userId: ctx.actor.userId,
      membershipId: ctx.membershipId,
      subjectType: 'calendar_connection',
      subjectId: connection.id,
    })
    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'calendar.disconnected',
      subjectType: 'calendar_connection',
      subjectId: connection.id,
      payload: {},
    })
  }

  /**
   * §22.8: Was andere sehen, hängt am `share_level` des Kalenders. Unterhalb von `title`
   * wird der Termininhalt durch „belegt" ersetzt – die Verfügbarkeit bleibt nutzbar,
   * der Inhalt privat.
   */
  async events(tx: Tx, ctx: EffectiveContext, range: { from: Date; to: Date }) {
    const rows = await tx
      .select({
        event: calendarEvents,
        shareLevel: calendarSelections.shareLevel,
        ownerMembershipId: calendarConnections.membershipId,
      })
      .from(calendarEvents)
      .innerJoin(calendarConnections, eq(calendarConnections.id, calendarEvents.connectionId))
      .leftJoin(
        calendarSelections,
        and(
          eq(calendarSelections.connectionId, calendarEvents.connectionId),
          eq(calendarSelections.externalCalendarId, calendarEvents.externalCalendarId),
        ),
      )
      .where(
        and(
          eq(calendarEvents.householdId, ctx.householdId),
          gte(calendarEvents.startsAt, range.from),
          lte(calendarEvents.startsAt, range.to),
          sql`${calendarEvents.state} <> 'cancelled'`,
        ),
      )
      .limit(500)

    return rows.map(({ event, shareLevel, ownerMembershipId }) => {
      const mine = ownerMembershipId === ctx.membershipId
      const level = (shareLevel ?? 'busy') as CalendarShareLevel
      const showTitle = mine || level === 'title' || level === 'full'
      return {
        id: event.id,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        allDay: event.allDay,
        timeZone: event.timeZone,
        linkedDomainId: event.linkedDomainId,
        isMine: mine,
        title: showTitle ? event.title : 'belegt',
        location: mine || level === 'full' ? event.location : null,
        contentHidden: !showTitle,
      }
    })
  }

  private async own(tx: Tx, ctx: EffectiveContext, connectionId: string) {
    const [row] = await tx
      .select()
      .from(calendarConnections)
      .where(and(eq(calendarConnections.householdId, ctx.householdId), eq(calendarConnections.id, connectionId)))
      .limit(1)
    if (!row) throw notFound('Die Kalenderverbindung')
    // Fremde Kalender werden nie verändert – auch nicht von Admins (§6, A3).
    if (row.membershipId !== ctx.membershipId) {
      throw notFound('Die Kalenderverbindung')
    }
    return row
  }
}
