import type { MonitorRuleKind, Severity, SignalKind } from '@thealotta/contracts'
import type { Clock } from '../clock.js'
import type { StateDefinitionLike, StateValueLike } from '../freshness.js'

export interface MonitorLike {
  id: string
  householdId: string
  domainId: string
  stateDefinitionId: string | null
  name: string
  ruleKind: MonitorRuleKind
  config: Record<string, unknown>
  enabled: boolean
  lastEvaluatedAt: Date | null
  nextEvaluationAt: Date | null
}

/** Was der Evaluator zur Auswertung braucht – bewusst schmal, damit er rein bleibt. */
export interface MonitorEvaluationContext {
  clock: Clock
  stateDefinition?: StateDefinitionLike | null
  stateValue?: StateValueLike | null
  /** Aktive Unterdrückungen (§7.6) – Buckets, die nicht erneut feuern sollen. */
  suppressions: readonly { bucketPattern: string; until: Date | null }[]
  /** Nur für lead_time_before_event / date_field_lead_time. */
  upcomingEvents?: readonly { id: string; title: string; startsAt: Date; sequence: number }[]
  /** Nur für absence. */
  lastActivityAt?: Date | null
  /**
   * Nur für `dependency_recheck`: wann die Aufgabe, an die sich diese Regel hängt, zuletzt
   * erledigt wurde. `null` heißt „noch nie" – dann wartet die Regel, statt zu feuern.
   */
  precedingCompletedAt?: Date | null
  /**
   * Nur für `schedule` mit Endbedingung „nach N Malen": wie oft die Reihe schon gelaufen ist.
   * Das Muster selbst weiß das nicht – es kennt nur den Rhythmus.
   */
  occurrencesSoFar?: number
}

export interface SignalDraft {
  monitorId: string
  domainId: string
  signalKind: SignalKind
  severity: Severity
  /** Idempotenz-Anker: gleiche Evidenz ⇒ gleicher Schlüssel ⇒ genau ein Signal (§11). */
  dedupeKey: string
  /** Bucket-Anteil des Schlüssels, gegen den Unterdrückungen greifen. */
  bucket: string
  evidence: Record<string, unknown> & { rationale: string }
  title: string
  /** Menschenlesbare Antwort auf „Warum jetzt?“ – Pflichtfeld (INV-008). */
  whyNow: string
  ifItWaits: string
}

export interface MonitorEvaluationResult {
  signals: SignalDraft[]
  /** Fachliche Schlüssel, deren Bedingung nicht mehr erfüllt ist – zugehörige Signale werden aufgelöst. */
  resolvedBuckets: string[]
  nextEvaluationAt: Date
}

export type MonitorEvaluator = (monitor: MonitorLike, ctx: MonitorEvaluationContext) => MonitorEvaluationResult
