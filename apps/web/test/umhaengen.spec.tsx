import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DOMAIN, installBackend, renderPage, settle } from './harness.js'
import { DomainDetailPage } from '../src/pages/DomainDetailPage.js'
import fixtures from './fixtures/api.json' with { type: 'json' }

/**
 * Inhalte in einen anderen Bereich umhängen (docs/72).
 *
 * Der Anlass ist das Aufteilen: „Jacken und Schuhe" wird zu zwei Bereichen. Geprüft wird hier
 * der Weg dorthin – dass die Auswahl erst auf Verlangen erscheint, dass die Leiste zählt, und
 * dass am Ende genau das an den Server geht, was angehakt war.
 */
const detail = (fixtures as { responses: Record<string, unknown> }).responses['domains/detail'] as Record<
  string,
  unknown
>

const mitNotizen = () => ({
  ...detail,
  knowledge: [
    { id: 'k1', title: 'Größe 29 seit Mai', body: '', kind: 'fact', confirmedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'k2', title: 'Gummistiefel im Keller', body: '', kind: 'fact', confirmedAt: '2026-01-01T00:00:00.000Z' },
  ],
})

const wissen = () => ({ route: `/bereiche/${DOMAIN}/wissen`, path: '/bereiche/:domainId/:section' })
const kaesten = () => document.querySelectorAll<HTMLInputElement>('.checkbox input')
/*
  Über den Namen statt über die Stelle in der Liste: Vor den Notizen stehen die Angaben, und
  ein Test, der „das erste Kästchen" anhakt, prüft beim nächsten Abschnittswechsel etwas
  anderes als das, was in seinem Namen steht.
*/
const kasten = (titel: string | RegExp) => screen.getByRole('checkbox', { name: titel })

