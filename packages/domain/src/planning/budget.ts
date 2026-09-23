import type { CapacityLevel } from '@thealotta/contracts'

/**
 * Wie viele Minuten Arbeit trägt ein Tag?
 *
 * **Eine Produktwette, keine wissenschaftliche Regel** – im selben Sinn wie die Grenze in
 * `capacity.ts`. Es gibt keine Studie, die einer Kapazitätsstufe eine Minutenzahl zuordnet.
 * Die Zahlen sind ein Anfangswert, damit überhaupt etwas Messbares dasteht; verstellbar
 * über `THEALOTTA_DAY_BUDGET` (Minuten bei „Normal"), damit man sie prüfen kann statt
 * glauben zu müssen.
 *
 * Was dagegen belegt ist: dass Menschen den eigenen Aufwand systematisch unterschätzen
 * (Planungsfehlschluss, Buehler/Griffin/Ross 1994). Deshalb gibt es `SLACK_UTILISATION`.
 */
export function dayBudgetMinutes(capacity: CapacityLevel, normal = DAY_BUDGET_NORMAL): number {
  switch (capacity) {
    case 'normal':
      return normal
    case 'reduced':
      return Math.round(normal / 2)
    case 'minimal':
      return Math.round(normal / 6)
    case 'paused':
      // Null wäre eine leere Ansicht. Eine einzige kleine Sache bleibt möglich – mehr nicht.
      return 15
  }
}

/**
 * Wie viel des Budgets darf verplant werden?
 *
 * 0,693 ist keine gefühlte Zahl: Es ist die Auslastungsschranke für ratenmonotone Planung
 * bei vielen Aufgaben (Liu & Layland 1973, n·(2^(1/n)−1) → ln 2). Dort garantiert sie, dass
 * jede Frist gehalten wird; hier tut sie dasselbe für einen Tag, der nicht sofort kippt,
 * wenn eine Sache länger dauert als gedacht.
 *
 * Der Übertrag von Prozessorlast auf Menschentage ist eine Analogie, kein Beweis – das
 * steht so in docs/80. Der Wert ist aber nachvollziehbar begründet, und das ist mehr, als
 * „plane 80 % ein" für sich beanspruchen kann.
 */
export const SLACK_UTILISATION = 0.693

/** Vorgabe bei „Normal". Verstellbar, um 90 gegen 180 zu messen. */
export const DAY_BUDGET_NORMAL = leseBudget(120)

/**
 * Wie lange dauert eine Sache ohne Schätzung?
 *
 * Nicht 0 – sonst wären unschätzbare Aufgaben gratis und die Ansicht liefe über. Nicht
 * unendlich – sonst kämen sie nie vor. 30 Minuten ist die Annahme; sie steht hier an einer
 * Stelle, damit sie sichtbar ist.
 */
export const ASSUMED_MINUTES = 30

function leseBudget(vorgabe: number): number {
  const umgebung = typeof process !== 'undefined' ? process.env : undefined
  const zahl = Number(umgebung?.['THEALOTTA_DAY_BUDGET'])
  return Number.isInteger(zahl) && zahl >= 15 && zahl <= 960 ? zahl : vorgabe
}
