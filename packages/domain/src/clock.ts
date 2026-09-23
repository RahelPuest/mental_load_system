/**
 * Zeit ist eine Abhängigkeit, kein globaler Zustand.
 *
 * Ohne diese Indirektion wären Freshness-, Monitoring- und Vertretungslogik nur mit echten
 * Wartezeiten testbar. Eine Lint-Regel verbietet `new Date()` innerhalb von `packages/domain`.
 */
export interface Clock {
  now(): Date
}

// Die einzige Stelle in der Domänenschicht, die die Systemuhr lesen darf.
// eslint-disable-next-line no-restricted-syntax
export const systemClock: Clock = { now: () => new Date() }

/** Testuhr: startbar an beliebigem Zeitpunkt, vorspulbar ohne echtes Warten. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current.getTime())
  }
  set(d: Date): void {
    this.current = new Date(d.getTime())
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms)
  }
  advanceDays(days: number): void {
    this.advance(days * 86_400_000)
  }
  advanceWeeks(weeks: number): void {
    this.advanceDays(weeks * 7)
  }
}

export const MS = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 } as const

/**
 * Minimaler ISO-8601-Dauer-Parser für die im Produkt genutzten Intervalle (P6W, P3M, PT30M …).
 * Monate/Jahre werden kalendarisch gerechnet, alles andere exakt.
 */
export function addIsoDuration(from: Date, iso: string): Date {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso)
  if (!m) throw new Error(`Ungültige ISO-8601-Dauer: ${iso}`)
  const [, y, mo, w, d, h, mi, s] = m
  const out = new Date(from.getTime())
  if (y) out.setUTCFullYear(out.getUTCFullYear() + Number(y))
  if (mo) out.setUTCMonth(out.getUTCMonth() + Number(mo))
  let ms = 0
  if (w) ms += Number(w) * MS.week
  if (d) ms += Number(d) * MS.day
  if (h) ms += Number(h) * MS.hour
  if (mi) ms += Number(mi) * MS.minute
  if (s) ms += Number(s) * MS.second
  return new Date(out.getTime() + ms)
}

export function isoDurationToMs(iso: string): number {
  const base = new Date(0)
  return addIsoDuration(base, iso).getTime() - base.getTime()
}
