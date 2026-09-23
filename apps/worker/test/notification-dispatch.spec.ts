import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { notificationDeliveries, notifications, pushSubscriptions, uuidv7, withTenant } from '@thealotta/db'
import { dispatchNotifications, type ChannelSender } from '../src/jobs/notification-dispatch.js'
import { seedWorkerFixture, type WorkerFixture } from './db-helpers.js'

/**
 * Schutz vor Meldungsmüdigkeit (docs/23 §3, docs/60 R1).
 *
 * Für den Zusteller gab es bisher **keinen** Test – das ist der Grund, warum drei der sechs
 * dokumentierten Maßnahmen nie gebaut wurden und es niemandem auffiel. Was hier geprüft wird,
 * ist immer dieselbe Zusage: **In der App geht nichts verloren, nur der Push bleibt aus.**
 */
let f: WorkerFixture
const gesendet: { titel: string }[] = []

const push: ChannelSender = {
  channel: 'push',
  send: async ({ title }) => {
    gesendet.push({ titel: title })
  },
}
const inApp: ChannelSender = { channel: 'in_app', send: async () => {} }

beforeAll(async () => {
  f = await seedWorkerFixture('dispatch')
  /*
   * Ohne angemeldetes Gerät filtert der Zusteller den Push ohnehin weg – dann prüfte dieser
   * Test die Grenzen an einem Kanal, den es gar nicht gibt.
   */
  await withTenant(f.db, [f.householdId], async (tx) => {
    await tx.insert(pushSubscriptions).values({
      householdId: f.householdId,
      membershipId: f.membershipId,
      // Eindeutig je Lauf: Der Endpunkt trägt einen Unique-Index über alle Haushalte.
      endpoint: `https://push.example.invalid/${f.householdId}`,
      p256dh: 'p',
      auth: 'a',
    } as never)
  })
}, 180_000)
afterAll(async () => f.handle.close())

/** Legt eine Meldung an, wie es der Auslöser täte. */
async function meldung(input: {
  titel: string
  prioritaet?: string
  erstelltVor?: number
  buendelnBis?: Date | null
}): Promise<string> {
  const id = uuidv7()
  await withTenant(f.db, [f.householdId], async (tx) => {
    await tx.insert(notifications).values({
      id,
      householdId: f.householdId,
      recipientMembershipId: f.membershipId,
      notificationKind: 'attention_new',
      priority: input.prioritaet ?? 'high',
      title: input.titel,
      body: '',
      dedupeKey: `k-${id}`,
      bundleAfter: input.buendelnBis ?? null,
      createdAt: new Date(Date.now() - (input.erstelltVor ?? 0)),
    } as never)
  })
  return id
}

async function kanaeleVon(id: string): Promise<string[]> {
  return withTenant(f.db, [f.householdId], async (tx) => {
    const zeilen = await tx
      .select({ kanal: notificationDeliveries.channel })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.notificationId, id))
    return zeilen.map((z) => z.kanal).sort()
  })
}

async function grundVon(id: string): Promise<string | null> {
  return withTenant(f.db, [f.householdId], async (tx) => {
    const [z] = await tx
      .select({ grund: notifications.suppressedReason })
      .from(notifications)
      .where(eq(notifications.id, id))
      .limit(1)
    return z?.grund ?? null
  })
}

/** Räumt zwischen den Fällen auf – die Grenzen zählen über den ganzen Haushalt. */
async function leeren() {
  await withTenant(f.db, [f.householdId], async (tx) => {
    await tx.delete(notificationDeliveries).where(eq(notificationDeliveries.householdId, f.householdId))
    await tx.delete(notifications).where(eq(notifications.householdId, f.householdId))
  })
  gesendet.length = 0
}

