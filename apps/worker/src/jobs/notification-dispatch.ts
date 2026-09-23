import { and, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import {
  capacityStates,
  notificationDeliveries,
  notificationPreferences,
  notifications,
  pushSubscriptions,
  withTenant,
  type Database,
  type Tx,
} from '@thealotta/db'
import {
  UNDISMISSABLE_NOTIFICATION_KINDS,
  priorityRank,
  type NotificationChannel,
  type NotificationKind,
  type NotificationPriority,
} from '@thealotta/contracts'
import { notificationDeliveries as deliveryMetric, notificationSuppressed } from '@thealotta/observability'

export interface ChannelSender {
  channel: NotificationChannel
  send(input: { recipientMembershipId: string; title: string; body: string; payload: Record<string, unknown> }): Promise<void>
}

export interface DispatchResult {
  sent: number
  failed: number
  suppressed: number
}

const MAX_ATTEMPTS = 5

/**
 * Schutz vor Meldungsmüdigkeit (docs/23 §3, docs/60 R1).
 *
 * Die Maßnahmen standen seit jeher im Modell und waren nicht gebaut: `bundle_after` existierte
 * als Spalte ohne Code, Staleness-Gate und Ratenbegrenzung gar nicht. Bei den wenigen Meldungen
 * eines Demohaushalts fällt das nicht auf – ein realer Haushalt mit mehreren Bereichen und
 * Regeln erzeugt genug, dass Habituation einsetzt.
 *
 * Systematische Übersichten aus der klinischen Entscheidungsunterstützung finden
 * Override-Raten von 46–96 %. Die Zahlen sind nicht auf Familiensoftware übertragbar, der
 * Mechanismus schon: Wer zu oft angetippt wird, tippt weg, ohne zu lesen.
 *
 * Alle drei Maßnahmen betreffen **nur den Push**. In der App bleibt jede Meldung sichtbar –
 * nichts geht verloren (INV-001).
 */
const PUSH_PRO_STUNDE = 4
const PUSH_PRO_TAG = 12

/** Älter als das: nicht mehr einzeln antippen, nur noch in der App zeigen. */
const MAX_STALENESS_MS = 6 * 60 * 60 * 1000

/** Kanäle, die jemanden unterbrechen. In-App unterbricht nicht und wird nie begrenzt. */
const LAUTE_KANAELE = new Set<NotificationChannel>(['push', 'email'])

/**
 * Zustellung (docs/23).
 *
 * INV-006 ist hier die Leitplanke: Dieser Job schreibt ausschließlich in `notifications` und
 * `notification_deliveries`. In Produktion läuft er zusätzlich unter der DB-Rolle
 * `thealotta_notifier`, die auf fachlichen Tabellen nur lesen darf.
 */
export async function dispatchNotifications(
  db: Database,
  householdId: string,
  senders: readonly ChannelSender[],
  now: Date,
): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, failed: 0, suppressed: 0 }

  await withTenant(db, [householdId], async (tx) => {
    const pending = await tx
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.householdId, householdId),
          eq(notifications.state, 'pending'),
          /*
            `bundle_after` ist ein Sammelfenster: Wer sie setzt, sagt „warte noch, es kommt
            vielleicht mehr". Vorher stand die Spalte da und wurde nie gelesen – eine
            Verzögerung, die niemand bewirkte.
          */
          or(isNull(notifications.bundleAfter), lte(notifications.bundleAfter, now)),
        ),
      )
      /*
       * Die Reihenfolge entscheidet, **welche** Meldung den Push für die anderen trägt –
       * ohne Sortierung entschied das die Datenbank, also der Zufall. Das Dringendste zuerst,
       * bei gleicher Dringlichkeit das Älteste: Wer angetippt wird, soll die wichtigste Sache
       * sehen, nicht irgendeine.
       */
      .orderBy(
        sql`CASE ${notifications.priority}
              WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`,
        notifications.createdAt,
      )
      .limit(200)

    /*
     * Wie viele laute Zustellungen hat jede Person in dieser Stunde und an diesem Tag schon
     * bekommen? Einmal je Durchlauf gezählt, nicht je Meldung – sonst wäre die Begrenzung
     * selbst der teuerste Teil des Jobs.
     */
    const lautBisher = await zaehleLauteZustellungen(tx, householdId, now)

    /*
     * Wer mehrere Meldungen auf einmal bekommt, soll einmal angetippt werden, nicht dreimal.
     * Die erste trägt den Push für alle – ihr Text nennt die Zahl –, die übrigen bleiben in
     * der App. Unterbrochene Arbeit wird zwar schneller erledigt, aber mit messbar mehr
     * Stress (Mark, Gudith & Klocke 2008); drei Unterbrechungen sind dreimal so teuer wie eine.
     */
    const lautZaehler = new Map<string, number>()

    for (const notification of pending) {
      const channels = await resolveChannels(tx, notification, now)

      if (channels.length === 0) {
        await tx
          .update(notifications)
          .set({ state: 'suppressed', suppressedReason: 'keine aktiven Kanäle für diese Einstellung' })
          .where(eq(notifications.id, notification.id))
        notificationSuppressed.labels('preferences_or_capacity').inc()
        result.suppressed += 1
        continue
      }

      const empfaenger = notification.recipientMembershipId
      const kritisch = notification.priority === 'critical'
      const zuAlt = now.getTime() - notification.createdAt.getTime() > MAX_STALENESS_MS
      const schonLaut = (lautBisher.get(empfaenger) ?? { stunde: 0, tag: 0 })
      const bereitsInDiesemLauf = lautZaehler.get(empfaenger) ?? 0

      /*
       * Drei Gründe, den lauten Kanal wegzulassen – jeder einzeln nachvollziehbar:
       *
       *   zu alt      Eine Meldung von heute früh mitten am Nachmittag anzutippen, hilft
       *               niemandem mehr; sie steht in der App.
       *   zu viele    Ab der fünften Zustellung in einer Stunde liest niemand mehr, was
       *               dasteht.
       *   gebündelt   Die erste Meldung dieses Laufs trägt den Push für alle weiteren.
       *
       * Kritisches geht immer durch. Wer eine Grenze auch für Kritisches zieht, hat keine
       * Grenze gebaut, sondern ein Risiko.
       */
      const ueberGrenze =
        schonLaut.stunde + bereitsInDiesemLauf >= PUSH_PRO_STUNDE ||
        schonLaut.tag + bereitsInDiesemLauf >= PUSH_PRO_TAG
      const gebuendelt = bereitsInDiesemLauf > 0

      const stumm = !kritisch && (zuAlt || ueberGrenze || gebuendelt)
      const grund = zuAlt ? 'zu_alt' : ueberGrenze ? 'ratenbegrenzung' : 'gebuendelt'

      const zuStellen = stumm ? channels.filter((c) => !LAUTE_KANAELE.has(c)) : channels
      if (stumm) {
        notificationSuppressed.labels(grund).inc()
      } else if (channels.some((c) => LAUTE_KANAELE.has(c))) {
        lautZaehler.set(empfaenger, bereitsInDiesemLauf + 1)
      }

      for (const channel of zuStellen) {
        // Ein Kanal je Benachrichtigung – der Unique-Index verhindert Doppelzustellung.
        const inserted = await tx
          .insert(notificationDeliveries)
          .values({ householdId, notificationId: notification.id, channel, state: 'queued', nextAttemptAt: now })
          .onConflictDoNothing()
          .returning({ id: notificationDeliveries.id })
        if (inserted.length === 0) continue
      }

      /*
       * Der Grund steht an der Meldung, nicht nur in einer Kennzahl: Wer in der App sieht,
       * dass etwas nicht angetippt wurde, soll auch lesen können, warum.
       */
      if (stumm) {
        await tx
          .update(notifications)
          .set({
            suppressedReason:
              grund === 'zu_alt'
                ? 'zu alt für eine eigene Meldung – steht in der App'
                : grund === 'ratenbegrenzung'
                  ? 'Meldungsgrenze erreicht – steht in der App'
                  : 'mit einer anderen Meldung zusammengefasst',
          })
          .where(eq(notifications.id, notification.id))
      }

      await tx.update(notifications).set({ state: 'dispatched' }).where(eq(notifications.id, notification.id))
    }

    // Fällige Zustellversuche abarbeiten.
    const due = await tx
      .select({
        delivery: notificationDeliveries,
        notification: notifications,
      })
      .from(notificationDeliveries)
      .innerJoin(notifications, eq(notifications.id, notificationDeliveries.notificationId))
      .where(
        and(
          eq(notificationDeliveries.householdId, householdId),
          eq(notificationDeliveries.state, 'queued'),
          or(isNull(notificationDeliveries.nextAttemptAt), lte(notificationDeliveries.nextAttemptAt, now)),
        ),
      )
      .limit(200)

    for (const row of due) {
      const sender = senders.find((s) => s.channel === row.delivery.channel)
      const attempt = row.delivery.attemptCount + 1

      if (!sender) {
        await tx
          .update(notificationDeliveries)
          .set({ state: 'suppressed', failureCode: 'channel_unavailable' })
          .where(eq(notificationDeliveries.id, row.delivery.id))
        result.suppressed += 1
        continue
      }

      try {
        await sender.send({
          recipientMembershipId: row.notification.recipientMembershipId,
          title: row.notification.title,
          body: row.notification.body,
          payload: row.notification.payload as Record<string, unknown>,
        })
        await tx
          .update(notificationDeliveries)
          .set({ state: 'sent', attemptCount: attempt, sentAt: now, nextAttemptAt: null })
          .where(eq(notificationDeliveries.id, row.delivery.id))
        deliveryMetric.labels(row.delivery.channel, 'sent').inc()
        result.sent += 1
      } catch (error) {
        const terminal = attempt >= MAX_ATTEMPTS
        const backoffMinutes = Math.min(240, 2 ** attempt)
        await tx
          .update(notificationDeliveries)
          .set({
            state: terminal ? 'failed' : 'queued',
            attemptCount: attempt,
            nextAttemptAt: terminal ? null : new Date(now.getTime() + backoffMinutes * 60_000),
            failureCode: error instanceof Error ? error.name : 'unknown_error',
            failureDetail: error instanceof Error ? error.message.slice(0, 300) : null,
          })
          .where(eq(notificationDeliveries.id, row.delivery.id))
        deliveryMetric.labels(row.delivery.channel, terminal ? 'failed' : 'retry').inc()
        result.failed += 1
      }
    }
  })

  return result
}

