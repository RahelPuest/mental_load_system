import type { Recurrence } from '@thealotta/contracts'
import { MS, addIsoDuration } from '../clock.js'

/**
 * Wiederholungsmuster: die Rechnung. Der Wortlaut steht in `@thealotta/contracts`.
 *
 * Drei Formen, die im Haushalt tatsächlich vorkommen:
 *
 *   { every: 'P3D' }        alle drei Tage – gezählt ab dem letzten Mal
 *   { weekdays: [1, 4] }    montags und donnerstags
 *   { monthday: 15 }        am 15. jedes Monats
 *
 * Der Unterschied zwischen der ersten und den beiden anderen ist wichtig: „alle drei Tage"
 * verschiebt sich mit, wenn man einen Termin verpasst; „montags" nicht. Beides ist gewollt –
 * Wäsche alle drei Tage rutscht mit, der Müll kommt donnerstags.
 *
 * Alles rechnet in UTC-Kalendertagen. Das ist bewusst grob: Eine regelmäßige Aufgabe wird an
 * einem Tag fällig, nicht zu einer Uhrzeit.
 */


export const startOfUtcDay = (d: Date): Date => {
  const x = new Date(d.getTime())
  x.setUTCHours(0, 0, 0, 0)
  return x
}

const addDays = (d: Date, n: number): Date => new Date(startOfUtcDay(d).getTime() + n * MS.day)

/** Ein Muster aus einer gespeicherten Konfiguration lesen – ohne ihr zu vertrauen. */
export function readRecurrence(config: Record<string, unknown>): Recurrence | null {
  const tag = (v: unknown): string | undefined =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined

  const grenzen: Recurrence = {}
  const startsOn = tag(config['startsOn'])
  if (startsOn) grenzen.startsOn = startsOn
  const until = tag(config['until'])
  if (until) grenzen.until = until
  const count = config['count']
  if (typeof count === 'number' && count >= 1) grenzen.count = Math.floor(count)

  const nth = config['nthWeekday']
  if (nth && typeof nth === 'object') {
    const n = (nth as Record<string, unknown>)['nth']
    const w = (nth as Record<string, unknown>)['weekday']
    if (typeof n === 'number' && typeof w === 'number' && w >= 0 && w <= 6 && (n === -1 || (n >= 1 && n <= 4))) {
      return { ...grenzen, nthWeekday: { nth: n, weekday: w } }
    }
  }

  const weekdays = Array.isArray(config['weekdays'])
    ? [...new Set(config['weekdays'].filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6))].sort()
    : []
  if (weekdays.length > 0) return { ...grenzen, weekdays }

  const monthday = config['monthday']
  if (typeof monthday === 'number' && monthday >= 1 && monthday <= 31) return { ...grenzen, monthday }

  const every = config['every']
  if (typeof every === 'string' && every.length > 0) return { ...grenzen, every }

  return null
}

const parseTag = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`)

/** Der n-te Wochentag eines Monats – `nth: -1` ist der letzte. */
export function nthWeekdayOf(year: number, month: number, nth: number, weekday: number): Date {
  if (nth === -1) {
    const letzter = new Date(Date.UTC(year, month + 1, 0))
    const zurueck = (letzter.getUTCDay() - weekday + 7) % 7
    return new Date(Date.UTC(year, month, letzter.getUTCDate() - zurueck))
  }
  const erster = new Date(Date.UTC(year, month, 1))
  const vor = (weekday - erster.getUTCDay() + 7) % 7
  return new Date(Date.UTC(year, month, 1 + vor + (nth - 1) * 7))
}

/**
 * Der nächste Fälligkeitstag nach `after`.
 *
 * `after` ist der Zeitpunkt, ab dem gesucht wird – in der Regel „das letzte Mal" oder „jetzt".
 * Der zurückgegebene Tag liegt immer echt danach, nie am selben Tag: Sonst würde eine Aufgabe,
 * die man morgens erledigt, am selben Abend erneut fällig.
 *
 * `null` heißt: Die Reihe ist zu Ende (`until` überschritten).
 */
export function nextOccurrence(rule: Recurrence, after: Date): Date | null {
  // Vor dem ersten Termin ist der erste Termin der nächste.
  if (rule.startsOn) {
    const start = parseTag(rule.startsOn)
    if (start.getTime() > startOfUtcDay(after).getTime()) return withinLimit(rule, start)
  }

  if (rule.nthWeekday) {
    const start = startOfUtcDay(after)
    for (let step = 0; step <= 2; step += 1) {
      const kandidat = nthWeekdayOf(
        start.getUTCFullYear(),
        start.getUTCMonth() + step,
        rule.nthWeekday.nth,
        rule.nthWeekday.weekday,
      )
      if (kandidat.getTime() > start.getTime()) return withinLimit(rule, kandidat)
    }
    return null
  }

  if (rule.weekdays && rule.weekdays.length > 0) {
    const start = startOfUtcDay(after)
    for (let offset = 1; offset <= 7; offset += 1) {
      const kandidat = addDays(start, offset)
      if (rule.weekdays.includes(kandidat.getUTCDay())) return withinLimit(rule, kandidat)
    }
    return withinLimit(rule, addDays(start, 7))
  }

  if (rule.monthday) {
    const start = startOfUtcDay(after)
    for (let step = 0; step <= 2; step += 1) {
      const jahr = start.getUTCFullYear()
      const monat = start.getUTCMonth() + step
      // Kürzere Monate: Der 31. wird zum 30., 29. oder 28. – nicht zum 1. des nächsten.
      const letzterTag = new Date(Date.UTC(jahr, monat + 1, 0)).getUTCDate()
      const tag = Math.min(rule.monthday, letzterTag)
      const kandidat = new Date(Date.UTC(jahr, monat, tag))
      if (kandidat.getTime() > start.getTime()) return withinLimit(rule, kandidat)
    }
    return withinLimit(rule, addDays(start, 30))
  }

  const next = addIsoDuration(after, rule.every ?? 'P1M')
  // Auch hier: nie am selben Tag noch einmal.
  return withinLimit(rule, next.getTime() > after.getTime() ? next : addDays(after, 1))
}

/** Nach dem Enddatum gibt es keinen Termin mehr. */
function withinLimit(rule: Recurrence, kandidat: Date): Date | null {
  if (!rule.until) return kandidat
  // Einschließlich: Ein Termin am Enddatum selbst zählt noch.
  const ende = parseTag(rule.until)
  return startOfUtcDay(kandidat).getTime() > ende.getTime() ? null : kandidat
}

/**
 * Ob die Reihe zu Ende ist.
 *
 * Zwei Arten von Ende, die Kalender üblicherweise anbieten: an einem Datum, oder nach einer
 * Anzahl. Die Anzahl braucht einen Blick nach außen – wie oft schon etwas entstanden ist,
 * weiß das Muster selbst nicht.
 */
export function isFinished(rule: Recurrence, now: Date, occurrencesSoFar: number): boolean {
  if (rule.count !== undefined && occurrencesSoFar >= rule.count) return true
  if (rule.until && startOfUtcDay(now).getTime() > parseTag(rule.until).getTime()) return true
  return false
}
