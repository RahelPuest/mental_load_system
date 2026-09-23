import type { ActorContext } from '@thealotta/domain'
import { uuidv7 } from '@thealotta/db'

/**
 * Hintergrundjobs handeln als System – nie als Mensch.
 *
 * Dadurch greifen die Autonomiestufen (ADR-0008) automatisch: A3-Operationen sind für
 * jeden Job technisch unerreichbar, egal welchen Code jemand später hinzufügt.
 */
export function systemActor(ref: string, correlationId = uuidv7()): ActorContext {
  return { kind: 'system', userId: null, membershipId: null, ref, correlationId }
}

export function integrationActor(ref: string, correlationId = uuidv7()): ActorContext {
  return { kind: 'integration', userId: null, membershipId: null, ref, correlationId }
}

/** Ein System-Kontext für einen Haushalt, mit allen Rechten innerhalb dieses Haushalts. */
export interface SystemContextInput {
  householdId: string
  domainPaths: ReadonlyMap<string, string>
  actor: ActorContext
}
