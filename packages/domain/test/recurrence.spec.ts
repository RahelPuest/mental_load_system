import { describe, expect, it } from 'vitest'
import { describeRecurrence } from '@thealotta/contracts'
import { isFinished, nextOccurrence, nthWeekdayOf, readRecurrence } from '../src/monitors/recurrence.js'

/**
 * Wiederholungsmuster.
 *
 * Datumsarithmetik ist die Sorte Code, die fast immer funktioniert und an vier Tagen im Jahr
 * nicht: am 29. Februar, am 31. eines kurzen Monats, über den Jahreswechsel und bei der
 * Zeitumstellung. Genau die stehen hier.
 */
const D = (iso: string) => new Date(iso)
/* `null` heisst: die Reihe ist zu Ende. Im Test soll das sichtbar sein, nicht abstuerzen. */
const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? 'keiner'

describe('readRecurrence', () => {
  it('liest die drei Formen', () => {
    expect(readRecurrence({ every: 'P3D' })).toEqual({ every: 'P3D' })
    expect(readRecurrence({ weekdays: [1, 4] })).toEqual({ weekdays: [1, 4] })
    expect(readRecurrence({ monthday: 15 })).toEqual({ monthday: 15 })
  })

  it('sortiert Wochentage und wirft Doppelte weg', () => {
    expect(readRecurrence({ weekdays: [4, 1, 4] })).toEqual({ weekdays: [1, 4] })
  })

  it('nimmt keine unmöglichen Werte an', () => {
    expect(readRecurrence({ weekdays: [7, -1, 'Montag'] })).toBeNull()
    expect(readRecurrence({ monthday: 0 })).toBeNull()
    expect(readRecurrence({ monthday: 32 })).toBeNull()
    expect(readRecurrence({})).toBeNull()
  })

  it('Wochentage gehen vor – wer beides speichert, meint das Genauere', () => {
    expect(readRecurrence({ weekdays: [2], every: 'P1D' })).toEqual({ weekdays: [2] })
  })
})

describe('nextOccurrence – alle N Tage', () => {
  it('zählt ab dem letzten Mal', () => {
    expect(day(nextOccurrence({ every: 'P3D' }, D('2026-03-10T09:00:00Z')))).toBe('2026-03-13')
  })

  it('verschiebt sich mit, wenn ein Termin verpasst wurde', () => {
    /*
     * „Alle drei Tage" heißt: drei Tage nach dem letzten Mal – nicht an einem festen Raster.
     * Wäsche, die zwei Tage liegen bleibt, ist nicht plötzlich zweimal fällig.
     */
    const spaet = nextOccurrence({ every: 'P3D' }, D('2026-03-20T09:00:00Z'))
    expect(day(spaet)).toBe('2026-03-23')
  })

  it('liefert nie denselben Tag noch einmal', () => {
    const next = nextOccurrence({ every: 'P0D' }, D('2026-03-10T09:00:00Z'))
    expect(next!.getTime()).toBeGreaterThan(D('2026-03-10T09:00:00Z').getTime())
  })
})

describe('nextOccurrence – an bestimmten Wochentagen', () => {
  // 2026-03-10 ist ein Dienstag.
  it('findet den nächsten passenden Tag', () => {
    expect(day(nextOccurrence({ weekdays: [4] }, D('2026-03-10T09:00:00Z')))).toBe('2026-03-12')
  })

  it('nimmt bei mehreren den nächstliegenden', () => {
    expect(day(nextOccurrence({ weekdays: [1, 4] }, D('2026-03-10T09:00:00Z')))).toBe('2026-03-12')
    expect(day(nextOccurrence({ weekdays: [1, 4] }, D('2026-03-12T09:00:00Z')))).toBe('2026-03-16')
  })

  it('springt über das Wochenende ins nächste Jahr', () => {
    // 2026-12-31 ist ein Donnerstag; der nächste Montag liegt im neuen Jahr.
    expect(day(nextOccurrence({ weekdays: [1] }, D('2026-12-31T09:00:00Z')))).toBe('2027-01-04')
  })

  it('am eigenen Wochentag kommt erst der nächste – nicht noch einmal heute', () => {
    // Dienstag, Muster „dienstags": nicht heute Abend wieder.
    expect(day(nextOccurrence({ weekdays: [2] }, D('2026-03-10T09:00:00Z')))).toBe('2026-03-17')
  })
})

