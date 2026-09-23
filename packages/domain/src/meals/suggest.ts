import {
  BASE_TAGS,
  DISH_RATING_WEIGHT,
  fitsSlot,
  seasonOfMonth,
  SEASON_TAGS,
  type DishRating,
  type MealSlot,
  type MealSuitability,
  type SuggestionMode,
} from '@thealotta/contracts'

/**
 * Vorschläge für freie Mahlzeiten (docs/63, §15–§31).
 *
 * Reine Funktion: gleiche Eingabe, gleiche Ausgabe. Die Zufälligkeit steckt in einem
 * übergebenen Startwert, nicht in `Math.random()` – sonst ließe sich keine einzige der
 * Eigenschaften prüfen, die dieses Modul haben soll („B ist deutlich wahrscheinlicher als A").
 *
 * **Was es nicht tut:** eine Rangliste ausrechnen und die Spitze nehmen. Dann stünden bei
 * jedem Klick dieselben fünf Gerichte da, und „Woche füllen" wäre nach dem zweiten Mal
 * nutzlos (§18). Stattdessen gewichtete Ziehung: Das Gewicht verschiebt Wahrscheinlichkeiten,
 * es entscheidet nicht.
 *
 * **Was der Nutzer davon sieht:** einen Satz, keine Zahl (§25, §26). Die Gewichte hier sind
 * Rechnung, kein Anzeigematerial.
 */

/** Ein Gericht, so wie die Auswahl es braucht. */
export interface DishCandidate {
  id: string
  name: string
  tags: string[]
  /** Zubereitung plus Vorbereitung, in Minuten. `null` heißt: nicht hinterlegt. */
  totalMinutes: number | null
  /** §29: bleibt in der Sammlung, kommt aber nicht von selbst auf den Tisch. */
  excluded: boolean
  /** Wofür es passt. `both` heißt: überall – die Voreinstellung. */
  suitableFor: MealSuitability
  /** Wann es zuletzt eingeplant war (ISO-Datum) – oder `null`, wenn nie. */
  lastPlannedOn: string | null
  /** Wie oft insgesamt eingeplant. */
  plannedCount: number
  /** Was die Personen im Haushalt davon halten. Leer heißt: hat noch niemand gesagt. */
  ratings: DishRating[]
}

/** Ein zu füllender Platz im Plan. */
export interface SlotRequest {
  /** ISO-Datum, `YYYY-MM-DD`. */
  date: string
  slot: MealSlot
}

/** Eine Regel für einen Wochentag (§21). Verschiebt Vorschläge, verbietet nichts. */
export interface DayRule {
  weekday: number
  slot: MealSlot | null
  maxMinutes: number | null
  requireTags: string[]
  excludeTags: string[]
}

export interface SuggestOptions {
  mode: SuggestionMode
  /** Filter aus der Oberfläche – gelten für alle Slots (§20, §45). */
  requireTags?: string[]
  excludeTags?: string[]
  maxMinutes?: number | null
  dayRules?: DayRule[]
  /** Was in dieser Woche schon geplant ist – wird nicht doppelt vorgeschlagen (§19, §58). */
  alreadyPlanned?: { date: string; dishId: string }[]
  /**
   * Der Startwert der Ziehung. **Pflicht**, nicht optional.
   *
   * Die Domäne liest keine Uhr (docs/26 §4) – und ein Vorschlagswerk, das sich seinen Zufall
   * selbst besorgt, ließe sich nicht prüfen. Wer „nochmal würfeln" will, schickt einen
   * anderen Wert; die Anwendungsschicht nimmt dafür die injizierte Zeit.
   */
  seed: number
}

export interface Suggestion {
  date: string
  slot: MealSlot
  dishId: string
  /** Warum dieses Gericht – ein Satzteil in klarer Sprache, keine Punktzahl. */
  reason: string
}

/** Warum ein Slot leer geblieben ist. Ein stiller leerer Platz wäre nicht erklärbar. */
export interface Unfilled {
  date: string
  slot: MealSlot
  reason: string
}

export interface SuggestResult {
  suggestions: Suggestion[]
  unfilled: Unfilled[]
}

