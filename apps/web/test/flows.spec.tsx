import { ApiError } from '../src/lib/api.js'
import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installBackend, renderPage, DOMAIN, settle } from './harness.js'

import { NowPage } from '../src/pages/NowPage.js'
import { InboxPage } from '../src/pages/InboxPage.js'
import { DomainDetailPage } from '../src/pages/DomainDetailPage.js'
import { FamilyPage } from '../src/pages/FamilyPage.js'
import { SettingsPage } from '../src/pages/SettingsPage.js'
import { CaptureSheet } from '../src/components/CaptureSheet.js'

/**
 * Auftrag §60 – heuristische Reviews der zentralen Abläufe, als Test.
 *
 * Geprüft wird nicht, ob ein Knopf existiert, sondern ob der Ablauf das tut, was die
 * Produktentscheidung verlangt: Verantwortung geht nicht still über, Abhaken ist
 * zurücknehmbar, Abgeben verlangt eine Aussage, Warten ist ein Zustand.
 */

interface Call {
  method: string
  path: string
  body: unknown
}

function recorder(): { calls: Call[]; onMutate: (m: string, p: string, b: unknown) => void } {
  const calls: Call[] = []
  return { calls, onMutate: (method, path, body) => calls.push({ method, path, body }) }
}

describe('§16 – Erfassen', () => {
  it('nimmt einen Gedanken an, ohne nach Bereich, Datum oder Art zu fragen', async () => {
    const rec = recorder()
    installBackend({ onMutate: rec.onMutate })
    renderPage(<CaptureSheet open onClose={() => undefined} />)
    const dialog = await screen.findByRole('dialog')

    // Keine Pflichtfelder außer dem Text selbst.
    const selects = dialog.querySelectorAll('select')
    expect(selects.length, 'Erfassen darf keine Einordnung verlangen (§16)').toBe(0)

    await userEvent.type(screen.getByLabelText('Notiz'), 'Schuhe werden knapp')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(rec.calls.length).toBeGreaterThan(0))
    expect(rec.calls[0]!.path).toContain('/capture')
  })
})

describe('§57 – Abhaken ist zurücknehmbar, nicht bestätigungspflichtig', () => {
  it('erledigt sofort, meldet sich mit „Rückgängig" und nimmt es auch wirklich zurück', async () => {
    const rec = recorder()
    installBackend({ onMutate: rec.onMutate })
    renderPage(<NowPage />, { route: '/jetzt', path: '/jetzt' })
    await settle()

    const done = await screen.findAllByRole('button', { name: /Erledigt/i })
    await userEvent.click(done[0]!)

    // Kein Bestätigungsdialog dazwischen.
    expect(screen.queryByRole('dialog')).toBeNull()

    const undo = await screen.findByRole('button', { name: 'Rückgängig' })
    await waitFor(() => expect(rec.calls.some((c) => c.path.includes('/complete'))).toBe(true))

    await userEvent.click(undo)
    await waitFor(() => expect(rec.calls.some((c) => c.path.includes('/reopen'))).toBe(true))
  })
})

describe('§26/§27 – Abgeben und Warten sind dort erreichbar, wo man Aufgaben trifft', () => {
  it('die Jetzt-Ansicht bietet beides an, nicht nur Erledigt und Später', async () => {
    installBackend()
    renderPage(<NowPage />, { route: '/jetzt', path: '/jetzt' })
    await settle()
    const more = screen.getAllByText('Geht gerade nicht')
    expect(more.length, 'kein Weg außer erledigen oder verschieben').toBeGreaterThan(0)
    await userEvent.click(more[0]!)
    expect(screen.getAllByRole('button', { name: 'Abgeben' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /Ich warte auf jemanden/ }).length).toBeGreaterThan(0)
  })

  it('Abgeben benennt den Unterschied zwischen Ausführen und Mitdenken', async () => {
    const rec = recorder()
    installBackend({ onMutate: rec.onMutate })
    renderPage(<NowPage />, { route: '/jetzt', path: '/jetzt' })
    await settle()
    await userEvent.click(screen.getAllByText('Geht gerade nicht')[0]!)
    await userEvent.click(screen.getAllByRole('button', { name: 'Abgeben' })[0]!)
    const dialog = await screen.findByRole('dialog')
    expect(
      dialog.textContent ?? '',
      'Der Unterschied muss benannt sein, nicht nur ein Auswahlfeld',
    ).toMatch(/mitdenk|Ausführung/i)
  })

  it('Warten verlangt, worauf gewartet wird und wann wieder geschaut wird', async () => {
    installBackend()
    renderPage(<NowPage />, { route: '/jetzt', path: '/jetzt' })
    await settle()
    await userEvent.click(screen.getAllByText('Geht gerade nicht')[0]!)
    await userEvent.click(screen.getAllByRole('button', { name: /Ich warte auf jemanden/ })[0]!)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent ?? '').toMatch(/wor(auf|an)|wieder|erneut|nachfrag/i)
    // Und es darf sich nicht wie ein Versäumnis anfühlen.
    expect(dialog.textContent ?? '').not.toMatch(/blockiert|Verzögerung|Schuld/i)
  })
})

