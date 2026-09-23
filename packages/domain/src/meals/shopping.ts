import { UNIT_BASE, UNIT_FAMILIES } from '@thealotta/contracts'

/**
 * Aus geplanten Gerichten wird eine Einkaufsliste (docs/63, §32–§35).
 *
 * Zwei Rechnungen, beide rein: Mengen an die geplante Personenzahl anpassen, und gleiche
 * Zutaten zusammenzählen. Die zweite ist die heiklere – **im Zweifel lieber zwei Zeilen als
 * eine falsche.** Eine zusammengelegte Zeile, die nicht stimmt, merkt man erst im Laden.
 */

export interface Ingredient {
  name: string
  /** `null` heißt: keine Menge hinterlegt – „Parmesan" ist eine gültige Zutat (§4). */
  quantity: number | null
  unit: string | null
  note?: string | null
}

/** Eine Zutat mitsamt der Mahlzeit, aus der sie kommt. */
export interface PlannedIngredient extends Ingredient {
  dishName: string
  /** Portionen, für die das Rezept gedacht ist. */
  baseServings: number | null
  /** Portionen, für die geplant ist. */
  plannedServings: number | null
}

export interface AggregatedItem {
  name: string
  quantity: number | null
  unit: string | null
  /** Aus welchen Gerichten diese Zeile stammt – die Erklärung für die Zahl daneben. */
  fromDishes: string[]
  /**
   * Warum die Zeile nicht mit einer anderen desselben Namens zusammengelegt wurde.
   * `null` heißt: Es gab nichts zusammenzulegen oder es hat geklappt.
   */
  splitReason: string | null
}

/**
 * Mengen auf die geplante Personenzahl bringen (§34).
 *
 * Fehlt eine der beiden Zahlen, wird **nicht** skaliert. Ein Rezept ohne Portionsangabe auf
 * sechs Personen zu rechnen hieße raten, für wie viele es gedacht war – und ein geratener
 * Faktor ist im Einkaufswagen teurer als eine Zeile, die man selbst anpasst.
 */
export function scaleQuantity(
  quantity: number | null,
  baseServings: number | null,
  plannedServings: number | null,
): number | null {
  if (quantity === null) return null
  if (!baseServings || !plannedServings || baseServings === plannedServings) return quantity
  const faktor = plannedServings / baseServings
  const roh = quantity * faktor
  /*
   * Auf drei Nachkommastellen – so viel, wie die Spalte hält. Gerundet wird zum Einkaufen
   * ohnehin im Kopf; das System soll nur nicht mehr Genauigkeit behaupten, als es hat.
   */
  return Math.round(roh * 1000) / 1000
}

/** Der Vergleichsschlüssel einer Zutat: Name ohne Rücksicht auf Schreibweise. */
const schluessel = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ')

/** In welche Rechenfamilie eine Einheit gehört – oder `null`, wenn sie nur zu sich selbst passt. */
function familie(unit: string | null): { familie: string; faktor: number } | null {
  if (!unit) return null
  const treffer = (UNIT_FAMILIES as Record<string, { familie: string; faktor: number }>)[unit.trim()]
  return treffer ?? null
}

/**
 * Gleiche Zutaten zusammenlegen (§35).
 *
 * Zusammengelegt wird, wenn Name **und** Rechenfamilie übereinstimmen: 500 g und 1 kg werden
 * zu 1,5 kg, 2 Dosen und 1 Dose zu 3 Dosen. Nicht zusammengelegt wird bei:
 *
 * - unterschiedlichen Familien („2 Dosen" und „400 g" – wie viel ist eine Dose?),
 * - fehlender Menge („Parmesan" ohne Zahl lässt sich zu nichts addieren),
 * - unbekannten Einheiten, die nicht identisch sind („1 Bund" und „2 Zweige").
 *
 * Was nicht zusammengeht, bleibt als zweite Zeile stehen und sagt in `splitReason`, warum.
 * Eine stille Verweigerung wäre schlechter als eine falsche Summe: Man sähe nur zwei Zeilen
 * und wüsste nicht, ob das Absicht war.
 */
export function aggregateIngredients(zutaten: PlannedIngredient[]): AggregatedItem[] {
  type Eimer = {
    name: string
    unit: string | null
    familieName: string | null
    menge: number | null
    gerichte: string[]
    ohneMenge: boolean
  }
  const eimer: Eimer[] = []

  for (const z of zutaten) {
    const menge = scaleQuantity(z.quantity, z.baseServings, z.plannedServings)
    const fam = familie(z.unit)
    const famName = fam ? fam.familie : null

    const passend = eimer.find((e) => {
      if (schluessel(e.name) !== schluessel(z.name)) return false
      if (menge === null || e.menge === null) return false
      /* Bekannte Familie: g und kg gehören zusammen. */
      if (famName && e.familieName) return famName === e.familieName
      /* Unbekannte Einheit: nur die exakt gleiche Schreibweise – „Dose" und „Dose". */
      if (!famName && !e.familieName) return (e.unit ?? '') === (z.unit ?? '')
      return false
    })

    if (passend && menge !== null && passend.menge !== null) {
      if (fam && passend.familieName) {
        /* In der Grundeinheit rechnen, damit 500 g + 1 kg aufgeht. */
        const bisher = passend.menge * (familie(passend.unit)?.faktor ?? 1)
        passend.menge = bisher + menge * fam.faktor
        passend.unit = UNIT_BASE[fam.familie] ?? passend.unit
      } else {
        passend.menge += menge
      }
      if (!passend.gerichte.includes(z.dishName)) passend.gerichte.push(z.dishName)
      continue
    }

    eimer.push({
      name: z.name.trim(),
      unit: z.unit?.trim() || null,
      familieName: famName,
      menge,
      gerichte: [z.dishName],
      ohneMenge: menge === null,
    })
  }

  /*
   * Erst am Ende entscheidet sich, ob eine Zeile eine Erklärung braucht: Sie braucht eine,
   * wenn es eine zweite mit demselben Namen gibt. Vorher weiß man das nicht.
   */
  return eimer.map((e) => {
    const geschwister = eimer.filter((a) => schluessel(a.name) === schluessel(e.name))
    let grund: string | null = null
    if (geschwister.length > 1) {
      grund = e.ohneMenge
        ? 'ohne Mengenangabe – nicht zusammengezählt'
        : `Einheit „${e.unit ?? '–'}" passt nicht zu den anderen Zeilen`
    }
    return {
      name: e.name,
      quantity: e.menge === null ? null : Math.round(e.menge * 1000) / 1000,
      unit: e.unit,
      fromDishes: e.gerichte,
      splitReason: grund,
    }
  })
}

/**
 * Wie eine Menge dasteht.
 *
 * 1500 g bleiben 1500 g und werden nicht zu 1,5 kg: Wer 1500 g im Rezept stehen hatte, sucht
 * im Laden nach 1500 g. Umgerechnet wird nur, was zusammengezählt wurde – und dann in die
 * kleinere Einheit, weil dort keine Nachkommastelle entsteht.
 */
export function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity === null) return unit ?? ''
  const zahl = Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',')
  return unit ? `${zahl} ${unit}` : zahl
}
