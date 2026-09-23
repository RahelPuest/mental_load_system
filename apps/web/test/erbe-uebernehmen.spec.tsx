import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installBackend, renderPage, settle } from './harness.js'
import { DomainsPage } from '../src/pages/DomainsPage.js'
import fixtures from './fixtures/api.json' with { type: 'json' }

/**
 * „geerbt" ist der Weg, es zu beenden.
 *
 * Ein Unterbereich ohne eigene Zuweisung erbt die Verantwortung von oben (Q-04). Das stand als
 * reines Etikett da – eine Auskunft, die den häufigsten nächsten Schritt kennt und ihn nicht
 * anbietet. Jetzt ist das Etikett der Knopf.
 */
const alle = (fixtures as { responses: Record<string, unknown> }).responses['domains'] as {
  items: Record<string, unknown>[]
}

const mitErbe = () => ({
  items: alle.items.map((d, i) =>
    i === 1
      ? {
          ...d,
          name: 'Gummistiefel',
          ownershipInheritance: 'inherit',
          effectiveOwner: {
            membershipId: '01a07d11-af2b-710a-afa5-ab628f3cf977',
            displayName: 'Anna',
            inheritedFrom: 'kinder.kind_a.kleidung',
            viaCoverage: false,
          },
        }
      : d,
  ),
})

describe('Der geerbte Bereich bietet das Übernehmen an', () => {
  it('das Etikett ist ein Knopf, nicht nur eine Auskunft', async () => {
    installBackend({ routes: { domains: mitErbe() } })
    renderPage(<DomainsPage />, { route: '/bereiche', path: '/bereiche' })
    await settle()

    const knopf = document.querySelector('.erbe-chip')
    expect(knopf, 'kein Übernehmen-Knopf an einem geerbten Bereich').toBeTruthy()
    expect(knopf?.tagName, 'als <span> ist es weder fokussierbar noch bedienbar').toBe('BUTTON')
  })

  it('beide Aufschriften stehen im Knopf – sichtbar ist eine', async () => {
    installBackend({ routes: { domains: mitErbe() } })
    renderPage(<DomainsPage />, { route: '/bereiche', path: '/bereiche' })
    await settle()

    const knopf = document.querySelector('.erbe-chip')!
    expect(knopf.querySelector('.erbe-ruhe')?.textContent).toBe('geerbt')
    expect(knopf.querySelector('.erbe-aktion')?.textContent).toBe('übernehmen')
  })

  it('der vorgelesene Name ändert sich nicht unter dem Zeiger', async () => {
    installBackend({ routes: { domains: mitErbe() } })
    renderPage(<DomainsPage />, { route: '/bereiche', path: '/bereiche' })
    await settle()

    /*
      Ein Bedienelement, dessen Name beim Darauffahren wechselt, ist für jemanden, der es nicht
      sieht, zwei verschiedene Dinge. Deshalb trägt der Knopf einen festen Namen, und die beiden
      Aufschriften sind für Vorleseprogramme verborgen.
    */
    const knopf = screen.getByRole('button', { name: /Verantwortung für „Gummistiefel" selbst übernehmen/ })
    expect(knopf).toBeTruthy()
    expect(knopf.querySelector('.erbe-ruhe')?.getAttribute('aria-hidden')).toBe('true')
    expect(knopf.querySelector('.erbe-aktion')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('ein Klick übernimmt den Bereich regulär', async () => {
    const gesendet = vi.fn()
    installBackend({ routes: { domains: mitErbe() }, onMutate: gesendet })
    renderPage(<DomainsPage />, { route: '/bereiche', path: '/bereiche' })
    await settle()

    await userEvent.click(screen.getByRole('button', { name: /Verantwortung für „Gummistiefel" selbst übernehmen/ }))
    await settle()

    const aufruf = gesendet.mock.calls.find(([, pfad]) => String(pfad).includes('/claim'))
    expect(aufruf, 'es ging keine Übernahme hinaus').toBeTruthy()
    expect(aufruf?.[0], 'Übernehmen ist kein Lesevorgang').toBe('POST')
    // Die Meldung sagt, was sich geändert hat – nicht „gespeichert".
    expect(screen.getByText(/nicht mehr geerbt/)).toBeTruthy()
  })

  it('nur geerbte Bereiche tragen ihn', async () => {
    installBackend()
    renderPage(<DomainsPage />, { route: '/bereiche', path: '/bereiche' })
    await settle()

    /*
      Im Demobestand erbt nur ein Teil der Bereiche. Ein Knopf an jedem wäre eine Aufforderung
      dort, wo es nichts zu beenden gibt – und der Baum wäre voll mit ihr.

      Geprüft wird das Verhältnis, nicht die Zahl: Wie viele Zeilen der Baum gerade zeigt, hängt
      daran, was aufgeklappt ist, und das ist nicht die Aussage dieses Tests.
    */
    const knoepfe = document.querySelectorAll('.erbe-chip').length
    const zeilen = document.querySelectorAll('.row').length
    expect(knoepfe, 'kein einziger geerbter Bereich im Bestand – dann prüft der Test nichts').toBeGreaterThan(0)
    expect(knoepfe, 'jede Zeile fordert zum Übernehmen auf').toBeLessThan(zeilen)
  })
})
