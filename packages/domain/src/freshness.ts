import type { ValueKind } from '@thealotta/contracts'
import { addIsoDuration, type Clock } from './clock.js'

export interface StateValueLike {
  stateDefinitionId: string
  valueKind: ValueKind
  value: unknown
  verifiedAt: Date | null
  staleAt: Date | null
  confirmedAt: Date | null
  origin: string
}

export interface StateDefinitionLike {
  id: string
  key: string
  label: string
  /** ISO-8601-Dauer oder null (= altert nicht). */
  freshnessInterval: string | null
  isCritical: boolean
}

/**
 * §9.1: Freshness sagt „könnte veraltet sein“, nicht „ist falsch“.
 * Der Zeitpunkt hängt an `verifiedAt` – nicht an `updatedAt`. Ein automatischer Schreibvorgang
 * ohne menschliche Bestätigung frischt die Gültigkeit deshalb nicht auf (INV-011).
 */
export function computeStaleAt(def: StateDefinitionLike, verifiedAt: Date | null): Date | null {
  if (!def.freshnessInterval || !verifiedAt) return null
  return addIsoDuration(verifiedAt, def.freshnessInterval)
}

export function isStale(value: StateValueLike, clock: Clock): boolean {
  return value.staleAt !== null && value.staleAt.getTime() <= clock.now().getTime()
}

export function daysSinceVerified(value: StateValueLike, clock: Clock): number | null {
  if (!value.verifiedAt) return null
  return Math.floor((clock.now().getTime() - value.verifiedAt.getTime()) / 86_400_000)
}

/** Fertiger deutscher Satz für `why_now` / `rationale` (§7.2 – Begründungspflicht). */
export function describeStaleness(def: StateDefinitionLike, value: StateValueLike, clock: Clock): string {
  const days = daysSinceVerified(value, clock)
  const when = value.verifiedAt ? formatDate(value.verifiedAt) : 'unbekannt'
  const interval = def.freshnessInterval ? humanizeDuration(def.freshnessInterval) : 'kein Intervall'
  if (days === null) {
    return `„${def.label}“ wurde noch nie bestätigt. Vorgesehen ist eine Prüfung alle ${interval}.`
  }
  return `„${def.label}“ wurde zuletzt am ${when} bestätigt (vor ${days} Tagen). Vorgesehen ist eine Prüfung alle ${interval}.`
}

export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d)
}

export function humanizeDuration(iso: string): string {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?/.exec(iso)
  if (!m) return iso
  const [, y, mo, w, d] = m
  if (y) return Number(y) === 1 ? 'Jahr' : `${y} Jahre`
  if (mo) return Number(mo) === 1 ? 'Monat' : `${mo} Monate`
  if (w) return Number(w) === 1 ? 'Woche' : `${w} Wochen`
  if (d) return Number(d) === 1 ? 'Tag' : `${d} Tage`
  return iso
}
