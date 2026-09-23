import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { COLOR_TONES } from '@thealotta/contracts'

/**
 * Prüft die Designtokens als Werte, nicht als Absicht (Auftrag §25, §26, §38).
 *
 * Bis zum dritten Durchgang stand in der Dokumentation, die Kontraste seien geprüft.
 * Geprüft hatte sie niemand. Diese Datei rechnet nach.
 */

const css = readFileSync(resolve(process.cwd(), 'apps/web/src/design/tokens.css'), 'utf8')

/* ── Tokens auslesen ─────────────────────────────────────────────────── */

function block(selector: string): string {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`Block ${selector} nicht gefunden`)
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error('unbalanciert')
}

function tokensOf(source: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const [, name, value] of source.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    map.set(name!, value!.trim())
  }
  return map
}

const light = tokensOf(block(':root'))
const dark = new Map([...light, ...tokensOf(block('@media (prefers-color-scheme: dark)'))])

/**
 * Die auswählbaren Schemata – jedes in beiden Modi.
 *
 * Ein Schema, das man anbieten kann, aber nicht lesen: Das wäre schlimmer als keins.
 * Deshalb läuft dieselbe Kontrastprüfung über alle.
 */
const SCHEMES = ['dracula', 'catppuccin', 'nord', 'solarized']

function schemeTokens(scheme: string, mode: 'light' | 'dark'): Map<string, string> {
  const selector =
    mode === 'light'
      ? `:root[data-scheme='${scheme}'] {`
      : `:root[data-scheme='${scheme}'][data-theme='dark'] {`
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`Schema ${scheme}/${mode} fehlt`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const base = mode === 'light' ? light : dark
  return new Map([...base, ...tokensOf(css.slice(open + 1, close))])
}

/** Löst `var(--x)`-Ketten auf einen Hexwert auf. */
function hex(scope: Map<string, string>, token: string, depth = 0): string {
  const raw = scope.get(token)
  if (raw === undefined) throw new Error(`Token ${token} fehlt`)
  const ref = raw.match(/^var\((--[a-z0-9-]+)\)$/)
  if (ref) {
    if (depth > 8) throw new Error(`Zyklische Referenz bei ${token}`)
    return hex(scope, ref[1]!, depth + 1)
  }
  return raw
}

/* ── Kontrast nach WCAG 2.1 ──────────────────────────────────────────── */

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(color: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) throw new Error(`Kein Hexwert: ${color}`)
  const n = parseInt(m[1]!, 16)
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  )
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

/** Kombinationen, die in der Oberfläche tatsächlich vorkommen. */
const TEXT_PAIRS: [string, string, string][] = [
  ['Fließtext auf Seitenhintergrund', '--text', '--bg'],
  ['Fließtext auf Fläche', '--text', '--surface'],
  ['Fließtext auf vertiefter Fläche', '--text', '--surface-sunken'],
  ['Sekundärtext auf Seitenhintergrund', '--text-secondary', '--bg'],
  ['Sekundärtext auf Fläche', '--text-secondary', '--surface'],
  ['Gedämpfter Text auf Fläche', '--text-muted', '--surface'],
  ['Gedämpfter Text auf vertiefter Fläche', '--text-muted', '--surface-sunken'],
  ['Akzentschrift auf Fläche', '--accent', '--surface'],
  // Chips und der aktive Navigationseintrag stehen auf der weichen Akzentfläche.
  ['Akzentschrift auf Akzentfläche', '--accent', '--accent-soft'],
  ['Primärknopf-Beschriftung', '--accent-text', '--accent-solid'],
  ['Erfolg', '--success-fg', '--success-bg'],
  ['Aufmerksamkeit', '--attention-fg', '--attention-bg'],
  ['Kritisch', '--critical-fg', '--critical-bg'],
  ['Hinweis', '--info-fg', '--info-bg'],
]

