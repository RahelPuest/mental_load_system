/**
 * Der Ledger-Schreiber liegt in `@thealotta/db`, weil API und Worker exakt denselben Pfad brauchen
 * (Zustandsänderung + Domain-Event + Outbox in einer Transaktion). Zwei Implementierungen
 * würden auseinanderlaufen.
 */
export { recordAudit, recordEvent, type AuditInput, type EventInput } from '@thealotta/db'
