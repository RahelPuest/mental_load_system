/**
 * Das Vokabular der Essensplanung (docs/63).
 *
 * Was hier steht, ist geschlossen und wird in der Datenbank gespiegelt (ADR-0013). Was
 * bewusst **nicht** hier steht, ist die Liste der Tags: Tags sind frei, und eine geschlossene
 * Liste wäre genau die Verwaltungsbelastung, die dieser Bereich vermeiden soll. Vorschläge
 * gibt es trotzdem – als Angebot, nicht als Vorgabe.
 */

/**
 * Die zwei Mahlzeiten, die geplant werden.
 *
 * Frühstück fehlt mit Absicht. Es wiederholt sich in den meisten Haushalten so weit, dass es
 * nichts zu entscheiden gibt – und was nichts zu entscheiden hat, kostet auch keine
 * Entscheidungslast. Ein dritter Slot wäre eine Zeile mehr an sieben Tagen, für nichts.
 */
export const MEAL_SLOTS = ['lunch', 'dinner'] as const
export type MealSlot = (typeof MEAL_SLOTS)[number]

/*
 * „Mittag" und „Abend", nicht „Mittagessen" und „Abendessen".
 *
 * Das Wort steht zweimal am Rand einer Tabelle und einmal in einem Satz. Als Zeilenkopf des
 * Wochenplans passte die lange Form nicht in ihre Spalte – „Abendessen" braucht 85 px, die
 * Spalte hatte 72 – und wurde abgeschnitten. Die kurze Form passt, gibt den Tagesspalten
 * sechzehn Pixel zurück und liest sich im Satz genauso: „Dienstag, Abend".
 *
 * Eine Sprache, nicht zwei: Ein Begriff, der an der Tabelle anders heißt als im Bogen, ist
 * derselbe Fehler wie eine Rolle in zwei Ausprägungen (docs/65).
 */
export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  lunch: 'Mittag',
  dinner: 'Abend',
}

/**
 * Wofür ein Gericht passt.
 *
 * Ein **Feld**, kein Tag. Tags beschreiben, dieses hier steuert: Ein Gericht, das nur mittags
 * passt, wird abends nicht vorgeschlagen. Worauf sich die Auswahl verlässt, muss geschlossen
 * sein – ein Tippfehler in einem freien Tag wäre eine stille Regeländerung.
 *
 * `both` ist die Voreinstellung. Niemand muss seine Sammlung durchklassifizieren, bevor sie
 * benutzbar ist (§6); wer nichts angibt, bekommt das Gericht überall vorgeschlagen.
 */
export const MEAL_SUITABILITY = ['both', 'lunch', 'dinner'] as const
export type MealSuitability = (typeof MEAL_SUITABILITY)[number]

export const MEAL_SUITABILITY_LABEL: Record<MealSuitability, string> = {
  both: 'mittags und abends',
  lunch: 'nur mittags',
  dinner: 'nur abends',
}

/** Ob ein Gericht für eine bestimmte Mahlzeit in Frage kommt. */
export function fitsSlot(suitableFor: MealSuitability, slot: MealSlot): boolean {
  return suitableFor === 'both' || suitableFor === slot
}

/**
 * Wie ein Eintrag in den Plan gekommen ist.
 *
 * Der Unterschied ist sichtbar: Ein Vorschlag darf ausgetauscht werden, ohne dass man
 * jemandem etwas wegnimmt; eine Setzung von Hand nicht. „Freie Woche füllen" rührt deshalb
 * nur `suggested` und leere Slots an (§24, §56).
 */
export const MEAL_ENTRY_SOURCES = ['manual', 'suggested'] as const
export type MealEntrySource = (typeof MEAL_ENTRY_SOURCES)[number]

/**
 * Wie sehr jemand ein Gericht mag – in Worten, nicht in Sternen.
 *
 * Fünf Sterne behaupten eine Auflösung, die niemand hat: Der Unterschied zwischen drei und
 * vier Sternen bei einem Kartoffelauflauf ist nicht bestimmbar, und ihn zu erfragen ist
 * Arbeit ohne Ertrag (§26). Vier Stufen in klarer Sprache reichen für die Auswahl.
 *
 * Die Bewertung hängt an **einer Person**, nicht am Haushalt (§10). Was „die Familie" davon
 * hält, wird daraus abgeleitet und nicht getrennt gepflegt.
 */