/**
 * §23.3: Kapazität und Einstellungen entscheiden über Kanäle – nie über Relevanz.
 * Was unterdrückt wird, bleibt in der App sichtbar; nur der Push bleibt aus.
 */
async function resolveChannels(
  tx: Tx,
  notification: typeof notifications.$inferSelect,
  now: Date,
): Promise<NotificationChannel[]> {
  const kind = notification.notificationKind as NotificationKind
  const priority = notification.priority as NotificationPriority
  const undismissable = UNDISMISSABLE_NOTIFICATION_KINDS.includes(kind)

  const [preference] = await tx
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.membershipId, notification.recipientMembershipId),
        eq(notificationPreferences.notificationKind, kind),
      ),
    )
    .limit(1)

  let channels: NotificationChannel[] = preference
    ? ((preference.channels as NotificationChannel[]) ?? ['in_app'])
    : priority === 'critical'
      ? ['in_app', 'push', 'email']
      : priority === 'high'
        ? ['in_app', 'push']
        : ['in_app']

  if (preference && !undismissable && priorityRank(priority) < priorityRank(preference.priorityFloor as NotificationPriority)) {
    return []
  }

  const [capacity] = await tx
    .select()
    .from(capacityStates)
    .where(and(eq(capacityStates.membershipId, notification.recipientMembershipId), isNull(capacityStates.clearedAt)))
    .limit(1)

  const capacityActive = capacity && (!capacity.endsAt || capacity.endsAt.getTime() > now.getTime())

  if (capacityActive && capacity.mutePush && priority !== 'critical') {
    channels = channels.filter((c) => c !== 'push')
  }
  if (capacityActive && capacity.criticalOnly && priority !== 'critical' && !undismissable) {
    // In-App bleibt: die Sache verschwindet nicht, sie klopft nur nicht an.
    channels = channels.filter((c) => c === 'in_app')
  }

  if (channels.includes('push')) {
    const subs = await tx
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.membershipId, notification.recipientMembershipId),
          isNull(pushSubscriptions.disabledAt),
        ),
      )
      .limit(1)
    if (subs.length === 0) channels = channels.filter((c) => c !== 'push')
  }

  return channels
}

