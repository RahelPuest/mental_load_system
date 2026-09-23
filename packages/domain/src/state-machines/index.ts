import type { StateMachine } from './machine.js'

export * from './machine.js'

/* ── Task (docs/03 §1) ─────────────────────────────────────────────────
 * Bewusst NICHT enthalten: ein Übergang mit dem Auslöser „Fälligkeitsdatum überschritten“.
 * Zeitablauf führt nie in einen Endzustand (INV-001).
 */
export type TaskEvent =
  | 'activate'
  | 'start'
  | 'complete'
  | 'block'
  | 'unblock'
  | 'wait'
  | 'release'
  | 'defer'
  | 'undefer'
  | 'resume'
  | 'reopen'
  | 'drop'
  | 'supersede'

export const taskMachine: StateMachine<
  'draft' | 'ready' | 'in_progress' | 'blocked' | 'waiting' | 'deferred' | 'done' | 'dropped' | 'superseded',
  TaskEvent
> = {
  name: 'task',
  initial: 'draft',
  states: ['draft', 'ready', 'in_progress', 'blocked', 'waiting', 'deferred', 'done', 'dropped', 'superseded'],
  terminal: ['done', 'dropped', 'superseded'],
  transitions: [
    { from: 'draft', event: 'activate', to: 'ready' },
    { from: 'draft', event: 'drop', to: 'dropped' },
    { from: 'ready', event: 'start', to: 'in_progress' },
    { from: 'ready', event: 'complete', to: 'done' },
    { from: 'ready', event: 'block', to: 'blocked' },
    { from: 'ready', event: 'wait', to: 'waiting' },
    { from: 'ready', event: 'defer', to: 'deferred' },
    { from: 'ready', event: 'drop', to: 'dropped' },
    { from: 'ready', event: 'supersede', to: 'superseded' },
    { from: 'in_progress', event: 'complete', to: 'done' },
    { from: 'in_progress', event: 'block', to: 'blocked' },
    { from: 'in_progress', event: 'wait', to: 'waiting' },
    { from: 'in_progress', event: 'defer', to: 'deferred' },
    { from: 'in_progress', event: 'resume', to: 'ready' },
    { from: 'in_progress', event: 'drop', to: 'dropped' },
    { from: 'in_progress', event: 'supersede', to: 'superseded' },
    { from: 'blocked', event: 'unblock', to: 'ready' },
    { from: 'blocked', event: 'drop', to: 'dropped' },
    { from: 'blocked', event: 'supersede', to: 'superseded' },
    { from: 'waiting', event: 'release', to: 'ready' },
    { from: 'waiting', event: 'drop', to: 'dropped' },
    { from: 'waiting', event: 'supersede', to: 'superseded' },
    { from: 'deferred', event: 'undefer', to: 'ready' },
    { from: 'deferred', event: 'drop', to: 'dropped' },
    { from: 'deferred', event: 'supersede', to: 'superseded' },
    // Wiedereröffnen bleibt möglich – ein versehentliches „erledigt“ darf nichts kosten.
    { from: 'done', event: 'reopen', to: 'ready' },
    { from: 'dropped', event: 'reopen', to: 'ready' },
  ],
}

/* ── Process (docs/03 §2) ─────────────────────────────────────────────── */
export type ProcessEvent = 'activate' | 'pause' | 'resume' | 'block' | 'unblock' | 'complete' | 'abandon' | 'reopen'

export const processMachine: StateMachine<
  'draft' | 'active' | 'paused' | 'blocked' | 'completed' | 'abandoned',
  ProcessEvent
> = {
  name: 'process',
  initial: 'draft',
  states: ['draft', 'active', 'paused', 'blocked', 'completed', 'abandoned'],
  terminal: ['completed', 'abandoned'],
  transitions: [
    { from: 'draft', event: 'activate', to: 'active' },
    { from: 'draft', event: 'abandon', to: 'abandoned' },
    { from: 'active', event: 'pause', to: 'paused' },
    { from: 'active', event: 'block', to: 'blocked' },
    { from: 'active', event: 'complete', to: 'completed', guard: 'no_open_tasks_or_force_close_reason' },
    { from: 'active', event: 'abandon', to: 'abandoned', guard: 'reason_required' },
    { from: 'paused', event: 'resume', to: 'active' },
    { from: 'paused', event: 'abandon', to: 'abandoned', guard: 'reason_required' },
    { from: 'blocked', event: 'unblock', to: 'active' },
    { from: 'blocked', event: 'abandon', to: 'abandoned', guard: 'reason_required' },
    { from: 'completed', event: 'reopen', to: 'active' },
    { from: 'abandoned', event: 'reopen', to: 'active' },
  ],
}

