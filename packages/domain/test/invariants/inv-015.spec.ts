import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * INV-015 – Das System behauptet keine scheinpräzise mathematische Fairness.
 *
 * Strukturelle Prüfung (ADR-0012): Weder Contracts noch Domänenlogik dürfen Felder
 * einführen, die eine Verteilung als objektive Zahl darstellen.
 */
const root = fileURLToPath(new URL('../../../..', import.meta.url))

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (p.endsWith('.ts')) yield p
  }
}

const FORBIDDEN = [
  /\bfairnessPercentage\b/,
  /\bloadPercentage\b/,
  /\bbalanceScore\b/,
  /\bproductivityScore\b/,
  /\bcompletionRate\b/,
  /\bstreak(Count|Days)\b/,
  /\bmemberRank\b/,
]

describe('INV-015 / INV-P02 – keine Scheinpräzision, keine Leistungsbewertung', () => {
  it('führt keine Prozent-, Score- oder Ranking-Felder in Contracts und Domäne', () => {
    const offenders: string[] = []
    for (const dir of ['packages/contracts/src', 'packages/domain/src']) {
      for (const file of walk(join(root, dir))) {
        const src = readFileSync(file, 'utf8')
        for (const re of FORBIDDEN) {
          if (re.test(src)) offenders.push(`${file}: ${re}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('die Übersichtsantwort trägt einen erklärenden Hinweis statt einer Kennzahl', async () => {
    const { overviewResponse } = await import('@thealotta/contracts')
    const shape = overviewResponse.shape
    expect(Object.keys(shape)).toContain('note')
    expect(Object.keys(shape)).not.toContain('percentage')
    expect(Object.keys(shape)).not.toContain('score')
  })
})