export const DISH_RATINGS = ['love', 'like', 'neutral', 'rather_not'] as const
export type DishRating = (typeof DISH_RATINGS)[number]

export const DISH_RATING_LABEL: Record<DishRating, string> = {
  love: 'mag ich sehr',
  like: 'mag ich',
  neutral: 'geht so',
  rather_not: 'eher nicht',
}

/**
 * Das Gewicht einer Bewertung in der Auswahl. Negativ heißt: seltener, nicht nie.
 *
 * „Eher nicht" wiegt schwerer als „mag ich sehr" – und zwar mit Absicht. Ein Gericht, das
 * drei lieben und eines ablehnt, ist nicht dasselbe wie eines, das alle bloß mögen: Am Tisch
 * sitzt dann jemand, der nichts isst, und daraus wird eine zweite Mahlzeit. Genau diese
 * Arbeit soll die Planung ja abnehmen.
 */
export const DISH_RATING_WEIGHT: Record<DishRating, number> = {
  love: 2,
  like: 1,
  neutral: 0,
  rather_not: -3,
}

/**
 * Die Vorschlagsarten – Voreinstellungen statt Reglern (§27, §28).
 *
 * Ein Gewichtungspanel als Standardansicht wäre ein Algorithmus-Konfigurator: Wer ihn
 * bedienen will, muss verstehen, wie das Ranking rechnet. Fünf benannte Absichten sind
 * dasselbe in der Sprache der Sache – „mehr Abwechslung" statt „Recency-Faktor 0,7".
 */
export const SUGGESTION_MODES = ['balanced', 'variety', 'favourites', 'quick', 'surprise'] as const
export type SuggestionMode = (typeof SUGGESTION_MODES)[number]

export const SUGGESTION_MODE_LABEL: Record<SuggestionMode, { titel: string; zweck: string }> = {
  balanced: { titel: 'Ausgewogen', zweck: 'Beliebtes und lange nicht Gegessenes zu gleichen Teilen.' },
  variety: { titel: 'Abwechslung', zweck: 'Was lange nicht dran war, kommt zuerst.' },
  favourites: { titel: 'Favoriten', zweck: 'Was ihr mögt, häufiger – aber nicht immer dasselbe.' },
  quick: { titel: 'Schnell', zweck: 'Kurze Zubereitungszeit hat Vorrang.' },
  surprise: { titel: 'Überrasch mich', zweck: 'Mehr Zufall, weniger Rechnung.' },
}

/**
 * Einheiten, die sich zusammenzählen lassen (§35).
 *
 * Der Punkt dieser Liste ist nicht, Eingaben einzuschränken – jede Einheit darf getippt
 * werden. Der Punkt ist die **Familie**: Nur was in derselben Familie liegt, wird für die
 * Einkaufsliste zusammengeführt. 500 g und 1 kg werden zu 1,5 kg; 2 Dosen und 300 g bleiben
 * zwei Zeilen. Im Zweifel lieber zwei Zeilen als eine falsche.
 */
export const UNIT_FAMILIES = {
  g: { familie: 'masse', faktor: 1 },
  kg: { familie: 'masse', faktor: 1000 },
  ml: { familie: 'volumen', faktor: 1 },
  l: { familie: 'volumen', faktor: 1000 },
  Stück: { familie: 'stueck', faktor: 1 },
} as const satisfies Record<string, { familie: string; faktor: number }>

/** Die Einheit, in der eine Familie zusammengefasst wird – die kleinste. */
export const UNIT_BASE: Record<string, string> = {
  masse: 'g',
  volumen: 'ml',
  stueck: 'Stück',
}

/**
 * Einheiten, die in der Auswahlliste angeboten werden.
 *
 * Mehr als diese darf getippt werden. Was nicht in `UNIT_FAMILIES` steht, wird beim
 * Zusammenzählen nur mit sich selbst zusammengelegt: „2 Dosen" und „1 Dose" ergeben
 * „3 Dosen", aber „2 Dosen" und „400 g" bleiben getrennt.
 */
export const UNIT_SUGGESTIONS = [
  'g',
  'kg',
  'ml',
  'l',
  'Stück',
  'Dose',
  'Packung',
  'Bund',
  'EL',
  'TL',
  'Prise',
  'Zehe',
  'Scheibe',
] as const

