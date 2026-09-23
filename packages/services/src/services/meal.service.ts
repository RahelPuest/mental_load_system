import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import {
  dishIngredients,
  dishPreferences,
  dishTags,
  dishes,
  householdMemberships,
  mealDayRules,
  mealPlanEntries,
  mealSettings,
  recordEvent,
  shoppingListItems,
  shoppingLists,
  uuidv7,
  type Tx,
} from '@thealotta/db'
import {
  aggregateIngredients,
  authorize,
  badRequest,
  conflict,
  notFound,
  popularity,
  suggestMeals,
  type DishCandidate,
  type EffectiveContext,
  type SlotRequest,
} from '@thealotta/domain'
import {
  DISH_RATINGS,
  MEAL_SLOTS,
  MEAL_SUITABILITY,
  SUGGESTION_MODES,
  type DishRating,
  type MealSlot,
  type MealSuitability,
  type SuggestionMode,
} from '@thealotta/contracts'

/**
 * Die Essensplanung (docs/63).
 *
 * Drei Dinge hängen hier zusammen und dürfen nicht auseinanderfallen:
 *
 * 1. **Die Sammlung** ist das Gedächtnis. Ein Gericht braucht nur einen Namen (§50); alles
 *    Weitere – Zutaten, Zeiten, Tags – ist Nachtrag und nie Pflicht.
 * 2. **Der Plan** ist zugleich die Historie (§47). Wann ein Gericht zuletzt dran war, wird
 *    abgefragt und nirgends gepflegt (§48).
 * 3. **Die Einkaufsliste** übersetzt den Plan in Handlung – und bleibt danach eigenständig
 *    bearbeitbar, ohne je auf das Rezept zurückzuschlagen (§36).
 */

export interface DishInput {
  name: string
  description?: string | null
  servings?: number | null
  prepMinutes?: number | null
  cookMinutes?: number | null
  steps?: string | null
  notes?: string | null
  sourceUrl?: string | null
  imageUrl?: string | null
  excludedFromSuggestions?: boolean
  /** Wofür das Gericht passt: mittags, abends oder beides. Voreinstellung `both`. */
  suitableFor?: MealSuitability
  tags?: string[]
  ingredients?: { name: string; quantity?: number | null; unit?: string | null; note?: string | null }[]
}

export interface DishRow {
  id: string
  name: string
  description: string | null
  servings: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  totalMinutes: number | null
  steps: string | null
  notes: string | null
  sourceUrl: string | null
  imageUrl: string | null
  excludedFromSuggestions: boolean
  suitableFor: MealSuitability
  archivedAt: string | null
  tags: string[]
  ingredients: { id: string; name: string; quantity: number | null; unit: string | null; note: string | null }[]
  /** Was die Personen im Haushalt davon halten – je Mitgliedschaft eine Stimme (§10). */
  ratings: { membershipId: string; displayName: string; rating: DishRating }[]
  /** Aus dem Plan abgeleitet, nie gepflegt (§8, §48). */
  lastPlannedOn: string | null
  plannedCount: number
  plannedLast90: number
}

const MINUTEN = (prep: number | null, cook: number | null): number | null =>
  prep === null && cook === null ? null : (prep ?? 0) + (cook ?? 0)

/** Der Montag der Woche, in der dieses Datum liegt. Wochen beginnen hier montags. */
export function weekStartOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  const versatz = (d.getUTCDay() + 6) % 7
  return new Date(d.getTime() - versatz * 86_400_000).toISOString().slice(0, 10)
}

const tagePlus = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** Datumsangaben kommen aus Postgres als `Date` oder als String – beides auf `YYYY-MM-DD`. */
const alsTag = (wert: unknown): string =>
  wert instanceof Date ? wert.toISOString().slice(0, 10) : String(wert).slice(0, 10)

const zahl = (wert: unknown): number | null =>
  wert === null || wert === undefined ? null : Number(wert)

export class MealService {
  /* ══ Die Sammlung ═══════════════════════════════════════════════════ */

