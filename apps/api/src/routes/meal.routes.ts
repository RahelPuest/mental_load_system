import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  DISH_RATINGS,
  MEAL_SLOTS,
  MEAL_SUITABILITY,
  SUGGESTION_MODES,
  type DishRating,
  type MealSlot,
  type SuggestionMode,
} from '@thealotta/contracts'
import { badRequest } from '@thealotta/domain'
import type { BringService, MealService } from '@thealotta/services'
import { DISH_SORTS, filterDishes, sortDishes, weekStartOf, type DishSort } from '@thealotta/services'
import { inHousehold, type RouteDeps } from '../lib/route-helpers.js'

/** Pfadparameter – dieselbe Kurzform wie in `work.routes.ts`. */
const param = (request: { params: unknown }, key: string): string =>
  (request.params as Record<string, string>)[key]!

/**
 * Die Essensplanung über HTTP (docs/63).
 *
 * Der Zuschnitt folgt dem Ablauf, nicht dem Datenmodell: sammeln → planen → anpassen →
 * einkaufen. Deshalb gibt es `POST …/meals/week/fill` und nicht eine allgemeine
 * Vorschlagsschnittstelle, aus der sich die Oberfläche das Nötige selbst zusammenbaut.
 */

const tag = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum als JJJJ-MM-TT.')
const slot = z.enum(MEAL_SLOTS)

const zutatSchema = z.object({
  name: z.string().min(1).max(160),
  quantity: z.number().positive().nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  note: z.string().max(400).nullable().optional(),
})

const dishBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  servings: z.number().int().positive().max(99).nullable().optional(),
  prepMinutes: z.number().int().min(0).max(6000).nullable().optional(),
  cookMinutes: z.number().int().min(0).max(6000).nullable().optional(),
  steps: z.string().max(20000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  sourceUrl: z.string().url().max(2000).nullable().optional(),
  imageUrl: z.string().url().max(2000).nullable().optional(),
  excludedFromSuggestions: z.boolean().optional(),
  suitableFor: z.enum(MEAL_SUITABILITY).optional(),
  tags: z.array(z.string().min(1).max(60)).max(40).optional(),
  ingredients: z.array(zutatSchema).max(80).optional(),
})

const fillBody = z.object({
  weekStart: tag,
  only: z.array(z.object({ date: tag, slot })).max(20).optional(),
  replace: z.boolean().optional(),
  mode: z.enum(SUGGESTION_MODES).optional(),
  requireTags: z.array(z.string().min(1).max(60)).max(10).optional(),
  excludeTags: z.array(z.string().min(1).max(60)).max(10).optional(),
  maxMinutes: z.number().int().positive().max(6000).nullable().optional(),
  /* Für „nochmal würfeln" und für Tests: derselbe Wert liefert dasselbe Ergebnis. */
  seed: z.number().int().optional(),
})

export interface MealRoutesDeps extends RouteDeps {
  meals: MealService
  bring: BringService
}

