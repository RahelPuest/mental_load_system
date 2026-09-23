import { and, eq, isNull } from 'drizzle-orm'
import nodemailer from 'nodemailer'
import webpush from 'web-push'
import { householdMemberships, pushSubscriptions, users, withoutTenant, type Database } from '@thealotta/db'
import type { ChannelSender } from './jobs/notification-dispatch.js'

/**
 * In-App ist die Rückfallebene: Sie kann nicht scheitern, weil die Benachrichtigung bereits
 * in der Datenbank steht. Genau deshalb geht nichts verloren, wenn Push oder E-Mail ausfallen
 * (§28.1, INV-006).
 */
export const inAppSender: ChannelSender = {
  channel: 'in_app',
  async send() {
    /* Bereits persistiert – nichts zu tun. */
  },
}

export function emailSender(db: Database, smtpUrl: string, from: string): ChannelSender {
  const transport = nodemailer.createTransport(smtpUrl)
  return {
    channel: 'email',
    async send(input) {
      const address = await recipientEmail(db, input.recipientMembershipId)
      if (!address) throw new Error('Kein E-Mail-Empfänger hinterlegt')
      await transport.sendMail({
        from,
        to: address,
        // §23.5: Betreff und Inhalt enthalten keine Daten der Klassen C–E.
        subject: input.title,
        text: `${input.body}\n\nDu kannst die Details in Thealotta ansehen.`,
      })
    },
  }
}

export function pushSender(db: Database, vapid: { publicKey: string; privateKey: string; subject: string }): ChannelSender {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
  return {
    channel: 'push',
    async send(input) {
      const subs = await withoutTenant(db, 'push_lookup_by_membership', async (tx) =>
        tx
          .select()
          .from(pushSubscriptions)
          .where(and(eq(pushSubscriptions.membershipId, input.recipientMembershipId), isNull(pushSubscriptions.disabledAt))),
      )
      if (subs.length === 0) throw new Error('Keine aktive Push-Registrierung')

      let delivered = 0
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: input.title, body: input.body, data: input.payload }),
          )
          delivered += 1
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode
          // 404/410: Der Browser hat die Registrierung verworfen – aufräumen statt endlos retryen.
          if (statusCode === 404 || statusCode === 410) {
            await withoutTenant(db, 'disable_dead_push_subscription', async (tx) =>
              tx
                .update(pushSubscriptions)
                .set({ disabledAt: new Date(), disabledReason: `provider_status_${statusCode}` })
                .where(eq(pushSubscriptions.id, sub.id)),
            )
          }
        }
      }
      if (delivered === 0) throw new Error('Keine Zustellung erfolgreich')
    },
  }
}

async function recipientEmail(db: Database, membershipId: string): Promise<string | null> {
  const rows = await withoutTenant(db, 'notification_recipient_lookup', async (tx) =>
    tx
      .select({ email: users.email })
      .from(householdMemberships)
      .innerJoin(users, eq(users.id, householdMemberships.userId))
      .where(eq(householdMemberships.id, membershipId))
      .limit(1),
  )
  return rows[0]?.email ?? null
}
