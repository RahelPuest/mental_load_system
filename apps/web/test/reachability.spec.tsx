import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'
import { installBackend } from './harness.js'
import { SessionProvider } from '../src/lib/session.js'
import { ToastProvider } from '../src/design/overlay.js'
import { ColorProvider } from '../src/lib/colors.js'
import { AppShell } from '../src/components/AppShell.js'
import { ALL_ENTRIES, NAV_GROUPS, MOBILE_PRIMARY, SETTINGS_ENTRY, HELP_ENTRY } from '../src/lib/navigation.js'

/**
 * Auftrag §64: Funktionen dürfen nicht unauffindbar werden.
 *
 * Der dritte Durchgang hat gezeigt, dass „ist doch erreichbar" ohne Test nichts wert ist.
 * Diese Datei prüft dreierlei strukturell:
 *
 *  1. Jede Funktion des Backends, die der Client kennt, wird von der Oberfläche benutzt.
 *  2. Jeder Ort der Informationsarchitektur hat eine Route und ist verlinkt.
 *  3. Von der Navigation aus ist jeder Ort ohne Umweg erreichbar.
 */

const web = (p: string) => resolve(process.cwd(), 'apps/web', p)
const read = (p: string) => readFileSync(web(p), 'utf8')

function sourceFiles(): string {
  const dirs = ['src/pages', 'src/components', 'src/lib']
  let all = ''
  for (const dir of dirs) {
    for (const file of readdirSync(web(dir))) {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) all += read(`${dir}/${file}`)
    }
  }
  return all
}

/** Alle Funktionen des API-Clients, so wie sie deklariert sind. */
function clientFunctions(): string[] {
  const api = read('src/lib/api.ts')
  const body = api.slice(api.indexOf('export const endpoints'))
  const names: string[] = []
  let depth = 0
  for (const line of body.split('\n').slice(1)) {
    const trimmed = line.trim()
    if (trimmed.startsWith('}') && depth === 0) break
    if (depth === 0) {
      const match = /^([a-zA-Z][a-zA-Z0-9_]*)\s*:/.exec(trimmed)
      if (match) names.push(match[1]!)
    }
    for (const char of line) {
      if ('{(['.includes(char)) depth += 1
      if ('})]'.includes(char)) depth -= 1
    }
  }
  return names
}

describe('§64 – Nichts verschwindet', () => {
  it('jede Client-Funktion wird von der Oberfläche tatsächlich benutzt', () => {
    const all = sourceFiles()
    const unused = clientFunctions().filter(
      (name) => !new RegExp(`endpoints\\s*\\n?\\s*\\.${name}\\b|\\.${name}\\(`, 'm').test(all),
    )
    expect(unused, 'Backend-Funktionen ohne Weg in der Oberfläche').toEqual([])
  })

  it('jeder Ort der Navigation hat eine Route', () => {
    const app = read('src/App.tsx')
    for (const entry of [...ALL_ENTRIES, SETTINGS_ENTRY, HELP_ENTRY, ...MOBILE_PRIMARY]) {
      expect(app, `keine Route für ${entry.to}`).toContain(`path="${entry.to}"`)
    }
  })

  it('jede Route der App ist von der Navigation aus erreichbar', () => {
    const app = read('src/App.tsx')
    // Weiterleitungen alter Pfade zählen nicht als eigene Seiten – sie halten nur
    // gespeicherte Links am Leben.
    const routes = [...app.matchAll(/path="(\/[a-zäöü/:._-]*)"[^>]*element=\{<([A-Za-z]+)/g)]
      .filter((m) => m[2] !== 'Navigate')
      .map((m) => m[1]!)
      .filter((p) => !p.includes(':') && p !== '*')
    const reachable = new Set([...ALL_ENTRIES, SETTINGS_ENTRY, HELP_ENTRY, ...MOBILE_PRIMARY].map((e) => e.to))
    const orphans = routes.filter((r) => !reachable.has(r))
    expect(orphans, 'Seiten ohne Eintrag in der Navigation').toEqual([])
  })

  it('die Informationsarchitektur bleibt überschaubar', () => {
    // Nicht mehr als sieben Ziele je Gruppe – darüber liest niemand mehr, er sucht.
    for (const group of NAV_GROUPS) {
      expect(group.entries.length, `Gruppe „${group.label}" ist zu lang`).toBeLessThanOrEqual(7)
    }
    // Mobil bleibt der Daumenbereich bei vier Zielen plus Erfassen.
    expect(MOBILE_PRIMARY.length).toBe(4)
    // Jeder Ort erklärt sich in einem Satz.
    for (const entry of ALL_ENTRIES) {
      expect(entry.purpose.length, `${entry.label} ohne Erklärung`).toBeGreaterThan(20)
      expect(entry.purpose.length, `${entry.label} erklärt zu ausführlich`).toBeLessThan(120)
    }
  })
})

describe('§6 – Die Navigation zeigt, was es gibt', () => {
  const renderShell = () =>
    render(
      <MemoryRouter initialEntries={['/jetzt']}>
        <SessionProvider>
      <ColorProvider>
          <ToastProvider>
            <AppShell />
          </ToastProvider>
        </ColorProvider>
    </SessionProvider>
      </MemoryRouter>,
    )

  it('jeder Ort ist als Link erreichbar – in der Navigation oder der Kopfleiste', async () => {
    installBackend()
    renderShell()
    await screen.findByRole('navigation', { name: 'Hauptbereiche' })
    for (const entry of [...ALL_ENTRIES, SETTINGS_ENTRY, HELP_ENTRY]) {
      const links = await screen.findAllByRole('link', { name: new RegExp(entry.label, 'i') })
      expect(links.length, `${entry.label} ist nirgends verlinkt`).toBeGreaterThan(0)
    }
  })

  it('die Kopfleiste trägt die Werkzeuge, nicht die Orte', async () => {
    installBackend()
    renderShell()
    const bar = await screen.findByRole('banner')
    for (const label of ['Suchen', 'Meldungen']) {
      expect(
        within(bar).getAllByRole('button', { name: new RegExp(label) }).length,
        `${label} fehlt in der Kopfleiste`,
      ).toBeGreaterThan(0)
    }
    expect(within(bar).getByRole('link', { name: /Einstellungen/ })).toBeTruthy()
  })

  it('das Konto meldet nicht mit einem Klick ab, sondern öffnet ein Menü', async () => {
    installBackend()
    renderShell()
    const bar = await screen.findByRole('banner')
    const account = within(bar).getByRole('button', { name: /Anna/i })
    expect(account.getAttribute('aria-haspopup')).toBe('menu')
    await userEvent.click(account)
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /Abmelden/ })).toBeTruthy()
  })

  it('Erfassen, Suchen und Meldungen sind von überall erreichbar', async () => {
    installBackend()
    renderShell()
    for (const label of ['Erfassen', 'Suchen', 'Meldungen']) {
      expect((await screen.findAllByRole('button', { name: new RegExp(label) })).length).toBeGreaterThan(0)
    }
  })

  it('die Befehlspalette bietet dieselben Orte an wie die Navigation', async () => {
    installBackend()
    renderShell()
    await userEvent.click((await screen.findAllByRole('button', { name: /Suchen/ }))[0]!)
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog.textContent).toContain('Aktionen'))
    for (const entry of ALL_ENTRIES) {
      expect(dialog.textContent, `${entry.label} fehlt in der Palette`).toContain(entry.label)
    }
  })
})
