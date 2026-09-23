import { capacityRank, energyRank, type CapacityLevel, type EnergyLevel } from '@thealotta/contracts'

/**
 * Kapazität – was jemand heute realistisch tragen kann.
 *
 * Sie ändert nie die Relevanz einer Sache (INV-007), nur wie viel davon gezeigt wird.
 *
 * Diese Datei ist der Rest des früheren „Kontext"-Moduls. Die Umstandsauswahl („im
 * Supermarkt", „Telefonat möglich") wurde entfernt: Sie verlangte eine Selbstauskunft, die
 * niemand pflegt, und filterte ohne gepflegte Auskunft falsch. Kapazität dagegen wird
 * bewusst gesetzt und verändert tatsächlich, was sinnvoll ist.
 */
export function fitsCapacity(mentalEnergy: EnergyLevel, capacity: CapacityLevel): boolean {
  const budget: Record<CapacityLevel, EnergyLevel> = {
    normal: 'high',
    reduced: 'medium',
    minimal: 'low',
    paused: 'low',
  }
  return energyRank(mentalEnergy) <= energyRank(budget[capacity])
}

/**
 * Wie viele Einträge zeigt „Jetzt relevant"?
 *
 * **Eine Produktwette, keine wissenschaftliche Regel.** Die Grenze (Q-14) soll verhindern,
 * dass die Ansicht zur Todo-Liste wird. Naheliegend wäre die Begründung „zu viel Auswahl
 * überfordert" – die trägt aber nicht: Die große Meta-Analyse zu Choice Overload
 * (Scheibehenne, Greifeneder & Todd 2010, 63 Bedingungen aus 50 Experimenten, N = 5.036)
 * findet einen mittleren Effekt von praktisch **null**. Eine zweite Meta-Analyse (Chernev
 * et al. 2015) findet Moderatoren, von denen einige hier zutreffen könnten – belegt ist das
 * für diesen Kontext nicht.
 *
 * Die Grenze bleibt, weil sie eine Produktentscheidung stützt („dies ist keine Liste"), nicht
 * weil Forschung sie fordert. Sie ist über `NOW_LIMIT` verstellbar, damit sie sich messen
 * lässt statt geglaubt werden zu müssen (docs/60 R3).
 */
export function nowLimitFor(capacity: CapacityLevel, limits: NowLimits = NOW_LIMIT): number {
  return capacityRank(capacity) >= capacityRank('minimal') ? limits.reduziert : limits.normal
}

export interface NowLimits {
  /** Bei „Normal". */
  normal: number
  /** Ab „Sehr wenig" – wer wenig Kapazität angibt, bekommt eine Sache, nicht drei. */
  reduziert: number
}

/**
 * Die Vorgabe. Verstellbar, um 3 gegen 7 zu messen (docs/60, Validierungsplan):
 * `THEALOTTA_NOW_LIMIT=7` setzt den Normalwert.
 */
export const NOW_LIMIT: NowLimits = {
  normal: leseGrenze(3),
  reduziert: 1,
}

function leseGrenze(vorgabe: number): number {
  /*
    Der alte Name wird noch gelesen (§23). Diese Variable steht in Deployment-Konfiguration
    außerhalb dieses Verzeichnisses; sie dort still fallen zu lassen hieße, eine bewusst
    gesetzte Grenze ohne Meldung durch die Vorgabe zu ersetzen.
  */
  const umgebung = typeof process !== 'undefined' ? process.env : undefined
  const roh = umgebung?.['THEALOTTA_NOW_LIMIT'] ?? umgebung?.['MIRA_NOW_LIMIT']
  const zahl = Number(roh)
  // Keine unsinnigen Werte übernehmen: Eine Grenze von 0 wäre eine leere Seite.
  return Number.isInteger(zahl) && zahl >= 1 && zahl <= 20 ? zahl : vorgabe
}
