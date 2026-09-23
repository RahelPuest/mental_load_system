import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * INV-002 – Delegation eines Tasks verändert niemals implizit die Ownership eines Bereichs.
 *
 * Auf Domänenebene wird das strukturell geprüft: Der Work-Kontext darf keine
 * Ownership-Funktionen importieren. Der laufzeitseitige Nachweis liegt in
 * apps/api/test/invariants/inv-002.spec.ts.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('INV-002 – Delegation ändert keine Ownership', () => {
  it('der Work-Kontext importiert keine Ownership-Logik', () => {
    const src = read('../../src/work/next-action.ts')
    expect(src).not.toMatch(/from '\.\.\/ownership/)
    expect(src).not.toMatch(/ResponsibilityAssignment|assignmentKind/)
  })

  it('Delegation ist kein Zustandsübergang der Task-Maschine', () => {
    const src = read('../../src/state-machines/index.ts')
    const taskSection = src.slice(src.indexOf('taskMachine'), src.indexOf('processMachine'))
    expect(taskSection).not.toMatch(/'delegate'|'assign'/)
  })
})
