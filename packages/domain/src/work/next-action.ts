import { OPEN_TASK_STATES } from '@thealotta/contracts'
import type { TaskLike } from '../types.js'

export interface DependencyEdge {
  taskId: string
  dependsOnTaskId: string
}

/**
 * ADR-0006: `NextAction` ist eine Projektion, keine Entität.
 *
 * Nächste Handlungen sind Tasks eines Vorgangs, die
 *   (a) noch offen sind,
 *   (b) keine offenen Vorbedingungen haben,
 *   (c) nicht auf Externes warten und nicht in die Zukunft zurückgestellt sind.
 *
 * Ist die Menge leer, obwohl der Vorgang aktiv ist, gilt er als „stalled“ – daraus entsteht
 * ein Attention Item „Nächsten Schritt festlegen“ (INV-P04). §12 verlangt, dass die Frage
 * „Was ist der nächste konkrete Schritt?“ immer beantwortbar ist.
 */
export function nextActions(tasks: readonly TaskLike[], deps: readonly DependencyEdge[], now: Date): TaskLike[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const openStates = new Set<string>(OPEN_TASK_STATES)

  const blocked = new Set<string>()
  for (const edge of deps) {
    const upstream = byId.get(edge.dependsOnTaskId)
    if (!upstream) continue
    if (openStates.has(upstream.state)) blocked.add(edge.taskId)
  }

  return tasks
    .filter((t) => {
      if (t.state !== 'ready' && t.state !== 'in_progress') return false
      if (blocked.has(t.id)) return false
      if (t.deferUntil && t.deferUntil.getTime() > now.getTime()) return false
      return true
    })
    .sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime())
}

export function isStalled(processState: string, tasks: readonly TaskLike[], deps: readonly DependencyEdge[], now: Date): boolean {
  if (processState !== 'active') return false
  return nextActions(tasks, deps, now).length === 0
}

/** Ein Vorgang darf nur abgeschlossen werden, wenn nichts Offenes zurückbleibt – oder mit Begründung. */
export function openTaskCount(tasks: readonly TaskLike[]): number {
  const open = new Set<string>(OPEN_TASK_STATES)
  return tasks.filter((t) => open.has(t.state)).length
}
