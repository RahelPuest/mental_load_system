import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { IcsParseError, parseIcs, parseIcsDate } from '../src/calendar/ics.js'

/**
 * Zeitzonen- und Sommerzeittests (docs/22 §5).
 *
 * Diese Fälle sind der häufigste Grund für falsche Erinnerungen in Kalenderprodukten –
 * und ein falscher Arzttermin ist genau die Art von Fehler, die das Produktversprechen bricht.
 */
const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//DE\r\n${body}\r\nEND:VCALENDAR`

const event = (props: string) => wrap(`BEGIN:VEVENT\r\n${props}\r\nEND:VEVENT`)

describe('ICS-Parser', () => {
  it('liest einen einfachen Termin mit Zeitzone', () => {
    const { events } = parseIcs(
      event('UID:evt-1\r\nSUMMARY:Kinderarzt Kind A\r\nDTSTART;TZID=Europe/Berlin:20261114T143000\r\nDTEND;TZID=Europe/Berlin:20261114T150000\r\nSEQUENCE:0'),
    )
    expect(events).toHaveLength(1)
    expect(events[0]!.summary).toBe('Kinderarzt Kind A')
    expect(events[0]!.timeZone).toBe('Europe/Berlin')
    // 14:30 Berlin im November = 13:30 UTC
    expect(events[0]!.startsAt.toISOString()).toBe('2026-11-14T13:30:00.000Z')
  })

  it('behandelt Ganztagestermine als lokale Datumsgrenzen, nicht als UTC-Mitternacht', () => {
    const { events } = parseIcs(
      event('UID:evt-2\r\nSUMMARY:Ferienbeginn\r\nDTSTART;VALUE=DATE:20260720\r\nDTEND;VALUE=DATE:20260721'),
      { defaultTimeZone: 'Europe/Berlin' },
    )
    expect(events[0]!.allDay).toBe(true)
    // Mitternacht Berlin im Sommer = 22:00 UTC am Vortag
    expect(events[0]!.startsAt.toISOString()).toBe('2026-07-19T22:00:00.000Z')
  })

  it('rechnet über die Sommerzeit-Umstellung korrekt', () => {
    // Rückstellung in Europe/Berlin: 2026-10-25, 03:00 → 02:00
    const before = parseIcsDate('20261024T140000', { TZID: 'Europe/Berlin' }, 'UTC')
    const after = parseIcsDate('20261026T140000', { TZID: 'Europe/Berlin' }, 'UTC')
    expect(before.date.toISOString()).toBe('2026-10-24T12:00:00.000Z') // MESZ, UTC+2
    expect(after.date.toISOString()).toBe('2026-10-26T13:00:00.000Z') // MEZ, UTC+1
  })

  it('behandelt eine lokal nicht existierende Zeit ohne abzustürzen', () => {
    // Vorstellung 2026-03-29: 02:00 → 03:00, 02:30 existiert nicht.
    const parsed = parseIcsDate('20260329T023000', { TZID: 'Europe/Berlin' }, 'UTC')
    expect(parsed.date instanceof Date).toBe(true)
    expect(Number.isNaN(parsed.date.getTime())).toBe(false)
    // Luxon verschiebt in die gültige Zeit – wichtig ist, dass kein ungültiges Datum entsteht.
    expect(DateTime.fromJSDate(parsed.date).isValid).toBe(true)
  })

  it('erkennt Serien, Ausnahmen und abweichende Einzelinstanzen', () => {
    const ics = wrap(
      [
        'BEGIN:VEVENT',
        'UID:serie-1',
        'SUMMARY:Musikschule',
        'DTSTART;TZID=Europe/Berlin:20260907T160000',
        'DTEND;TZID=Europe/Berlin:20260907T170000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO',
        'EXDATE;TZID=Europe/Berlin:20261005T160000',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:serie-1',
        'RECURRENCE-ID;TZID=Europe/Berlin:20260914T160000',
        'SUMMARY:Musikschule (verlegt)',
        'DTSTART;TZID=Europe/Berlin:20260914T173000',
        'DTEND;TZID=Europe/Berlin:20260914T183000',
        'SEQUENCE:2',
        'END:VEVENT',
      ].join('\r\n'),
    )
    const { events } = parseIcs(ics)
    expect(events).toHaveLength(2)

    const master = events.find((e) => e.recurrenceId === '')!
    expect(master.rrule).toBe('FREQ=WEEKLY;BYDAY=MO')
    expect(master.exdates).toHaveLength(1)

    const exception = events.find((e) => e.recurrenceId !== '')!
    expect(exception.summary).toBe('Musikschule (verlegt)')
    expect(exception.sequence).toBe(2)
  })

  it('entfaltet umgebrochene Zeilen (RFC 5545 §3.1)', () => {
    const ics = wrap(
      // Beim Falten wird CRLF + ein Zeichen eingefügt; das Leerzeichen gehört zum Inhalt
      // und steht deshalb noch am Ende der ersten Zeile (RFC 5545 §3.1).
      ['BEGIN:VEVENT', 'UID:evt-3', 'DTSTART:20260907T100000Z', 'SUMMARY:Ein sehr langer ', ' Titel über zwei Zeilen', 'END:VEVENT'].join('\r\n'),
    )
    const { events } = parseIcs(ics)
    expect(events[0]!.summary).toBe('Ein sehr langer Titel über zwei Zeilen')
  })

  it('demaskiert Sonderzeichen korrekt', () => {
    const { events } = parseIcs(event('UID:evt-4\r\nDTSTART:20260907T100000Z\r\nSUMMARY:Arzt\\, Zahn\\nZweite Zeile'))
    expect(events[0]!.summary).toBe('Arzt, Zahn\nZweite Zeile')
  })

  it('übernimmt STATUS:CANCELLED statt den Termin zu verlieren', () => {
    const { events } = parseIcs(event('UID:evt-5\r\nDTSTART:20260907T100000Z\r\nSTATUS:CANCELLED'))
    expect(events[0]!.status).toBe('cancelled')
  })

  it('ergänzt ein fehlendes DTEND sinnvoll', () => {
    const { events } = parseIcs(event('UID:evt-6\r\nDTSTART:20260907T100000Z\r\nSUMMARY:Ohne Ende'))
    expect(events[0]!.endsAt.getTime() - events[0]!.startsAt.getTime()).toBe(3_600_000)
  })

  it('begrenzt übergroße Eingaben – Kalenderdaten sind nicht vertrauenswürdig', () => {
    const huge = wrap(Array.from({ length: 200 }, (_, i) => `BEGIN:VEVENT\r\nUID:e${i}\r\nDTSTART:20260907T100000Z\r\nEND:VEVENT`).join('\r\n'))
    expect(() => parseIcs(huge, { maxEvents: 10 })).toThrowError(IcsParseError)
    expect(() => parseIcs('X'.repeat(10) + '\n'.repeat(50), { maxLines: 5 })).toThrowError(IcsParseError)
  })

  it('ignoriert unbekannte Eigenschaften, statt zu scheitern', () => {
    const { events } = parseIcs(
      event('UID:evt-7\r\nDTSTART:20260907T100000Z\r\nX-CUSTOM-VENDOR-FIELD:irgendwas\r\nATTENDEE;CN=Test:mailto:a@b.c'),
    )
    expect(events).toHaveLength(1)
  })
})