/**
 * Wie viele laute Zustellungen hat jede Person zuletzt bekommen?
 *
 * Gezählt werden tatsächlich **gesendete** Zustellungen, nicht angelegte: Was in der
 * Warteschlange hängt, hat niemanden unterbrochen.
 */
async function zaehleLauteZustellungen(
  tx: Tx,
  householdId: string,
  now: Date,
): Promise<Map<string, { stunde: number; tag: number }>> {
  const seitEinerStunde = new Date(now.getTime() - 60 * 60 * 1000)
  const seitEinemTag = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const zeilen = await tx
    .select({
      empfaenger: notifications.recipientMembershipId,
      gesendet: notificationDeliveries.sentAt,
    })
    .from(notificationDeliveries)
    .innerJoin(notifications, eq(notifications.id, notificationDeliveries.notificationId))
    .where(
      and(
        eq(notificationDeliveries.householdId, householdId),
        eq(notificationDeliveries.state, 'sent'),
        inArray(notificationDeliveries.channel, ['push', 'email']),
        /*
          `gte` statt roher `sql`: Ein `Date` in einer Vorlage kann der Treiber nicht
          serialisieren – das endet in einem Laufzeitfehler, nicht in einem Übersetzungsfehler.
          In diesem Projekt schon dreimal passiert.
        */
        gte(notificationDeliveries.sentAt, seitEinemTag),
      ),
    )

  const out = new Map<string, { stunde: number; tag: number }>()
  for (const z of zeilen) {
    const eintrag = out.get(z.empfaenger) ?? { stunde: 0, tag: 0 }
    eintrag.tag += 1
    if (z.gesendet && z.gesendet >= seitEinerStunde) eintrag.stunde += 1
    out.set(z.empfaenger, eintrag)
  }
  return out
}