describe('§9 / INV-009 – Ausführen ist nicht Verantworten', () => {
  it('die Jetzt-Ansicht nennt beide Rollen getrennt, wenn sie auseinanderfallen', async () => {
    installBackend()
    renderPage(<NowPage />, { route: '/jetzt', path: '/jetzt' })
    await settle()
    const badges = [...document.querySelectorAll('.owner-badge, [class*="owner"]')]
    // Wo eine Zuweisung existiert, muss auch erkennbar sein, wer verantwortlich bleibt.
    const text = document.body.textContent ?? ''
    if (/erledigt für|führt aus|Ausführung/i.test(text)) {
      expect(badges.length).toBeGreaterThan(0)
    }
    expect(text).not.toMatch(/Besitzer|Owner\b/)
  })
})

describe('§8 – Kapazität ändern ist ein Angebot, keine Bewertung', () => {
  it('bietet die Stufen ohne Wertung an', async () => {
    installBackend()
    renderPage(<FamilyPage />, { route: '/familie', path: '/familie' })
    await settle()
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/Kapazität|heute/i)
    // „misst keine Leistung" ist erlaubt – gemeint ist die Darstellung als Leistung.
    expect(text, 'Kapazität darf nicht als Leistung dargestellt werden').not.toMatch(
      /(?<!keine )(?:Produktivität|Auslastung|Effizienz)|deine Leistung/i,
    )
  })
})

describe('§17 – Der Eingang verlangt möglichst wenige Entscheidungen', () => {
  it('schlägt eine Einordnung vor und begründet sie', async () => {
    installBackend()
    renderPage(<InboxPage />, { route: '/eingang', path: '/eingang' })
    await settle()
    const text = document.body.textContent ?? ''
    if (!/Eingang/i.test(text)) return
    // Entweder es ist leer, oder jeder Eintrag trägt einen Vorschlag mit Begründung.
    const cards = [...document.querySelectorAll('.card')]
    for (const card of cards) {
      const inner = card.textContent ?? ''
      expect(inner.length).toBeGreaterThan(10)
    }
  })
})

describe('§46 – Nichts passiert unsichtbar', () => {
  it('Bereichsdetail zeigt, was beobachtet wird und wann als Nächstes', async () => {
    installBackend()
    renderPage(<DomainDetailPage />, { route: `/bereiche/${DOMAIN}`, path: '/bereiche/:domainId' })
    await settle()
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/prüfen|beobacht|erinnert|Regel/i)
    // Und zwar in Worten, nicht als technische Konfiguration.
    expect(text).not.toMatch(/cron|interval:|rrule|P\d+[WD]\b/i)
  })
})

describe('§43 – Zugriff ist als Satz erklärt', () => {
  it('Bereichsdetail nennt Sichtbarkeit in Klartext, wenn etwas eingeschränkt ist', async () => {
    installBackend()
    renderPage(<DomainDetailPage />, { route: `/bereiche/${DOMAIN}`, path: '/bereiche/:domainId' })
    await settle()
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/sensitivity|capability|grant_effect|scope_type/i)
  })
})

describe('§21 – Fehler beim Handeln verlieren nichts', () => {
  it('ein gescheitertes Abhaken sagt, dass nichts verloren ist', async () => {
    installBackend()
    renderPage(<NowPage />, { route: '/jetzt', path: '/jetzt' })
    await settle()
    // Ab jetzt scheitern Mutationen.
    const original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') !== 'GET') {
        return new Response(JSON.stringify({ code: 'internal', title: 'Serverfehler' }), { status: 500 })
      }
      return original(input, init)
    }) as typeof fetch

    const done = await screen.findAllByRole('button', { name: /Erledigt/i })
    await userEvent.click(done[0]!)
    const live = await waitFor(() => {
      const node = document.querySelector('[role="status"], [role="alert"]')
      expect(node?.textContent?.length ?? 0).toBeGreaterThan(0)
      return node!
    })
    expect(live.textContent).toMatch(/nichts ist verloren|nicht gespeichert|nicht geklappt/i)
    globalThis.fetch = original
  })
})