/*
 * Wie stark die einzelnen Signale je Betriebsart zählen.
 *
 * `spread` ist der Ausschlag der gewichteten Ziehung: Bei 1 unterscheiden sich die Chancen
 * kaum, bei 3 deutlich. „Überrasch mich" senkt ihn, statt die Signale abzuschalten – ein
 * gleichverteilter Wurf würde auch das Gericht ziehen, das vorgestern auf dem Tisch stand.
 */
const GEWICHTE: Record<SuggestionMode, { alter: number; beliebtheit: number; tempo: number; spread: number }> = {
  balanced: { alter: 1, beliebtheit: 1, tempo: 0.2, spread: 2 },
  variety: { alter: 2.2, beliebtheit: 0.4, tempo: 0.2, spread: 2 },
  favourites: { alter: 0.6, beliebtheit: 2.2, tempo: 0.2, spread: 2 },
  quick: { alter: 0.8, beliebtheit: 0.8, tempo: 2.2, spread: 2 },
  surprise: { alter: 0.5, beliebtheit: 0.5, tempo: 0.1, spread: 0.6 },
}

/**
 * Ab wann ein Gericht wieder „dran" ist.
 *
 * 42 Tage – sechs Wochen. Der Wert ist nicht aus einer Studie, sondern aus dem Zweck:
 * Ein Haushalt kocht rund vierzehn Abendessen in zwei Wochen; wer eine Sammlung von dreißig
 * Gerichten hat, soll jedes davon etwa alle sechs Wochen sehen. Darüber hinaus wächst das
 * Gewicht nicht weiter – „vor vier Monaten" und „vor acht Monaten" sind für die Frage
 * „hatten wir das lange nicht?" dasselbe.
 */
const SAETTIGUNG_TAGE = 42

/** Innerhalb dieser Frist gilt ein Gericht als gerade erst dagewesen (§19, §30). */
const ZU_FRISCH_TAGE = 10

/** Ein einfacher, wiederholbarer Zufallsgenerator (mulberry32). */
function wuerfel(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const tage = (von: string, bis: string): number =>
  Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / 86_400_000)

const kleinbuchstaben = (tags: string[]): Set<string> => new Set(tags.map((t) => t.trim().toLowerCase()))

/** Die Basis eines Gerichts – daraus leitet sich ab, was als ähnlich gilt (§19). */
export function baseOf(dish: { tags: string[] }): string | null {
  const gesetzt = kleinbuchstaben(dish.tags)
  for (const basis of BASE_TAGS) {
    if (gesetzt.has(basis.toLowerCase())) return basis.toLowerCase()
  }
  return null
}

/**
 * Wie sehr der Haushalt ein Gericht mag – aus den einzelnen Stimmen, nicht als eigene Angabe.
 *
 * Der Mittelwert allein wäre irreführend: Ein Gericht, das drei lieben und eines gar nicht
 * mag, ist nicht dasselbe wie eines, das alle mittelmäßig finden – am Tisch sitzt aber
 * jemand, der nichts isst. Deshalb zieht ein „eher nicht" doppelt (siehe
 * `DISH_RATING_WEIGHT`), und das Ergebnis ist der Durchschnitt daraus.
 */
export function popularity(ratings: DishRating[]): number {
  if (ratings.length === 0) return 0
  return ratings.reduce((s, r) => s + DISH_RATING_WEIGHT[r], 0) / ratings.length
}

