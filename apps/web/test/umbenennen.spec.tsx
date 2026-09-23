import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DOMAIN, installBackend, renderPage, settle } from './harness.js'
import { DomainsPage } from '../src/pages/DomainsPage.js'
import { DomainDetailPage } from '../src/pages/DomainDetailPage.js'
import fixtures from './fixtures/api.json' with { type: 'json' }

/**
 * Umbenennen im Baum (docs/75).
 *
 * Im Bearbeiten-Modus ließ sich eine Zeile verschieben, einfärben und löschen – nur nicht
 * umbenennen. Den Namen zu ändern hieß: Bereich öffnen, „Diesen Bereich verwalten",
 * „Bearbeiten". Drei Schritte für die naheliegendste Änderung von allen, und zwar genau dort
 * nicht erreichbar, wo man gerade aufräumt.
 */
const ersterName = ((fixtures as { responses: Record<string, unknown> }).responses['domains'] as {
  items: { name: string }[]
}).items[0]!.name

async function bearbeitenModus() {
  await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }))
}

describe('Ein Bereich lässt sich dort umbenennen, wo man ihn sieht', () => {
  it('jede Zeile im Bearbeiten-Modus trägt den Knopf', async () => {
    installBackend()
    renderPage(<DomainsPage />, { route: '/bereiche', path: '/bereiche' })
    await settle()

    expect(screen.queryAllByRole('button', { name: /umbenennen oder einordnen/ }), 'ohne Bearbeiten steht er da').toHaveLength(0)

    await bearbeitenModus()
    expect(screen.getAllByRole('button', { name: /umbenennen oder einordnen/ }).length).toBeGreaterThan(0)
  })

  it('der Bogen kommt mit dem Namen, der schon dasteht', async () => {
    installBackend()
    renderPage(<DomainsPage />, { route: '/bereiche', path: '/bereiche' })
    await settle()
    await bearbeitenModus()

    await userEvent.click(screen.getByRole('button', { name: `„${ersterName}" umbenennen oder einordnen` }))

    const bogen = within(screen.getByRole('dialog'))
    expect((bogen.getByLabelText('Wie heißt der Bereich?') as HTMLInputElement).value).toBe(ersterName)
  })

  it('der neue Name geht als PATCH hinaus', async () => {
    const gesendet = vi.fn()
    installBackend({ onMutate: gesendet })
    renderPage(<DomainsPage />, { route: '/bereiche', path: '/bereiche' })
    await settle()
    await bearbeitenModus()

    await userEvent.click(screen.getByRole('button', { name: `„${ersterName}" umbenennen oder einordnen` }))
    const bogen = within(screen.getByRole('dialog'))
    const feld = bogen.getByLabelText('Wie heißt der Bereich?')
    await userEvent.clear(feld)
    await userEvent.type(feld, 'Anders benannt')
    await userEvent.click(bogen.getByRole('button', { name: 'Speichern' }))
    await settle()

    const aufruf = gesendet.mock.calls.find(([m, pfad]) => m === 'PATCH' && String(pfad).includes('/domains/'))
    expect(aufruf, 'es ging keine Änderung hinaus').toBeTruthy()
    expect((aufruf as [string, string, { name: string }])[2].name).toBe('Anders benannt')
  })

  it('es ist derselbe Bogen wie auf der Bereichsseite, nicht ein zweiter', async () => {
    installBackend()
    renderPage(<DomainsPage />, { route: '/bereiche', path: '/bereiche' })
    await settle()
    await bearbeitenModus()
    await userEvent.click(screen.getByRole('button', { name: `„${ersterName}" umbenennen oder einordnen` }))

    /*
      Zwei Formulare für Name, Einordnung und Wichtigkeit laufen auseinander, sobald eines ein
      Feld dazubekommt. Erkennbar ist das hier daran, dass alle drei Felder da sind.
    */
    const bogen = within(screen.getByRole('dialog'))
    expect(bogen.getByLabelText('Wie heißt der Bereich?')).toBeTruthy()
    expect(bogen.getByLabelText(/Gehört er zu einem größeren Bereich/)).toBeTruthy()
    expect(bogen.getByLabelText(/Wie wichtig ist er/)).toBeTruthy()
  })
})

/**
 * Und auf der Seite des Bereichs selbst.
 *
 * Dort führte der Weg zum Namen über den fünften Abschnitt („Diesen Bereich verwalten") –
 * während der Name einen Zentimeter weiter oben als Überschrift steht.
 */
describe('Der Bereich lässt sich auf seiner eigenen Seite umbenennen', () => {
  const seite = () => ({ route: `/bereiche/${DOMAIN}/wissen`, path: '/bereiche/:domainId/:section' })

  it('der Knopf steht im Kopf, neben dem Namen', async () => {
    installBackend()
    renderPage(<DomainDetailPage />, seite())
    await settle()

    const knopf = screen.getByRole('button', { name: 'Umbenennen' })
    expect(knopf).toBeTruthy()
    expect(knopf.closest('.page-head'), 'der Knopf steht irgendwo, nur nicht beim Namen').toBeTruthy()
  })

  it('er öffnet denselben Bogen und schickt den neuen Namen', async () => {
    const gesendet = vi.fn()
    installBackend({ onMutate: gesendet })
    renderPage(<DomainDetailPage />, seite())
    await settle()

    await userEvent.click(screen.getByRole('button', { name: 'Umbenennen' }))
    const bogen = within(screen.getByRole('dialog'))
    const feld = bogen.getByLabelText('Wie heißt der Bereich?')
    await userEvent.clear(feld)
    await userEvent.type(feld, 'Frisch benannt')
    await userEvent.click(bogen.getByRole('button', { name: 'Speichern' }))
    await settle()

    const aufruf = gesendet.mock.calls.find(([m, pfad]) => m === 'PATCH' && String(pfad).includes('/domains/'))
    expect((aufruf as [string, string, { name: string }])[2].name).toBe('Frisch benannt')
  })
})
