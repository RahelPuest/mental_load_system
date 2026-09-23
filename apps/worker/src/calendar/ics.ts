import { DateTime } from 'luxon'

/**
 * Kompakter ICS-Parser (RFC 5545, gebräuchliche Teilmenge).
 *
 * Bewusst selbst geschrieben statt einer Bibliothek: Kalenderdaten sind nicht vertrauenswürdige
 * Eingabe (docs/25). Hier sind Größen-, Zeilen- und Verschachtelungsgrenzen sichtbar und
 * überprüfbar, statt in einer Abhängigkeit zu verschwinden.
 */
export interface IcsEvent {
  uid: string
  recurrenceId: string
  sequence: number
  summary: string
  description: string | null
  location: string | null
  startsAt: Date
  endsAt: Date
  timeZone: string
  allDay: boolean
  rrule: string | null
  exdates: string[]
  status: 'confirmed' | 'tentative' | 'cancelled'
  lastModified: Date | null
}

export interface IcsParseOptions {
  maxLines?: number
  maxEvents?: number
  defaultTimeZone?: string
}

export class IcsParseError extends Error {}

/** Entfaltet Folgezeilen (RFC 5545 §3.1: Fortsetzung beginnt mit Leerzeichen oder Tab). */
function unfold(raw: string, maxLines: number): string[] {
  const lines = raw.split(/\r?\n/)
  if (lines.length > maxLines) throw new IcsParseError(`Kalenderdatei hat zu viele Zeilen (${lines.length})`)
  const out: string[] = []
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

interface Property {
  name: string
  params: Record<string, string>
  value: string
}

function parseProperty(line: string): Property | null {
  const colon = line.indexOf(':')
  if (colon < 0) return null
  const head = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const [name, ...paramParts] = head.split(';')
  const params: Record<string, string> = {}
  for (const part of paramParts) {
    const eq = part.indexOf('=')
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name: (name ?? '').toUpperCase(), params, value }
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

/**
 * Zeitzonenbehandlung (docs/22 §5): Ein Zeitpunkt ohne Zone ist „floating" und wird in der
 * Kalenderzone interpretiert; `Z` ist UTC; `TZID` gewinnt vor beidem. Ganztagestermine sind
 * lokale Datumsgrenzen, nicht UTC-Mitternacht.
 */
export function parseIcsDate(
  value: string,
  params: Record<string, string>,
  fallbackZone: string,
): { date: Date; zone: string; allDay: boolean } {
  const isDateOnly = params['VALUE'] === 'DATE' || /^\d{8}$/.test(value)
  const zone = params['TZID'] ?? (value.endsWith('Z') ? 'UTC' : fallbackZone)

  if (isDateOnly) {
    const dt = DateTime.fromFormat(value, 'yyyyMMdd', { zone })
    if (!dt.isValid) throw new IcsParseError(`Ungültiges Datum: ${value}`)
    return { date: dt.toJSDate(), zone, allDay: true }
  }

  const clean = value.replace(/Z$/, '')
  const dt = DateTime.fromFormat(clean, "yyyyMMdd'T'HHmmss", { zone })
  if (!dt.isValid) throw new IcsParseError(`Ungültige Zeitangabe: ${value}`)
  return { date: dt.toJSDate(), zone, allDay: false }
}

export function parseIcs(raw: string, opts: IcsParseOptions = {}): { events: IcsEvent[]; calendarTimeZone: string } {
  const maxLines = opts.maxLines ?? 200_000
  const maxEvents = opts.maxEvents ?? 5_000
  const lines = unfold(raw, maxLines)

  let calendarTimeZone = opts.defaultTimeZone ?? 'UTC'
  const events: IcsEvent[] = []

  let inEvent = false
  let inTimezone = false
  let current: Partial<IcsEvent> & { exdates: string[] } = { exdates: [] }

  for (const line of lines) {
    const property = parseProperty(line)
    if (!property) continue

    if (property.name === 'BEGIN' && property.value === 'VTIMEZONE') inTimezone = true
    if (property.name === 'END' && property.value === 'VTIMEZONE') inTimezone = false
    if (inTimezone) {
      if (property.name === 'TZID') calendarTimeZone = property.value
      continue
    }

    if (property.name === 'X-WR-TIMEZONE') {
      calendarTimeZone = property.value
      continue
    }

    if (property.name === 'BEGIN' && property.value === 'VEVENT') {
      inEvent = true
      current = { exdates: [], sequence: 0, status: 'confirmed', recurrenceId: '' }
      continue
    }

    if (property.name === 'END' && property.value === 'VEVENT') {
      inEvent = false
      if (current.uid && current.startsAt) {
        // Ohne DTEND gilt DTSTART + 1 Tag (ganztägig) bzw. + 1 Stunde.
        const endsAt =
          current.endsAt ??
          new Date(current.startsAt.getTime() + (current.allDay ? 86_400_000 : 3_600_000))
        events.push({
          uid: current.uid,
          recurrenceId: current.recurrenceId ?? '',
          sequence: current.sequence ?? 0,
          summary: current.summary ?? '(ohne Titel)',
          description: current.description ?? null,
          location: current.location ?? null,
          startsAt: current.startsAt,
          endsAt,
          timeZone: current.timeZone ?? calendarTimeZone,
          allDay: current.allDay ?? false,
          rrule: current.rrule ?? null,
          exdates: current.exdates,
          status: current.status ?? 'confirmed',
          lastModified: current.lastModified ?? null,
        })
        if (events.length > maxEvents) throw new IcsParseError(`Kalenderdatei hat zu viele Termine (> ${maxEvents})`)
      }
      continue
    }

    if (!inEvent) continue

    switch (property.name) {
      case 'UID':
        current.uid = property.value
        break
      case 'SUMMARY':
        current.summary = unescapeText(property.value).slice(0, 500)
        break
      case 'DESCRIPTION':
        current.description = unescapeText(property.value).slice(0, 5000)
        break
      case 'LOCATION':
        current.location = unescapeText(property.value).slice(0, 500)
        break
      case 'SEQUENCE':
        current.sequence = Number.parseInt(property.value, 10) || 0
        break
      case 'STATUS': {
        const status = property.value.toUpperCase()
        current.status = status === 'CANCELLED' ? 'cancelled' : status === 'TENTATIVE' ? 'tentative' : 'confirmed'
        break
      }
      case 'DTSTART': {
        const parsed = parseIcsDate(property.value, property.params, calendarTimeZone)
        current.startsAt = parsed.date
        current.timeZone = parsed.zone
        current.allDay = parsed.allDay
        break
      }
      case 'DTEND': {
        current.endsAt = parseIcsDate(property.value, property.params, calendarTimeZone).date
        break
      }
      case 'RECURRENCE-ID': {
        // Die abweichende Instanz wird über ihren ursprünglichen Startzeitpunkt identifiziert.
        current.recurrenceId = property.value
        break
      }
      case 'RRULE':
        current.rrule = property.value
        break
      case 'EXDATE':
        current.exdates.push(...property.value.split(',').map((v) => v.trim()))
        break
      case 'LAST-MODIFIED':
        current.lastModified = parseIcsDate(property.value, property.params, 'UTC').date
        break
      default:
        break
    }
  }

  return { events, calendarTimeZone }
}