/** Ob ein Gericht die harten Bedingungen eines Slots erfüllt. */
function erlaubt(
  dish: DishCandidate,
  slot: MealSlot,
  opts: SuggestOptions,
  regel: DayRule | undefined,
): { ok: true } | { ok: false; grund: string } {
  if (dish.excluded) return { ok: false, grund: 'ausgeschlossen' }
  /* Wofür es passt, ist eine harte Bedingung – Pfannkuchen mittags heißt nicht Pfannkuchen abends. */
  if (!fitsSlot(dish.suitableFor, slot)) return { ok: false, grund: 'Mahlzeit' }

  const gesetzt = kleinbuchstaben(dish.tags)
  const braucht = [...(opts.requireTags ?? []), ...(regel?.requireTags ?? [])]
  for (const t of braucht) {
    if (!gesetzt.has(t.trim().toLowerCase())) return { ok: false, grund: 'Filter' }
  }
  const meidet = [...(opts.excludeTags ?? []), ...(regel?.excludeTags ?? [])]
  for (const t of meidet) {
    if (gesetzt.has(t.trim().toLowerCase())) return { ok: false, grund: 'Filter' }
  }

  /*
   * Ein Gericht ohne Zeitangabe wird von einer Zeitgrenze **nicht** ausgeschlossen.
   *
   * „Höchstens 30 Minuten" heißt „nichts Aufwendiges", nicht „nur was jemand gestoppt hat".
   * Sonst bestraft der Filter die Pflegelücke statt das Gericht – und §6 sagt ausdrücklich,
   * dass niemand gezwungen sein soll, alles auszufüllen.
   */
  const grenze = Math.min(opts.maxMinutes ?? Infinity, regel?.maxMinutes ?? Infinity)
  if (Number.isFinite(grenze) && dish.totalMinutes !== null && dish.totalMinutes > grenze) {
    return { ok: false, grund: 'Zeit' }
  }
  return { ok: true }
}

/** Das Gewicht eines Gerichts für einen bestimmten Tag. Immer > 0, damit nichts unmöglich wird. */
function gewicht(
  dish: DishCandidate,
  datum: string,
  mode: SuggestionMode,
): { wert: number; grund: string } {
  const g = GEWICHTE[mode]
  let punkte = 0
  /* Der Grund ist das stärkste Signal – nicht die Summe. Eine Summe ließe sich nicht sagen. */
  const gruende: { text: string; staerke: number }[] = []

  // 1 — Wie lange ist es her (§17). Nie geplant zählt wie „sehr lange her".
  const her = dish.lastPlannedOn === null ? SAETTIGUNG_TAGE : tage(dish.lastPlannedOn, datum)
  const alter = Math.max(0, Math.min(1, her / SAETTIGUNG_TAGE))
  punkte += alter * g.alter
  if (dish.lastPlannedOn === null && dish.plannedCount === 0) {
    gruende.push({ text: 'Noch nie geplant', staerke: alter * g.alter })
  } else if (alter > 0.75) {
    gruende.push({ text: 'Lange nicht gegessen', staerke: alter * g.alter })
  }

  // 2 — Beliebtheit (§18). Auf 0..1 gestaucht, damit sie nicht alles andere überstimmt.
  const beliebt = (popularity(dish.ratings) + 2) / 4
  punkte += beliebt * g.beliebtheit
  if (popularity(dish.ratings) >= 1.5) {
    gruende.push({ text: 'Mögen hier alle', staerke: beliebt * g.beliebtheit })
  }

  // 3 — Tempo. Nur wenn eine Zeit hinterlegt ist; ohne Angabe gibt es weder Bonus noch Malus.
  if (dish.totalMinutes !== null) {
    const schnell = Math.max(0, Math.min(1, (60 - dish.totalMinutes) / 45))
    punkte += schnell * g.tempo
    if (mode === 'quick' && dish.totalMinutes <= 30) {
      gruende.push({ text: `In ${dish.totalMinutes} Minuten fertig`, staerke: schnell * g.tempo })
    }
  }

  /*
   * 4 — Jahreszeit (§31). Ein Zuschlag, kein Filter: Kürbissuppe im März ist erlaubt, nur
   * seltener. Wer im Winter kein Sommergericht will, taggt es aus – von selbst verschwinden
   * darf hier nichts.
   */
  const gesetzt = kleinbuchstaben(dish.tags)
  const saisontags = SEASON_TAGS.filter((s) => gesetzt.has(s.toLowerCase()))
  if (saisontags.length > 0) {
    const jetzt = seasonOfMonth(Number(datum.slice(5, 7)) - 1)
    if (saisontags.includes(jetzt)) {
      punkte += 0.6
      gruende.push({ text: `Passt in den ${jetzt}`, staerke: 0.6 })
    } else {
      punkte -= 0.4
    }
  }

  gruende.sort((a, b) => b.staerke - a.staerke)
  return { wert: Math.max(0.05, punkte), grund: gruende[0]?.text ?? 'Passt in die Woche' }
}

