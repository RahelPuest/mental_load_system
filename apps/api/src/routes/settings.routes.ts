import type { FastifyInstance } from 'fastify'
import {
  changeRoleBody,
  attachCueBody,
  cueBody,
  setColorBody,
  createCalendarConnectionBody,
  createPushSubscriptionBody,
  putNotificationPreferencesBody,
  updateHouseholdBody,
  updateSelectionBody,
} from '@thealotta/contracts'
import { AgendaService, CalendarService, ColorService, SearchService, SettingsService, BringService,
  PlanningService,
} from '@thealotta/services'
import { inHousehold, type RouteDeps } from '../lib/route-helpers.js'

export interface SettingsRoutesDeps extends RouteDeps {
  bring: BringService
  settings: SettingsService
  colors: ColorService
  calendar: CalendarService
  search: SearchService
  agenda: AgendaService
  planning: PlanningService
  /** Öffentlicher VAPID-Schlüssel oder null, wenn Push nicht eingerichtet ist. */
  vapidPublicKey: string | null
}

const param = (request: { params: unknown }, key: string): string => (request.params as Record<string, string>)[key]!

export async function settingsRoutes(app: FastifyInstance, deps: SettingsRoutesDeps): Promise<void> {
  app.addHook('preHandler', async (request) => {
    await app.authenticate(request)
  })

  /**
   * §48: Globale Suche. Jeder Treffer läuft durch dieselbe Berechtigungsprüfung wie die
   * reguläre Ansicht – Suche ist kein Weg an der Zugriffskontrolle vorbei.
   */
  app.get('/households/:householdId/search', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const query = (request.query as { q?: string }).q ?? ''
      return reply.send({ items: await deps.search.search(tx, ctx, query) })
    }),
  )

  /* ── Haushalt ─────────────────────────────────────────────────────── */

  app.get('/households/:householdId/settings', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const household = await deps.settings.getHousehold(tx, ctx)
      return reply.header('etag', `"${household.version}"`).send({
        id: household.id,
        name: household.name,
        timezone: household.timezone,
        notificationContentLevel: household.notificationContentLevel,
        balanceViewEnabled: household.balanceViewEnabled,
        version: household.version,
        yourRole: ctx.role,
        explanations: {
          notificationContentLevel:
            'Bei „minimal" enthalten Push und E-Mail nur, dass etwas ansteht – nie den Inhalt. ' +
            'Termine und Gesundheitsangaben bleiben damit auf dem Sperrbildschirm unsichtbar.',
          balanceViewEnabled:
            'Zeigt, wie Verantwortung verteilt ist – als Bänder, nie als Prozentzahl. ' +
            'Standardmäßig aus, weil so eine Ansicht nicht in jeder Familie hilfreich ist.',
        },
      })
    }),
  )

  app.patch('/households/:householdId/settings', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = updateHouseholdBody.parse(request.body)
      const updated = await deps.settings.updateHousehold(tx, ctx, body)
      return reply.send({
        id: updated.id,
        name: updated.name,
        timezone: updated.timezone,
        notificationContentLevel: updated.notificationContentLevel,
        balanceViewEnabled: updated.balanceViewEnabled,
        version: updated.version,
      })
    }),
  )

  app.patch('/households/:householdId/members/:membershipId/role', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = changeRoleBody.parse(request.body)
      await deps.settings.changeRole(tx, ctx, param(request, 'membershipId'), body.role)
      return reply.send({ ok: true })
    }),
  )

  /*
   * Jemand verlässt den Haushalt (Audit 2, H4).
   *
   * DELETE, weil die Mitgliedschaft endet – gelöscht wird nichts: Die Zeile geht auf `left`,
   * der Name bleibt lesbar, und die Antwort sagt, was dadurch ohne Zuständige dasteht.
   */
  app.delete('/households/:householdId/members/:membershipId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const result = await deps.settings.removeMember(tx, ctx, param(request, 'membershipId'), now)
      return reply.send({
        ...result,
        note:
          result.vacatedDomains.length > 0
            ? 'Die Verantwortung dieser Person wurde nicht weitergereicht. Die betroffenen Bereiche stehen jetzt unter „Wo niemand mitdenkt".'
            : 'Es sind keine Bereiche ohne Zuständige zurückgeblieben.',
      })
    }),
  )

  /* ── Bring! ───────────────────────────────────────────────────────────
   *
   * Die Schnittstelle ist nicht offiziell (siehe `packages/services/src/bring/client.ts`).
   * Deshalb antwortet jeder dieser Endpunkte im Fehlerfall mit einem Klartext, den man dem
   * Nutzer zeigen kann – „hat nicht geklappt" wäre hier zu wenig.
   */
  app.get('/households/:householdId/bring', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) =>
      reply.send({ verbindung: await deps.bring.status(tx, ctx) }),
    ),
  )

  app.post('/households/:householdId/bring/connect', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = request.body as { email?: string; passwort?: string }
      return reply.send(
        await deps.bring.connect(tx, ctx, {
          email: String(body?.email ?? ''),
          passwort: String(body?.passwort ?? ''),
        }),
      )
    }),
  )

  app.post('/households/:householdId/bring/list', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = request.body as { listUuid?: string; listName?: string }
      await deps.bring.chooseList(tx, ctx, String(body?.listUuid ?? ''), String(body?.listName ?? 'Liste'))
      return reply.send({ ok: true })
    }),
  )

  app.delete('/households/:householdId/bring', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      await deps.bring.disconnect(tx, ctx)
      return reply.status(204).send()
    }),
  )

  app.post('/households/:householdId/tasks/:taskId/bring', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) =>
      reply.send(await deps.bring.pushTask(tx, ctx, param(request, 'taskId'), now)),
    ),
  )

  /* ── Farben ───────────────────────────────────────────────────────────
   *
   * Farben gelten für den Betrachter, nicht für den Haushalt. Deshalb steht hier keine
   * Rechteprüfung: Wer eine Farbe wählt, verändert sein eigenes Bild. Der Dienst prüft nur,
   * dass das Ziel im selben Haushalt existiert.
   */

  /* ── Situative Anlässe ──────────────────────────────────────────── */

  app.get('/households/:householdId/cues', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => reply.send(await deps.planning.cuesWithCounts(tx, ctx.householdId))),
  )

  app.post('/households/:householdId/cues', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = cueBody.parse(request.body)
      return reply.status(201).send(await deps.planning.createCue(tx, ctx.householdId, body.label))
    }),
  )

  app.post('/households/:householdId/cues/:cueId/occurred', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      await deps.planning.markCueOccurred(tx, ctx.householdId, param(request, 'cueId'), now)
      return reply.send({ ok: true })
    }),
  )

  app.delete('/households/:householdId/cues/:cueId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      // Zur Seite legen, nicht löschen: Aufgaben hängen daran.
      await deps.planning.archiveCue(tx, ctx.householdId, param(request, 'cueId'), now)
      return reply.send({ ok: true })
    }),
  )

  app.put('/households/:householdId/tasks/:taskId/cue', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = attachCueBody.parse(request.body)
      await deps.planning.attachCue(tx, ctx.householdId, param(request, 'taskId'), body.cueId)
      return reply.send({ ok: true })
    }),
  )

  app.get('/households/:householdId/colors', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => reply.send(await deps.colors.list(tx, ctx))),
  )

  app.put('/households/:householdId/colors/:subject/:subjectId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = setColorBody.parse(request.body)
      const subject = param(request, 'subject')
      if (subject !== 'member' && subject !== 'domain') {
        return reply.status(404).send({ error: 'not_found', message: 'Diese Art von Ziel gibt es nicht.' })
      }
      await deps.colors.set(tx, ctx, subject, param(request, 'subjectId'), body.tone, now)
      return reply.send({ ok: true })
    }),
  )

  /* ── Benachrichtigungen ───────────────────────────────────────────── */

  app.get('/households/:householdId/notification-preferences', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) =>
      reply.send({
        items: await deps.settings.listNotificationPreferences(tx, ctx),
        note:
          'Ein ignorierter Hinweis geht nie verloren – er bleibt in der App sichtbar, ' +
          'auch wenn kein Kanal aktiv ist.',
      }),
    ),
  )

  app.put('/households/:householdId/notification-preferences', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = putNotificationPreferencesBody.parse(request.body)
      await deps.settings.setNotificationPreferences(tx, ctx, body as never)
      return reply.send({ ok: true })
    }),
  )

  /**
   * Der öffentliche VAPID-Schlüssel ist kein Geheimnis – der Browser braucht ihn, um sich
   * überhaupt anmelden zu können. Ist keiner konfiguriert, sagt die Antwort das, statt die
   * Oberfläche einen Push versprechen zu lassen, der nie ankommt.
   */
  app.get('/push/config', async (_request, reply) =>
    reply.send({ publicKey: deps.vapidPublicKey }),
  )

  app.get('/households/:householdId/push-subscriptions', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) =>
      reply.send({ items: await deps.settings.listPushSubscriptions(tx, ctx) }),
    ),
  )

  app.post('/households/:householdId/push-subscriptions', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = createPushSubscriptionBody.parse(request.body)
      return reply.status(201).send(await deps.settings.registerPushSubscription(tx, ctx, body))
    }),
  )

  app.delete('/households/:householdId/push-subscriptions/:subscriptionId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      await deps.settings.removePushSubscription(tx, ctx, param(request, 'subscriptionId'))
      return reply.status(204).send()
    }),
  )

  /* ── Kalender ─────────────────────────────────────────────────────── */

  app.get('/households/:householdId/calendar-connections', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const result = await deps.calendar.list(tx, ctx)
      return reply.send({
        ...result,
        note:
          'Termininhalte anderer sind standardmäßig verborgen. Für die Zeitplanung reicht, ' +
          'dass ein Zeitraum belegt ist.',
      })
    }),
  )

  app.post('/households/:householdId/calendar-connections', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = createCalendarConnectionBody.parse(request.body)
      return reply.status(201).send(await deps.calendar.connect(tx, ctx, body))
    }),
  )

  app.patch('/households/:householdId/calendar-connections/:connectionId/selection', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = updateSelectionBody.parse(request.body)
      await deps.calendar.updateSelection(tx, ctx, param(request, 'connectionId'), body)
      return reply.send({ ok: true })
    }),
  )

  app.post('/households/:householdId/calendar-connections/:connectionId/sync', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      await deps.calendar.requestSync(tx, ctx, param(request, 'connectionId'), now)
      return reply.send({ ok: true, note: 'Der Abgleich läuft im Hintergrund und dauert meist wenige Sekunden.' })
    }),
  )

  app.delete('/households/:householdId/calendar-connections/:connectionId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      await deps.calendar.disconnect(tx, ctx, param(request, 'connectionId'))
      return reply.status(204).send()
    }),
  )

  /**
   * Der gemeinsame Plan: Termine, datierte Aufgaben und fällige Prüfungen aller – plus das
   * Offene ohne Datum, nach Person gebündelt. Alles durch dieselbe Berechtigungsprüfung
   * wie die regulären Ansichten.
   */
  app.get('/households/:householdId/agenda', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const query = request.query as { from?: string; days?: string }
      const from = query.from ? new Date(query.from) : startOfDay(now)
      const span = Math.min(Math.max(Number(query.days ?? 7), 1), 31)
      const to = new Date(from.getTime() + span * 86_400_000)
      const household = await deps.settings.getHousehold(tx, ctx)
      return reply.send(await deps.agenda.build(tx, ctx, { from, to, timezone: household.timezone }))
    }),
  )

  app.get('/households/:householdId/calendar-events', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const query = request.query as { from?: string; to?: string }
      const from = query.from ? new Date(query.from) : new Date(now.getTime() - 7 * 86_400_000)
      const to = query.to ? new Date(query.to) : new Date(now.getTime() + 60 * 86_400_000)
      return reply.send({ items: await deps.calendar.events(tx, ctx, { from, to }) })
    }),
  )
}

/** Der Plan beginnt heute, nicht in diesem Augenblick. */
function startOfDay(now: Date): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}
