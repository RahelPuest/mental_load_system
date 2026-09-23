import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DOMAIN, installBackend, renderPage, settle } from './harness.js'
import { DomainDetailPage } from '../src/pages/DomainDetailPage.js'
import fixtures from './fixtures/api.json' with { type: 'json' }

const detail = (fixtures as { responses: Record<string, unknown> }).responses['domains/detail'] as Record<
  string,
  unknown
>

/**
 * Eine Angabe anlegen – samt Wert.
 *
 * Der Bogen legte vorher nur die Hülle an und meldete „noch ohne Wert"; den Wert trug man
 * danach über „Ändern" nach. Wer eine Angabe anlegt, weiß sie aber meistens gerade – das ist
 * der Anlass. Freiwillig bleibt das Feld trotzdem: Eine Angabe ohne Wert ist eine gültige
 * Aussage darüber, was fehlt.
 */
const wissen = () => ({ route: `/bereiche/${DOMAIN}/wissen`, path: '/bereiche/:domainId/:section' })

async function oeffneBogen() {
  await userEvent.click(screen.getByRole('button', { name: 'Angabe' }))
  return within(screen.getByRole('dialog'))
}

/*
  Nach Methode *und* Pfad: Der Wert liegt unter `/state-definitions/:id/value`, ein Filter auf
  den Pfad allein zählt die Angabe und ihren Wert als dasselbe.
*/
const anfragen = (spy: ReturnType<typeof vi.fn>, methode: string, teil: string) =>
  spy.mock.calls.filter(([m, pfad]) => m === methode && String(pfad).includes(teil))

describe('Der Wert steht schon im Anlegen-Bogen', () => {
  it('das Feld ist da, bevor irgendetwas gespeichert wurde', async () => {
    installBackend()
    renderPage(<DomainDetailPage />, wissen())
    await settle()

    const bogen = await oeffneBogen()
    expect(bogen.getByLabelText(/^Wert/), 'kein Wertfeld beim Anlegen').toBeTruthy()
  })

  it('ein eingetragener Wert geht als eigener Aufruf mit hinaus', async () => {
    const gesendet = vi.fn()
    installBackend({ onMutate: gesendet })
    renderPage(<DomainDetailPage />, wissen())
    await settle()

    const bogen = await oeffneBogen()
    await userEvent.type(bogen.getByLabelText(/Was soll festgehalten werden/), 'Schuhgröße')
    await userEvent.selectOptions(bogen.getByLabelText('Art der Angabe'), 'number')
    await userEvent.type(bogen.getByLabelText(/^Wert/), '29')
    await userEvent.click(bogen.getByRole('button', { name: 'Anlegen' }))
    await settle()

    expect(anfragen(gesendet, 'POST', 'state-definitions'), 'die Angabe selbst ging nicht hinaus').toHaveLength(1)
    const [, , wert] = anfragen(gesendet, 'PUT', '/value')[0] as [string, string, Record<string, unknown>]
    expect(wert['valueKind']).toBe('known')
    // Eine Zahl geht als Zahl hinaus, nicht als Zeichenkette – sonst rechnet der Server mit Text.
    expect(wert['value']).toBe(29)
    expect(wert['confirm'], 'selbst eingetragen heißt bestätigt').toBe(true)
    expect(screen.getByText('Angabe angelegt und bestätigt.')).toBeTruthy()
  })

  it('ohne Wert bleibt es bei einem Aufruf', async () => {
    const gesendet = vi.fn()
    installBackend({ onMutate: gesendet })
    renderPage(<DomainDetailPage />, wissen())
    await settle()

    const bogen = await oeffneBogen()
    await userEvent.type(bogen.getByLabelText(/Was soll festgehalten werden/), 'Ohne Wert')
    await userEvent.click(bogen.getByRole('button', { name: 'Anlegen' }))
    await settle()

    expect(anfragen(gesendet, 'POST', 'state-definitions')).toHaveLength(1)
    expect(anfragen(gesendet, 'PUT', '/value'), 'ein leeres Feld schrieb einen leeren Wert').toHaveLength(0)
    expect(screen.getByText('Angabe angelegt – noch ohne Wert.')).toBeTruthy()
  })

  it('„weiß ich nicht" wird hinterlegt, nicht weggelassen', async () => {
    const gesendet = vi.fn()
    installBackend({ onMutate: gesendet })
    renderPage(<DomainDetailPage />, wissen())
    await settle()

    const bogen = await oeffneBogen()
    await userEvent.type(bogen.getByLabelText(/Was soll festgehalten werden/), 'Impfstatus')
    await userEvent.click(bogen.getByLabelText('Weiß ich (noch) nicht'))

    // Das Feld verschwindet, statt gesperrt danebenzustehen.
    expect(bogen.queryByLabelText(/^Wert/)).toBeNull()

    await userEvent.click(bogen.getByRole('button', { name: 'Anlegen' }))
    await settle()

    /*
      `confirm: true` ist hier der Punkt, nicht `valueKind`. Jede neue Angabe steht ohnehin auf
      „unbekannt" (`defineState`, INV-010); das Anhaken setzt zusätzlich `verified_at` – also
      „jemand hat hingesehen, und es gibt nichts zu wissen". Ohne Bestätigung meldet sich die
      Regelart `state_unknown` sofort, mit Bestätigung erst nach der eingestellten Frist.
    */
    const [, , wert] = anfragen(gesendet, 'PUT', '/value')[0] as [string, string, Record<string, unknown>]
    expect(wert['valueKind']).toBe('unknown')
    expect(wert['value'], 'zu „unbekannt" gehört kein Wert').toBeUndefined()
    expect(screen.getByText('Angabe angelegt – als offen hinterlegt.')).toBeTruthy()
  })

  it('ein Wechsel der Art wirft den Wert weg', async () => {
    installBackend()
    renderPage(<DomainDetailPage />, wissen())
    await settle()

    const bogen = await oeffneBogen()
    await userEvent.selectOptions(bogen.getByLabelText('Art der Angabe'), 'number')
    await userEvent.type(bogen.getByLabelText(/^Wert/), '29')
    await userEvent.selectOptions(bogen.getByLabelText('Art der Angabe'), 'boolean')

    /*
      „29" ist als „Ja / Nein" nichts. Ein stehengebliebener Rest würde stillschweigend als
      `false` gespeichert – ein Wert, den niemand eingegeben hat.
    */
    expect((bogen.getByLabelText(/^Wert/) as HTMLSelectElement).value).toBe('')
  })
})

