import type { ReactNode } from 'react'

/**
 * Ein kleiner Teil von Markdown – gelesen, nicht ausgeführt.
 *
 * **Warum kein HTML.** Der naheliegende Weg wäre eine Bibliothek, die Markdown zu HTML macht,
 * plus eine zweite, die das Ergebnis säubert, plus `dangerouslySetInnerHTML`. Dieser Parser
 * erzeugt stattdessen **React-Knoten**. Damit gibt es keinen Pfad, auf dem Nutzertext zu
 * Markup werden könnte – kein `onerror=`, kein `javascript:`, nichts zu säubern. Die
 * Content-Security-Policy (`script-src 'self'`) ist die zweite Linie, nicht die erste.
 *
 * **Warum nur ein Teil.** Markdown kann Tabellen, Fußnoten, Zitate, Bilder, Codeblöcke. In
 * einem Haushaltsgedächtnis schreibt das niemand. Unterstützt ist, was in einer Notiz, einer
 * Antwort oder einem Rezept tatsächlich vorkommt:
 *
 * | Eingabe | Ergebnis |
 * | --- | --- |
 * | `**fett**` | fett |
 * | `*kursiv*` oder `_kursiv_` | kursiv |
 * | `- Zeile` oder `* Zeile` | Aufzählung |
 * | `1. Zeile` | nummerierte Liste |
 * | `[Text](https://…)` | Verweis |
 * | Leerzeile | neuer Absatz |
 * | einfacher Umbruch | Zeilenumbruch |
 *
 * Alles andere bleibt stehen, wie es getippt wurde. Das ist Absicht: Wer `#` schreibt, meint
 * meist eine Raute und keine Überschrift – und ein Formatierer, der Text verschluckt, den man
 * wörtlich gemeint hat, ist schlimmer als einer, der zu wenig kann.
 */

/** Nur diese Schemata dürfen zu einem Verweis werden. Alles andere bleibt Text. */
const ERLAUBTE_SCHEMATA = ['http:', 'https:', 'mailto:']

function sichererVerweis(ziel: string): string | null {
  try {
    const url = new URL(ziel, 'https://example.invalid')
    /* Relative Ziele haben nach dem Auflösen die Basis – die wollen wir hier nicht. */
    if (!ziel.includes(':')) return null
    return ERLAUBTE_SCHEMATA.includes(url.protocol) ? ziel : null
  } catch {
    return null
  }
}

/**
 * Auszeichnungen innerhalb einer Zeile.
 *
 * Die Reihenfolge ist wichtig: `**` vor `*`, sonst frisst die kursive Regel die halbe fette
 * Auszeichnung. Deshalb ein Ausdruck für alle Fälle statt drei nacheinander.
 */
const INLINE = /(\[[^\]\n]+\]\([^)\s]+\))|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)/

export function inlineNodes(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  let rest = text
  let n = 0
  while (rest.length > 0) {
    const treffer = INLINE.exec(rest)
    if (!treffer || treffer.index === undefined) {
      out.push(rest)
      break
    }
    if (treffer.index > 0) out.push(rest.slice(0, treffer.index))
    const stueck = treffer[0]
    const k = `${key}-${n++}`
    if (stueck.startsWith('[')) {
      const ende = stueck.indexOf('](')
      const beschriftung = stueck.slice(1, ende)
      const ziel = stueck.slice(ende + 2, -1)
      const sicher = sichererVerweis(ziel)
      out.push(
        sicher ? (
          <a key={k} href={sicher} target="_blank" rel="noreferrer noopener">
            {beschriftung}
          </a>
        ) : (
          /* Kein erlaubtes Schema: Der Text bleibt, wie er getippt wurde. */
          stueck
        ),
      )
    } else if (stueck.startsWith('**')) {
      out.push(<strong key={k}>{stueck.slice(2, -2)}</strong>)
    } else {
      out.push(<em key={k}>{stueck.slice(1, -1)}</em>)
    }
    rest = rest.slice(treffer.index + stueck.length)
  }
  return out
}

/** Eine Zeile mit einfachem Umbruch wird zu Text mit `<br>` dazwischen. */
function mitUmbruechen(absatz: string, key: string): ReactNode[] {
  const zeilen = absatz.split('\n')
  return zeilen.flatMap((zeile, i) =>
    i === 0
      ? inlineNodes(zeile, `${key}-${i}`)
      : [<br key={`${key}-br-${i}`} />, ...inlineNodes(zeile, `${key}-${i}`)],
  )
}

type Block =
  | { art: 'absatz'; zeilen: string[] }
  | { art: 'punkte'; zeilen: string[] }
  | { art: 'zahlen'; zeilen: string[] }

const PUNKT = /^\s*[-*]\s+(.*)$/
const ZAHL = /^\s*\d+[.)]\s+(.*)$/

/** Zeilen zu Blöcken bündeln: Leerzeilen trennen, Listenzeichen bilden Gruppen. */
export function bloecke(quelle: string): Block[] {
  const out: Block[] = []
  for (const zeile of quelle.replace(/\r\n?/g, '\n').split('\n')) {
    const punkt = PUNKT.exec(zeile)
    const zahl = ZAHL.exec(zeile)
    const letzter = out[out.length - 1]
    if (punkt) {
      if (letzter?.art === 'punkte') letzter.zeilen.push(punkt[1]!)
      else out.push({ art: 'punkte', zeilen: [punkt[1]!] })
    } else if (zahl) {
      if (letzter?.art === 'zahlen') letzter.zeilen.push(zahl[1]!)
      else out.push({ art: 'zahlen', zeilen: [zahl[1]!] })
    } else if (zeile.trim() === '') {
      /* Eine Leerzeile beendet, was gerade offen ist. */
      if (letzter) out.push({ art: 'absatz', zeilen: [] })
    } else {
      if (letzter?.art === 'absatz' && letzter.zeilen.length > 0) letzter.zeilen.push(zeile)
      else if (letzter?.art === 'absatz') letzter.zeilen.push(zeile)
      else out.push({ art: 'absatz', zeilen: [zeile] })
    }
  }
  return out.filter((b) => b.zeilen.length > 0)
}

/**
 * Formatierter Fließtext.
 *
 * `as` bestimmt das umgebende Element – standardmäßig ein `<div>`, weil ein Absatz keinen
 * Absatz enthalten darf. Wo bisher ein `<p className="t-body-sm">` stand, steht jetzt
 * `<Markdown className="t-body-sm">`.
 */
export function Markdown({ children, className }: { children: string | null | undefined; className?: string }) {
  const quelle = (children ?? '').trim()
  if (!quelle) return null
  const teile = bloecke(quelle)
  return (
    <div className={['markdown', className].filter(Boolean).join(' ')}>
      {teile.map((b, i) => {
        if (b.art === 'punkte')
          return (
            <ul key={i}>
              {b.zeilen.map((z, j) => (
                <li key={j}>{inlineNodes(z, `${i}-${j}`)}</li>
              ))}
            </ul>
          )
        if (b.art === 'zahlen')
          return (
            <ol key={i}>
              {b.zeilen.map((z, j) => (
                <li key={j}>{inlineNodes(z, `${i}-${j}`)}</li>
              ))}
            </ol>
          )
        return <p key={i}>{mitUmbruechen(b.zeilen.join('\n'), String(i))}</p>
      })}
    </div>
  )
}