describe('Farbtokens erfüllen WCAG-Kontraste', () => {
  for (const scope of [
    { name: 'Hell', map: light },
    { name: 'Dunkel', map: dark },
  ]) {
    for (const [label, fg, bg] of TEXT_PAIRS) {
      it(`${scope.name}: ${label} ≥ 4.5:1`, () => {
        const ratio = contrast(hex(scope.map, fg), hex(scope.map, bg))
        expect(
          ratio,
          `${fg} auf ${bg} = ${ratio.toFixed(2)}:1 (${hex(scope.map, fg)} / ${hex(scope.map, bg)})`,
        ).toBeGreaterThanOrEqual(4.5)
      })
    }

    it(`${scope.name}: Fokusring hebt sich von Fläche und Seite ab (≥ 3:1)`, () => {
      for (const bg of ['--bg', '--surface', '--surface-sunken']) {
        const ratio = contrast(hex(scope.map, '--focus'), hex(scope.map, bg))
        expect(ratio, `--focus auf ${bg} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
      }
    })

    /* Kein WCAG-Kriterium, sondern eine eigene Untergrenze: ein Rand, den man nicht sieht,
     * gruppiert auch nichts. 1.45 ist der Wert, ab dem die Trennung auf einem gedimmten
     * Notebookbildschirm noch trägt. */
    it(`${scope.name}: Ränder sind von ihrer Fläche unterscheidbar`, () => {
      for (const [token, floor] of [
        ['--border', 1.45],
        ['--border-subtle', 1.1],
        ['--border-strong', 1.8],
      ] as const) {
        const ratio = contrast(hex(scope.map, token), hex(scope.map, '--surface'))
        expect(ratio, `${token} auf --surface = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(floor)
      }
    })
  }
})

describe('Jedes auswählbare Schema ist lesbar', () => {
  for (const scheme of SCHEMES) {
    for (const mode of ['light', 'dark'] as const) {
      const map = schemeTokens(scheme, mode)
      for (const [label, fg, bg] of TEXT_PAIRS) {
        it(`${scheme} ${mode}: ${label} ≥ 4.5:1`, () => {
          const ratio = contrast(hex(map, fg), hex(map, bg))
          expect(
            ratio,
            `${scheme}/${mode}: ${fg} auf ${bg} = ${ratio.toFixed(2)}:1 (${hex(map, fg)} / ${hex(map, bg)})`,
          ).toBeGreaterThanOrEqual(4.5)
        })
      }

      it(`${scheme} ${mode}: die Knopffläche hebt sich vom Grund ab`, () => {
        const ratio = contrast(hex(map, '--accent-solid'), hex(map, '--surface'))
        expect(ratio, `${scheme}/${mode}: --accent-solid auf --surface = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(2.2)
      })

      it(`${scheme} ${mode}: der Fokusring ist sichtbar`, () => {
        for (const bg of ['--bg', '--surface']) {
          const ratio = contrast(hex(map, '--focus'), hex(map, bg))
          expect(ratio, `${scheme}/${mode}: --focus auf ${bg} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
        }
      })
    }
  }
})

describe('Personenfarben', () => {
  /*
   * Zwölf Farben, die eine Person oder einen Bereich überall wiedererkennbar machen. Jede
   * muss auf ihrer eigenen Fläche lesbar sein – sonst ist die Farbe eine Behauptung, keine
   * Information. Farbe steht nie allein; geprüft wird das in a11y.spec.tsx.
   *
   * Die Zahl steht hier nicht doppelt: Sie kommt aus dem Vokabular, das auch die Datenbank
   * und die Oberfläche benutzen. Ein Ton mehr in COLOR_TONES ohne passende Tokens fällt
   * dadurch hier auf und nicht erst im Bild.
   */
  const TONE_COUNT = COLOR_TONES.length

  for (const scope of [
    { name: 'Hell', map: light },
    { name: 'Dunkel', map: dark },
  ]) {
    for (let i = 1; i <= TONE_COUNT; i += 1) {
      it(`${scope.name}: Person ${i} ist auf ihrer Fläche lesbar`, () => {
        const ratio = contrast(hex(scope.map, `--m${i}-fg`), hex(scope.map, `--m${i}-bg`))
        expect(ratio, `--m${i}-fg auf --m${i}-bg = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
      })
    }

    it(`${scope.name}: die ${TONE_COUNT} Farben sind voneinander unterscheidbar`, () => {
      // Zwei Töne, die sich in der Helligkeit kaum unterscheiden, sind für Menschen mit
      // Farbsehschwäche dieselbe Farbe. Ein Mindestabstand in der Leuchtdichte hilft.
      const values = Array.from({ length: TONE_COUNT }, (_, i) => hex(scope.map, `--m${i + 1}-fg`))
      for (let a = 0; a < values.length; a += 1) {
        for (let b = a + 1; b < values.length; b += 1) {
          expect(values[a], `Person ${a + 1} und ${b + 1} haben denselben Wert`).not.toBe(values[b])
        }
      }
    })
  }

  /*
   * Jeder Ton des Vokabulars braucht seine drei Tokens. Ohne diese Prüfung ergäbe ein
   * zusätzlicher Eintrag in COLOR_TONES eine Farbklasse, die auf nichts zeigt – im Bild
   * wäre das ein farbloses Feld im Farbwähler.
   */
  it('jeder Ton aus dem Vokabular hat Tokens in beiden Modi', () => {
    for (let i = 1; i <= COLOR_TONES.length; i += 1) {
      for (const [name, map] of [['hell', light], ['dunkel', dark]] as const) {
        for (const part of ['fg', 'bg', 'line']) {
          expect(map.get(`--m${i}-${part}`), `--m${i}-${part} fehlt (${name}) für „${COLOR_TONES[i - 1]}"`).toBeTruthy()
        }
      }
    }
  })
})

describe('Skalen sind Skalen, keine Einzelwerte', () => {
  it('Abstände folgen der 4-px-Basis und wachsen streng monoton', () => {
    const steps = [...light.entries()]
      .filter(([k]) => /^--s-\d+$/.test(k))
      .map(([k, v]) => [Number(k.slice(4)), parseFloat(v)] as const)
      .sort((a, b) => a[0] - b[0])
    expect(steps.length).toBeGreaterThanOrEqual(10)
    for (const [step, px] of steps) {
      expect(px % 4, `--s-${step} = ${px}px ist kein Vielfaches von 4`).toBe(0)
      expect(px, `--s-${step}`).toBe(step * 4)
    }
  })

  it('Radien und Bewegungsdauern sind gestaffelt', () => {
    const radii = ['--r-sm', '--r-md', '--r-lg', '--r-xl'].map((t) => parseFloat(light.get(t)!))
    expect(radii).toEqual([...radii].sort((a, b) => a - b))
    const motion = ['--motion-fast', '--motion-base', '--motion-slow'].map((t) => parseFloat(light.get(t)!))
    expect(motion).toEqual([...motion].sort((a, b) => a - b))
    expect(Math.max(...motion), 'Bewegung soll unaufdringlich bleiben').toBeLessThanOrEqual(400)
  })

  /*
   * Rollen-Tokens verweisen auf Skalen-Tokens (`--t-tag-size: var(--t-caption-size)`).
   * Genau das ist gewollt: Eine Rolle erfindet keine Größe, sie wählt eine. Der Test löst
   * den Verweis auf, damit die Skala trotzdem gemessen wird – und stellt dabei sicher, dass
   * keine Rolle heimlich an der Skala vorbei einen eigenen Wert setzt.
   */
  const resolveSize = (value: string): number => {
    const ref = value.match(/var\(\s*(--[a-z0-9-]+)\s*\)/)
    return ref ? resolveSize(light.get(ref[1]) ?? '') : parseFloat(value)
  }

  it('die Schriftgrößen bleiben zählbar und Metatext bleibt lesbar', () => {
    const sizes = [...light.entries()]
      .filter(([k]) => k.endsWith('-size') && k.startsWith('--t-'))
      .map(([, v]) => resolveSize(v))
    expect(new Set(sizes).size, 'zu viele verschiedene Schriftgrößen (§27)').toBeLessThanOrEqual(10)
    const remBase = 16
    for (const [name, value] of light) {
      if (!name.endsWith('-size')) continue
      const px = resolveSize(value) * remBase
      expect(Number.isNaN(px), `${name} verweist ins Leere`).toBe(false)
      expect(px, `${name} ist zu klein für Metatext`).toBeGreaterThanOrEqual(11)
    }
  })

  it('es gibt genau zwei Tiefenstufen', () => {
    const shadows = [...light.keys()].filter((k) => k.startsWith('--shadow-'))
    expect(shadows.sort()).toEqual(['--shadow-overlay', '--shadow-raised'])
  })
})

describe('Keine Farbwerte außerhalb der Tokendatei', () => {
  const componentCss = readFileSync(resolve(process.cwd(), 'apps/web/src/design/components.css'), 'utf8')

  it('components.css benutzt ausschließlich Tokens', () => {
    const literals = [...componentCss.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])
    expect(literals, `Feste Farbwerte gefunden: ${literals.join(', ')}`).toEqual([])
  })

  /*
   * Der Audit fand 20 frei gesetzte Schriftgewichte und 8 Größen außerhalb der Skala. Die
   * Folge war auf der Bereichsseite messbar: drei verschiedene Gewichte bei 13 px für
   * dieselbe Rolle. Gleiche Größe bei anderem Gewicht liest sich nicht als Rangfolge.
   */
  /**
   * Ein Token, das es nicht gibt, macht keinen Lärm – es macht gar nichts.
   *
   * `padding-top: var(--s-7)` stand wochenlang im Stylesheet. Die Abstandsskala hat aber
   * keine Stufe 7 (…5, 6, 8, 10…), also war die Deklaration ungültig und wurde verworfen:
   * kein Fehler, keine Warnung, nur eine Überschrift, die an ihrer Trennlinie klebte.
   */
  it('jeder Tokenverweis in components.css zeigt auf ein Token, das es gibt', () => {
    /*
     * Diese hier setzt kein Token, sondern das Markup zur Laufzeit: Personenfarben über die
     * Klassen `m-1` … `m-12`, die Baumtiefe über ein Inline-Style, der Karteninnenabstand
     * über `.panel` selbst.
     */
    const runtime = new Set(['--p-fg', '--p-bg', '--p-line', '--depth', '--panel-pad'])

    // Nicht zeilenweise: `tokens.css` setzt mehrere Tokens pro Zeile.
    const declarations = (text: string) =>
      new Set([...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!))
    const declared = declarations(css)
    const ownDeclarations = declarations(componentCss)

    const missing = [...new Set([...componentCss.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]!))]
      .filter((name) => !declared.has(name) && !ownDeclarations.has(name) && !runtime.has(name))
      .sort()

    expect(missing, `Verweise ins Leere: ${missing.join(', ')}`).toEqual([])
  })

  it('components.css setzt Schrift nur über Rollen-Tokens', () => {
    // `em` bleibt erlaubt: Es skaliert mit seiner Rolle, statt neben ihr zu stehen
    // (das Aufklapp-Zeichen „›" ist damit immer proportional zu seiner Zeile).
    const literals = [...componentCss.matchAll(/font-size:\s*[0-9.]+(?:rem|px)|font-weight:\s*[0-9]+/g)].map(
      (m) => m[0],
    )
    expect(literals, `Schrift außerhalb der Skala: ${literals.join(' | ')}`).toEqual([])
  })

  it('jede Typografie-Rolle hat genau ein Paar aus Größe und Gewicht', () => {
    const roles = ['item', 'control', 'tag', 'count']
    for (const role of roles) {
      for (const axis of ['size', 'weight']) {
        const decl = new RegExp(`--t-${role}-${axis}:\\s*([^;]+);`)
        const found = css.match(decl)
        expect(found, `--t-${role}-${axis} fehlt`).not.toBeNull()
      }
    }
  })

  it('kein Bauteil setzt Farbe per Inline-Style', () => {
    const files = ['components.tsx', 'overlay.tsx', 'swipe.tsx', 'icons.tsx']
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), 'apps/web/src/design', file), 'utf8')
      const inline = [...source.matchAll(/style=\{\{[^}]*(?:color|background)[^}]*\}\}/g)].map((m) => m[0])
      expect(inline, `${file}: Farbe im Inline-Style`).toEqual([])
    }
  })
})
