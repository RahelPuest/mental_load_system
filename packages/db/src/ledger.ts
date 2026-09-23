import { sensitivityRank, type Sensitivity } from '@thealotta/contracts'
import { auditEvents, domainEvents, outboxEvents } from './schema.js'
import { uuidv7 } from './id.js'
import type { Tx } from './client.js'

/**
 * Ledger-Schreiber (ADR-0007 / ADR-0009).
 *
 * Liegt hier statt in der API, weil API und Worker denselben Pfad brauchen: Zustandsänderung,
 * Domain-Event und Outbox-Eintrag gehören in dieselbe Transaktion. Zwei Implementierungen
 * würden früher oder später auseinanderlaufen.
 *
 * Der Akteur ist strukturell typisiert, damit dieses Paket nicht von `@thealotta/domain` abhängt.
 */
export interface LedgerActor {
  kind: 'user' | 'system' | 'integration'
  userId: string | null
  membershipId: string | null
  ref?: string
  correlationId: string
}

export interface EventInput {
  eventType: string
  subjectType: string
  subjectId: string | null
  payload?: Record<string, unknown>
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  /** false unterdrückt die Outbox-Zeile – für Massenoperationen ohne Folgeverarbeitung. */
  publish?: boolean
  causationId?: string | null
  /** Sensitivity des Subjekts – steuert, ob Werte in die Nutzlast dürfen. */
  sensitivity?: Sensitivity
}

export async function recordEvent(
  tx: Tx,
  householdId: string,
  actor: LedgerActor,
  input: EventInput,
): Promise<string> {
  const eventId = uuidv7()
  const sensitive = input.sensitivity && sensitivityRank(input.sensitivity) >= sensitivityRank('health')

  // docs/06 §1: Die Historie darf keine Rechteumgehung sein. Sensible Werte werden
  // durch eine Beschreibung ersetzt, nicht mitgeschrieben.
  const scrub = (v: Record<string, unknown> | null | undefined): Record<string, unknown> | null => {
    if (!v) return null
    if (!sensitive) return v
    return { valueOmitted: true, sensitivity: input.sensitivity, keys: Object.keys(v) }
  }

  await tx.insert(domainEvents).values({
    id: eventId,
    householdId,
    eventType: input.eventType,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    actorKind: actor.kind,
    actorMembershipId: actor.membershipId,
    actorRef: actor.ref ?? null,
    payload: (scrub(input.payload) ?? {}) as never,
    before: scrub(input.before) as never,
    after: scrub(input.after) as never,
    correlationId: actor.correlationId,
    causationId: input.causationId ?? null,
  })

  if (input.publish !== false) {
    await tx.insert(outboxEvents).values({
      householdId,
      eventId,
      topic: input.eventType,
      payload: {
        eventId,
        eventType: input.eventType,
        householdId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        actorKind: actor.kind,
        actorMembershipId: actor.membershipId,
        correlationId: actor.correlationId,
      } as never,
      correlationId: actor.correlationId,
    })
  }

  return eventId
}

export interface AuditInput {
  action: string
  outcome?: 'success' | 'failure' | 'denied'
  householdId?: string | null
  userId?: string | null
  membershipId?: string | null
  subjectType?: string | null
  subjectId?: string | null
  ipHash?: string | null
  userAgentHash?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Sicherheitsrelevante Ereignisse gehen in einen getrennten, hash-verketteten Strom (docs/11).
 * Er überlebt eine Haushaltslöschung und enthält niemals Inhalte.
 */
export async function recordAudit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.insert(auditEvents).values({
    householdId: input.householdId ?? null,
    userId: input.userId ?? null,
    membershipId: input.membershipId ?? null,
    action: input.action,
    outcome: input.outcome ?? 'success',
    subjectType: input.subjectType ?? null,
    subjectId: input.subjectId ?? null,
    ipHash: input.ipHash ?? null,
    userAgentHash: input.userAgentHash ?? null,
    metadata: (input.metadata ?? {}) as never,
    // row_hash setzt der Datenbank-Trigger (Hash-Kette); der Platzhalter erfüllt nur NOT NULL.
    rowHash: '',
  })
}
