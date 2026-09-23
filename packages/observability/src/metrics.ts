import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client'

/**
 * Metriken tragen niemals personenbezogene Labels (docs/30 §2).
 * `household_bucket` ist eine Größenklasse, kein Identifikator.
 */
export const registry = new Registry()
collectDefaultMetrics({ register: registry })

const h = (config: ConstructorParameters<typeof Histogram>[0]) => new Histogram({ ...config, registers: [registry] })
const c = (config: ConstructorParameters<typeof Counter>[0]) => new Counter({ ...config, registers: [registry] })
const g = (config: ConstructorParameters<typeof Gauge>[0]) => new Gauge({ ...config, registers: [registry] })

export const httpRequestDuration = h({
  name: 'http_request_duration_seconds',
  help: 'Dauer von HTTP-Requests',
  labelNames: ['route', 'method', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.4, 0.8, 1.5, 3, 8],
})

export const dbQueryDuration = h({
  name: 'db_query_duration_seconds',
  help: 'Dauer von Datenbankoperationen',
  labelNames: ['repository', 'operation'],
  buckets: [0.001, 0.005, 0.02, 0.05, 0.2, 1],
})

export const jobDuration = h({
  name: 'job_duration_seconds',
  help: 'Laufzeit von Hintergrundjobs',
  labelNames: ['queue', 'job'],
  buckets: [0.05, 0.2, 1, 5, 20, 60, 300],
})

export const jobAttempts = c({
  name: 'job_attempts_total',
  help: 'Versuche je Job und Ergebnis',
  labelNames: ['queue', 'job', 'outcome'],
})

export const outboxPending = g({ name: 'outbox_pending_total', help: 'Unveröffentlichte Outbox-Events' })
export const outboxLagSeconds = g({ name: 'outbox_lag_seconds', help: 'Alter des ältesten offenen Outbox-Events' })

/* ── Fachliche Metriken: sie zeigen, ob das Produktversprechen trägt ── */

export const monitorEvaluations = c({
  name: 'monitor_evaluations_total',
  help: 'Monitor-Auswertungen',
  labelNames: ['rule_kind', 'outcome'],
})

export const signalsRaised = c({
  name: 'signals_raised_total',
  help: 'Erzeugte Signale',
  labelNames: ['signal_kind'],
})

export const attentionTriage = c({
  name: 'attention_triage_actions_total',
  help: 'Triage-Aktionen an Attention Items – hoher Anteil "irrelevant" zeigt Rauschen (Risiko P2)',
  labelNames: ['action'],
})

export const attentionToTaskRatio = g({
  name: 'attention_to_task_ratio',
  help: 'Verhältnis Attention Items zu Tasks – Frühwarnung gegen Todo-Listen-Drift (Risiko P1)',
})

export const unownedCriticalDomains = g({
  name: 'unowned_critical_domains',
  help: 'Kritische Bereiche ohne effektive Verantwortung (INV-014)',
})

export const coveragePendingReturn = g({
  name: 'coverage_pending_return_total',
  help: 'Vertretungen, deren Rückgabe unbestätigt ist',
})

export const stateConflictsOpen = g({ name: 'state_conflicts_open', help: 'Ungelöste Zustandskonflikte' })

export const calendarSyncAge = g({
  name: 'calendar_sync_age_seconds',
  help: 'Alter des letzten erfolgreichen Kalender-Syncs',
  labelNames: ['provider'],
})

export const calendarSyncFailures = c({
  name: 'calendar_sync_failures_total',
  help: 'Fehlgeschlagene Kalender-Syncs',
  labelNames: ['provider', 'error'],
})

export const notificationDeliveries = c({
  name: 'notification_deliveries_total',
  help: 'Zustellungen je Kanal und Endzustand',
  labelNames: ['channel', 'state'],
})

export const notificationSuppressed = c({
  name: 'notification_suppressed_total',
  help: 'Unterdrückte Benachrichtigungen mit Grund',
  labelNames: ['reason'],
})

export const backupRestoreVerified = g({
  name: 'backup_restore_verified_timestamp',
  help: 'Unix-Zeit der letzten erfolgreichen Restore-Verifikation',
})

export const auditChainVerified = g({
  name: 'audit_chain_verified_timestamp',
  help: 'Unix-Zeit der letzten erfolgreichen Audit-Kettenprüfung',
})