describe('Bündelung: eine Unterbrechung statt drei', () => {
  it('gibt nur der ersten Meldung einen Push, die übrigen bleiben in der App', async () => {
    await leeren()
    // Absichtlich mit Abstand angelegt: Der Träger des Pushes soll die älteste sein,
    // nicht irgendeine – ohne Sortierung entschied das die Datenbank.
    const eins = await meldung({ titel: 'Erste', erstelltVor: 3000 })
    const zwei = await meldung({ titel: 'Zweite', erstelltVor: 2000 })
    const drei = await meldung({ titel: 'Dritte', erstelltVor: 1000 })

    await dispatchNotifications(f.db, f.householdId, [push, inApp], new Date())

    expect(await kanaeleVon(eins)).toContain('push')
    expect(await kanaeleVon(zwei), 'die zweite darf nicht noch einmal antippen').not.toContain('push')
    expect(await kanaeleVon(drei)).not.toContain('push')

    // Aber sichtbar bleiben alle drei.
    for (const id of [eins, zwei, drei]) {
      expect(await kanaeleVon(id), 'in der App muss jede stehen').toContain('in_app')
    }
    expect(await grundVon(zwei)).toMatch(/zusammengefasst/)
  })

  it('gibt den Push dem Dringendsten, nicht dem Zufall', async () => {
    await leeren()
    const normal = await meldung({ titel: 'Kann warten', prioritaet: 'normal', erstelltVor: 5000 })
    const dringend = await meldung({ titel: 'Kind ist krank', prioritaet: 'critical', erstelltVor: 1000 })

    await dispatchNotifications(f.db, f.householdId, [push, inApp], new Date())

    expect(await kanaeleVon(dringend), 'das Kritische trägt den Push').toContain('push')
    expect(await kanaeleVon(normal), 'obwohl es älter ist').not.toContain('push')
  })

  it('hält zurück, was noch im Sammelfenster liegt', async () => {
    await leeren()
    const spaeter = await meldung({ titel: 'Kommt später', buendelnBis: new Date(Date.now() + 60_000) })

    await dispatchNotifications(f.db, f.householdId, [push, inApp], new Date())

    expect(await kanaeleVon(spaeter), 'noch gar nicht zugestellt').toEqual([])
  })
})

describe('Staleness: was alt ist, tippt nicht mehr an', () => {
  it('lässt eine sieben Stunden alte Meldung in der App, ohne Push', async () => {
    await leeren()
    const alt = await meldung({ titel: 'Von heute früh', erstelltVor: 7 * 60 * 60 * 1000 })

    await dispatchNotifications(f.db, f.householdId, [push, inApp], new Date())

    expect(await kanaeleVon(alt)).toEqual(['in_app'])
    expect(await grundVon(alt)).toMatch(/zu alt/)
  })
})

describe('Ratenbegrenzung', () => {
  it('hört nach vier lauten Zustellungen in der Stunde auf', async () => {
    await leeren()
    // Vier bereits gesendete Pushes in dieser Stunde vortäuschen.
    await withTenant(f.db, [f.householdId], async (tx) => {
      for (let i = 0; i < 4; i += 1) {
        const nid = uuidv7()
        await tx.insert(notifications).values({
          id: nid,
          householdId: f.householdId,
          recipientMembershipId: f.membershipId,
          notificationKind: 'attention_new',
          priority: 'high',
          title: `Früher ${i}`,
          dedupeKey: `alt-${nid}`,
          state: 'dispatched',
        } as never)
        await tx.insert(notificationDeliveries).values({
          householdId: f.householdId,
          notificationId: nid,
          channel: 'push',
          state: 'sent',
          sentAt: new Date(Date.now() - 10 * 60_000),
        } as never)
      }
    })

    const fuenfte = await meldung({ titel: 'Die fünfte' })
    await dispatchNotifications(f.db, f.householdId, [push, inApp], new Date())

    expect(await kanaeleVon(fuenfte)).toEqual(['in_app'])
    expect(await grundVon(fuenfte)).toMatch(/Meldungsgrenze/)
  })

  it('lässt Kritisches auch über der Grenze durch', async () => {
    await leeren()
    await withTenant(f.db, [f.householdId], async (tx) => {
      for (let i = 0; i < 12; i += 1) {
        const nid = uuidv7()
        await tx.insert(notifications).values({
          id: nid,
          householdId: f.householdId,
          recipientMembershipId: f.membershipId,
          notificationKind: 'attention_new',
          priority: 'high',
          title: `Früher ${i}`,
          dedupeKey: `viel-${nid}`,
          state: 'dispatched',
        } as never)
        await tx.insert(notificationDeliveries).values({
          householdId: f.householdId,
          notificationId: nid,
          channel: 'push',
          state: 'sent',
          sentAt: new Date(Date.now() - 5 * 60_000),
        } as never)
      }
    })

    const kritisch = await meldung({ titel: 'Kind ist krank', prioritaet: 'critical' })
    await dispatchNotifications(f.db, f.householdId, [push, inApp], new Date())

    expect(
      await kanaeleVon(kritisch),
      'eine Grenze, die auch für Kritisches gilt, ist kein Schutz, sondern ein Risiko',
    ).toContain('push')
  })
})
