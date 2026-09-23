import type { ConflictState, Origin, ValueKind } from '@thealotta/contracts'
import { MS } from '../clock.js'
import type { StateValueLike } from '../freshness.js'

export interface IncomingObservation {
  valueKind: ValueKind
  value: unknown
  origin: Origin
  observedAt: Date
  observedBy: string | null
  /** true = der Mensch bestätigt diesen Wert ausdrücklich. */
  confirm: boolean
}

export interface StateWriteDecision {
  /** Wird der aktuelle Wert übernommen? */
  applyValue: boolean
  /** Wird verified_at aufgefrischt? Nur bei menschlicher Bestätigung oder vertrauenswürdiger Integration. */
  refreshVerified: boolean
  conflictState: ConflictState
  /** Interner Code des greifenden Falls – landet in der History. */
  rule: string
  /** Menschenlesbare Erklärung, falls ein Konflikt entsteht. */
  conflictExplanation: string | null
}

export interface ConflictOptions {
  /** Fenster, innerhalb dessen zwei menschliche Angaben als Widerspruch gelten (§9 Fall 5). */
  conflictWindowMs: number
  isCritical: boolean
}

export const defaultConflictWindow = (isCritical: boolean): number => (isCritical ? 7 * MS.day : MS.day)

/**
 * §10 / INV-011: Das System überschreibt bestätigtes menschliches Wissen niemals still.
 *
 * Leitsatz: Ein sichtbarer Widerspruch ist besser als eine stille Auflösung. Wenn unklar ist,
 * welcher Wert stimmt, bleibt der alte stehen und ein Attention Item macht den Konflikt sichtbar.
 */
export function resolveStateWrite(
  current: StateValueLike | null,
  incoming: IncomingObservation,
  opts: ConflictOptions,
): StateWriteDecision {
  const humanIncoming = incoming.origin === 'human'
  const refreshOnApply = humanIncoming ? incoming.confirm : incoming.origin === 'integration' && incoming.confirm

  // Erster Wert überhaupt
  if (!current) {
    return {
      applyValue: true,
      refreshVerified: refreshOnApply,
      conflictState: 'none',
      rule: 'initial_value',
      conflictExplanation: null,
    }
  }

  const sameValue = current.valueKind === incoming.valueKind && deepEqual(current.value, incoming.value)

  // 1 ── Gleicher Wert: nur bestätigen. Genau das passiert nach „habe nachgesehen, stimmt noch“.
  if (sameValue) {
    return {
      applyValue: true,
      refreshVerified: refreshOnApply,
      conflictState: 'none',
      rule: 'reconfirmation',
      conflictExplanation: null,
    }
  }

  // 2 ── Der bestehende Wert war nie menschlich bestätigt → er hat keinen Vorrang.
  if (current.confirmedAt === null) {
    return {
      applyValue: true,
      refreshVerified: refreshOnApply,
      conflictState: 'none',
      rule: 'overwrite_unconfirmed',
      conflictExplanation: null,
    }
  }

  // 3 ── Mensch korrigiert einen maschinell erzeugten Wert.
  if (humanIncoming && current.origin !== 'human') {
    return {
      applyValue: true,
      refreshVerified: incoming.confirm,
      conflictState: 'none',
      rule: 'human_over_machine',
      conflictExplanation: null,
    }
  }

  // 4 ── INV-011: Maschine gegen bestätigten menschlichen Wert → NICHT übernehmen.
  if (!humanIncoming) {
    return {
      applyValue: false,
      refreshVerified: false,
      conflictState: 'unresolved',
      rule: 'machine_blocked_by_confirmed_human',
      conflictExplanation:
        'Eine automatische Quelle meldet einen abweichenden Wert. Der bestätigte Eintrag bleibt bestehen, bis jemand entscheidet.',
    }
  }

  // 5 ── Zwei Menschen, verschiedene Werte, innerhalb des Konfliktfensters.
  const bothHuman = current.origin === 'human' && humanIncoming
  const withinWindow =
    current.verifiedAt !== null && incoming.observedAt.getTime() - current.verifiedAt.getTime() <= opts.conflictWindowMs

  if (bothHuman && withinWindow) {
    return {
      applyValue: false,
      refreshVerified: false,
      conflictState: 'unresolved',
      rule: 'human_conflict_within_window',
      conflictExplanation:
        'Es liegen zwei unterschiedliche Angaben aus kurzer Zeit vor. Beide bleiben sichtbar, bis geklärt ist, welche stimmt.',
    }
  }

  // 6 ── Außerhalb des Fensters: die neuere menschliche Angabe gewinnt (jemand hat nachgesehen).
  return {
    applyValue: true,
    refreshVerified: incoming.confirm,
    conflictState: 'none',
    rule: 'newer_human_wins',
    conflictExplanation: null,
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  return JSON.stringify(a) === JSON.stringify(b)
}