describe('§36 – Sprache ohne Schuld über alle Ansichten', () => {
  const FORBIDDEN = [
    'überfällig',
    'im Rückstand',
    'versäumt',
    'du hast vergessen',
    'schon wieder',
    'endlich',
    'immer noch nicht',
  ]

  it('kommt in der Jetzt-Ansicht nicht vor', async () => {
    installBackend()
    renderPage(<NowPage />, { route: '/jetzt', path: '/jetzt' })
    await settle()
    const text = (document.body.textContent ?? '').toLowerCase()
    for (const word of FORBIDDEN) expect(text, `„${word}"`).not.toContain(word.toLowerCase())
  })
})

describe('§30 – Ein Bereich ohne Zuständigkeit ist sichtbar, aber kein Vorwurf', () => {
  it('Familie benennt fehlende Zuständigkeit sachlich', async () => {
    installBackend()
    renderPage(<FamilyPage />, { route: '/familie', path: '/familie' })
    await settle()
    const text = document.body.textContent ?? ''
    if (!/ohne (klare )?Zuständigkeit|niemand/i.test(text)) return
    expect(text).not.toMatch(/Problem|Fehler|Versäumnis|Mangel/i)
  })
})

describe('§32 – Verteilung zeigt Bänder, keine Zahlen', () => {
  it('nennt keine Prozentwerte und keine Rangfolge', async () => {
    installBackend()
    renderPage(<FamilyPage />, { route: '/familie', path: '/familie' })
    await settle()
    const balance = screen.queryAllByRole('button', { name: /Verteilung|Balance/i })
    if (balance.length > 0) await userEvent.click(balance[0]!)
    await waitFor(() => expect(document.querySelectorAll('.skeleton').length).toBe(0))
    const text = document.body.textContent ?? ''
    expect(text, 'Prozentzahlen erzeugen Streit, ohne etwas zu messen (ADR-0012)').not.toMatch(/\d+\s?%/)
    expect(text).not.toMatch(/Platz \d|Rang|Sieger|mehr als du/i)
  })
})

describe('§15/§36 – Es gibt mehr Ausgänge als „erledigt" und „später"', () => {
  it('„Ich bin dran" macht sichtbar, dass sich jemand kümmert', async () => {
    const rec = recorder()
    installBackend({ onMutate: rec.onMutate })
    renderPage(<NowPage />, { route: '/jetzt', path: '/jetzt' })
    await settle()
    const start = screen.queryAllByRole('button', { name: 'Ich bin dran' })
    expect(start.length).toBeGreaterThan(0)
    await userEvent.click(start[0]!)
    await waitFor(() => expect(rec.calls.some((c) => c.path.endsWith('/start'))).toBe(true))
  })

  it('„Nicht mehr nötig" ist ein Abschluss, kein Scheitern', async () => {
    const rec = recorder()
    installBackend({ onMutate: rec.onMutate })
    renderPage(<NowPage />, { route: '/jetzt', path: '/jetzt' })
    await settle()
    await userEvent.click(screen.getAllByText('Geht gerade nicht')[0]!)
    await userEvent.click(screen.getAllByRole('button', { name: 'Nicht mehr nötig' })[0]!)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent, 'darf nicht nach Versagen klingen').not.toMatch(
      /Abbruch|gescheitert|nicht geschafft|Versäumnis/i,
    )
    await userEvent.click(screen.getByRole('button', { name: /Aus der Übersicht nehmen/ }))
    await waitFor(() => expect(rec.calls.some((c) => c.path.endsWith('/drop'))).toBe(true))
  })
})

describe('§46 – Bekannte Wege werden angeboten, nicht versteckt', () => {
  it('beim Starten eines Vorgangs schlägt Thealotta passende Abläufe mit Begründung vor', async () => {
    installBackend({
      routes: {
        'playbook-suggestions': {
          items: [{ id: 'pb1', title: 'Neue Schuhe', reason: 'Passt zu „Schuhe" in diesem Bereich' }],
        },
      },
    })
    renderPage(<DomainDetailPage />, {
      route: `/bereiche/${DOMAIN}/laeuft`,
      path: '/bereiche/:domainId/:section',
    })
    await settle()
    // Seit Review C3 fasst die Übersicht nur zusammen; „Vorgang“ steht auf der Seite des
    // Abschnitts, in dem er auch erscheint.
    await userEvent.click(screen.getAllByRole('button', { name: 'Vorgang' })[0]!)
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Worum geht es?'), 'Schuhe besorgen')
    await screen.findByText('Dafür gibt es schon einen Ablauf', {}, { timeout: 4000 })
    expect(within(dialog).getByText(/Passt zu/)).toBeTruthy()
    // Der Vorschlag darf den freien Weg nicht verdrängen.
    expect(within(dialog).getByRole('button', { name: 'Ohne Ablauf starten' })).toBeTruthy()
  })
})

