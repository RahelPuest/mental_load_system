import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import type { ComponentType } from 'react'
import { installBackend, renderPage, settle, DOMAIN, LONG_NAME, LONG_WORD, type Mode } from './harness.js'

import { NowPage } from '../src/pages/NowPage.js'
import { InboxPage } from '../src/pages/InboxPage.js'
import { PlanPage } from '../src/pages/PlanPage.js'
import { DomainsPage } from '../src/pages/DomainsPage.js'
import { DomainDetailPage } from '../src/pages/DomainDetailPage.js'
import { FamilyPage } from '../src/pages/FamilyPage.js'
import { PlaybooksPage } from '../src/pages/PlaybooksPage.js'
import { CalendarPage } from '../src/pages/CalendarPage.js'
import { MealsPage } from '../src/pages/MealsPage.js'
import { SettingsPage } from '../src/pages/SettingsPage.js'
import { KnowledgePage } from '../src/pages/KnowledgePage.js'
import { WatchPage } from '../src/pages/WatchPage.js'
import { ProcessesPage } from '../src/pages/ProcessesPage.js'
import { OverviewPage } from '../src/pages/OverviewPage.js'
import { HelpPage } from '../src/pages/HelpPage.js'

/**
 * Auftrag §67 – „Definition of Done pro View" – als Test statt als Vorsatz.
 *
 * Jede Ansicht muss jeden dieser Zustände überleben und in jedem etwas Verständliches
 * zeigen. Bis zum dritten Durchgang war das eine Behauptung in der Dokumentation
 * (docs/44 §1): es gab keinen einzigen Test, der eine Komponente überhaupt rendert.
 */

interface View {
  name: string
  Component: ComponentType
  route: string
  path: string
  /** Überschrift, an der man erkennt, dass die Seite steht. */
  heading: RegExp
  /** Reine Verzeichnisseite ohne eigene Daten – Laden, Fehler und Sperre gibt es dort nicht. */
  static?: boolean
}

const VIEWS: View[] = [
  { name: 'Jetzt', Component: NowPage, route: '/jetzt', path: '/jetzt', heading: /Jetzt/i },
  { name: 'Plan', Component: PlanPage, route: '/plan', path: '/plan', heading: /Der Plan/i },
  { name: 'Eingang', Component: InboxPage, route: '/eingang', path: '/eingang', heading: /Eingang/i },
  { name: 'Bereiche', Component: DomainsPage, route: '/bereiche', path: '/bereiche', heading: /Bereiche/i },
  {
    name: 'Bereichsdetail',
    Component: DomainDetailPage,
    route: `/bereiche/${DOMAIN}`,
    path: '/bereiche/:domainId',
    heading: /./,
  },
  { name: 'Familie', Component: FamilyPage, route: '/familie', path: '/familie', heading: /Familie/i },
  { name: 'Abläufe', Component: PlaybooksPage, route: '/ablaeufe', path: '/ablaeufe', heading: /Abläufe/i },
  { name: 'Kalender', Component: CalendarPage, route: '/kalender', path: '/kalender', heading: /Kalender/i },
  { name: 'Essen', Component: MealsPage, route: '/essen', path: '/essen', heading: /Essen/i },
  {
    name: 'Essen-Gerichte',
    Component: MealsPage,
    route: '/essen/sammlung',
    path: '/essen/:section',
    heading: /Essen/i,
  },
  { name: 'Wissen', Component: KnowledgePage, route: '/wissen', path: '/wissen', heading: /Wissen/i },
  { name: 'Regeln', Component: WatchPage, route: '/regeln', path: '/regeln', heading: /Regeln/i },
  { name: 'Vorgänge', Component: ProcessesPage, route: '/vorgaenge', path: '/vorgaenge', heading: /Vorgänge/i },
  {
    name: 'Übersicht',
    Component: OverviewPage,
    route: '/uebersicht',
    path: '/uebersicht',
    heading: /Übersicht/i,
    static: true,
  },
  {
    name: 'Einstellungen',
    Component: SettingsPage,
    route: '/einstellungen/haushalt',
    path: '/einstellungen/:section',
    heading: /Haushalt/i,
  },
  {
    name: 'Einstellungen-Übersicht',
    Component: SettingsPage,
    route: '/einstellungen',
    path: '/einstellungen',
    heading: /Einstellungen/i,
    static: true,
  },
  {
    name: 'Hilfe',
    Component: HelpPage,
    route: '/hilfe',
    path: '/hilfe',
    heading: /Wie Thealotta denkt/i,
    // Reiner Erklärtext ohne Daten.
    static: true,
  },
]