/* ── AttentionItem (docs/03 §3) ───────────────────────────────────────── */
export type AttentionEvent =
  | 'confirm'
  | 'snooze'
  | 'wake'
  | 'dismiss'
  | 'mark_irrelevant'
  | 'promote'
  | 'obsolete'
  | 'resignal'

export const attentionMachine: StateMachine<
  'open' | 'acknowledged' | 'snoozed' | 'dismissed' | 'irrelevant' | 'converted' | 'obsolete',
  AttentionEvent
> = {
  name: 'attention_item',
  initial: 'open',
  states: ['open', 'acknowledged', 'snoozed', 'dismissed', 'irrelevant', 'converted', 'obsolete'],
  terminal: ['dismissed', 'irrelevant', 'converted', 'obsolete'],
  transitions: [
    { from: 'open', event: 'confirm', to: 'acknowledged' },
    { from: 'open', event: 'snooze', to: 'snoozed' },
    { from: 'open', event: 'dismiss', to: 'dismissed' },
    { from: 'open', event: 'mark_irrelevant', to: 'irrelevant' },
    { from: 'open', event: 'promote', to: 'converted' },
    { from: 'open', event: 'obsolete', to: 'obsolete' },
    { from: 'acknowledged', event: 'snooze', to: 'snoozed' },
    { from: 'acknowledged', event: 'dismiss', to: 'dismissed' },
    { from: 'acknowledged', event: 'mark_irrelevant', to: 'irrelevant' },
    { from: 'acknowledged', event: 'promote', to: 'converted' },
    { from: 'snoozed', event: 'wake', to: 'open' },
    { from: 'snoozed', event: 'dismiss', to: 'dismissed' },
    { from: 'snoozed', event: 'promote', to: 'converted' },
    { from: 'snoozed', event: 'mark_irrelevant', to: 'irrelevant' },
    // Ein neues Signal holt ein weggeklicktes Thema zurück – nichts verschwindet endgültig.
    { from: 'dismissed', event: 'resignal', to: 'open' },
    { from: 'obsolete', event: 'resignal', to: 'open' },
  ],
}

/* ── TemporaryCoverage (docs/03 §6) ───────────────────────────────────── */
export type CoverageEvent = 'start' | 'expire' | 'confirm_return' | 'extend' | 'cancel'

export const coverageMachine: StateMachine<
  'scheduled' | 'active' | 'pending_return' | 'returned' | 'cancelled',
  CoverageEvent
> = {
  name: 'temporary_coverage',
  initial: 'scheduled',
  states: ['scheduled', 'active', 'pending_return', 'returned', 'cancelled'],
  terminal: ['returned', 'cancelled'],
  transitions: [
    { from: 'scheduled', event: 'start', to: 'active' },
    { from: 'scheduled', event: 'cancel', to: 'cancelled' },
    { from: 'active', event: 'extend', to: 'active' },
    { from: 'active', event: 'cancel', to: 'cancelled' },
    // Zielzustand hängt von return_mode ab – beide Übergänge sind legal.
    { from: 'active', event: 'expire', to: 'pending_return', guard: 'return_mode=require_confirmation' },
    { from: 'active', event: 'confirm_return', to: 'returned' },
    { from: 'pending_return', event: 'confirm_return', to: 'returned' },
    { from: 'pending_return', event: 'extend', to: 'active' },
  ],
}

/** `expire` bei auto_return führt direkt nach `returned`. */
export const coverageExpireTarget = (returnMode: string): 'returned' | 'pending_return' =>
  returnMode === 'auto_return' ? 'returned' : 'pending_return'

/* ── InboxItem (docs/03 §8) ───────────────────────────────────────────── */
export type InboxEvent = 'classify' | 'accept' | 'reject' | 'process_manually' | 'discard'

export const inboxMachine: StateMachine<'captured' | 'suggested' | 'processed' | 'discarded', InboxEvent> = {
  name: 'inbox_item',
  initial: 'captured',
  states: ['captured', 'suggested', 'processed', 'discarded'],
  terminal: ['processed', 'discarded'],
  transitions: [
    { from: 'captured', event: 'classify', to: 'suggested' },
    { from: 'captured', event: 'process_manually', to: 'processed' },
    { from: 'captured', event: 'discard', to: 'discarded' },
    { from: 'suggested', event: 'accept', to: 'processed' },
    { from: 'suggested', event: 'reject', to: 'captured' },
    { from: 'suggested', event: 'process_manually', to: 'processed' },
    { from: 'suggested', event: 'discard', to: 'discarded' },
  ],
}