/**
 * Tagvorschläge – ein Angebot, keine Liste zum Abarbeiten (§5, §6).
 *
 * Ein Gericht darf nur einen Namen haben und sofort benutzbar sein. Diese Gruppen stehen im
 * Bogen als anklickbare Vorschläge; getippt werden darf alles.
 *
 * Zwei Gruppen tun mehr als beschreiben und sind deshalb ausdrücklich hier verzeichnet:
 * **Basis** entscheidet, was als „ähnlich" gilt (§19 – vier Nudelgerichte hintereinander),
 * und **Saison** verschiebt Gewichte im Jahreslauf (§31).
 */
export const TAG_SUGGESTIONS: { gruppe: string; zweck: string; tags: readonly string[] }[] = [
  {
    gruppe: 'Ernährung',
    zweck: 'Wer was isst.',
    tags: ['vegetarisch', 'vegan', 'Fleisch', 'Fisch'],
  },
  {
    gruppe: 'Aufwand',
    zweck: 'Wie viel Kraft es kostet.',
    tags: ['sehr schnell', 'schnell', 'aufwendig', 'gut vorzubereiten'],
  },
  {
    gruppe: 'Situation',
    zweck: 'Wann es passt.',
    tags: [
      'unter der Woche',
      'Wochenende',
      'Gäste',
      'wenig Energie',
      'wenig Zeit',
      'Meal Prep',
      'Resteverwertung',
    ],
  },
  {
    gruppe: 'Familie',
    zweck: 'Wer es mag – grob. Genauer geht es über die Bewertung.',
    tags: ['Kinder mögen es', 'Erwachsene mögen es', 'alle mögen es'],
  },
  {
    gruppe: 'Basis',
    zweck: 'Woraus es hauptsächlich besteht. Danach entscheidet sich, was als ähnlich gilt.',
    tags: ['Nudeln', 'Reis', 'Kartoffeln', 'Brot', 'Suppe', 'Auflauf', 'Salat', 'Eintopf'],
  },
  {
    gruppe: 'Küche',
    zweck: 'Woher es kommt.',
    tags: ['deutsch', 'italienisch', 'asiatisch', 'mexikanisch', 'mediterran', 'orientalisch'],
  },
  {
    gruppe: 'Saison',
    zweck: 'Wann im Jahr es am besten passt.',
    tags: ['Frühling', 'Sommer', 'Herbst', 'Winter'],
  },
]

/** Alle vorgeschlagenen Tags, flach – für die Vervollständigung im Eingabefeld. */
export const ALL_TAG_SUGGESTIONS: string[] = TAG_SUGGESTIONS.flatMap((g) => [...g.tags])

/**
 * Die Tags, aus denen sich „ähnlich" ableitet (§19).
 *
 * Nicht geraten, sondern getaggt: Ob Lasagne und Carbonara einander ähneln, weiß der
 * Haushalt, nicht ein Wortabgleich auf dem Namen. Was niemand getaggt hat, gilt als
 * unähnlich – lieber keine Regel als eine erfundene.
 */
export const BASE_TAGS: readonly string[] = TAG_SUGGESTIONS.find((g) => g.gruppe === 'Basis')!.tags

/** Die Saisontags in der Reihenfolge der Jahresviertel, beginnend im Frühling. */
export const SEASON_TAGS = ['Frühling', 'Sommer', 'Herbst', 'Winter'] as const
export type SeasonTag = (typeof SEASON_TAGS)[number]

/** Zu welchem Monat (0 = Januar) welche Jahreszeit gehört. */
export function seasonOfMonth(month: number): SeasonTag {
  if (month <= 1 || month === 11) return 'Winter'
  if (month <= 4) return 'Frühling'
  if (month <= 7) return 'Sommer'
  return 'Herbst'
}

/**
 * Woher ein Eintrag der Einkaufsliste stammt.
 *
 * `dish` wird beim Neuerzeugen ersetzt, `manual` nie – und `dish` auch dann nicht mehr, wenn
 * jemand ihn von Hand geändert hat (§36). Sonst verlöre man beim zweiten „Liste erzeugen"
 * genau die Korrekturen, für die man das erste Mal Zeit aufgewendet hat.
 */
export const SHOPPING_ITEM_ORIGINS = ['dish', 'manual'] as const
export type ShoppingItemOrigin = (typeof SHOPPING_ITEM_ORIGINS)[number]