describe('nextOccurrence – am N-ten des Monats', () => {
  it('findet den nächsten Monatstag', () => {
    expect(day(nextOccurrence({ monthday: 15 }, D('2026-03-10T09:00:00Z')))).toBe('2026-03-15')
  })

  it('springt in den Folgemonat, wenn der Tag vorbei ist', () => {
    expect(day(nextOccurrence({ monthday: 5 }, D('2026-03-10T09:00:00Z')))).toBe('2026-04-05')
  })

  it('der 31. wird in kurzen Monaten zum letzten Tag – nicht zum ersten des nächsten', () => {
    expect(day(nextOccurrence({ monthday: 31 }, D('2026-03-31T09:00:00Z')))).toBe('2026-04-30')
    expect(day(nextOccurrence({ monthday: 31 }, D('2026-01-31T09:00:00Z')))).toBe('2026-02-28')
  })

  it('im Schaltjahr endet der Februar später', () => {
    expect(day(nextOccurrence({ monthday: 30 }, D('2028-01-31T09:00:00Z')))).toBe('2028-02-29')
  })

  it('über den Jahreswechsel', () => {
    expect(day(nextOccurrence({ monthday: 3 }, D('2026-12-20T09:00:00Z')))).toBe('2027-01-03')
  })
})

describe('describeRecurrence', () => {
  it('sagt das Muster so, wie man es aussprechen würde', () => {
    expect(describeRecurrence({ weekdays: [1] })).toBe('montags')
    expect(describeRecurrence({ weekdays: [1, 4] })).toBe('montags und donnerstags')
    expect(describeRecurrence({ weekdays: [1, 3, 5] })).toBe('montags, mittwochs und freitags')
    expect(describeRecurrence({ monthday: 15 })).toBe('am 15. jedes Monats')
    expect(describeRecurrence({ every: 'P1D' })).toBe('täglich')
    expect(describeRecurrence({ every: 'P3D' })).toBe('alle 3 Tage')
    expect(describeRecurrence({ every: 'P1W' })).toBe('jede Woche')
    expect(describeRecurrence({ every: 'P2W' })).toBe('alle 2 Wochen')
    expect(describeRecurrence({ every: 'P1M' })).toBe('jeden Monat')
  })

  it('enthält nie einen Modellbegriff – auch nicht bei unbekanntem Rhythmus', () => {
    for (const rule of [{ every: 'P1D' }, { weekdays: [0, 6] }, { monthday: 1 }]) {
      expect(describeRecurrence(rule)).not.toMatch(/[A-Z]{2,}|P\d|weekday|monthday/)
    }
  })
})

describe('Startdatum', () => {
  it('vor dem ersten Termin ist der erste Termin der nächste', () => {
    expect(day(nextOccurrence({ startsOn: '2026-04-01', every: 'P1D' }, D('2026-03-10T09:00:00Z')))).toBe('2026-04-01')
  })

  it('am Starttag selbst geht es normal weiter', () => {
    expect(day(nextOccurrence({ startsOn: '2026-03-10', every: 'P3D' }, D('2026-03-10T09:00:00Z')))).toBe('2026-03-13')
  })

  it('gilt auch für Wochentage – vorher passiert nichts', () => {
    // 2026-03-12 ist ein Donnerstag; Start erst im April.
    expect(day(nextOccurrence({ startsOn: '2026-04-01', weekdays: [4] }, D('2026-03-10T09:00:00Z')))).toBe('2026-04-01')
  })
})

describe('Ende der Reihe', () => {
  it('nach dem Enddatum gibt es keinen Termin mehr', () => {
    expect(nextOccurrence({ every: 'P1D', until: '2026-03-10' }, D('2026-03-10T09:00:00Z'))).toBeNull()
  })

  it('ein Termin am Enddatum selbst zählt noch', () => {
    expect(day(nextOccurrence({ every: 'P1D', until: '2026-03-11' }, D('2026-03-10T09:00:00Z')))).toBe('2026-03-11')
  })

  it('isFinished zählt die Male', () => {
    expect(isFinished({ every: 'P1D', count: 3 }, D('2026-03-10T09:00:00Z'), 2)).toBe(false)
    expect(isFinished({ every: 'P1D', count: 3 }, D('2026-03-10T09:00:00Z'), 3)).toBe(true)
  })

  it('isFinished kennt auch das Enddatum', () => {
    expect(isFinished({ every: 'P1D', until: '2026-03-11' }, D('2026-03-11T23:00:00Z'), 0)).toBe(false)
    expect(isFinished({ every: 'P1D', until: '2026-03-11' }, D('2026-03-12T01:00:00Z'), 0)).toBe(true)
  })

  it('ohne Ende ist nie Schluss', () => {
    expect(isFinished({ every: 'P1D' }, D('2099-01-01T00:00:00Z'), 10_000)).toBe(false)
  })
})

