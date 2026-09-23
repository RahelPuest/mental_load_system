/**
 * Wiederholungsmuster – Vokabular und Wortlaut.
 *
 * Steht hier und nicht in der Domänenschicht, weil beide Seiten denselben Satz brauchen: Der
 * Server schreibt ihn in die Begründung des Signals, die Oberfläche zeigt ihn als Vorschau,
 * bevor die Regel überhaupt existiert. Zwei Formulierungen desselben Musters würden
 * auseinanderlaufen, und niemand würde es merken.
 *
 * Die Datumsarithmetik bleibt in `@thealotta/domain` – die gehört nicht ins Vokabular.
 */

export interface Recurrence {
  /**
   * Der erste Termin, als Kalendertag (`YYYY-MM-DD`).
   *
   * Ohne ihn hinge die Wiederholung am Zeitpunkt der letzten Auswertung – eine Aufgabe „am
   * 15." wäre dann am 15. fällig oder auch am 16., je nachdem wann der Auswerter lief. Mit
   * Startdatum ist die Reihe von Anfang an festgelegt.
   */
  startsOn?: string
  /** ISO-8601-Dauer, z. B. `P3D`, `P2W`, `P1M`, `P1Y`. */
  every?: string
  /** Wochentage, 0 = Sonntag … 6 = Samstag. */
  weekdays?: number[]
  /** Tag im Monat, 1–31. Kürzere Monate enden am letzten Tag. */
  monthday?: number
  /** „Am zweiten Dienstag": `nth` 1–4 oder -1 für den letzten. */
  nthWeekday?: { nth: number; weekday: number }
  /** Letzter möglicher Termin (`YYYY-MM-DD`), einschließlich. */
  until?: string
  /** Endet nach so vielen Terminen. */
  count?: number
}

const TAG_NAMEN = ['sonntags', 'montags', 'dienstags', 'mittwochs', 'donnerstags', 'freitags', 'samstags']
const TAG_EINZAHL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const ORDNUNG: Record<number, string> = { 1: 'ersten', 2: 'zweiten', 3: 'dritten', 4: 'vierten', [-1]: 'letzten' }

const tagListe = (tage: number[]): string => {
  const namen = [...tage].sort().map((d) => TAG_NAMEN[d] ?? '?')
  if (namen.length === 1) return namen[0]!
  return `${namen.slice(0, -1).join(', ')} und ${namen[namen.length - 1]}`
}

/**
 * Wie das Muster in einem Satz heißt – dieselbe Formulierung in Signal und Oberfläche.
 *
 * Rhythmus und Ende sind getrennt abrufbar, weil sie im Satz nicht nebeneinander stehen:
 * „ist donnerstags dran, bis zum 31.12." – nicht „ist donnerstags, bis zum 31.12. dran".
 */
export function describeRecurrence(rule: Recurrence): string {
  return describeRhythm(rule) + describeLimit(rule)
}

/** Nur der Rhythmus: „donnerstags", „am 12. jedes Monats", „jedes Jahr". */
export function describeRhythm(rule: Recurrence): string {
  return kernSatz(rule)
}

/** Nur das Ende: „", „, bis zum 31.12.2026", „, 6-mal". */
export function describeLimit(rule: Recurrence): string {
  if (rule.until) return `, bis zum ${formatTag(rule.until)}`
  if (rule.count !== undefined) return `, ${rule.count}-mal`
  return ''
}

function kernSatz(rule: Recurrence): string {
  if (rule.nthWeekday) {
    const { nth, weekday } = rule.nthWeekday
    return `am ${ORDNUNG[nth] ?? `${nth}.`} ${TAG_EINZAHL[weekday] ?? '?'} jedes Monats`
  }

  if (rule.weekdays && rule.weekdays.length > 0) {
    // Montag bis Freitag ist so häufig, dass es einen eigenen Namen verdient.
    const werktags = [1, 2, 3, 4, 5]
    if (rule.weekdays.length === 5 && werktags.every((d) => rule.weekdays!.includes(d))) return 'an jedem Werktag'
    return tagListe(rule.weekdays)
  }

  if (rule.monthday) return `am ${rule.monthday}. jedes Monats`

  const every = rule.every ?? 'P1M'
  const match = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(every)
  if (match?.[1]) return Number(match[1]) === 1 ? 'jedes Jahr' : `alle ${match[1]} Jahre`
  if (match?.[2]) return Number(match[2]) === 1 ? 'jeden Monat' : `alle ${match[2]} Monate`
  if (match?.[3]) return Number(match[3]) === 1 ? 'jede Woche' : `alle ${match[3]} Wochen`
  if (match?.[4]) return Number(match[4]) === 1 ? 'täglich' : `alle ${match[4]} Tage`
  return `im Rhythmus ${every}`
}

/** `2026-04-01` → `01.04.2026` – so, wie ein Datum hier überall geschrieben wird. */
function formatTag(iso: string): string {
  const [jahr, monat, tag] = iso.split('-')
  return `${tag}.${monat}.${jahr}`
}