/* ── Question (docs/03 §11) ───────────────────────────────────────────── */
export type QuestionEvent = 'answer' | 'promote_to_knowledge' | 'close_unanswered' | 'reopen'

export const questionMachine: StateMachine<'open' | 'answered' | 'knowledge_captured' | 'closed', QuestionEvent> = {
  name: 'question',
  initial: 'open',
  states: ['open', 'answered', 'knowledge_captured', 'closed'],
  terminal: ['knowledge_captured', 'closed'],
  transitions: [
    { from: 'open', event: 'answer', to: 'answered' },
    { from: 'open', event: 'close_unanswered', to: 'closed' },
    { from: 'answered', event: 'promote_to_knowledge', to: 'knowledge_captured' },
    { from: 'answered', event: 'reopen', to: 'open' },
    { from: 'closed', event: 'reopen', to: 'open' },
  ],
}

/* ── NotificationDelivery (docs/03 §9) ────────────────────────────────
 * INV-006: Kein Übergang dieser Maschine schreibt außerhalb von notification_delivery.
 * Zusätzlich technisch abgesichert über die DB-Rolle `thealotta_notifier`.
 */
export type DeliveryEvent = 'send' | 'confirm' | 'ack' | 'retry' | 'fail' | 'suppress'

export const deliveryMachine: StateMachine<
  'queued' | 'sent' | 'delivered' | 'failed' | 'suppressed' | 'acknowledged',
  DeliveryEvent
> = {
  name: 'notification_delivery',
  initial: 'queued',
  states: ['queued', 'sent', 'delivered', 'failed', 'suppressed', 'acknowledged'],
  terminal: ['failed', 'suppressed', 'acknowledged'],
  transitions: [
    { from: 'queued', event: 'send', to: 'sent' },
    { from: 'queued', event: 'suppress', to: 'suppressed' },
    { from: 'queued', event: 'fail', to: 'failed' },
    { from: 'sent', event: 'confirm', to: 'delivered' },
    { from: 'sent', event: 'ack', to: 'acknowledged' },
    { from: 'sent', event: 'retry', to: 'queued' },
    { from: 'sent', event: 'fail', to: 'failed' },
    { from: 'delivered', event: 'ack', to: 'acknowledged' },
    { from: 'failed', event: 'retry', to: 'queued' },
  ],
}

/* ── CalendarConnection (docs/03 §10) ─────────────────────────────────── */
export type ConnectionEvent = 'authorize' | 'sync_ok' | 'transient_error' | 'auth_error' | 'disconnect' | 'revoke'

export const connectionMachine: StateMachine<
  'pending_auth' | 'active' | 'degraded' | 'needs_reauth' | 'disconnected' | 'revoked',
  ConnectionEvent
> = {
  name: 'calendar_connection',
  initial: 'pending_auth',
  states: ['pending_auth', 'active', 'degraded', 'needs_reauth', 'disconnected', 'revoked'],
  terminal: ['revoked'],
  transitions: [
    { from: 'pending_auth', event: 'authorize', to: 'active' },
    { from: 'pending_auth', event: 'revoke', to: 'revoked' },
    { from: 'active', event: 'sync_ok', to: 'active' },
    { from: 'active', event: 'transient_error', to: 'degraded', guard: 'consecutive_failures>=3' },
    { from: 'active', event: 'auth_error', to: 'needs_reauth' },
    { from: 'active', event: 'disconnect', to: 'disconnected' },
    { from: 'active', event: 'revoke', to: 'revoked' },
    { from: 'degraded', event: 'sync_ok', to: 'active' },
    { from: 'degraded', event: 'transient_error', to: 'degraded' },
    { from: 'degraded', event: 'auth_error', to: 'needs_reauth' },
    { from: 'degraded', event: 'disconnect', to: 'disconnected' },
    { from: 'degraded', event: 'revoke', to: 'revoked' },
    { from: 'needs_reauth', event: 'authorize', to: 'active' },
    { from: 'needs_reauth', event: 'disconnect', to: 'disconnected' },
    { from: 'needs_reauth', event: 'revoke', to: 'revoked' },
    { from: 'disconnected', event: 'authorize', to: 'active' },
    { from: 'disconnected', event: 'revoke', to: 'revoked' },
  ],
}

export const ALL_MACHINES = [
  taskMachine,
  processMachine,
  attentionMachine,
  coverageMachine,
  inboxMachine,
  questionMachine,
  deliveryMachine,
  connectionMachine,
] as const
