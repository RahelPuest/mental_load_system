import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Meta-Test (docs/26 §2): Jede in docs/08-invariants.md dokumentierte Invariante braucht
 * mindestens einen automatisierten Test. Ohne diesen Test wäre die Invariantenliste eine
 * Absichtserklärung statt einer Zusicherung.
 */
const root = fileURLToPath(new URL('../../../..', import.meta.url))

const TEST_DIRS = ['packages/domain/test/invariants', 'apps/api/test/invariants']

function collectCoveredIds(): Set<string> {
  const covered = new Set<string>()
  for (const dir of TEST_DIRS) {
    for (const file of readdirSync(join(root, dir))) {
      for (const match of file.matchAll(/inv-(\d{3})/g)) covered.add(`INV-${match[1]}`)
      const body = readFileSync(join(root, dir, file), 'utf8')
      for (const match of body.matchAll(/INV-(\d{3})/g)) covered.add(`INV-${match[1]}`)
    }
  }
  // Der routenübergreifende Isolationstest liegt bewusst außerhalb des Ordners.
  const isolation = readFileSync(join(root, 'apps/api/test/tenant-isolation.spec.ts'), 'utf8')
  for (const match of isolation.matchAll(/INV-(\d{3})/g)) covered.add(`INV-${match[1]}`)
  return covered
}

function documentedIds(): string[] {
  const doc = readFileSync(join(root, 'docs/08-invariants.md'), 'utf8')
  const ids = new Set<string>()
  for (const match of doc.matchAll(/\*\*(INV-\d{3})\*\*/g)) ids.add(match[1]!)
  return [...ids].sort()
}

describe('Invarianten-Abdeckung', () => {
  it('die Dokumentation führt alle 15 Invarianten', () => {
    expect(documentedIds()).toHaveLength(15)
  })

  it('jede dokumentierte Invariante hat mindestens einen Test', () => {
    const covered = collectCoveredIds()
    const missing = documentedIds().filter((id) => !covered.has(id))
    expect(missing, 'Invarianten ohne Test').toEqual([])
  })
})
