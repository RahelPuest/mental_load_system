import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { installBackend, renderPage, settle } from './harness.js'
import { NowPage } from '../src/pages/NowPage.js'
import fixtures from './fixtures/api.json' with { type: 'json' }

/**
 * Die Listenansicht in „Jetzt" (docs/80).
 *
 * Zwei Dinge werden hier geprüft, die kein Test der Domänenschicht sehen kann:
 *
 *  1. **Die Steuerung liegt geschlossen da.** docs/48 zählt sichtbare Bedienelemente als
 *     Last, und `jetzt` lag dort bei „Hoch". Drei Zeiträume, sechs Reihenfolgen und zwei
 *     Schalter offen hinzulegen wäre ein Rückschritt in genau dieser Kennzahl.
 *  2. **Überhang und Nicht-Planbares stehen wirklich auf der Seite** – INV-007 nützt nichts,
 *     wenn die Oberfläche sie wegwirft.
 */
const NOW_MIT_PLAN = (() => {
  const basis = (fixtures as { responses: Record<string, { sections: { items: unknown[] }[] }> }).responses['now']!
  const beispiel = basis.sections.flatMap((s) => s.items).find(Boolean) as Record<string, unknown>
  const eintrag = (titel: string, grund: string) => ({
    ...beispiel,
    subjectId: `${titel}-id`,
    title: titel,
    placedBecause: grund,
    cue: null,
  })
  return {
    ...basis,
    plan: {
      horizon: 'day',
      strategy: 'deadline_first',
      aging: true,
      slack: true,
      note: 'Früheste Frist zuerst (EDF). Bei mehr Arbeit als Zeit verliert diese Reihenfolge ihre Stärke.',
      slots: [
        {
          key: '2026-09-22',
          label: 'Dienstag, 22.09',
          from: '2026-09-22T00:00:00.000Z',
          to: '2026-09-23T00:00:00.000Z',
          budgetMinutes: 83,
          plannedMinutes: 45,
          entries: [eintrag('Reifen prüfen', 'Von allem Offenen läuft das hier als Erstes ab.')],
        },
      ],
      overflow: [eintrag('Keller aufräumen', 'Passt nicht mehr in den Tag.')],
      notPlannable: [eintrag('Rückruf abwarten', 'Wartet auf etwas von außen.')],
    },
  }
})()

beforeEach(() => vi.useRealTimers())
afterEach(() => vi.restoreAllMocks())

