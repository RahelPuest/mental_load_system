import { describe, expect, it } from 'vitest'
import { ALL_MACHINES, availableEvents, can, next, taskMachine } from '../src/state-machines/index.js'
import { DomainError } from '../src/errors.js'

describe('State Machines', () => {
  it('jeder deklarierte Zustand ist vom Startzustand aus erreichbar', () => {
    for (const m of ALL_MACHINES) {
      const seen = new Set<string>([m.initial])
      const queue = [m.initial as string]
      while (queue.length) {
        const s = queue.shift()!
        for (const t of m.transitions.filter((x) => x.from === s)) {
          if (!seen.has(t.to)) {
            seen.add(t.to)
            queue.push(t.to)
          }
        }
      }
      const unreachable = m.states.filter((s) => !seen.has(s))
      expect(unreachable, `${m.name}: unerreichbare Zustände`).toEqual([])
    }
  })

  it('kein Übergang zeigt auf einen undeklarierten Zustand', () => {
    for (const m of ALL_MACHINES) {
      for (const t of m.transitions) {
        expect(m.states, `${m.name}.${t.event}`).toContain(t.from)
        expect(m.states, `${m.name}.${t.event}`).toContain(t.to)
      }
    }
  })

  it('wirft bei einem unmöglichen Übergang statt still nichts zu tun', () => {
    expect(() => next(taskMachine, 'done', 'start')).toThrowError(DomainError)
    try {
      next(taskMachine, 'done', 'start')
    } catch (e) {
      expect((e as DomainError).code).toBe('invalid_transition')
      expect((e as DomainError).status).toBe(409)
    }
  })

  it('führt reguläre Task-Übergänge korrekt aus', () => {
    expect(next(taskMachine, 'draft', 'activate')).toBe('ready')
    expect(next(taskMachine, 'ready', 'start')).toBe('in_progress')
    expect(next(taskMachine, 'in_progress', 'complete')).toBe('done')
    expect(can(taskMachine, 'ready', 'complete')).toBe(true)
    expect(availableEvents(taskMachine, 'waiting')).toContain('release')
  })
})