export async function mealRoutes(app: FastifyInstance, deps: MealRoutesDeps): Promise<void> {
  app.addHook('preHandler', async (request) => {
    await app.authenticate(request)
  })

  /* ══ Die Sammlung ═════════════════════════════════════════════════ */

  /**
   * Die Gerichtesammlung – gefiltert, sortiert, mit Nutzungszahlen.
   *
   * Gefiltert und sortiert wird auf dem Server, obwohl die Liste klein genug wäre. Der Grund
   * ist die Konsistenz: „Woche füllen" muss dieselben Filter anwenden wie die Liste daneben
   * (§45), und dieselbe Regel zweimal zu schreiben heißt, sie irgendwann verschieden zu haben.
   */
  app.get('/households/:householdId/dishes', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const q = request.query as Record<string, string | undefined>
      const sort = (DISH_SORTS as readonly string[]).includes(q['sort'] ?? '')
        ? (q['sort'] as DishSort)
        : 'name'
      const alle = await deps.meals.listDishes(tx, ctx, now, {
        includeArchived: q['archived'] === 'true',
      })
      const gefiltert = filterDishes(alle, {
        ...(q['q'] === undefined ? {} : { query: q['q'] }),
        tags: q['tags'] ? q['tags'].split(',').filter(Boolean) : [],
        maxMinutes: q['maxMinutes'] ? Number(q['maxMinutes']) : null,
      })
      return reply.send({ items: sortDishes(gefiltert, sort) })
    }),
  )

  app.post('/households/:householdId/dishes', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = dishBody.parse(request.body)
      return reply.code(201).send(await deps.meals.createDish(tx, ctx, body))
    }),
  )

  app.patch('/households/:householdId/dishes/:dishId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = dishBody.partial().parse(request.body)
      await deps.meals.updateDish(tx, ctx, param(request, 'dishId'), body)
      return reply.code(204).send()
    }),
  )

  app.delete('/households/:householdId/dishes/:dishId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      await deps.meals.deleteDish(tx, ctx, param(request, 'dishId'))
      return reply.code(204).send()
    }),
  )

  /** Wegräumen statt löschen – für alles, was schon einmal auf dem Tisch stand. */
  app.post('/households/:householdId/dishes/:dishId/archive', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = z.object({ archived: z.boolean() }).parse(request.body ?? { archived: true })
      await deps.meals.setDishArchived(tx, ctx, param(request, 'dishId'), body.archived, now)
      return reply.code(204).send()
    }),
  )

  /** Die eigene Stimme zu einem Gericht. `null` nimmt sie zurück. */
  app.put('/households/:householdId/dishes/:dishId/preference', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = z.object({ rating: z.enum(DISH_RATINGS).nullable() }).parse(request.body)
      await deps.meals.setPreference(tx, ctx, param(request, 'dishId'), body.rating as DishRating | null)
      return reply.code(204).send()
    }),
  )

  /* ══ Der Plan ═════════════════════════════════════════════════════ */

  app.get('/households/:householdId/meals/week', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const q = request.query as Record<string, string | undefined>
      const start = q['start'] ?? now.toISOString().slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw badRequest('validation_failed', 'Datum als JJJJ-MM-TT.')
      return reply.send(await deps.meals.getWeek(tx, ctx, start))
    }),
  )

  app.put('/households/:householdId/meals/entry', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = z
        .object({
          date: tag,
          slot,
          dishId: z.string().uuid(),
          servings: z.number().int().positive().max(99).nullable().optional(),
          note: z.string().max(400).nullable().optional(),
        })
        .parse(request.body)
      return reply.send(await deps.meals.setEntry(tx, ctx, body))
    }),
  )

  app.delete('/households/:householdId/meals/entry', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const q = request.query as Record<string, string | undefined>
      const body = z.object({ date: tag, slot }).parse({ date: q['date'], slot: q['slot'] })
      await deps.meals.clearEntry(tx, ctx, body.date, body.slot as MealSlot)
      return reply.code(204).send()
    }),
  )

  /** Verschieben oder kopieren – der Weg, den Ziehen und Fallenlassen nimmt (§13). */
  app.post('/households/:householdId/meals/move', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = z
        .object({
          from: z.object({ date: tag, slot }),
          to: z.object({ date: tag, slot }),
          mode: z.enum(['move', 'copy']).optional(),
        })
        .parse(request.body)
      await deps.meals.moveEntry(tx, ctx, body.from, body.to, body.mode ?? 'move')
      return reply.code(204).send()
    }),
  )

  app.post('/households/:householdId/meals/lock', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = z.object({ date: tag, slot, locked: z.boolean() }).parse(request.body)
      await deps.meals.setLocked(tx, ctx, body.date, body.slot as MealSlot, body.locked)
      return reply.code(204).send()
    }),
  )

  /**
   * Freie Plätze füllen (§15, §22).
   *
   * Ein Endpunkt für alle vier Fälle aus §22 – ganze Woche, nur Abendessen, ein Tag, ein
   * einzelner Platz. Der Unterschied liegt in `only`, nicht in vier Routen, die dasselbe tun.
   */
  app.post('/households/:householdId/meals/week/fill', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = fillBody.parse(request.body)
      return reply.send(
        await deps.meals.fillWeek(tx, ctx, now, {
          weekStart: body.weekStart,
          ...(body.only === undefined ? {} : { only: body.only as { date: string; slot: MealSlot }[] }),
          ...(body.replace === undefined ? {} : { replace: body.replace }),
          ...(body.mode === undefined ? {} : { mode: body.mode as SuggestionMode }),
          ...(body.requireTags === undefined ? {} : { requireTags: body.requireTags }),
          ...(body.excludeTags === undefined ? {} : { excludeTags: body.excludeTags }),
          ...(body.maxMinutes === undefined ? {} : { maxMinutes: body.maxMinutes }),
          ...(body.seed === undefined ? {} : { seed: body.seed }),
        }),
      )
    }),
  )

  /* ══ Einstellungen und Tagesregeln ════════════════════════════════ */

  app.get('/households/:householdId/meals/settings', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const [settings, rules] = await Promise.all([
        deps.meals.getSettings(tx, ctx),
        deps.meals.listDayRules(tx, ctx),
      ])
      return reply.send({ ...settings, dayRules: rules })
    }),
  )

  app.patch('/households/:householdId/meals/settings', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = z
        .object({
          lunchWeekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
          defaultServings: z.number().int().positive().max(99).optional(),
          suggestionMode: z.enum(SUGGESTION_MODES).optional(),
        })
        .parse(request.body)
      await deps.meals.updateSettings(tx, ctx, body as Parameters<MealService['updateSettings']>[2])
      return reply.code(204).send()
    }),
  )

  app.put('/households/:householdId/meals/day-rules', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      const body = z
        .object({
          weekday: z.number().int().min(0).max(6),
          slot: z.enum(MEAL_SLOTS).nullable(),
          maxMinutes: z.number().int().positive().max(6000).nullable(),
          requireTags: z.array(z.string().min(1).max(60)).max(10),
          excludeTags: z.array(z.string().min(1).max(60)).max(10),
          note: z.string().max(400).nullable().optional(),
        })
        .parse(request.body)
      await deps.meals.setDayRule(tx, ctx, { ...body, slot: body.slot as MealSlot | null })
      return reply.code(204).send()
    }),
  )

  /* ══ Einkaufsliste ════════════════════════════════════════════════ */

  app.get('/households/:householdId/meals/shopping', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const q = request.query as Record<string, string | undefined>
      const start = q['start'] ?? now.toISOString().slice(0, 10)
      return reply.send(await deps.meals.getShoppingList(tx, ctx, start))
    }),
  )

  app.post('/households/:householdId/meals/shopping/build', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = z.object({ weekStart: tag }).parse(request.body)
      const ergebnis = await deps.meals.buildShoppingList(tx, ctx, body.weekStart, now)
      const liste = await deps.meals.getShoppingList(tx, ctx, body.weekStart)
      return reply.send({ ...ergebnis, items: liste.items })
    }),
  )

  app.put('/households/:householdId/meals/shopping/:listId/items', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const body = z
        .object({
          id: z.string().uuid().optional(),
          name: z.string().min(1).max(200).optional(),
          quantity: z.number().positive().nullable().optional(),
          unit: z.string().max(40).nullable().optional(),
          note: z.string().max(400).nullable().optional(),
          checked: z.boolean().optional(),
          haveAtHome: z.boolean().optional(),
        })
        .parse(request.body)
      return reply.send(await deps.meals.upsertShoppingItem(tx, ctx, param(request, 'listId'), now, body))
    }),
  )

  app.delete('/households/:householdId/meals/shopping/:listId/items/:itemId', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx }) => {
      await deps.meals.deleteShoppingItem(tx, ctx, param(request, 'listId'), param(request, 'itemId'))
      return reply.code(204).send()
    }),
  )

  /**
   * Die offenen Zeilen an Bring! übergeben (§37).
   *
   * Zeile für Zeile, und der Fehlschlag bricht nicht ab: Bring hat keine Schnittstelle für
   * mehrere Artikel auf einmal und keine Zusage, dass es die für einen überhaupt gibt. Wer
   * bei Artikel drei abbricht, hinterlässt eine halb übertragene Liste, von der niemand
   * weiß, wie weit sie kam. Deshalb zählt die Antwort, was durchkam und was nicht.
   */
  app.post('/households/:householdId/meals/shopping/:listId/push', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const listId = param(request, 'listId')
      const offen = await deps.meals.openShoppingItems(tx, ctx, listId)
      if (offen.length === 0) {
        return reply.send({ pushed: 0, failed: 0, items: [], note: 'Nichts offen – die Liste ist abgehakt.' })
      }

      const geschafft: string[] = []
      const gescheitert: { name: string; grund: string }[] = []
      for (const zeile of offen) {
        const menge = zeile.quantity === null ? null : `${zeile.quantity}${zeile.unit ? ` ${zeile.unit}` : ''}`
        try {
          await deps.bring.pushItem(tx, ctx, { name: zeile.name, zusatz: menge }, now)
          geschafft.push(zeile.id)
        } catch (err) {
          gescheitert.push({ name: zeile.name, grund: (err as Error).message })
        }
      }
      await deps.meals.markPushed(tx, ctx, geschafft, now)

      return reply.send({
        pushed: geschafft.length,
        failed: gescheitert.length,
        items: gescheitert,
      })
    }),
  )

  /* ══ Auskunft für andere Seiten ═══════════════════════════════════ */

  app.get('/households/:householdId/meals/upcoming', async (request, reply) =>
    inHousehold(deps, request, reply, async ({ tx, ctx, now }) => {
      const q = request.query as Record<string, string | undefined>
      const tage = Math.min(7, Math.max(1, Number(q['days'] ?? 2)))
      return reply.send({
        today: now.toISOString().slice(0, 10),
        weekStart: weekStartOf(now.toISOString().slice(0, 10)),
        items: await deps.meals.upcoming(tx, ctx, now, tage),
      })
    }),
  )
}
