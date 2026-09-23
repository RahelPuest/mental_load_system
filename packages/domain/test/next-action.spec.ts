import { describe, expect, it } from 'vitest'
import { MS } from '../src/clock.js'
import { isStalled, nextActions, openTaskCount } from '../src/work/next-action.js'
import type { TaskLike } from '../src/types.js'

const NOW = new Date('2026-09-07T09:00:00.000Z')

const task = (id: string, over: Partial<TaskLike> = {}): TaskLike => ({
  id,
  title: id,
  state: 'ready',
  domainId: 'd1',
  processId: 'p1',
  assigneeMembershipId: null,
  dueAt: null,
  deferUntil: null,
  estimatedMinutes: 5,
  mentalEnergy: 'low',
  position: 0,
  createdAt: NOW,
  ...over,
})

describe('nextActions() – ADR-0006 / §12', () => {
  it('liefert nur unblockierte Schritte in Reihenfolge', () => {
    const tasks = [task('messen', { position: 1 }), task('bestellen', { position: 2 }), task('anprobieren', { position: 3 })]
    const deps = [
      { taskId: 'bestellen', dependsOnTaskId: 'messen' },
      { taskId: 'anprobieren', dependsOnTaskId: 'bestellen' },
    ]
    expect(nextActions(tasks, deps, NOW).map((t) => t.id)).toEqual(['messen'])
  })

  it('gibt den Folgeschritt frei, sobald die Vorbedingung erledigt ist', () => {
    const tasks = [task('messen', { state: 'done', position: 1 }), task('bestellen', { position: 2 })]
    const deps = [{ taskId: 'bestellen', dependsOnTaskId: 'messen' }]
    expect(nextActions(tasks, deps, NOW).map((t) => t.id)).toEqual(['bestellen'])
  })

  it('blendet zurückgestellte und wartende Schritte aus', () => {
    const tasks = [
      task('spaeter', { deferUntil: new Date(NOW.getTime() + MS.day) }),
      task('wartet', { state: 'waiting' }),
      task('jetzt'),
    ]
    expect(nextActions(tasks, [], NOW).map((t) => t.id)).toEqual(['jetzt'])
  })

  it('erkennt einen Vorgang ohne nächsten Schritt als stalled (INV-P04)', () => {
    expect(isStalled('active', [task('a', { state: 'waiting' })], [], NOW)).toBe(true)
    expect(isStalled('active', [task('a')], [], NOW)).toBe(false)
    expect(isStalled('completed', [], [], NOW)).toBe(false)
  })

  it('zählt offene Schritte für den Abschluss-Check', () => {
    expect(openTaskCount([task('a'), task('b', { state: 'done' }), task('c', { state: 'waiting' })])).toBe(2)
  })
})
