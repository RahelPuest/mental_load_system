import { describe, expect, it } from 'vitest'
import { assertAutonomy, autonomyLevelOf, listOperationsAtLevel, OPERATION_AUTONOMY, type AutonomyOperation } from '../src/autonomy.js'
import { DomainError } from '../src/errors.js'
import type { ActorContext } from '../src/types.js'

const user: ActorContext = { kind: 'user', userId: 'u1', membershipId: 'm1', correlationId: 'c' }
const system: ActorContext = { kind: 'system', userId: null, membershipId: null, ref: 'monitor:x', correlationId: 'c' }
const integration: ActorContext = { kind: 'integration', userId: null, membershipId: null, ref: 'calendar:x', correlationId: 'c' }

describe('Autonomiestufen (ADR-0008 / §6)', () => {
  it('A3 ist für System- und Integrationsakteure vollständig unerreichbar', () => {
    const a3 = listOperationsAtLevel('A3')
    expect(a3.length).toBeGreaterThan(5)
    for (const op of a3) {
      for (const actor of [system, integration]) {
        expect(() => assertAutonomy(op, actor), op).toThrowError(DomainError)
        try {
          assertAutonomy(op, actor)
        } catch (e) {
          expect((e as DomainError).code).toBe('requires_human_actor')
        }
      }
      expect(() => assertAutonomy(op, user), op).not.toThrow()
    }
  })

  it('A2 verlangt eine aktivierte, von einem Menschen angelegte Automatisierungsregel', () => {
    const op = 'task.create_automatic' as AutonomyOperation
    expect(() => assertAutonomy(op, system)).toThrow()
    expect(() => assertAutonomy(op, system, { id: 'r', enabled: false, createdBy: 'm1', rationaleTemplate: 'x' })).toThrow()
    expect(() => assertAutonomy(op, system, { id: 'r', enabled: true, createdBy: null, rationaleTemplate: 'x' })).toThrow()
    expect(() => assertAutonomy(op, system, { id: 'r', enabled: true, createdBy: 'm1', rationaleTemplate: 'x' })).not.toThrow()
  })

  it('A1 darf das System jederzeit selbst tun', () => {
    for (const op of listOperationsAtLevel('A1')) {
      expect(() => assertAutonomy(op, system), op).not.toThrow()
    }
  })

  it('die Ownership-Operationen sind ausnahmslos A3 eingestuft', () => {
    for (const op of Object.keys(OPERATION_AUTONOMY) as AutonomyOperation[]) {
      if (op.startsWith('ownership.') || op.startsWith('grant.') || op.startsWith('role.')) {
        expect(autonomyLevelOf(op), op).toBe('A3')
      }
    }
  })

  it('das Markieren als dauerhaft irrelevant bleibt eine menschliche Entscheidung', () => {
    // Sonst könnte das System sein eigenes Monitoring stillschalten.
    expect(autonomyLevelOf('attention.mark_irrelevant')).toBe('A3')
  })
})