describe('Am n-ten Wochentag des Monats', () => {
  it('findet den zweiten Dienstag', () => {
    // März 2026: 1. ist ein Sonntag, also Dienstage am 3., 10., 17., 24., 31.
    expect(day(nthWeekdayOf(2026, 2, 2, 2))).toBe('2026-03-10')
  })

  it('findet den ersten Montag', () => {
    expect(day(nthWeekdayOf(2026, 2, 1, 1))).toBe('2026-03-02')
  })

  it('findet den letzten Freitag', () => {
    expect(day(nthWeekdayOf(2026, 2, -1, 5))).toBe('2026-03-27')
  })

  it('springt in den Folgemonat, wenn der Tag vorbei ist', () => {
    const nach = nextOccurrence({ nthWeekday: { nth: 2, weekday: 2 } }, D('2026-03-10T09:00:00Z'))
    expect(day(nach)).toBe('2026-04-14')
  })

  it('der letzte Wochentag klappt auch über den Jahreswechsel', () => {
    expect(day(nextOccurrence({ nthWeekday: { nth: -1, weekday: 1 } }, D('2026-12-29T09:00:00Z')))).toBe('2027-01-25')
  })
})

describe('Jährlich', () => {
  it('ein Jahr weiter, am selben Tag', () => {
    expect(day(nextOccurrence({ every: 'P1Y' }, D('2026-03-10T09:00:00Z')))).toBe('2027-03-10')
  })
})

describe('readRecurrence – die neuen Felder', () => {
  it('liest Start, Ende und Anzahl', () => {
    expect(readRecurrence({ every: 'P1D', startsOn: '2026-03-01', until: '2026-04-01', count: 5 })).toEqual({
      every: 'P1D',
      startsOn: '2026-03-01',
      until: '2026-04-01',
      count: 5,
    })
  })

  it('nimmt kein Datum an, das keines ist', () => {
    expect(readRecurrence({ every: 'P1D', startsOn: 'morgen' })).toEqual({ every: 'P1D' })
    expect(readRecurrence({ every: 'P1D', until: '01.04.2026' })).toEqual({ every: 'P1D' })
  })

  it('liest den n-ten Wochentag und weist Unmögliches ab', () => {
    expect(readRecurrence({ nthWeekday: { nth: 2, weekday: 2 } })).toEqual({ nthWeekday: { nth: 2, weekday: 2 } })
    expect(readRecurrence({ nthWeekday: { nth: 9, weekday: 2 } })).toBeNull()
    expect(readRecurrence({ nthWeekday: { nth: -1, weekday: 5 } })).toEqual({ nthWeekday: { nth: -1, weekday: 5 } })
  })
})

describe('describeRecurrence – die neuen Muster', () => {
  it('nennt den n-ten Wochentag', () => {
    expect(describeRecurrence({ nthWeekday: { nth: 2, weekday: 2 } })).toBe('am zweiten Dienstag jedes Monats')
    expect(describeRecurrence({ nthWeekday: { nth: -1, weekday: 5 } })).toBe('am letzten Freitag jedes Monats')
  })

  it('Montag bis Freitag hat einen eigenen Namen', () => {
    expect(describeRecurrence({ weekdays: [1, 2, 3, 4, 5] })).toBe('an jedem Werktag')
    // Vier Tage sind noch keine Werktage.
    expect(describeRecurrence({ weekdays: [1, 2, 3, 4] })).toBe('montags, dienstags, mittwochs und donnerstags')
  })

  it('nennt das Jahr', () => {
    expect(describeRecurrence({ every: 'P1Y' })).toBe('jedes Jahr')
    expect(describeRecurrence({ every: 'P2Y' })).toBe('alle 2 Jahre')
  })

  it('hängt das Ende an', () => {
    expect(describeRecurrence({ weekdays: [4], until: '2026-12-31' })).toBe('donnerstags, bis zum 31.12.2026')
    expect(describeRecurrence({ every: 'P1D', count: 5 })).toBe('täglich, 5-mal')
  })

  it('bleibt frei von Modellbegriffen', () => {
    const alle = [
      { nthWeekday: { nth: 1, weekday: 0 } },
      { weekdays: [1, 2, 3, 4, 5] },
      { every: 'P1Y', until: '2030-01-01' },
      { monthday: 1, count: 3 },
    ]
    for (const rule of alle) {
      expect(describeRecurrence(rule)).not.toMatch(/[A-Z]{2,}|P\d|weekday|monthday|until|count/)
    }
  })
})