async function mount(view: View, mode: Mode | 'long' = 'ok'): Promise<void> {
  installBackend(mode === 'long' ? { longNames: true } : { mode })
  renderPage(<view.Component />, { route: view.route, path: view.path })
  if (mode === 'loading') {
    await waitFor(() => expect(screen.queryByTestId('session-pending')).toBeNull(), { timeout: 6000 })
    return
  }
  await settle()
}

/** Alles, was die Oberfläche nie sagen darf. */
const JARGON = [
  'AttentionItem', 'Attention Item', 'StateDefinition', 'StateValue', 'ResponsibilityAssignment',
  'MonitoringRule', 'WaitingState', 'Playbook Instance', 'Signal ',
  'Idempotency', 'RLS', 'Tenant', 'undefined', 'NaN', '[object Object]', 'null,', 'Error:',
  'Cannot read', 'household_id', 'membershipId', 'subjectId',
]

const SHAMEFUL = [
  'überfällig', 'Rückstand', 'versäumt', 'versagt', 'du hast nicht', 'Verspätung',
  'du solltest längst', 'faul',
]

function visibleText(): string {
  return document.body.textContent ?? ''
}

describe('§67 – Definition of Done pro Ansicht', () => {
  afterEach(() => vi.restoreAllMocks())

  for (const view of VIEWS) {
    describe(view.name, () => {
      it('mit Daten: steht, nennt sich, und zeigt keine Modellbegriffe', async () => {
        await mount(view, 'ok')
        const headings = screen.getAllByRole('heading')
        expect(headings.length, 'jede Ansicht braucht mindestens eine Überschrift').toBeGreaterThan(0)
        const text = visibleText()
        for (const term of JARGON) {
          expect(text, `Modellbegriff „${term}" ist sichtbar`).not.toContain(term)
        }
      })

      it('leer: erklärt den Bereich, statt „keine Daten" zu melden', async () => {
        await mount(view, 'empty')
        const text = visibleText()
        expect(text).not.toMatch(/keine Daten|no data|leer\.$/i)
        // Ein leerer Zustand muss etwas erklären – ein einzelnes Wort genügt nicht.
        expect(text.length, 'leerer Zustand ohne Erklärung').toBeGreaterThan(80)
      })

      it.skipIf(view.static)('Fehler: sagt, was los ist, dass nichts verloren ist, und bietet einen Weg', async () => {
        await mount(view, 'error')
        const text = visibleText()
        expect(text, 'kein technischer Fehlertext').not.toMatch(/500|fetch|Internal Server|stack/i)
        expect(text).toMatch(/nicht geklappt|nicht geladen|nicht erreichbar|nichts verloren|Erneut/i)
      })

      it.skipIf(view.static)('ohne Berechtigung: eigener Zustand statt Fehler', async () => {
        await mount(view, 'forbidden')
        const text = visibleText()
        expect(text).not.toMatch(/403|Forbidden/i)
        expect(text, 'weder Erklärung noch Fehlerzustand').toMatch(
          /nicht freigegeben|fehlt dir die Berechtigung|nicht geklappt|nicht geladen|Erneut/i,
        )
      })

      it.skipIf(view.static)('lädt: zeigt Platzhalter statt einer leeren Seite', async () => {
        await mount(view, 'loading')
        await waitFor(() => {
          const skeletons = document.querySelectorAll('.skeleton')
          const spinners = document.querySelectorAll('[class*="spinner"]')
          expect(skeletons.length + spinners.length, 'kein Ladezustand sichtbar').toBeGreaterThan(0)
        })
      })

      it('sehr lange Namen: bleiben lesbar und sprengen nichts', async () => {
        await mount(view, 'long')
        const text = visibleText()
        if (!text.includes(LONG_NAME.slice(0, 40))) return // Ansicht zeigt keine Namen
        // Der vollständige Name muss erreichbar sein – Kürzen darf nur die Darstellung sein.
        for (const node of document.querySelectorAll('.row-title, .hit-title')) {
          const el = node as HTMLElement
          const style = getComputedStyle(el)
          if (style.whiteSpace === 'nowrap') {
            expect(
              el.getAttribute('title'),
              'in einer Zeile abgeschnitten, ohne den vollen Text zugänglich zu machen',
            ).toBeTruthy()
          }
        }
        expect(text).not.toContain(`${LONG_WORD}${LONG_WORD}`)
      })

      it('Sprache bleibt ohne Schuldzuweisung (§36)', async () => {
        await mount(view, 'ok')
        const text = visibleText().toLowerCase()
        for (const word of SHAMEFUL) {
          expect(text, `beschämende Formulierung „${word}"`).not.toContain(word.toLowerCase())
        }
      })
    })
  }
})

