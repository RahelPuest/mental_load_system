import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { ComponentType } from 'react'
import { installBackend, renderPage, loadStylesheet, DOMAIN, settle } from './harness.js'

import { NowPage } from '../src/pages/NowPage.js'
import { InboxPage } from '../src/pages/InboxPage.js'
import { PlanPage } from '../src/pages/PlanPage.js'
import { DomainsPage } from '../src/pages/DomainsPage.js'
import { DomainDetailPage } from '../src/pages/DomainDetailPage.js'
import { FamilyPage } from '../src/pages/FamilyPage.js'
import { PlaybooksPage } from '../src/pages/PlaybooksPage.js'
import { CalendarPage } from '../src/pages/CalendarPage.js'
import { SettingsPage } from '../src/pages/SettingsPage.js'
import { KnowledgePage } from '../src/pages/KnowledgePage.js'
import { WatchPage } from '../src/pages/WatchPage.js'
import { ProcessesPage } from '../src/pages/ProcessesPage.js'
import { OverviewPage } from '../src/pages/OverviewPage.js'
import { HelpPage } from '../src/pages/HelpPage.js'
import { Sheet, ToastProvider, useToast } from '../src/design/overlay.js'
import { Button } from '../src/design/components.js'

/**
 * Auftrag §38 – Barrierefreiheit als Definition of Done, nicht als Nacharbeit.
 *
 * Diese Datei prüft die Aussagen, die docs/42 macht, an der gerenderten Oberfläche.
 */

const PAGES: { name: string; Component: ComponentType; route: string; path: string }[] = [
  { name: 'Jetzt', Component: NowPage, route: '/jetzt', path: '/jetzt' },
  { name: 'Plan', Component: PlanPage, route: '/plan', path: '/plan' },
  { name: 'Eingang', Component: InboxPage, route: '/eingang', path: '/eingang' },
  { name: 'Bereiche', Component: DomainsPage, route: '/bereiche', path: '/bereiche' },
  { name: 'Bereichsdetail', Component: DomainDetailPage, route: `/bereiche/${DOMAIN}`, path: '/bereiche/:domainId' },
  { name: 'Familie', Component: FamilyPage, route: '/familie', path: '/familie' },
  { name: 'Abläufe', Component: PlaybooksPage, route: '/ablaeufe', path: '/ablaeufe' },
  { name: 'Kalender', Component: CalendarPage, route: '/kalender', path: '/kalender' },
  { name: 'Wissen', Component: KnowledgePage, route: '/wissen', path: '/wissen' },
  { name: 'Regeln', Component: WatchPage, route: '/regeln', path: '/regeln' },
  { name: 'Vorgänge', Component: ProcessesPage, route: '/vorgaenge', path: '/vorgaenge' },
  { name: 'Übersicht', Component: OverviewPage, route: '/uebersicht', path: '/uebersicht' },
  { name: 'Hilfe', Component: HelpPage, route: '/hilfe', path: '/hilfe' },
  { name: 'Einstellungen', Component: SettingsPage, route: '/einstellungen/haushalt', path: '/einstellungen/:section' },
]

/** Ermittelt den zugänglichen Namen so, wie ihn ein Screenreader bilden würde. */
function accessibleName(el: HTMLElement): string {
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .join(' ')
    if (parts.trim()) return parts.trim()
  }
  const aria = el.getAttribute('aria-label')
  if (aria?.trim()) return aria.trim()
  const title = el.getAttribute('title')
  if (title?.trim()) return title.trim()
  // Text ohne rein dekorative Symbole.
  const clone = el.cloneNode(true) as HTMLElement
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"], .visually-hidden ~ *')) hidden.remove()
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

describe('§38 – Jede Ansicht ist bedienbar ohne Maus und ohne Sicht', () => {
  for (const page of PAGES) {
    describe(page.name, () => {
      beforeEach(() => installBackend())

      it('jedes Bedienelement hat einen Namen', async () => {
        renderPage(<page.Component />, { route: page.route, path: page.path })
        await settle()
        const controls = [
          ...document.querySelectorAll<HTMLElement>('button, a[href], [role="button"], summary'),
        ]
        expect(controls.length, 'Ansicht ohne jedes Bedienelement').toBeGreaterThan(0)
        const nameless = controls.filter((c) => accessibleName(c).length === 0)
        expect(
          nameless.map((c) => c.outerHTML.slice(0, 120)),
          'Bedienelemente ohne zugänglichen Namen',
        ).toEqual([])
      })

      it('jedes Eingabefeld ist beschriftet', async () => {
        renderPage(<page.Component />, { route: page.route, path: page.path })
        await settle()
        const fields = [...document.querySelectorAll<HTMLElement>('input, select, textarea')].filter(
          (f) => f.getAttribute('type') !== 'hidden',
        )
        const unlabelled = fields.filter((f) => {
          if (f.getAttribute('aria-label') || f.getAttribute('aria-labelledby')) return false
          const id = f.getAttribute('id')
          if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) return false
          return !f.closest('label')
        })
        expect(
          unlabelled.map((f) => f.outerHTML.slice(0, 120)),
          'Eingabefelder ohne Beschriftung',
        ).toEqual([])
      })

      it('die Überschriftenebenen springen nicht', async () => {
        renderPage(<page.Component />, { route: page.route, path: page.path })
        await settle()
        const levels = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) =>
          Number(h.tagName[1]),
        )
        expect(levels.length, 'Ansicht ohne Überschrift').toBeGreaterThan(0)
        expect(levels.filter((l) => l === 1).length, 'genau eine Hauptüberschrift').toBeLessThanOrEqual(1)
        let previous = levels[0]!
        for (const level of levels.slice(1)) {
          expect(level - previous, `Sprung von h${previous} auf h${level}`).toBeLessThanOrEqual(1)
          previous = level
        }
      })

      it('dekorative Symbole sind für Vorleseprogramme unsichtbar', async () => {
        renderPage(<page.Component />, { route: page.route, path: page.path })
        await settle()
        const svgs = [...document.querySelectorAll('svg')]
        const speaking = svgs.filter(
          (s) => s.getAttribute('aria-hidden') !== 'true' && !s.getAttribute('aria-label'),
        )
        expect(speaking.length, 'Symbole ohne aria-hidden und ohne Namen').toBe(0)
      })

      it('Farbe ist nie der einzige Bedeutungsträger', async () => {
        renderPage(<page.Component />, { route: page.route, path: page.path })
        await settle()
        const tinted = [
          ...document.querySelectorAll<HTMLElement>(
            '[class*="tone-"], [class*="tinted-"], .chip, .badge, .notice',
          ),
        ]
        const mute = tinted.filter((el) => (el.textContent ?? '').trim().length === 0)
        expect(
          mute.map((el) => el.className),
          'eingefärbtes Element ohne Text',
        ).toEqual([])
      })
    })
  }
})

