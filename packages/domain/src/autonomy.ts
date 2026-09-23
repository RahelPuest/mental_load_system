import type { AutonomyLevel } from '@thealotta/contracts'
import { requiresHumanActor } from './errors.js'
import type { ActorContext } from './types.js'

/**
 * ADR-0008 / §6: Autonomiestufen sind im Code erzwungen, nicht nur dokumentiert.
 *
 *  A0 Observe  – lesen, ableiten
 *  A1 Inform   – Hinweise erzeugen (Signal, Attention Item, Vorschlag)
 *  A2 Prepare  – ausführbare Objekte erzeugen; nur mit aktivierter AutomationRule
 *  A3 Decide   – Verantwortung, Rechte, Regeln, sensible Inhalte ändern; nie automatisch
 */
export const OPERATION_AUTONOMY = {
  'signal.raise': 'A1',
  'attention.create': 'A1',
  'attention.reevaluate': 'A1',
  'playbook.suggest': 'A1',
  'priority.recompute': 'A1',
  'task.overdue_reassess': 'A1',
  'calendar.derive_context': 'A1',
  'knowledge.link': 'A1',

  'task.create_automatic': 'A2',
  'process.start_automatic': 'A2',
  'calendar.create_block': 'A2',
  'notification.send_reminder': 'A2',
  'state.update_from_trusted_integration': 'A2',

  'ownership.assign': 'A3',
  'ownership.transfer': 'A3',
  'ownership.release': 'A3',
  'grant.create': 'A3',
  'grant.revoke': 'A3',
  'role.assign': 'A3',
  'decision.write': 'A3',
  'state.overwrite_health': 'A3',
  'calendar.write_foreign': 'A3',
  'deletion.execute_hard': 'A3',
  'attention.mark_irrelevant': 'A3',
} as const satisfies Record<string, AutonomyLevel>

export type AutonomyOperation = keyof typeof OPERATION_AUTONOMY

export function autonomyLevelOf(op: AutonomyOperation): AutonomyLevel {
  return OPERATION_AUTONOMY[op]
}

export function listOperationsAtLevel(level: AutonomyLevel): AutonomyOperation[] {
  return (Object.keys(OPERATION_AUTONOMY) as AutonomyOperation[]).filter((op) => OPERATION_AUTONOMY[op] === level)
}

export interface AutomationRuleLike {
  id: string
  enabled: boolean
  createdBy: string | null
  rationaleTemplate: string
}

/**
 * Torwächter vor jeder Operation. A3 ist für System-Akteure schlicht nicht erreichbar –
 * §47 stellt Ownership-Klarheit über Automatisierung, und diese Priorität hält nur,
 * wenn sie nicht von Aufmerksamkeit abhängt.
 */
export function assertAutonomy(
  op: AutonomyOperation,
  actor: ActorContext,
  rule?: AutomationRuleLike | null,
): void {
  const level = autonomyLevelOf(op)
  if (actor.kind === 'user') return

  if (level === 'A3') throw requiresHumanActor(op)

  if (level === 'A2') {
    if (!rule || !rule.enabled || !rule.createdBy) {
      throw requiresHumanActor(`${op} (keine aktivierte Automatisierungsregel)`)
    }
  }
}