describe('§67 – Teilweise geladene Daten', () => {
  it('Bereichsdetail zeigt, was da ist, wenn nur ein Teil scheitert', async () => {
    installBackend({ failing: ['/handover', '/needs'] })
    renderPage(<DomainDetailPage />, { route: `/bereiche/${DOMAIN}`, path: '/bereiche/:domainId' })
    await settle()
    // Die Hauptinhalte bleiben sichtbar, obwohl Nebenabfragen scheitern.
    expect(visibleText()).toMatch(/Zustand|Wissen|Frage|Verantwortung|Bereich/i)
  })

  it('Jetzt bleibt bedienbar, wenn nur die Kapazität nicht lädt', async () => {
    installBackend({ failing: ['/capacity/'] })
    renderPage(<NowPage />, { route: '/jetzt', path: '/jetzt' })
    await settle()
    expect(visibleText().length).toBeGreaterThan(60)
  })
})

describe('§7 – Die Jetzt-Ansicht erklärt sich selbst', () => {
  beforeEach(() => installBackend())

  it('jeder Eintrag nennt einen Grund (INV-008)', async () => {
    renderPage(<NowPage />, { route: '/jetzt', path: '/jetzt' })
    await settle()
    const rows = document.querySelectorAll('.card')
    expect(rows.length).toBeGreaterThan(0)
    // „Warum jetzt?" muss irgendwo beantwortet sein – als Text, nicht als Zahl.
    expect(visibleText()).toMatch(/Warum|weil|seit|Regel|passt|wartet|Grund/i)
  })

  it('zeigt keinen Punktestand und keine Rückstandszahl (§35, §42)', async () => {
    renderPage(<NowPage />, { route: '/jetzt', path: '/jetzt' })
    await settle()
    const text = visibleText()
    expect(text).not.toMatch(/\bPunkte\b|\bScore\b|Streak|\d+\s*%\s*erledigt/i)
  })
})

describe('§43/§44 – Sichtbarkeit und Berechtigungen sind erklärt, nicht tabelliert', () => {
  it('Einstellungen zeigen Zugriff als Satz, nicht als Matrix', async () => {
    installBackend()
    renderPage(<SettingsPage />, { route: '/einstellungen/rechte', path: '/einstellungen/:section' })
    await settle()
    const tables = document.querySelectorAll('table')
    for (const table of tables) {
      const head = within(table as HTMLElement).queryAllByRole('columnheader')
      expect(head.length, 'Berechtigungen als Matrix statt als Satz (§44)').toBeLessThan(4)
    }
  })
})

describe('§3.1 – Modellbegriffe erscheinen nirgends, auch nicht aus Servertexten', () => {
  /**
   * Aufgefallen im echten Browser: die Begründung einer Meldung enthielt den rohen
   * Modellwert – „Der Bereich ist als „critical" eingestuft". Solche Werte kommen aus
   * dem Server und rutschen an jeder Prüfung der Oberfläche vorbei.
   */
  const ENUMS = [
    'critical', 'high', 'low', 'normal',
    'state_freshness', 'coverage_gap', 'attention_item', 'system_rule',
    'responsibility', 'execution', 'primary_owner',
  ]

  for (const view of [
    { name: 'Regeln', Component: WatchPage, route: '/regeln', path: '/regeln' },
    { name: 'Jetzt', Component: NowPage, route: '/jetzt', path: '/jetzt' },
    { name: 'Bereichsdetail', Component: DomainDetailPage, route: `/bereiche/${DOMAIN}`, path: '/bereiche/:domainId' },
  ]) {
    it(`${view.name}: kein Aufzählungswert steht in Anführungszeichen im Text`, async () => {
      installBackend()
      renderPage(<view.Component />, { route: view.route, path: view.path })
      await settle()
      // Aufklappbares mit aufnehmen: Gründe stehen teils hinter „weitere Gründe".
      for (const details of document.querySelectorAll('details')) details.setAttribute('open', '')
      const text = visibleText()
      for (const value of ENUMS) {
        for (const quoted of [`„${value}"`, `„${value}“`, `"${value}"`]) {
          expect(text, `Modellwert ${quoted} steht in der Oberfläche`).not.toContain(quoted)
        }
      }
    })
  }
})