describe('§38 – Overlays führen den Fokus', () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Öffnen
        </button>
        <Sheet open={open} onClose={() => setOpen(false)} title="Kurze Entscheidung" description="Erklärung">
          <label htmlFor="feld">Feld</label>
          <input id="feld" />
          <Button onClick={() => setOpen(false)}>Übernehmen</Button>
        </Sheet>
      </>
    )
  }

  beforeEach(() => installBackend())

  it('meldet sich als Dialog mit Namen und Beschreibung', async () => {
    renderPage(<Harness />)
    await userEvent.click(await screen.findByRole('button', { name: 'Öffnen' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy()
  })

  it('setzt den Fokus hinein, hält ihn dort und gibt ihn zurück', async () => {
    renderPage(<Harness />)
    const trigger = await screen.findByRole('button', { name: 'Öffnen' })
    await userEvent.click(trigger)
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    // Tab am Ende springt an den Anfang zurück, verlässt den Dialog also nicht.
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button, input')]
    focusable[focusable.length - 1]!.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })
})

describe('§57 – Rückgängig statt Bestätigungsdialog', () => {
  function ToastHarness() {
    const toast = useToast()
    return (
      <button type="button" onClick={() => toast.show('Erledigt.', () => undefined)}>
        Abhaken
      </button>
    )
  }

  it('die Rückmeldung wird angesagt und bietet die Rücknahme an', async () => {
    installBackend()
    renderPage(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Abhaken' }))
    const live = document.querySelector('[aria-live], [role="status"], [role="alert"]')
    expect(live, 'Rückmeldung ohne Live-Region').not.toBeNull()
    expect(live?.textContent).toContain('Erledigt.')
    expect(await screen.findByRole('button', { name: 'Rückgängig' })).toBeTruthy()
  })
})

describe('§23 – Trefferflächen und Bewegung', () => {
  beforeEach(() => loadStylesheet())

  it('Knöpfe und Zeilen sind mindestens 44 px hoch', () => {
    const css = document.getElementById('thealotta-css')!.textContent!
    // Genau die Basisregel, nicht irgendeine, die den Namen enthält.
    const rule = (selector: string) => {
      const match = new RegExp(`(?:^|\\})\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'm').exec(css)
      return match?.[1] ?? ''
    }
    /*
      Die Höhe steht als Token da (`--control-h`), nicht als Zahl. Geprüft wird deshalb
      beides: dass `.btn` das Token benutzt **und** dass das Token mindestens die
      Fingerbreite ist – sonst verschöbe eine Änderung am Token die Trefferfläche, ohne dass
      hier etwas aufträte.
    */
    expect(rule('.btn')).toMatch(/min-height:\s*var\(--control-h\)/)
    const controlH = /--control-h:\s*(\d+)px/.exec(css)?.[1]
    expect(Number(controlH)).toBeGreaterThanOrEqual(44)
    // Zeilen dürfen kompakter sein, aber nicht unter der Fingerbreite minus Innenabstand.
    const row = /\.row\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    const min = /min-height:\s*(\d+)px/.exec(row)?.[1]
    expect(Number(min)).toBeGreaterThanOrEqual(44)
  })

  it('reduzierte Bewegung wird respektiert', () => {
    const css = document.getElementById('thealotta-css')!.textContent!
    expect(css).toContain('prefers-reduced-motion')
  })

  it('der Fokusring ist sichtbar definiert und wird nirgends entfernt', () => {
    const css = document.getElementById('thealotta-css')!.textContent!
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*[^;]*solid/)
    const removals = [...css.matchAll(/([^{}]+)\{[^}]*outline:\s*(none|0)[^}]*\}/g)].map((m) => m[1]!.trim())
    for (const selector of removals) {
      // Erlaubt ist das Entfernen nur dort, wo es keinen Ring gab (`:focus` ohne
      // `:focus-visible`) – oder wo derselbe Selektor den Ring auf seiner Pseudofläche
      // wieder aufbaut, weil die Trefferfläche größer ist als das Element.
      const replaced = new RegExp(
        `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}::after\\s*\\{[^}]*outline:\\s*[^;n]`,
      ).test(css)
      if (replaced) continue
      expect(
        selector,
        `${selector} entfernt den Fokusring, ohne ihn zu ersetzen`,
      ).toMatch(/:focus:not\(:focus-visible\)|::-moz-focus-inner/)
    }
  })
})
