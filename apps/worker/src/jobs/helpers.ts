import type { tasks } from '@thealotta/db'
import type { EnergyLevel } from '@thealotta/contracts'
import type { TaskLike } from '@thealotta/domain'

export { coverageExpireTarget, isStalled, nextActions } from '@thealotta/domain'

export function uuidToTaskLike(row: typeof tasks.$inferSelect): TaskLike {
  return {
    id: row.id,
    title: row.title,
    state: row.state,
    domainId: row.domainId,
    processId: row.processId,
    assigneeMembershipId: row.assigneeMembershipId,
    dueAt: row.dueAt,
    deferUntil: row.deferUntil,
    estimatedMinutes: row.estimatedMinutes,
    mentalEnergy: row.mentalEnergy as EnergyLevel,
    position: row.position,
    createdAt: row.createdAt,
  }
}