/**
 * Freie Slots füllen.
 *
 * Die Reihenfolge ist Absicht: Ein Slot wird gefüllt, dann gilt sein Gericht für die
 * folgenden als vergeben. Sonst könnte dasselbe Gericht zweimal in einer Woche stehen (§58),
 * und die Ähnlichkeitsprüfung für den Vortag hätte nichts zu vergleichen.
 */
export function suggestMeals(
  slots: SlotRequest[],
  dishes: DishCandidate[],
  opts: SuggestOptions,
): SuggestResult {
  const rnd = wuerfel(opts.seed)
  const suggestions: Suggestion[] = []
  const unfilled: Unfilled[] = []

  /* Was in dieser Woche schon steht, zählt mit – auch das von Hand Gesetzte (§24). */
  const belegt = new Map<string, string>()
  for (const p of opts.alreadyPlanned ?? []) belegt.set(p.date, p.dishId)
  const vergeben = new Set<string>((opts.alreadyPlanned ?? []).map((p) => p.dishId))

  const nachId = new Map(dishes.map((d) => [d.id, d]))
  const sortiert = [...slots].sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot))

  for (const slot of sortiert) {
    const wochentag = new Date(`${slot.date}T00:00:00.000Z`).getUTCDay()
    const regel = (opts.dayRules ?? []).find(
      (r) => r.weekday === wochentag && (r.slot === null || r.slot === slot.slot),
    )

    /* Was am Vortag auf dem Tisch stand – für die Ähnlichkeitsprüfung. */
    const vortag = new Date(Date.parse(`${slot.date}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10)
    const basisGestern = (() => {
      const id = belegt.get(vortag)
      const d = id ? nachId.get(id) : undefined
      return d ? baseOf(d) : null
    })()

    const moeglich = dishes.filter((d) => erlaubt(d, slot.slot, opts, regel).ok)
    if (moeglich.length === 0) {
      unfilled.push({ date: slot.date, slot: slot.slot, reason: 'Kein Gericht passt zu den Vorgaben.' })
      continue
    }

    /*
     * Drei Stufen, jede nur so streng wie möglich.
     *
     * Erst alles, was noch nicht in dieser Woche steht, lange genug her ist und dem Vortag
     * nicht ähnelt. Bleibt davon nichts übrig, fallen die weichen Bedingungen der Reihe nach.
     * §58 sagt „ohne guten Grund" – ein leerer Slot **ist** ein guter Grund.
     */
    const nichtDoppelt = moeglich.filter((d) => !vergeben.has(d.id))
    const nichtZuFrisch = nichtDoppelt.filter(
      (d) => d.lastPlannedOn === null || tage(d.lastPlannedOn, slot.date) > ZU_FRISCH_TAGE,
    )
    const nichtAehnlich = nichtZuFrisch.filter(
      (d) => basisGestern === null || baseOf(d) === null || baseOf(d) !== basisGestern,
    )

    const auswahl =
      nichtAehnlich.length > 0
        ? nichtAehnlich
        : nichtZuFrisch.length > 0
          ? nichtZuFrisch
          : nichtDoppelt.length > 0
            ? nichtDoppelt
            : moeglich

    const bewertet = auswahl.map((d) => ({ dish: d, ...gewicht(d, slot.date, opts.mode) }))
    const spread = GEWICHTE[opts.mode].spread
    const gewichte = bewertet.map((b) => Math.pow(b.wert, spread))
    const summe = gewichte.reduce((a, b) => a + b, 0)

    let ziel = rnd() * summe
    let index = gewichte.length - 1
    for (let i = 0; i < gewichte.length; i += 1) {
      ziel -= gewichte[i]!
      if (ziel <= 0) {
        index = i
        break
      }
    }

    const gewaehlt = bewertet[index]!
    suggestions.push({ date: slot.date, slot: slot.slot, dishId: gewaehlt.dish.id, reason: gewaehlt.grund })
    vergeben.add(gewaehlt.dish.id)
    /* Nur das Abendessen prägt den Tag für die Ähnlichkeitsprüfung – mittags isst man anders. */
    if (slot.slot === 'dinner') belegt.set(slot.date, gewaehlt.dish.id)
  }

  return { suggestions, unfilled }
}