  /**
   * Ein Gericht anlegen. Der Name genügt (§40, §50).
   *
   * Doppelte Namen werden abgewiesen: „Haben wir das schon?" ist eine der Fragen, die dieser
   * Bereich abnehmen soll – eine Sammlung mit „Chili" und „chili" beantwortet sie schlechter
   * als eine Meldung beim Anlegen.
   */
  async createDish(tx: Tx, ctx: EffectiveContext, input: DishInput): Promise<{ id: string }> {
    authorize(ctx, 'meal:manage', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    const name = input.name.trim()
    if (!name) throw badRequest('validation_failed', 'Ein Gericht braucht einen Namen.')

    const [schon] = await tx
      .select({ id: dishes.id })
      .from(dishes)
      .where(and(eq(dishes.householdId, ctx.householdId), sql`lower(btrim(${dishes.name})) = ${name.toLowerCase()}`))
      .limit(1)
    if (schon) {
      throw conflict('duplicate_name', `„${name}" steht schon in eurer Sammlung.`)
    }

    const id = uuidv7()
    await tx.insert(dishes).values({
      id,
      householdId: ctx.householdId,
      name,
      description: input.description ?? null,
      servings: input.servings ?? null,
      prepMinutes: input.prepMinutes ?? null,
      cookMinutes: input.cookMinutes ?? null,
      steps: input.steps ?? null,
      notes: input.notes ?? null,
      sourceUrl: input.sourceUrl ?? null,
      imageUrl: input.imageUrl ?? null,
      excludedFromSuggestions: input.excludedFromSuggestions ?? false,
      suitableFor: input.suitableFor ?? 'both',
      createdBy: ctx.membershipId,
    })
    await this.setzeTags(tx, ctx, id, input.tags)
    await this.setzeZutaten(tx, ctx, id, input.ingredients)

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'dish.created',
      subjectType: 'dish',
      subjectId: id,
      payload: { name },
    })
    return { id }
  }

  /**
   * Ein Gericht ändern.
   *
   * Tags und Zutaten werden nur angefasst, wenn sie mitgeschickt wurden. Sonst löschte ein
   * Bogen, der nur den Namen ändert, stillschweigend die ganze Zutatenliste.
   */
  async updateDish(tx: Tx, ctx: EffectiveContext, dishId: string, input: Partial<DishInput>): Promise<void> {
    authorize(ctx, 'meal:manage', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    const vorher = await this.holeGericht(tx, ctx, dishId)

    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) throw badRequest('validation_failed', 'Ein Gericht braucht einen Namen.')
      const [schon] = await tx
        .select({ id: dishes.id })
        .from(dishes)
        .where(
          and(
            eq(dishes.householdId, ctx.householdId),
            sql`lower(btrim(${dishes.name})) = ${name.toLowerCase()}`,
            sql`${dishes.id} <> ${dishId}`,
          ),
        )
        .limit(1)
      if (schon) throw conflict('duplicate_name', `„${name}" steht schon in eurer Sammlung.`)
    }

    const felder: Record<string, unknown> = { version: sql`version + 1` }
    if (input.name !== undefined) felder['name'] = input.name.trim()
    if (input.description !== undefined) felder['description'] = input.description
    if (input.servings !== undefined) felder['servings'] = input.servings
    if (input.prepMinutes !== undefined) felder['prepMinutes'] = input.prepMinutes
    if (input.cookMinutes !== undefined) felder['cookMinutes'] = input.cookMinutes
    if (input.steps !== undefined) felder['steps'] = input.steps
    if (input.notes !== undefined) felder['notes'] = input.notes
    if (input.sourceUrl !== undefined) felder['sourceUrl'] = input.sourceUrl
    if (input.imageUrl !== undefined) felder['imageUrl'] = input.imageUrl
    if (input.excludedFromSuggestions !== undefined) {
      felder['excludedFromSuggestions'] = input.excludedFromSuggestions
    }
    if (input.suitableFor !== undefined) {
      if (!MEAL_SUITABILITY.includes(input.suitableFor)) {
        throw badRequest('validation_failed', 'Unbekannte Angabe, wofür das Gericht passt.')
      }
      felder['suitableFor'] = input.suitableFor
    }
    await tx.update(dishes).set(felder).where(eq(dishes.id, dishId))

    if (input.tags !== undefined) await this.setzeTags(tx, ctx, dishId, input.tags)
    if (input.ingredients !== undefined) await this.setzeZutaten(tx, ctx, dishId, input.ingredients)

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'dish.updated',
      subjectType: 'dish',
      subjectId: dishId,
      payload: { vorher: vorher.name, nachher: input.name?.trim() ?? vorher.name },
    })
  }

  /**
   * Ein Gericht löschen – nur, solange es nie auf dem Tisch stand.
   *
   * Dieselbe Grenze wie bei Regeln und Aufgaben: Was einmal etwas bedeutet hat, wird
   * weggeräumt statt gelöscht. Ein gelöschtes Gericht risse Löcher in den vergangenen Plan,
   * und „was haben wir im März gegessen?" wäre nicht mehr zu beantworten (§47).
   */
  async deleteDish(tx: Tx, ctx: EffectiveContext, dishId: string): Promise<void> {
    authorize(ctx, 'meal:manage', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    const gericht = await this.holeGericht(tx, ctx, dishId)

    const [geplant] = await tx
      .select({ id: mealPlanEntries.id })
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.dishId, dishId))
      .limit(1)
    if (geplant) {
      throw conflict(
        'has_history',
        `„${gericht.name}" stand schon auf dem Plan. Räum es stattdessen weg – dann bleibt ` +
          'nachvollziehbar, was ihr damals gegessen habt.',
      )
    }

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'dish.deleted',
      subjectType: 'dish',
      subjectId: dishId,
      payload: { name: gericht.name },
    })
    await tx.delete(dishes).where(eq(dishes.id, dishId))
  }

  /** Weggeräumt oder zurückgeholt. Die Vergangenheit bleibt, die Sammlung wird kürzer. */
  async setDishArchived(tx: Tx, ctx: EffectiveContext, dishId: string, archived: boolean, now: Date): Promise<void> {
    authorize(ctx, 'meal:manage', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    await this.holeGericht(tx, ctx, dishId)
    await tx
      .update(dishes)
      .set({ archivedAt: archived ? now : null, version: sql`version + 1` })
      .where(eq(dishes.id, dishId))
  }

  /**
   * Die Sammlung – mit allem, was zum Suchen, Filtern und Sortieren nötig ist (§7).
   *
   * Nutzungszahlen kommen aus dem Plan. Sie hier zu berechnen kostet eine Verknüpfung mehr
   * und erspart eine Spalte, die irgendwann nicht mehr stimmt.
   */
  async listDishes(
    tx: Tx,
    ctx: EffectiveContext,
    now: Date,
    opts: { includeArchived?: boolean } = {},
  ): Promise<DishRow[]> {
    authorize(ctx, 'meal:read', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })

    const heute = now.toISOString().slice(0, 10)
    const vor90 = tagePlus(heute, -90)

    const grund = await tx
      .select()
      .from(dishes)
      .where(
        opts.includeArchived
          ? eq(dishes.householdId, ctx.householdId)
          : and(eq(dishes.householdId, ctx.householdId), isNull(dishes.archivedAt)),
      )
      .orderBy(asc(sql`lower(${dishes.name})`))
    if (grund.length === 0) return []

    const ids = grund.map((d) => d.id)
    const [tags, zutaten, stimmen, nutzung] = await Promise.all([
      tx.select().from(dishTags).where(inArray(dishTags.dishId, ids)),
      tx.select().from(dishIngredients).where(inArray(dishIngredients.dishId, ids)).orderBy(asc(dishIngredients.position)),
      tx
        .select({
          dishId: dishPreferences.dishId,
          membershipId: dishPreferences.membershipId,
          rating: dishPreferences.rating,
          displayName: householdMemberships.displayName,
        })
        .from(dishPreferences)
        .innerJoin(householdMemberships, eq(householdMemberships.id, dishPreferences.membershipId))
        .where(inArray(dishPreferences.dishId, ids)),
      /*
        Nutzung in einem Zug: zuletzt, insgesamt, und in 90 Tagen (§8).
        Zukünftige Einträge zählen nicht als „gegessen" – geplant ist nicht gewesen.
      */
      tx
        .select({
          dishId: mealPlanEntries.dishId,
          zuletzt: sql<string | null>`max(${mealPlanEntries.onDate})`,
          gesamt: sql<number>`count(*)::int`,
          letzte90: sql<number>`count(*) FILTER (WHERE ${mealPlanEntries.onDate} >= ${vor90}::date)::int`,
        })
        .from(mealPlanEntries)
        .where(
          and(
            eq(mealPlanEntries.householdId, ctx.householdId),
            inArray(mealPlanEntries.dishId, ids),
            lte(mealPlanEntries.onDate, heute),
          ),
        )
        .groupBy(mealPlanEntries.dishId),
    ])

    const proGericht = <T extends { dishId: string }>(zeilen: T[]): Map<string, T[]> => {
      const m = new Map<string, T[]>()
      for (const z of zeilen) {
        const liste = m.get(z.dishId) ?? []
        liste.push(z)
        m.set(z.dishId, liste)
      }
      return m
    }
    const tagsJe = proGericht(tags)
    const zutatenJe = proGericht(zutaten)
    const stimmenJe = proGericht(stimmen)
    const nutzungJe = new Map(nutzung.map((n) => [n.dishId, n]))

    return grund.map((d) => {
      const n = nutzungJe.get(d.id)
      return {
        id: d.id,
        name: d.name,
        description: d.description,
        servings: d.servings,
        prepMinutes: d.prepMinutes,
        cookMinutes: d.cookMinutes,
        totalMinutes: MINUTEN(d.prepMinutes, d.cookMinutes),
        steps: d.steps,
        notes: d.notes,
        sourceUrl: d.sourceUrl,
        imageUrl: d.imageUrl,
        excludedFromSuggestions: d.excludedFromSuggestions,
        suitableFor: d.suitableFor as MealSuitability,
        archivedAt: d.archivedAt ? d.archivedAt.toISOString() : null,
        tags: (tagsJe.get(d.id) ?? []).map((t) => t.tag).sort((a, b) => a.localeCompare(b, 'de')),
        ingredients: (zutatenJe.get(d.id) ?? []).map((z) => ({
          id: z.id,
          name: z.name,
          quantity: zahl(z.quantity),
          unit: z.unit,
          note: z.note,
        })),
        ratings: (stimmenJe.get(d.id) ?? []).map((s) => ({
          membershipId: s.membershipId,
          displayName: s.displayName,
          rating: s.rating as DishRating,
        })),
        lastPlannedOn: n?.zuletzt ? alsTag(n.zuletzt) : null,
        plannedCount: n?.gesamt ?? 0,
        plannedLast90: n?.letzte90 ?? 0,
      }
    })
  }

  /** Wie sehr jemand ein Gericht mag. Immer die eigene Stimme – niemand bewertet für andere. */
  async setPreference(
    tx: Tx,
    ctx: EffectiveContext,
    dishId: string,
    rating: DishRating | null,
  ): Promise<void> {
    authorize(ctx, 'meal:read', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    await this.holeGericht(tx, ctx, dishId)
    if (!ctx.membershipId) throw badRequest('no_membership', 'Nur Mitglieder des Haushalts können bewerten.')

    if (rating === null) {
      await tx
        .delete(dishPreferences)
        .where(and(eq(dishPreferences.dishId, dishId), eq(dishPreferences.membershipId, ctx.membershipId)))
      return
    }
    if (!DISH_RATINGS.includes(rating)) throw badRequest('validation_failed', 'Unbekannte Bewertung.')

    await tx
      .insert(dishPreferences)
      .values({
        id: uuidv7(),
        householdId: ctx.householdId,
        dishId,
        membershipId: ctx.membershipId,
        rating,
      })
      .onConflictDoUpdate({
        target: [dishPreferences.dishId, dishPreferences.membershipId],
        set: { rating },
      })
  }

  /* ══ Der Plan ═══════════════════════════════════════════════════════ */

  /** Die Einstellungen des Haushalts – beim ersten Zugriff mit den Voreinstellungen angelegt. */
  async getSettings(
    tx: Tx,
    ctx: EffectiveContext,
  ): Promise<{ lunchWeekdays: number[]; defaultServings: number; suggestionMode: SuggestionMode }> {
    const [row] = await tx.select().from(mealSettings).where(eq(mealSettings.householdId, ctx.householdId)).limit(1)
    if (row) {
      return {
        lunchWeekdays: [...row.lunchWeekdays].sort((a, b) => a - b),
        defaultServings: row.defaultServings,
        suggestionMode: row.suggestionMode as SuggestionMode,
      }
    }
    /* Samstag und Sonntag: unter der Woche essen die meisten auswärts (§12). */
    return { lunchWeekdays: [0, 6], defaultServings: 4, suggestionMode: 'balanced' }
  }

  async updateSettings(
    tx: Tx,
    ctx: EffectiveContext,
    input: { lunchWeekdays?: number[]; defaultServings?: number; suggestionMode?: SuggestionMode },
  ): Promise<void> {
    authorize(ctx, 'meal:plan', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    if (input.lunchWeekdays && input.lunchWeekdays.some((d) => d < 0 || d > 6)) {
      throw badRequest('validation_failed', 'Wochentage laufen von 0 (Sonntag) bis 6 (Samstag).')
    }
    if (input.suggestionMode && !SUGGESTION_MODES.includes(input.suggestionMode)) {
      throw badRequest('validation_failed', 'Unbekannte Vorschlagsart.')
    }

    const jetzt = await this.getSettings(tx, ctx)
    const werte = {
      lunchWeekdays: input.lunchWeekdays ?? jetzt.lunchWeekdays,
      defaultServings: input.defaultServings ?? jetzt.defaultServings,
      suggestionMode: input.suggestionMode ?? jetzt.suggestionMode,
    }
    await tx
      .insert(mealSettings)
      .values({ householdId: ctx.householdId, ...werte })
      .onConflictDoUpdate({
        target: mealSettings.householdId,
        set: { ...werte, version: sql`meal_settings.version + 1` },
      })
  }

  /**
   * Eine Woche mit allen Slots – auch den leeren.
   *
   * Welche Mittagessen es gibt, sagen die Einstellungen. Ein bereits geplantes Mittagessen
   * zählt aber immer dazu, auch an einem Tag, an dem normalerweise keines vorgesehen ist:
   * Ferien und Feiertage sind der Regelfall der Ausnahme (§12), und wer einmal eines
   * eingetragen hat, soll es nicht dadurch verlieren, dass der Wochentag „nicht dran" ist.
   */
  async getWeek(
    tx: Tx,
    ctx: EffectiveContext,
    weekStart: string,
  ): Promise<{
    weekStart: string
    defaultServings: number
    days: {
      date: string
      weekday: number
      slots: {
        slot: MealSlot
        entry: {
          id: string
          dishId: string
          dishName: string
          totalMinutes: number | null
          servings: number | null
          note: string | null
          locked: boolean
          source: string
          suggestionReason: string | null
        } | null
      }[]
    }[]
  }> {
    authorize(ctx, 'meal:read', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    const start = weekStartOf(weekStart)
    const ende = tagePlus(start, 6)
    const einstellungen = await this.getSettings(tx, ctx)

    const eintraege = await tx
      .select({
        id: mealPlanEntries.id,
        onDate: mealPlanEntries.onDate,
        slot: mealPlanEntries.slot,
        dishId: mealPlanEntries.dishId,
        servings: mealPlanEntries.servings,
        note: mealPlanEntries.note,
        locked: mealPlanEntries.locked,
        source: mealPlanEntries.source,
        suggestionReason: mealPlanEntries.suggestionReason,
        dishName: dishes.name,
        prepMinutes: dishes.prepMinutes,
        cookMinutes: dishes.cookMinutes,
      })
      .from(mealPlanEntries)
      .innerJoin(dishes, eq(dishes.id, mealPlanEntries.dishId))
      .where(
        and(
          eq(mealPlanEntries.householdId, ctx.householdId),
          gte(mealPlanEntries.onDate, start),
          lte(mealPlanEntries.onDate, ende),
        ),
      )

    const nachSlot = new Map(eintraege.map((e) => [`${alsTag(e.onDate)}:${e.slot}`, e]))

    const days = Array.from({ length: 7 }, (_, i) => {
      const datum = tagePlus(start, i)
      const weekday = new Date(`${datum}T00:00:00.000Z`).getUTCDay()
      const mittagsGeplant = nachSlot.has(`${datum}:lunch`)
      const slots: MealSlot[] = einstellungen.lunchWeekdays.includes(weekday) || mittagsGeplant
        ? ['lunch', 'dinner']
        : ['dinner']

      return {
        date: datum,
        weekday,
        slots: slots.map((slot) => {
          const e = nachSlot.get(`${datum}:${slot}`)
          return {
            slot,
            entry: e
              ? {
                  id: e.id,
                  dishId: e.dishId,
                  dishName: e.dishName,
                  totalMinutes: MINUTEN(e.prepMinutes, e.cookMinutes),
                  servings: e.servings,
                  note: e.note,
                  locked: e.locked,
                  source: e.source,
                  suggestionReason: e.suggestionReason,
                }
              : null,
          }
        }),
      }
    })

    return { weekStart: start, defaultServings: einstellungen.defaultServings, days }
  }

  /**
   * Ein Gericht auf einen Platz setzen.
   *
   * Ist der Platz belegt, wird ersetzt – das ist der Fall „Gericht austauschen" aus §13 und
   * braucht keinen eigenen Weg. Was ersetzt wurde, steht im Verlauf.
   */
  async setEntry(
    tx: Tx,
    ctx: EffectiveContext,
    input: {
      date: string
      slot: MealSlot
      dishId: string
      servings?: number | null
      note?: string | null
      source?: 'manual' | 'suggested'
      suggestionReason?: string | null
    },
  ): Promise<{ id: string }> {
    authorize(ctx, 'meal:plan', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    if (!MEAL_SLOTS.includes(input.slot)) throw badRequest('validation_failed', 'Unbekannte Mahlzeit.')
    await this.holeGericht(tx, ctx, input.dishId)

    const id = uuidv7()
    const [zeile] = await tx
      .insert(mealPlanEntries)
      .values({
        id,
        householdId: ctx.householdId,
        onDate: input.date,
        slot: input.slot,
        dishId: input.dishId,
        servings: input.servings ?? null,
        note: input.note ?? null,
        source: input.source ?? 'manual',
        suggestionReason: input.suggestionReason ?? null,
        createdBy: ctx.membershipId,
      })
      .onConflictDoUpdate({
        target: [mealPlanEntries.householdId, mealPlanEntries.onDate, mealPlanEntries.slot],
        set: {
          dishId: input.dishId,
          servings: input.servings ?? null,
          note: input.note ?? null,
          source: input.source ?? 'manual',
          suggestionReason: input.suggestionReason ?? null,
          version: sql`meal_plan_entries.version + 1`,
        },
      })
      .returning({ id: mealPlanEntries.id })

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'meal.planned',
      subjectType: 'meal_plan_entry',
      subjectId: zeile!.id,
      payload: { date: input.date, slot: input.slot, dishId: input.dishId },
    })
    return { id: zeile!.id }
  }

  /** Einen Platz räumen. */
  async clearEntry(tx: Tx, ctx: EffectiveContext, date: string, slot: MealSlot): Promise<void> {
    authorize(ctx, 'meal:plan', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    const geloescht = await tx
      .delete(mealPlanEntries)
      .where(
        and(
          eq(mealPlanEntries.householdId, ctx.householdId),
          eq(mealPlanEntries.onDate, date),
          eq(mealPlanEntries.slot, slot),
        ),
      )
      .returning({ id: mealPlanEntries.id, dishId: mealPlanEntries.dishId })
    if (geloescht.length === 0) return

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'meal.unplanned',
      subjectType: 'meal_plan_entry',
      subjectId: geloescht[0]!.id,
      payload: { date, slot, dishId: geloescht[0]!.dishId },
    })
  }

  /**
   * Innerhalb des Plans verschieben (§13).
   *
   * Verschieben ist nicht „löschen und neu setzen": Ist das Ziel belegt, tauschen die beiden
   * Plätze ihre Gerichte. Das ist, was jemand beim Ziehen erwartet – und die Alternative
   * wäre, ein Gericht stillschweigend zu verlieren.
   */
  async moveEntry(
    tx: Tx,
    ctx: EffectiveContext,
    von: { date: string; slot: MealSlot },
    nach: { date: string; slot: MealSlot },
    modus: 'move' | 'copy' = 'move',
  ): Promise<void> {
    authorize(ctx, 'meal:plan', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    const [quelle] = await tx
      .select()
      .from(mealPlanEntries)
      .where(
        and(
          eq(mealPlanEntries.householdId, ctx.householdId),
          eq(mealPlanEntries.onDate, von.date),
          eq(mealPlanEntries.slot, von.slot),
        ),
      )
      .limit(1)
    if (!quelle) throw notFound('Der Eintrag')

    const [ziel] = await tx
      .select()
      .from(mealPlanEntries)
      .where(
        and(
          eq(mealPlanEntries.householdId, ctx.householdId),
          eq(mealPlanEntries.onDate, nach.date),
          eq(mealPlanEntries.slot, nach.slot),
        ),
      )
      .limit(1)

    if (modus === 'copy') {
      await this.setEntry(tx, ctx, {
        date: nach.date,
        slot: nach.slot,
        dishId: quelle.dishId,
        servings: quelle.servings,
        note: quelle.note,
      })
      return
    }

    if (ziel) {
      /* Tauschen. Zwei Schreibvorgänge in einer Transaktion – halb getauscht gibt es nicht. */
      await tx
        .update(mealPlanEntries)
        .set({ dishId: ziel.dishId, servings: ziel.servings, note: ziel.note, version: sql`version + 1` })
        .where(eq(mealPlanEntries.id, quelle.id))
      await tx
        .update(mealPlanEntries)
        .set({ dishId: quelle.dishId, servings: quelle.servings, note: quelle.note, version: sql`version + 1` })
        .where(eq(mealPlanEntries.id, ziel.id))
    } else {
      await tx
        .update(mealPlanEntries)
        .set({ onDate: nach.date, slot: nach.slot, version: sql`version + 1` })
        .where(eq(mealPlanEntries.id, quelle.id))
    }

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'meal.moved',
      subjectType: 'meal_plan_entry',
      subjectId: quelle.id,
      payload: { von, nach, getauscht: Boolean(ziel) },
    })
  }

  /** Einen Platz sperren, damit auch „ganze Woche neu planen" ihn in Ruhe lässt (§43). */
  async setLocked(tx: Tx, ctx: EffectiveContext, date: string, slot: MealSlot, locked: boolean): Promise<void> {
    authorize(ctx, 'meal:plan', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    await tx
      .update(mealPlanEntries)
      .set({ locked, version: sql`version + 1` })
      .where(
        and(
          eq(mealPlanEntries.householdId, ctx.householdId),
          eq(mealPlanEntries.onDate, date),
          eq(mealPlanEntries.slot, slot),
        ),
      )
  }

  /* ══ Vorschlagen ════════════════════════════════════════════════════ */

  /**
   * Freie Plätze füllen (§15, §22, §55).
   *
   * `replace: false` – die Voreinstellung – rührt nur an, was leer ist. Das ist §24 und §56:
   * Was jemand geplant hat, wird nicht ungefragt ersetzt. `replace: true` ist die
   * ausdrücklich andere Handlung („ganze Woche neu planen") und lässt gesperrte Plätze und
   * von Hand Gesetztes trotzdem stehen.
   */
  async fillWeek(
    tx: Tx,
    ctx: EffectiveContext,
    now: Date,
    input: {
      weekStart: string
      /** Nur diese Plätze füllen. Leer heißt: alle freien der Woche. */
      only?: { date: string; slot: MealSlot }[]
      replace?: boolean
      mode?: SuggestionMode
      requireTags?: string[]
      excludeTags?: string[]
      maxMinutes?: number | null
      seed?: number
    },
  ): Promise<{ filled: { date: string; slot: MealSlot; dishId: string; dishName: string; reason: string }[]; unfilled: { date: string; slot: MealSlot; reason: string }[] }> {
    authorize(ctx, 'meal:plan', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })

    const woche = await this.getWeek(tx, ctx, input.weekStart)
    const einstellungen = await this.getSettings(tx, ctx)
    const sammlung = await this.listDishes(tx, ctx, now)
    const regeln = await tx.select().from(mealDayRules).where(eq(mealDayRules.householdId, ctx.householdId))

    /* Welche Plätze überhaupt in Frage kommen. */
    const alle = woche.days.flatMap((d) => d.slots.map((s) => ({ date: d.date, slot: s.slot, entry: s.entry })))
    const gewuenscht = input.only
      ? alle.filter((p) => input.only!.some((o) => o.date === p.date && o.slot === p.slot))
      : alle

    const offen: SlotRequest[] = gewuenscht
      .filter((p) => {
        if (p.entry === null) return true
        if (!input.replace) return false
        /* Auch beim Neuplanen: gesperrt bleibt gesperrt, von Hand gesetzt bleibt stehen. */
        return !p.entry.locked && p.entry.source === 'suggested'
      })
      .map((p) => ({ date: p.date, slot: p.slot }))

    if (offen.length === 0) return { filled: [], unfilled: [] }

    const bleibt = alle.filter(
      (p) => p.entry !== null && !offen.some((o) => o.date === p.date && o.slot === p.slot),
    )

    /*
      Was in den letzten Monaten auf dem Tisch stand, geht in `lastPlannedOn` schon ein.
      `alreadyPlanned` deckt die laufende Woche ab – auch die Zukunft, die es dort gibt.
    */
    const kandidaten: DishCandidate[] = sammlung.map((d) => ({
      id: d.id,
      name: d.name,
      tags: d.tags,
      totalMinutes: d.totalMinutes,
      excluded: d.excludedFromSuggestions,
      suitableFor: d.suitableFor,
      lastPlannedOn: d.lastPlannedOn,
      plannedCount: d.plannedCount,
      ratings: d.ratings.map((r) => r.rating),
    }))

    const { suggestions, unfilled } = suggestMeals(offen, kandidaten, {
      mode: input.mode ?? einstellungen.suggestionMode,
      requireTags: input.requireTags,
      excludeTags: input.excludeTags,
      maxMinutes: input.maxMinutes ?? null,
      dayRules: regeln.map((r) => ({
        weekday: r.weekday,
        slot: (r.slot as MealSlot | null) ?? null,
        maxMinutes: r.maxMinutes,
        requireTags: r.requireTags,
        excludeTags: r.excludeTags,
      })),
      alreadyPlanned: bleibt.map((p) => ({ date: p.date, dishId: p.entry!.dishId })),
      /*
        Ohne mitgegebenen Startwert die injizierte Zeit – nie `Date.now()`. Der Test kann so
        eine feste Woche würfeln, und „nochmal würfeln" schickt einfach einen anderen Wert.
      */
      seed: input.seed ?? now.getTime(),
    })

    const namen = new Map(sammlung.map((d) => [d.id, d.name]))
    for (const s of suggestions) {
      await this.setEntry(tx, ctx, {
        date: s.date,
        slot: s.slot,
        dishId: s.dishId,
        source: 'suggested',
        suggestionReason: s.reason,
      })
    }

    return {
      filled: suggestions.map((s) => ({
        date: s.date,
        slot: s.slot,
        dishId: s.dishId,
        dishName: namen.get(s.dishId) ?? '',
        reason: s.reason,
      })),
      unfilled,
    }
  }

  /* ══ Einkaufsliste ══════════════════════════════════════════════════ */

  /**
   * Die Liste einer Woche erzeugen oder ergänzen (§32).
   *
   * Erneutes Erzeugen ersetzt nur, was aus Gerichten stammt **und** unangetastet geblieben
   * ist. Von Hand hinzugefügte Zeilen, geänderte Mengen, Abgehaktes und „haben wir schon"
   * bleiben, wie sie sind – sonst verlöre der zweite Klick genau die Arbeit, für die man sich
   * beim ersten Zeit genommen hat (§36).
   */
  async buildShoppingList(
    tx: Tx,
    ctx: EffectiveContext,
    weekStart: string,
    now: Date,
  ): Promise<{ listId: string; added: number; kept: number }> {
    authorize(ctx, 'meal:plan', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    const start = weekStartOf(weekStart)
    const ende = tagePlus(start, 6)
    const einstellungen = await this.getSettings(tx, ctx)

    const geplant = await tx
      .select({
        dishId: mealPlanEntries.dishId,
        dishName: dishes.name,
        baseServings: dishes.servings,
        plannedServings: mealPlanEntries.servings,
      })
      .from(mealPlanEntries)
      .innerJoin(dishes, eq(dishes.id, mealPlanEntries.dishId))
      .where(
        and(
          eq(mealPlanEntries.householdId, ctx.householdId),
          gte(mealPlanEntries.onDate, start),
          lte(mealPlanEntries.onDate, ende),
        ),
      )

    const zutaten =
      geplant.length === 0
        ? []
        : await tx
            .select()
            .from(dishIngredients)
            .where(inArray(dishIngredients.dishId, [...new Set(geplant.map((g) => g.dishId))]))
            .orderBy(asc(dishIngredients.position))

    const nachGericht = new Map<string, typeof zutaten>()
    for (const z of zutaten) {
      const liste = nachGericht.get(z.dishId) ?? []
      liste.push(z)
      nachGericht.set(z.dishId, liste)
    }

    const flach = geplant.flatMap((g) =>
      (nachGericht.get(g.dishId) ?? []).map((z) => ({
        name: z.name,
        quantity: zahl(z.quantity),
        unit: z.unit,
        note: z.note,
        dishName: g.dishName,
        baseServings: g.baseServings,
        plannedServings: g.plannedServings ?? einstellungen.defaultServings,
      })),
    )
    const zusammen = aggregateIngredients(flach)

    /* Die Liste der Woche – eine, nicht zwei. */
    const [vorhanden] = await tx
      .select()
      .from(shoppingLists)
      .where(and(eq(shoppingLists.householdId, ctx.householdId), eq(shoppingLists.weekStart, start)))
      .limit(1)

    let listId = vorhanden?.id
    if (!listId) {
      listId = uuidv7()
      await tx.insert(shoppingLists).values({
        id: listId,
        householdId: ctx.householdId,
        weekStart: start,
        createdBy: ctx.membershipId,
      })
    }

    const alt = await tx.select().from(shoppingListItems).where(eq(shoppingListItems.listId, listId))
    const unberuehrt = alt.filter((i) => i.origin === 'dish' && i.editedAt === null && i.checkedAt === null)
    const bleibt = alt.filter((i) => !unberuehrt.some((u) => u.id === i.id))

    if (unberuehrt.length > 0) {
      await tx.delete(shoppingListItems).where(
        inArray(
          shoppingListItems.id,
          unberuehrt.map((i) => i.id),
        ),
      )
    }

    /*
      Was schon als bearbeitete oder abgehakte Zeile dasteht, wird nicht noch einmal
      aufgenommen: Zwei Zeilen „Zwiebeln" – eine abgehakt, eine neu – wären im Laden eine
      Frage zu viel.
    */
    const schonDa = new Set(bleibt.map((i) => `${i.name.trim().toLowerCase()}|${i.unit ?? ''}`))
    let position = bleibt.length
    let added = 0
    for (const z of zusammen) {
      if (schonDa.has(`${z.name.trim().toLowerCase()}|${z.unit ?? ''}`)) continue
      await tx.insert(shoppingListItems).values({
        id: uuidv7(),
        householdId: ctx.householdId,
        listId,
        position: position++,
        name: z.name,
        quantity: z.quantity === null ? null : String(z.quantity),
        unit: z.unit,
        note: z.splitReason,
        origin: 'dish',
      })
      added += 1
    }

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'shopping_list.built',
      subjectType: 'shopping_list',
      subjectId: listId,
      payload: { weekStart: start, added, kept: bleibt.length, builtAt: now.toISOString() },
    })
    return { listId, added, kept: bleibt.length }
  }

  async getShoppingList(
    tx: Tx,
    ctx: EffectiveContext,
    weekStart: string,
  ): Promise<{
    id: string | null
    weekStart: string
    items: {
      id: string
      name: string
      quantity: number | null
      unit: string | null
      note: string | null
      checked: boolean
      haveAtHome: boolean
      origin: string
      pushedAt: string | null
    }[]
  }> {
    authorize(ctx, 'meal:read', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    const start = weekStartOf(weekStart)
    const [liste] = await tx
      .select()
      .from(shoppingLists)
      .where(and(eq(shoppingLists.householdId, ctx.householdId), eq(shoppingLists.weekStart, start)))
      .limit(1)
    if (!liste) return { id: null, weekStart: start, items: [] }

    const items = await tx
      .select()
      .from(shoppingListItems)
      .where(eq(shoppingListItems.listId, liste.id))
      .orderBy(asc(shoppingListItems.position))

    return {
      id: liste.id,
      weekStart: start,
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: zahl(i.quantity),
        unit: i.unit,
        note: i.note,
        checked: i.checkedAt !== null,
        haveAtHome: i.haveAtHome,
        origin: i.origin,
        pushedAt: i.pushedAt ? i.pushedAt.toISOString() : null,
      })),
    }
  }

  /** Eine Zeile hinzufügen, ändern oder abhaken. Alles davon macht sie „berührt" (§36). */
  async upsertShoppingItem(
    tx: Tx,
    ctx: EffectiveContext,
    listId: string,
    now: Date,
    input: {
      id?: string
      name?: string
      quantity?: number | null
      unit?: string | null
      note?: string | null
      checked?: boolean
      haveAtHome?: boolean
    },
  ): Promise<{ id: string }> {
    authorize(ctx, 'meal:plan', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    const [liste] = await tx
      .select()
      .from(shoppingLists)
      .where(and(eq(shoppingLists.householdId, ctx.householdId), eq(shoppingLists.id, listId)))
      .limit(1)
    if (!liste) throw notFound('Die Einkaufsliste')

    if (!input.id) {
      if (!input.name?.trim()) throw badRequest('validation_failed', 'Ein Eintrag braucht einen Namen.')
      const id = uuidv7()
      const [letzte] = await tx
        .select({ max: sql<number>`coalesce(max(${shoppingListItems.position}), -1)::int` })
        .from(shoppingListItems)
        .where(eq(shoppingListItems.listId, listId))
      const max = letzte?.max ?? -1
      await tx.insert(shoppingListItems).values({
        id,
        householdId: ctx.householdId,
        listId,
        position: max + 1,
        name: input.name.trim(),
        quantity: input.quantity === null || input.quantity === undefined ? null : String(input.quantity),
        unit: input.unit ?? null,
        note: input.note ?? null,
        origin: 'manual',
        editedAt: now,
      })
      return { id }
    }

    const felder: Record<string, unknown> = { editedAt: now, version: sql`version + 1` }
    if (input.name !== undefined) felder['name'] = input.name.trim()
    if (input.quantity !== undefined) felder['quantity'] = input.quantity === null ? null : String(input.quantity)
    if (input.unit !== undefined) felder['unit'] = input.unit
    if (input.note !== undefined) felder['note'] = input.note
    if (input.checked !== undefined) felder['checkedAt'] = input.checked ? now : null
    if (input.haveAtHome !== undefined) felder['haveAtHome'] = input.haveAtHome

    const [zeile] = await tx
      .update(shoppingListItems)
      .set(felder)
      .where(and(eq(shoppingListItems.id, input.id), eq(shoppingListItems.listId, listId)))
      .returning({ id: shoppingListItems.id })
    if (!zeile) throw notFound('Der Eintrag')
    return { id: zeile.id }
  }

  async deleteShoppingItem(tx: Tx, ctx: EffectiveContext, listId: string, itemId: string): Promise<void> {
    authorize(ctx, 'meal:plan', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    await tx
      .delete(shoppingListItems)
      .where(
        and(
          eq(shoppingListItems.householdId, ctx.householdId),
          eq(shoppingListItems.listId, listId),
          eq(shoppingListItems.id, itemId),
        ),
      )
  }

  /** Was noch zu kaufen ist – die Zeilen, die eine Übergabe an Bring bekämen. */
  async openShoppingItems(
    tx: Tx,
    ctx: EffectiveContext,
    listId: string,
  ): Promise<{ id: string; name: string; quantity: number | null; unit: string | null }[]> {
    const items = await tx
      .select()
      .from(shoppingListItems)
      .where(
        and(
          eq(shoppingListItems.householdId, ctx.householdId),
          eq(shoppingListItems.listId, listId),
          isNull(shoppingListItems.checkedAt),
          eq(shoppingListItems.haveAtHome, false),
        ),
      )
      .orderBy(asc(shoppingListItems.position))
    return items.map((i) => ({ id: i.id, name: i.name, quantity: zahl(i.quantity), unit: i.unit }))
  }

  async markPushed(tx: Tx, ctx: EffectiveContext, itemIds: string[], now: Date): Promise<void> {
    if (itemIds.length === 0) return
    await tx
      .update(shoppingListItems)
      .set({ pushedAt: now, version: sql`version + 1` })
      .where(and(eq(shoppingListItems.householdId, ctx.householdId), inArray(shoppingListItems.id, itemIds)))
  }

  /* ══ Kleine Auskünfte für andere Seiten ═════════════════════════════ */

  /**
   * Was heute und morgen auf dem Tisch steht (§38, §39).
   *
   * Bewusst schmal: Die Familienseite und die Jetzt-Ansicht sollen die Auskunft zeigen, nicht
   * die Planung übernehmen. Wer mehr will, geht in den Plan.
   */
  async upcoming(
    tx: Tx,
    ctx: EffectiveContext,
    now: Date,
    tage = 2,
  ): Promise<{ date: string; slot: MealSlot; dishName: string; totalMinutes: number | null }[]> {
    authorize(ctx, 'meal:read', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    const heute = now.toISOString().slice(0, 10)
    const bis = tagePlus(heute, Math.max(0, tage - 1))

    const zeilen = await tx
      .select({
        onDate: mealPlanEntries.onDate,
        slot: mealPlanEntries.slot,
        dishName: dishes.name,
        prepMinutes: dishes.prepMinutes,
        cookMinutes: dishes.cookMinutes,
      })
      .from(mealPlanEntries)
      .innerJoin(dishes, eq(dishes.id, mealPlanEntries.dishId))
      .where(
        and(
          eq(mealPlanEntries.householdId, ctx.householdId),
          gte(mealPlanEntries.onDate, heute),
          lte(mealPlanEntries.onDate, bis),
        ),
      )
      .orderBy(asc(mealPlanEntries.onDate), asc(mealPlanEntries.slot))

    return zeilen.map((z) => ({
      date: alsTag(z.onDate),
      slot: z.slot as MealSlot,
      dishName: z.dishName,
      totalMinutes: MINUTEN(z.prepMinutes, z.cookMinutes),
    }))
  }

  /* ══ Tagesregeln ════════════════════════════════════════════════════ */

  async listDayRules(tx: Tx, ctx: EffectiveContext) {
    authorize(ctx, 'meal:read', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    const zeilen = await tx
      .select()
      .from(mealDayRules)
      .where(eq(mealDayRules.householdId, ctx.householdId))
      .orderBy(asc(mealDayRules.weekday))
    return zeilen.map((r) => ({
      id: r.id,
      weekday: r.weekday,
      slot: r.slot as MealSlot | null,
      maxMinutes: r.maxMinutes,
      requireTags: r.requireTags,
      excludeTags: r.excludeTags,
      note: r.note,
    }))
  }

  async setDayRule(
    tx: Tx,
    ctx: EffectiveContext,
    input: {
      weekday: number
      slot: MealSlot | null
      maxMinutes: number | null
      requireTags: string[]
      excludeTags: string[]
      note?: string | null
    },
  ): Promise<void> {
    authorize(ctx, 'meal:plan', { type: 'generic', id: null, householdId: ctx.householdId, domainId: null })
    if (input.weekday < 0 || input.weekday > 6) {
      throw badRequest('validation_failed', 'Wochentage laufen von 0 (Sonntag) bis 6 (Samstag).')
    }

    /*
      Eine leere Regel ist keine Regel. Wer alle Felder räumt, will sie loswerden – dafür
      einen zweiten Knopf zu verlangen, wäre eine Frage zu viel.
    */
    const leer = input.maxMinutes === null && input.requireTags.length === 0 && input.excludeTags.length === 0
    const wo = and(
      eq(mealDayRules.householdId, ctx.householdId),
      eq(mealDayRules.weekday, input.weekday),
      input.slot === null ? isNull(mealDayRules.slot) : eq(mealDayRules.slot, input.slot),
    )
    if (leer) {
      await tx.delete(mealDayRules).where(wo)
      return
    }

    const [vorhanden] = await tx.select({ id: mealDayRules.id }).from(mealDayRules).where(wo).limit(1)
    if (vorhanden) {
      await tx
        .update(mealDayRules)
        .set({
          maxMinutes: input.maxMinutes,
          requireTags: input.requireTags,
          excludeTags: input.excludeTags,
          note: input.note ?? null,
        })
        .where(eq(mealDayRules.id, vorhanden.id))
      return
    }
    await tx.insert(mealDayRules).values({
      id: uuidv7(),
      householdId: ctx.householdId,
      weekday: input.weekday,
      slot: input.slot,
      maxMinutes: input.maxMinutes,
      requireTags: input.requireTags,
      excludeTags: input.excludeTags,
      note: input.note ?? null,
    })
  }

  /* ══ Innereien ══════════════════════════════════════════════════════ */

  private async holeGericht(tx: Tx, ctx: EffectiveContext, dishId: string) {
    const [row] = await tx
      .select()
      .from(dishes)
      .where(and(eq(dishes.householdId, ctx.householdId), eq(dishes.id, dishId)))
      .limit(1)
    if (!row) throw notFound('Das Gericht')
    return row
  }

  /** Tags neu setzen. Doppelte und leere fallen weg, die Schreibweise bleibt, wie getippt. */
  private async setzeTags(tx: Tx, ctx: EffectiveContext, dishId: string, tags?: string[]): Promise<void> {
    if (tags === undefined) return
    await tx.delete(dishTags).where(eq(dishTags.dishId, dishId))
    const gesehen = new Set<string>()
    for (const roh of tags) {
      const tag = roh.trim()
      if (!tag || gesehen.has(tag.toLowerCase())) continue
      gesehen.add(tag.toLowerCase())
      await tx.insert(dishTags).values({ id: uuidv7(), householdId: ctx.householdId, dishId, tag })
    }
  }

  private async setzeZutaten(
    tx: Tx,
    ctx: EffectiveContext,
    dishId: string,
    zutaten?: { name: string; quantity?: number | null; unit?: string | null; note?: string | null }[],
  ): Promise<void> {
    if (zutaten === undefined) return
    await tx.delete(dishIngredients).where(eq(dishIngredients.dishId, dishId))
    let position = 0
    for (const z of zutaten) {
      const name = z.name.trim()
      if (!name) continue
      await tx.insert(dishIngredients).values({
        id: uuidv7(),
        householdId: ctx.householdId,
        dishId,
        position: position++,
        name,
        quantity: z.quantity === null || z.quantity === undefined ? null : String(z.quantity),
        unit: z.unit?.trim() || null,
        note: z.note ?? null,
      })
    }
  }
}

/** Wie ein Haushalt zu einem Gericht steht – aus den einzelnen Stimmen, in einem Satz (§9). */
export function familyOpinion(ratings: { displayName: string; rating: DishRating }[]): string | null {
  if (ratings.length === 0) return null
  const zaehle = (r: DishRating) => ratings.filter((x) => x.rating === r).length
  const abneigung = ratings.filter((r) => r.rating === 'rather_not')

  if (abneigung.length > 0) {
    const namen = abneigung.map((a) => a.displayName).join(' und ')
    return ratings.length - abneigung.length > 0
      ? `${namen} mag das eher nicht.`
      : `Mag hier gerade niemand.`
  }
  if (zaehle('love') === ratings.length) return 'Mögen alle sehr.'
  if (zaehle('love') + zaehle('like') === ratings.length) return 'Mögen alle.'
  if (popularity(ratings.map((r) => r.rating)) > 0) return 'Kommt gut an.'
  return 'Geht so.'
}

/* Unbenutzt, aber sprechend: die Reihenfolge, in der die Sammlung sortiert werden kann (§7). */
export const DISH_SORTS = ['name', 'recent', 'often', 'long_ago'] as const
export type DishSort = (typeof DISH_SORTS)[number]

/** Sortierung der Sammlung. Rein, damit sie sich prüfen lässt. */
export function sortDishes(rows: DishRow[], sort: DishSort): DishRow[] {
  const kopie = [...rows]
  switch (sort) {
    case 'recent':
      /* Zuletzt verwendet zuerst; nie Verwendetes ans Ende – es war ja nie „zuletzt". */
      return kopie.sort((a, b) => (b.lastPlannedOn ?? '').localeCompare(a.lastPlannedOn ?? ''))
    case 'often':
      return kopie.sort((a, b) => b.plannedCount - a.plannedCount || a.name.localeCompare(b.name, 'de'))
    case 'long_ago':
      /*
        Lange nicht verwendet – und „noch nie" zählt als am längsten her. Ein leeres Feld
        ans Ende zu sortieren wäre hier falsch herum: Genau diese Gerichte sucht man.
      */
      return kopie.sort((a, b) => (a.lastPlannedOn ?? '').localeCompare(b.lastPlannedOn ?? ''))
    default:
      return kopie.sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }
}

/* Für die Routen: die Filter der Sammlung an einer Stelle. */
export function filterDishes(
  rows: DishRow[],
  opts: { query?: string; tags?: string[]; maxMinutes?: number | null },
): DishRow[] {
  const q = opts.query?.trim().toLowerCase()
  const tags = (opts.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)
  return rows.filter((d) => {
    if (q) {
      const heuhaufen = [d.name, d.description ?? '', ...d.tags, ...d.ingredients.map((i) => i.name)]
        .join(' ')
        .toLowerCase()
      if (!heuhaufen.includes(q)) return false
    }
    if (tags.length > 0) {
      const gesetzt = new Set(d.tags.map((t) => t.toLowerCase()))
      if (!tags.every((t) => gesetzt.has(t))) return false
    }
    /* Ohne Zeitangabe wird nicht ausgesiebt – die Pflegelücke ist keine Eigenschaft des Gerichts. */
    if (opts.maxMinutes && d.totalMinutes !== null && d.totalMinutes > opts.maxMinutes) return false
    return true
  })
}