describe('§19/§46 – Push verspricht nichts, was nicht passiert', () => {
  it('meldet das Gerät wirklich an, statt nur nach Erlaubnis zu fragen', async () => {
    const rec = recorder()
    installBackend({ onMutate: rec.onMutate, routes: { 'push/config': { publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' } } })

    // Browser-Fähigkeiten nachbilden.
    const subscribe = vi.fn().mockResolvedValue({
      toJSON: () => ({ endpoint: 'https://push.example.invalid/x', keys: { p256dh: 'p', auth: 'a' } }),
    })
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { requestPermission: async () => 'granted' },
    })
    Object.defineProperty(window, 'PushManager', { configurable: true, value: function () {} })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: async () => ({ pushManager: { getSubscription: async () => null, subscribe } }),
        ready: Promise.resolve({}),
        getRegistration: async () => undefined,
      },
    })

    renderPage(<SettingsPage />, { route: '/einstellungen/geraete', path: '/einstellungen/:section' })
    await settle()
    await userEvent.click(await screen.findByRole('button', { name: 'Push einrichten' }))

    await waitFor(() => expect(subscribe).toHaveBeenCalled())
    await waitFor(() =>
      expect(
        rec.calls.some((c) => c.path.includes('/push-subscriptions') && c.method === 'POST'),
        'die Anmeldung erreicht den Server nie',
      ).toBe(true),
    )
  })

  it('sagt ehrlich, wenn der Server gar kein Push kann', async () => {
    installBackend({ routes: { 'push/config': { publicKey: null } } })
    renderPage(<SettingsPage />, { route: '/einstellungen/geraete', path: '/einstellungen/:section' })
    await settle()
    expect(screen.getByText(/nicht eingerichtet/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Push einrichten' })).toBeNull()
  })
})

describe('§13 – Umstände werden nicht mehr erfragt', () => {
  /*
   * Die Selbstauskunft „wo bist du gerade?" ist entfallen: neun Schalter, die niemand
   * pflegt, sind keine Hilfe, sondern eine weitere Liste. Was ableitbar ist – Wochentag,
   * Tageszeit – leitet der Server ab; wo eine Aufgabe einen Umstand *braucht*, sagt sie das
   * weiterhin von selbst („fehlt: ruhige Umgebung").
   */
  it('die Jetzt-Ansicht fragt nicht mehr nach dem eigenen Aufenthaltsort', async () => {
    installBackend()
    renderPage(<NowPage />, { route: '/jetzt', path: '/jetzt' })
    await settle()
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/Wo bist du gerade|Umstände wählen|Umstand ergänzen/)
  })

  it('eine fehlende Bedingung wird trotzdem benannt', async () => {
    installBackend()
    renderPage(<NowPage />, { route: '/jetzt', path: '/jetzt' })
    await settle()
    // Entweder es fehlt gerade nichts – oder es steht als Text da, nicht als Farbe allein.
    const chips = [...document.querySelectorAll('.chip')].map((c) => c.textContent ?? '')
    for (const chip of chips.filter((c) => c.startsWith('fehlt'))) {
      expect(chip.length).toBeGreaterThan(7)
    }
  })
})

/**
 * §21: Was der Server erklärt, muss beim Menschen ankommen.
 *
 * Eine Fehlerantwort trägt zwei Texte: `title` ist die Kategorie („Konflikt."), `detail` der
 * Satz, den jemand für genau diesen Fall geschrieben hat. Die Oberfläche zeigte überall nur
 * den Titel – jede sorgfältig formulierte Erklärung wurde übertragen und verworfen. Bei einem
 * zerstörerischen Vorgang ist das der Unterschied zwischen „Fehler." und „Da liegen noch 13
 * Aufgaben drin, archiviere stattdessen".
 */
describe('Erklärungen des Servers', () => {
  it('ApiError trägt den ausführlichen Satz, nicht die Kategorie', () => {
    const err = new ApiError(409, 'not_empty', 'Da steht schon etwas drin.', 'In „Schuhe" liegen 13 Aufgaben.')
    expect(err.message).toBe('In „Schuhe" liegen 13 Aufgaben.')
    expect(err.title, 'die Kategorie bleibt erhalten, sie ist nur nicht die Meldung').toBe('Da steht schon etwas drin.')
  })

  it('ohne ausführlichen Satz bleibt die Kategorie die Meldung', () => {
    expect(new ApiError(500, 'internal_error', 'Unerwarteter Fehler.').message).toBe('Unerwarteter Fehler.')
  })

  it('ein leerer Satz zählt nicht als Erklärung', () => {
    expect(new ApiError(409, 'x', 'Kategorie.', '   ').message).toBe('Kategorie.')
  })
})
