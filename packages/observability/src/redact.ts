/**
 * Redaction als **Allowlist** (docs/30 §1).
 *
 * Jedes Feld, das nicht ausdrücklich erlaubt ist, wird zu '[redacted]'. Neue Felder – etwa eine
 * neu eingeführte Gesundheitsangabe – lecken dadurch nicht by default. Eine Denylist würde
 * genau diesen Fehler machen.
 */
export const LOG_ALLOWLIST: ReadonlySet<string> = new Set([
  // Envelope
  'ts', 'time', 'level', 'msg', 'name', 'service', 'version', 'env', 'pid', 'hostname',
  // Korrelation
  'requestId', 'correlationId', 'causationId', 'traceId', 'spanId',
  // Identifikatoren (nie Inhalte)
  'userId', 'householdId', 'membershipId', 'personId', 'domainId', 'taskId', 'processId',
  'attentionItemId', 'signalId', 'monitorId', 'stateDefinitionId', 'notificationId',
  'deliveryId', 'connectionId', 'inboxItemId', 'jobId', 'eventId', 'subjectId', 'grantId',
  // Technische Metadaten
  'route', 'method', 'statusCode', 'durationMs', 'outcome', 'attempt', 'attemptCount',
  'queue', 'queues', 'repeatables', 'job', 'topic', 'consumer', 'channel', 'provider', 'ruleKind', 'signalKind',
  'eventType', 'subjectType', 'actorKind', 'capability', 'matchedRule', 'code', 'errorCode',
  'state', 'fromState', 'toState', 'count', 'batchSize', 'lagMs', 'nextAttemptAt',
  'ipHash', 'userAgentHash', 'schemaVersion', 'migration', 'keyId', 'reason',
  // Fehlerdiagnose (Message ist erlaubt, Stack nur außerhalb Produktion)
  'err', 'error', 'type', 'message', 'stack',
])

const REDACTED = '[redacted]'

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1))
  if (value instanceof Error) {
    return { type: value.name, message: value.message, code: (value as { code?: string }).code }
  }
  if (typeof value !== 'object') return value

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = LOG_ALLOWLIST.has(k) ? redact(v, depth + 1) : REDACTED
  }
  return out
}

/** Für Freitext, dessen Länge diagnostisch nützlich, dessen Inhalt aber sensibel ist. */
export const describeText = (text: string | null | undefined): { length: number } | null =>
  text === null || text === undefined ? null : { length: text.length }
