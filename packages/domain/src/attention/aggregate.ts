import type { SignalDraft } from '../monitors/types.js'

export interface AttentionItemLike {
  id: string
  domainId: string
  signalKind: string
  state: string
  snoozedUntil: Date | null
  whyNow: string
  title: string
}

export type AggregationAction =
  | { kind: 'create'; domainId: string; signalKind: string; title: string; whyNow: string; ifItWaits: string; severity: string }
  | { kind: 'attach'; attentionItemId: string; whyNow: string }
  | { kind: 'skip'; reason: string }

/**
 * §4 / ADR-0004: Zehn veraltete Angaben in einem Bereich ergeben EINEN Eintrag mit zehn Belegen,
 * nicht zehn Einträge. Das ist die zentrale Gegenmaßnahme gegen die lange Todo-Liste.
 *
 * Bündelungsschlüssel: (domainId, signalKind).
 */
export function aggregationKey(domainId: string, signalKind: string): string {
  return `${domainId}|${signalKind}`
}

const OPEN_STATES = new Set(['open', 'acknowledged', 'snoozed'])

export function planAggregation(signal: SignalDraft, existing: readonly AttentionItemLike[]): AggregationAction {
  const match = existing.find(
    (a) => a.domainId === signal.domainId && a.signalKind === signal.signalKind && OPEN_STATES.has(a.state),
  )
  if (match) {
    return { kind: 'attach', attentionItemId: match.id, whyNow: signal.whyNow }
  }

  // 'irrelevant' bedeutet: diese Regel passt bei uns nicht. Ein neues Signal derselben Art
  // erzeugt hier bewusst nichts – dafür sorgt zusätzlich die MonitorSuppression (§7.6).
  const suppressed = existing.find(
    (a) => a.domainId === signal.domainId && a.signalKind === signal.signalKind && a.state === 'irrelevant',
  )
  if (suppressed) return { kind: 'skip', reason: 'als dauerhaft nicht relevant markiert' }

  return {
    kind: 'create',
    domainId: signal.domainId,
    signalKind: signal.signalKind,
    title: signal.title,
    whyNow: signal.whyNow,
    ifItWaits: signal.ifItWaits,
    severity: signal.severity,
  }
}

/**
 * Ein Attention Item wird obsolet, wenn alle stützenden Signale aufgelöst sind –
 * ABER nur, solange der Mensch es nicht ausdrücklich bestätigt hat (INV-001).
 * Bestätigte Themen bleiben, bis ein Mensch sie schließt.
 */
export function shouldBecomeObsolete(item: AttentionItemLike, openSupportingSignals: number): boolean {
  if (openSupportingSignals > 0) return false
  return item.state === 'open'
}

/** Ein abgelaufener Snooze holt das Thema zurück – nichts verschwindet still. */
export function shouldWake(item: AttentionItemLike, now: Date): boolean {
  return item.state === 'snoozed' && item.snoozedUntil !== null && item.snoozedUntil.getTime() <= now.getTime()
}