/**
 * Und dieselbe Maske zum Ändern (docs/77).
 *
 * „Ändern" klappte vorher eine Eingabe auf, die ausschließlich den Wert setzen konnte. Name,
 * Art, Frist und Wichtigkeit waren nach dem Anlegen für immer festgelegt.
 */
describe('Eine bestehende Angabe ändern', () => {
  const mitAngabe = (überschreibung: Record<string, unknown> = {}) => ({
    ...detail,
    states: [
      {
        id: 'sv1',
        definition: {
          id: 'sd1',
          label: 'Schugröße',
          key: 'schugroesse',
          dataType: 'number',
          unit: null,
          isCritical: false,
          freshnessInterval: 'P6W',
          sensitivity: 'normal',
        },
        valueKind: 'known',
        value: 29,
        verifiedAt: '2026-09-01T00:00:00.000Z',
        isStale: false,
        origin: 'human',
        confirmedAt: null,
        version: 1,
        conflict: null,
        ...überschreibung,
      },
    ],
  })

  async function oeffneAendern(routen: Record<string, unknown> = {}) {
    renderPage(<DomainDetailPage />, wissen())
    await settle()
    await userEvent.click(screen.getByRole('button', { name: 'Ändern' }))
    void routen
    return within(screen.getByRole('dialog'))
  }

  it('der Bogen kommt mit allem, was dasteht – nicht nur mit dem Wert', async () => {
    installBackend({ routes: { 'domains/detail': mitAngabe() } })
    const bogen = await oeffneAendern()

    expect((bogen.getByLabelText(/Was soll festgehalten werden/) as HTMLInputElement).value).toBe('Schugröße')
    expect((bogen.getByLabelText('Art der Angabe') as HTMLSelectElement).value).toBe('number')
    expect((bogen.getByLabelText(/bleibt sie verlässlich/) as HTMLSelectElement).value).toBe('P6W')
    expect((bogen.getByLabelText(/^Wert/) as HTMLInputElement).value, 'der Wert fehlt').toBe('29')
  })

  it('der Tippfehler im Namen lässt sich berichtigen', async () => {
    const gesendet = vi.fn()
    installBackend({ routes: { 'domains/detail': mitAngabe() }, onMutate: gesendet })
    const bogen = await oeffneAendern()

    const feld = bogen.getByLabelText(/Was soll festgehalten werden/)
    await userEvent.clear(feld)
    await userEvent.type(feld, 'Schuhgröße')
    await userEvent.click(bogen.getByRole('button', { name: 'Speichern' }))
    await settle()

    const [, , koerper] = anfragen(gesendet, 'PATCH', '/state-definitions/')[0] as [string, string, { label: string }]
    expect(koerper.label).toBe('Schuhgröße')
  })

  it('was sich nicht geändert hat, geht auch nicht hinaus', async () => {
    const gesendet = vi.fn()
    installBackend({ routes: { 'domains/detail': mitAngabe() }, onMutate: gesendet })
    const bogen = await oeffneAendern()

    /*
      Sonst stünde nach jedem Öffnen des Bogens eine Änderung im Verlauf, auch wenn jemand nur
      nachgesehen hat.
    */
    await userEvent.click(bogen.getByRole('button', { name: 'Speichern' }))
    await settle()
    expect(anfragen(gesendet, 'PATCH', '/state-definitions/'), 'es ging eine leere Änderung hinaus').toHaveLength(0)
    expect(anfragen(gesendet, 'PUT', '/value'), 'der unveränderte Wert wurde neu geschrieben').toHaveLength(0)
  })

  it('die Art steht fest, solange ein Wert dasteht', async () => {
    installBackend({ routes: { 'domains/detail': mitAngabe() } })
    const bogen = await oeffneAendern()

    /*
      „29" als Zahl ist als Datum nichts. Der Dienst lehnt den Wechsel ab – ein Feld
      anzubieten, das dann scheitert, wäre eine Falle.
    */
    expect((bogen.getByLabelText('Art der Angabe') as HTMLSelectElement).disabled).toBe(true)
  })

  it('ohne Wert ist die Art noch frei', async () => {
    installBackend({ routes: { 'domains/detail': mitAngabe({ valueKind: 'unknown', value: null }) } })
    const bogen = await oeffneAendern()
    expect((bogen.getByLabelText('Art der Angabe') as HTMLSelectElement).disabled).toBe(false)
  })
})
