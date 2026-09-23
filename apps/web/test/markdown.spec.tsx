import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Markdown, bloecke } from '../src/design/markdown.js'
import { Textarea } from '../src/design/components.js'

/**
 * Der Formatierer bekommt Nutzertext. Zwei Dinge müssen deshalb stimmen: Er darf nichts
 * verschlucken, was jemand wörtlich gemeint hat – und er darf unter keinen Umständen zu
 * Markup werden, das etwas ausführt.
 */
describe('Markdown – was erkannt wird', () => {
  it('erkennt fett, kursiv und beides in einem Satz', () => {
    render(<Markdown>{'Die **Größe** ist _29_.'}</Markdown>)
    expect(screen.getByText('Größe').tagName).toBe('STRONG')
    expect(screen.getByText('29').tagName).toBe('EM')
  })

  it('macht aus Strichen eine Aufzählung', () => {
    render(<Markdown>{'- Mehl\n- Eier\n- Milch'}</Markdown>)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('list').tagName).toBe('UL')
  })

  it('macht aus Zahlen eine nummerierte Liste', () => {
    render(<Markdown>{'1. Ofen vorheizen\n2. Gemüse schneiden'}</Markdown>)
    expect(screen.getByRole('list').tagName).toBe('OL')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('trennt Absätze an Leerzeilen und bricht einfache Umbrüche um', () => {
    expect(bloecke('eins\nzwei\n\ndrei')).toEqual([
      { art: 'absatz', zeilen: ['eins', 'zwei'] },
      { art: 'absatz', zeilen: ['drei'] },
    ])
  })

  it('lässt eine Liste direkt nach einem Absatz beginnen', () => {
    render(<Markdown>{'Dafür brauchst du:\n- Mehl\n- Eier'}</Markdown>)
    expect(screen.getByText('Dafür brauchst du:')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})

describe('Markdown – was nicht passiert', () => {
  it('erzeugt keinen Verweis auf ein fremdes Schema', () => {
    const { container } = render(<Markdown>{'[klick](javascript:alert(1))'}</Markdown>)
    expect(container.querySelector('a')).toBeNull()
    // Der Text bleibt stehen, wie er getippt wurde – nichts verschwindet stillschweigend.
    expect(container.textContent).toContain('[klick](javascript:alert(1))')
  })

  it('erlaubt http, https und mailto', () => {
    const { container } = render(
      <Markdown>{'[a](https://example.org) [b](http://example.org) [c](mailto:x@example.org)'}</Markdown>,
    )
    expect(container.querySelectorAll('a')).toHaveLength(3)
    for (const a of container.querySelectorAll('a')) {
      expect(a.getAttribute('rel')).toBe('noreferrer noopener')
    }
  })

  it('macht aus getipptem HTML keinen Knoten, sondern Text', () => {
    const { container } = render(<Markdown>{'<img src=x onerror="alert(1)"> <b>fett?</b>'}</Markdown>)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">')
  })

  it('lässt Rauten, Größer-Zeichen und Backticks in Ruhe', () => {
    const { container } = render(<Markdown>{'# 1 der Klasse > alle `x`'}</Markdown>)
    expect(container.textContent).toBe('# 1 der Klasse > alle `x`')
  })

  it('kommt mit leerem und nur aus Leerzeichen bestehendem Text zurecht', () => {
    const { container } = render(<Markdown>{'   \n  '}</Markdown>)
    expect(container.innerHTML).toBe('')
  })

  it('lässt einen einzelnen Stern mitten im Wort stehen', () => {
    const { container } = render(<Markdown>{'2*3 ist 6'}</Markdown>)
    expect(container.querySelector('em')).toBeNull()
    expect(container.textContent).toBe('2*3 ist 6')
  })
})

/**
 * Das Feld, in das der Text geschrieben wird (docs/74).
 *
 * Drei Zeilen Platz sagen: Hier gehören drei Zeilen hin. Für eine Zubereitung oder eine
 * ausführliche Entscheidung stimmt das nicht, und wer dort mehr schreibt, arbeitet durch ein
 * Guckloch.
 */
describe('Fließtextfelder lassen sich vergrößern', () => {
  const feld = () => document.querySelector('textarea')!

  it('der Knopf steht neben „Vorschau" und sagt, was er tut', () => {
    render(<Textarea markdown value="" onChange={() => undefined} rows={3} />)
    expect(screen.getByRole('button', { name: 'Größer' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Vorschau' })).toBeTruthy()
  })

  it('ein Druck vergrößert die Fläche und beschriftet den Rückweg', async () => {
    render(<Textarea markdown value="" onChange={() => undefined} rows={3} />)
    expect(feld().className, 'das Feld beginnt groß').not.toContain('gross')

    await userEvent.click(screen.getByRole('button', { name: 'Größer' }))

    expect(feld().className).toContain('gross')
    expect(screen.getByRole('button', { name: 'Kleiner' }), 'der Rückweg fehlt').toBeTruthy()
    // Gedrückt gehalten heißt gedrückt – auch für Vorleseprogramme.
    expect(screen.getByRole('button', { name: 'Kleiner' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('die Vorschau bleibt groß, wenn das Feld groß ist', async () => {
    render(<Textarea markdown value={'- Mehl\n- Eier'} onChange={() => undefined} rows={3} />)
    await userEvent.click(screen.getByRole('button', { name: 'Größer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Vorschau' }))

    /*
      Wer den Text groß schreibt, will ihn groß gegenlesen. Klappte die Vorschau die Fläche
      wieder zusammen, wäre der Gewinn beim ersten Blick auf das Ergebnis wieder weg.
    */
    const vorschau = document.querySelector('.vorschau')!
    expect(vorschau.className).toContain('gross')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('ein gewöhnliches Feld bekommt den Knopf nicht', () => {
    render(<Textarea value="" onChange={() => undefined} rows={2} />)
    expect(screen.queryByRole('button', { name: 'Größer' }), 'auch kurze Felder tragen ihn').toBeNull()
  })
})
