import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { installBackend, renderPage, settle, DOMAIN } from './harness.js'
import { DomainDetailPage } from '../src/pages/DomainDetailPage.js'

/**
 * Jeder bestehende Eintrag lässt sich ändern.
 *
 * Gemeldet als: „ich kann immer noch nicht die Einträge in Was wir wissen, Regeln oder
 * Läuft gerade editieren." Und das stimmte: Angaben und Regeln hatten ein „Ändern",
 * Notizen, Fragen, Aufgaben und Vorgänge nicht – Entscheidungen hatten überhaupt keine
 * Aktion. Anlegen ging überall, Berichtigen nirgends.
 *
 * Geprüft wird die Erreichbarkeit, nicht das Speichern: Dass der Server die Änderung
 * übernimmt, steht in apps/api/test/eintraege-aendern.spec.ts.
 */
const abschnitte = [
  ['wissen', ['Angaben', 'Notizen und Fragen', 'Entscheidungen']],
  ['laeuft', ['Läuft gerade']],
] as const

describe('Auf der Bereichsseite lässt sich berichtigen', () => {
  for (const [abschnitt, ueberschriften] of abschnitte) {
    it(`${abschnitt}: jeder Eintrag trägt „Ändern"`, async () => {
      installBackend()
      const { container } = renderPage(<DomainDetailPage />, {
        route: `/bereiche/${DOMAIN}/${abschnitt}`,
        path: '/bereiche/:domainId/:section',
      })
      await settle()

      /*
        Über die Abschnitte laufen statt über Textsuche: „Angaben" und „Läuft gerade" stehen
        auch in der Abschnittsnavigation, und `getByText` fand prompt mehrere Treffer.
      */
      let gesehen = 0
      for (const sektion of container.querySelectorAll('section.section')) {
        const ueberschrift = sektion.querySelector('h2, h3')?.textContent ?? ''
        if (!ueberschriften.some((u) => ueberschrift.startsWith(u))) continue
        for (const eintrag of sektion.querySelectorAll('.setting-row, .rowlist > li')) {
          const knopf = within(eintrag as HTMLElement).queryByRole('button', { name: /ändern/i })
          expect(knopf, `„${ueberschrift.trim()}": ein Eintrag ohne Weg zum Berichtigen`).toBeTruthy()
          gesehen += 1
        }
      }
      expect(gesehen, 'der Abschnitt muss überhaupt Einträge zeigen').toBeGreaterThan(0)
    })
  }

  it('der Knopf sagt, was er ändert – nicht nur „Ändern"', async () => {
    /*
     * Zehn Knöpfe namens „Ändern" sind für jemanden, der die Seite hört statt sieht, nicht
     * unterscheidbar. Aufgefallen ist es, weil `getByRole('button', { name: 'Ändern' })` in
     * den Angabentests plötzlich mehrere Treffer fand.
     */
    installBackend()
    renderPage(<DomainDetailPage />, {
      route: `/bereiche/${DOMAIN}/wissen`,
      path: '/bereiche/:domainId/:section',
    })
    await settle()

    const knoepfe = screen.getAllByRole('button', { name: /ändern/i })
    const namen = knoepfe.map((k) => k.getAttribute('aria-label') ?? k.textContent ?? '')
    const benannt = namen.filter((n) => n.includes('„'))
    expect(benannt.length, 'die Knöpfe an den Einträgen müssen ihren Eintrag nennen').toBeGreaterThan(0)
    expect(new Set(benannt).size, 'und sie müssen sich voneinander unterscheiden').toBe(benannt.length)
  })
})