describe('Die Liste in „Jetzt"', () => {
  it('zeigt Abschnitt, Begründung, Überhang und Nicht-Planbares', async () => {
    installBackend({ routes: { now: NOW_MIT_PLAN } })
    renderPage(<NowPage />)
    await settle()

    expect(screen.getByText('Dienstag, 22.09')).toBeTruthy()
    expect(screen.getByText('Reifen prüfen')).toBeTruthy()
    expect(screen.getByText('Von allem Offenen läuft das hier als Erstes ab.')).toBeTruthy()
    expect(screen.getByText(/45 von 83 Minuten verplant/)).toBeTruthy()
    expect(screen.getByText(/Passt nicht in den Zeitraum/)).toBeTruthy()
    expect(screen.getByText(/Lässt sich nicht einplanen/)).toBeTruthy()
  })

  it('sagt über der Liste, wann die Reihenfolge nicht taugt', async () => {
    installBackend({ routes: { now: NOW_MIT_PLAN } })
    renderPage(<NowPage />)
    await settle()
    expect(screen.getByText(/Bei mehr Arbeit als Zeit/)).toBeTruthy()
  })

  it('die Ansicht wird über Reiter gewechselt, nicht über einen Aufklapper', async () => {
    installBackend({ routes: { now: NOW_MIT_PLAN } })
    renderPage(<NowPage />)
    await settle()

    const reiter = screen.getByRole('radiogroup', { name: 'Ansicht' })
    expect(within(reiter).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Jetzt', 'Heute', 'Woche', 'Monat'])
    // Der Server hat einen Tagesplan geliefert – also steht „Heute" auf gewählt.
    expect(within(reiter).getByRole('radio', { name: 'Heute' }).getAttribute('aria-checked')).toBe('true')
    expect(within(reiter).getByRole('radio', { name: 'Jetzt' }).getAttribute('aria-checked')).toBe('false')
  })

  it('die Sortierung liegt geschlossen dahinter – ein benannter Klick (docs/48)', async () => {
    installBackend({ routes: { now: NOW_MIT_PLAN } })
    const { container } = renderPage(<NowPage />)
    await settle()

    const aufklapper = container.querySelector('details.disclosure')
    expect(aufklapper, 'die Einstellungen müssen in einem Aufklapper liegen').toBeTruthy()
    expect((aufklapper as HTMLDetailsElement).open, 'geschlossener Inhalt zählt nicht als Last').toBe(false)
    expect(aufklapper!.querySelector('summary')!.textContent).toMatch(/Wie sortiert wird/)
  })

  it('ohne Plan bleibt die Seite, wie sie war – und „Jetzt" ist der gewählte Reiter', async () => {
    installBackend()
    renderPage(<NowPage />)
    await settle()
    expect(screen.queryByText(/Passt nicht in den Zeitraum/), 'ungefragt keine Liste').toBeNull()

    const reiter = screen.getByRole('radiogroup', { name: 'Ansicht' })
    expect(within(reiter).getByRole('radio', { name: 'Jetzt' }).getAttribute('aria-checked')).toBe('true')
    // Ohne Liste gibt es nichts zu sortieren – also auch keine Einstellungen.
    expect(screen.queryByText(/Wie sortiert wird/), 'Einstellung ohne Gegenstand').toBeNull()
  })
})

describe('In der Liste lässt sich arbeiten', () => {
  /*
   * Die gemeldete Regression: Die erste Fassung baute die Einträge aus `Row` – einer
   * Navigationszeile. Damit ließ sich in der Liste nichts abhaken, nichts verschieben,
   * nichts abgeben. Eine Todo-Liste, in der man nichts tun kann, ist keine.
   */
  it('jeder Eintrag im Tagesplan trägt „Erledigt" und die weiteren Wege', async () => {
    installBackend({ routes: { now: NOW_MIT_PLAN } })
    renderPage(<NowPage />)
    await settle()

    const karte = screen.getByText('Reifen prüfen').closest('.card')
    expect(karte, 'der Eintrag muss eine Karte sein, keine blanke Zeile').toBeTruthy()
    expect(within(karte as HTMLElement).getByRole('button', { name: /Erledigt/ })).toBeTruthy()
    expect(within(karte as HTMLElement).getByRole('button', { name: /Später/ })).toBeTruthy()
    expect(within(karte as HTMLElement).getByText(/Geht gerade nicht/)).toBeTruthy()
  })

  it('auch im Überhang lässt sich abhaken – nicht eingeplant heißt nicht unerreichbar', async () => {
    installBackend({ routes: { now: NOW_MIT_PLAN } })
    renderPage(<NowPage />)
    await settle()

    const zeile = screen.getByText('Keller aufräumen').closest('li')
    expect(within(zeile as HTMLElement).getByRole('button', { name: /Erledigt/ })).toBeTruthy()
  })

  it('unter „Lässt sich nicht einplanen" gibt es nichts abzuhaken', async () => {
    installBackend({ routes: { now: NOW_MIT_PLAN } })
    renderPage(<NowPage />)
    await settle()

    const zeile = screen.getByText('Rückruf abwarten').closest('li')
    expect(
      within(zeile as HTMLElement).queryByRole('button', { name: /Erledigt/ }),
      'was auf andere wartet, hakt man nicht ab',
    ).toBeNull()
  })

  it('der Satz zur Platzierung steht am Eintrag, nicht in den Gründen', async () => {
    installBackend({ routes: { now: NOW_MIT_PLAN } })
    const { container } = renderPage(<NowPage />)
    await settle()

    const grund = container.querySelector('.plan-grund')
    expect(grund?.textContent).toContain('Von allem Offenen läuft das hier als Erstes ab.')
  })
})
