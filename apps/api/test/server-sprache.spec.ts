import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Texte, die der Server schreibt, sind Texte, die der Nutzer liest.
 *
 * Seit `ApiError` das `detail` des Servers benutzt, erscheint jeder Fehlertext wörtlich in
 * der Oberfläche – und `note`-Felder werden ohnehin angezeigt. Der bestehende Sprachtest
 * prüft nur die Zeichenketten im Client; deshalb stand „Ein **Playbook** ist eine Vorlage"
 * monatelang sichtbar auf `/ablaeufe`, und ein fehlender Ablauf meldete sich als
 * „Das Playbook wurde nicht gefunden" (Audit 2, M1).
 *
 * Verboten sind Wörter des Modells, für die es ein Produktwort gibt.
 */
const VERBOTEN: Record<string, string> = {
  Playbook: 'Ablauf',
  Monitor: 'Regel',
  'Attention Item': 'Hinweis',
  Ownership: 'Verantwortung',
  Task: 'Aufgabe',
  Inbox: 'Eingang',
}

/** Nur was tatsächlich an den Nutzer geht: Fehlertexte und `note`-Felder. */
const NUTZERTEXT = /(?:notFound|badRequest|conflict|forbidden)\(\s*(?:'[^']*',\s*)?'([^']+)'|note:\s*\n?\s*'([^']+)'/g

function dateien(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map((f) => join(dir, f))
}

describe('Sprache in servergeschriebenen Texten', () => {
  const quellen = [
    ...dateien('apps/api/src/routes'),
    ...dateien('packages/services/src/services'),
  ]

  it('findet überhaupt Texte – sonst prüft der Test nichts', () => {
    const alle = quellen.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(NUTZERTEXT)])
    expect(alle.length).toBeGreaterThan(20)
  })

  for (const [wort, statt] of Object.entries(VERBOTEN)) {
    it(`benutzt „${wort}" nicht – die Sache heißt „${statt}"`, () => {
      const treffer: string[] = []
      for (const datei of quellen) {
        const inhalt = readFileSync(datei, 'utf8')
        for (const m of inhalt.matchAll(NUTZERTEXT)) {
          const text = m[1] ?? m[2] ?? ''
          if (new RegExp(`\\b${wort}\\b`, 'i').test(text)) {
            treffer.push(`${datei}: „${text.slice(0, 80)}"`)
          }
        }
      }
      expect(treffer, treffer.join('\n')).toEqual([])
    })
  }
})