describe('Die Kästchen erscheinen erst auf Verlangen', () => {
  it('ohne Auswahlmodus steht vor keiner Zeile ein Kästchen', async () => {
    installBackend({ routes: { 'domains/detail': mitNotizen() } })
    renderPage(<DomainDetailPage />, wissen())
    await settle()

    expect(screen.getByText('Größe 29 seit Mai'), 'die Notiz fehlt – dann prüft der Test nichts').toBeTruthy()
    expect(kaesten(), 'Kästchen stehen da, ohne dass jemand auswählen wollte').toHaveLength(0)
  })

  it('der Knopf schaltet Kästchen und Leiste ein', async () => {
    installBackend({ routes: { 'domains/detail': mitNotizen() } })
    renderPage(<DomainDetailPage />, wissen())
    await settle()

    await userEvent.click(screen.getByRole('button', { name: 'In anderen Bereich' }))

    expect(kaesten().length, 'kein Kästchen im Auswahlmodus').toBeGreaterThan(0)
    /*
      Die Leiste steht auch bei null Gewählten da. Eine, die erst beim ersten Haken erscheint,
      springt ins Bild und schiebt die Liste unter dem Finger weg.
    */
    expect(screen.getByText('Hak an, was umziehen soll')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Zielbereich wählen' }).hasAttribute('disabled')).toBe(true)
  })

  it('die Leiste zählt, was angehakt ist', async () => {
    installBackend({ routes: { 'domains/detail': mitNotizen() } })
    renderPage(<DomainDetailPage />, wissen())
    await settle()
    await userEvent.click(screen.getByRole('button', { name: 'In anderen Bereich' }))

    await userEvent.click(kasten(/Größe 29 seit Mai/))
    expect(screen.getByText('1 Eintrag ausgewählt')).toBeTruthy()

    await userEvent.click(kasten(/Gummistiefel im Keller/))
    expect(screen.getByText('2 Einträge ausgewählt')).toBeTruthy()

    // Noch einmal derselbe Haken nimmt ihn weg – sonst zählte die Leiste nur aufwärts.
    await userEvent.click(kasten(/Gummistiefel im Keller/))
    expect(screen.getByText('1 Eintrag ausgewählt')).toBeTruthy()
  })

  it('Abbrechen wirft die Auswahl weg, nicht die Einträge', async () => {
    installBackend({ routes: { 'domains/detail': mitNotizen() } })
    renderPage(<DomainDetailPage />, wissen())
    await settle()
    await userEvent.click(screen.getByRole('button', { name: 'In anderen Bereich' }))
    await userEvent.click(kasten(/Größe 29 seit Mai/))
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(kaesten()).toHaveLength(0)
    expect(screen.getByText('Größe 29 seit Mai'), 'die Notiz ist mit der Auswahl verschwunden').toBeTruthy()
  })
})

describe('Der Bogen schickt, was angehakt war', () => {
  it('nennt Anzahl und Herkunft und sagt vorher, was zusammenbleibt', async () => {
    installBackend({ routes: { 'domains/detail': mitNotizen() } })
    renderPage(<DomainDetailPage />, wissen())
    await settle()
    await userEvent.click(screen.getByRole('button', { name: 'In anderen Bereich' }))
    await userEvent.click(kasten(/Größe 29 seit Mai/))
    await userEvent.click(screen.getByRole('button', { name: 'Zielbereich wählen' }))

    expect(screen.getByRole('heading', { name: 'Wohin verschieben?' })).toBeTruthy()
    /*
      Angekündigt, nicht überrascht: Wer erst hinterher erfährt, dass die Angabe mitkam, sucht
      die fehlende Hälfte im alten Bereich.
    */
    expect(screen.getByText(/Regel und die Angabe, die sie beobachtet, kommen zusammen/)).toBeTruthy()
  })

  it('der Bereich, in dem man steht, steht nicht zur Wahl', async () => {
    installBackend({ routes: { 'domains/detail': mitNotizen() } })
    renderPage(<DomainDetailPage />, wissen())
    await settle()
    await userEvent.click(screen.getByRole('button', { name: 'In anderen Bereich' }))
    await userEvent.click(kasten(/Größe 29 seit Mai/))
    await userEvent.click(screen.getByRole('button', { name: 'Zielbereich wählen' }))

    const werte = [...document.querySelectorAll<HTMLOptionElement>('select option')].map((o) => o.value)
    expect(werte, 'man kann in den Bereich verschieben, in dem man schon steht').not.toContain(DOMAIN)
    expect(werte.length, 'kein einziges Ziel zur Wahl').toBeGreaterThan(1)
  })

  it('geschickt wird Ziel und Auswahl – und die Rückmeldung nennt, was mitkam', async () => {
    const gesendet = vi.fn()
    installBackend({
      routes: { 'domains/detail': mitNotizen() },
      onMutate: gesendet,
      writeResponses: {
        'move-items': {
          moved: [{ kind: 'knowledge', id: 'k1', title: 'Größe 29 seit Mai' }],
          mitgenommen: [{ kind: 'state', id: 's1', title: 'Schuhgröße', grund: 'wird von „Schuhgröße prüfen" beobachtet' }],
        },
      },
    })
    renderPage(<DomainDetailPage />, wissen())
    await settle()
    await userEvent.click(screen.getByRole('button', { name: 'In anderen Bereich' }))
    await userEvent.click(kasten(/Größe 29 seit Mai/))
    await userEvent.click(screen.getByRole('button', { name: 'Zielbereich wählen' }))

    const ziel = [...document.querySelectorAll<HTMLOptionElement>('select option')].find((o) => o.value !== '')!
    await userEvent.selectOptions(document.querySelector('select')!, ziel.value)

    // Im Bogen suchen, nicht auf der Seite: „Verschieben" steht auch auf der Auswahlleiste.
    const bogen = within(screen.getByRole('dialog'))
    await userEvent.click(bogen.getByRole('button', { name: 'Verschieben' }))
    await settle()

    const aufruf = gesendet.mock.calls.find(([, pfad]) => String(pfad).includes('move-items'))
    expect(aufruf, 'es ging gar keine Anfrage hinaus').toBeTruthy()
    const [methode, pfad, body] = aufruf as [string, string, { targetDomainId: string; items: unknown[] }]
    expect(methode).toBe('POST')
    expect(pfad, 'der Bereich in der Adresse ist nicht die Quelle').toContain(DOMAIN)
    expect(body.targetDomainId).toBe(ziel.value)
    expect(body.items).toEqual([{ kind: 'knowledge', id: 'k1' }])

    // Was mitkam, steht in der Rückmeldung – sonst steht es gleich darauf unerklärt woanders.
    expect(screen.getByText(/wird von/), 'die Rückmeldung verschweigt, was mitgekommen ist').toBeTruthy()
  })
})
