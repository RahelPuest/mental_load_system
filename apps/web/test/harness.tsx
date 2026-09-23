import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen, waitFor, type RenderResult } from '@testing-library/react'
import { expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ReactElement } from 'react'
import { SessionProvider, useSession } from '../src/lib/session.js'
import { ToastProvider } from '../src/design/overlay.js'
import { ColorProvider } from '../src/lib/colors.js'

/* ══ Fake-Backend ═════════════════════════════════════════════════════
 * Die Antworten sind keine erfundenen Attrappen, sondern echte, vom laufenden Server
 * mitgeschnittene Antworten (`ops/scripts/dump-fixtures.mts`). Damit prüfen diese Tests die
 * Oberfläche gegen die Form, die sie im Betrieb tatsächlich bekommt – und fallen auf, wenn
 * sich ein Vertrag ändert.
 *
 * Der Modus entscheidet, welchen der Zustände aus Auftrag §67 eine Ansicht durchläuft.
 */

interface Fixtures {
  householdId: string
  domainId: string
  responses: Record<string, unknown>
}

/** In jsdom ist `import.meta.url` eine http-URL – deshalb über das Projektverzeichnis. */
const fromRoot = (p: string) => readFileSync(resolve(process.cwd(), 'apps/web', p), 'utf8')

const fixtures = JSON.parse(fromRoot('test/fixtures/api.json')) as Fixtures

export const HOUSEHOLD = fixtures.householdId
export const DOMAIN = fixtures.domainId

/** §67 „Very Long Names" und „Long Content": Text, der keine Zeile respektiert. */
export const LONG_NAME =
  'Kind A – Kleidung, Schuhe, Sportsachen und alles weitere Textile, inklusive Winterjacken, Regenhosen und der gesamten Turnbeutelverwaltung für den Schulsport im laufenden Halbjahr'
export const LONG_WORD =
  'Kinderarztvorsorgeuntersuchungsterminvereinbarungsunterlagenzusammenstellung'

export type Mode = 'ok' | 'empty' | 'error' | 'forbidden' | 'loading'

export interface BackendOptions {
  mode?: Mode
  /** Nur diese Pfadfragmente scheitern – für „ein Teil lädt, ein Teil nicht" (§67 Partial Data). */
  failing?: string[]
  forbidden?: string[]
  /** Ersetzt einzelne Antworten. */
  routes?: Record<string, unknown>
  /** Ersetzt jeden Namen/Titel durch einen sehr langen Text (§67 Very Long Names). */
  longNames?: boolean
  onMutate?: (method: string, path: string, body: unknown) => void
  /*
    Antwort auf eine schreibende Anfrage, wenn `{ ok: true }` nicht reicht.

    Schlüssel ist ein Stück des Pfades. Gebraucht, sobald die Oberfläche mit dem Ergebnis
    weiterarbeitet – etwa beim Umhängen, wo die Rückmeldung nennt, was mitgekommen ist.
  */
  writeResponses?: Record<string, unknown>
}

/** Rekursiv alle Arrays leeren, Zähler auf 0 – erzeugt den Empty State jeder Ansicht. */
function emptied(value: unknown): unknown {
  if (Array.isArray(value)) return []
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = emptied(v)
    return out
  }
  if (typeof value === 'number') return 0
  return value
}

const NAME_FIELDS = new Set(['name', 'title', 'displayName', 'label', 'body', 'description', 'rawText'])

function lengthen(value: unknown, depth = 0): unknown {
  if (depth > 12) return value
  if (Array.isArray(value)) return value.map((v) => lengthen(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = NAME_FIELDS.has(k) && typeof v === 'string' ? `${LONG_NAME} ${LONG_WORD}` : lengthen(v, depth + 1)
    }
    return out
  }
  return value
}

export function installBackend(options: BackendOptions = {}): void {
  const mode = options.mode ?? 'ok'
  const table: Record<string, unknown> = { ...fixtures.responses, ...(options.routes ?? {}) }

  /** Längste passende Route gewinnt; unbekannte Pfade liefern eine leere Sammlung. */
  const lookup = (path: string): unknown => {
    const bare = (path.split('?')[0] ?? path)
      .replace(/^\/api\/v1\//, '')
      .replace(`households/${HOUSEHOLD}/`, '')
      .replace(new RegExp(`${DOMAIN}`, 'g'), '§domain')
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '§id')
    if (bare in table) return table[bare]
    const normalized = bare.replace('§domain', '').replace(/\/\//g, '/')
    const candidates = Object.keys(table).filter(
      (k) => normalized === k || normalized.startsWith(`${k}/`) || normalized.replace('domains//', 'domains/') === k,
    )
    const domainKey = bare.startsWith('domains/§domain/')
      ? `domains/${bare.slice('domains/§domain/'.length)}`
      : null
    if (domainKey && domainKey in table) return table[domainKey]
    const best = candidates.sort((a, b) => b.length - a.length)[0]
    return best ? table[best] : { items: [] }
  }

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    const hits = (list?: string[]) => list?.some((p) => path.includes(p)) ?? false

    // Anmeldung und Haushaltsliste müssen immer antworten – sonst testet man nur den Login.
    const isSession = path.includes('/auth/me') || path.endsWith('/households')

    if (!isSession) {
      if (mode === 'loading') return new Promise<Response>(() => undefined)
      if (mode === 'forbidden' || hits(options.forbidden))
        return problem(403, 'forbidden', 'Dafür fehlt dir die Berechtigung.')
      if (mode === 'error' || hits(options.failing))
        return problem(500, 'internal', 'Das konnte gerade nicht geladen werden.')
    }

    if (method !== 'GET') {
      options.onMutate?.(method, path, init?.body ? JSON.parse(String(init.body)) : null)
      const treffer = Object.entries(options.writeResponses ?? {}).find(([teil]) => path.includes(teil))
      return json(200, treffer ? treffer[1] : { id: '00000000-0000-4000-8000-000000000001', ok: true })
    }

    let payload = lookup(path)
    if (mode === 'empty' && !isSession) payload = emptied(payload)
    if (options.longNames && !isSession) payload = lengthen(payload)
    return json(200, payload)
  }) as typeof fetch
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
function problem(status: number, code: string, title: string): Response {
  return new Response(JSON.stringify({ code, title }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })
}

/* ══ Rendern ══════════════════════════════════════════════════════════ */

/**
 * Seiten laufen in der echten App erst, wenn Sitzung und Haushalt feststehen (App.tsx).
 * Dieses Gatter bildet das nach – sonst prüfte man einen Zustand, den es nie gibt.
 */
function WhenReady({ children }: { children: ReactElement }) {
  const { household, status } = useSession()
  if (status === 'loading' || !household) return <div data-testid="session-pending" />
  return children
}

/** Rendert eine Seite in Sitzung, Router und Toast-Kontext – so wie die App es tut. */
export function renderPage(ui: ReactElement, options: { route?: string; path?: string } = {}): RenderResult {
  const route = options.route ?? '/jetzt'
  const path = options.path ?? '*'
  return render(
    <MemoryRouter initialEntries={[route]}>
      <SessionProvider>
        {/* Dieselbe Kette wie in main.tsx – sonst prüfen die Tests eine Anwendung,
            die es so nicht gibt. */}
        <ColorProvider>
          <ToastProvider>
            <Routes>
              <Route path={path} element={<WhenReady>{ui}</WhenReady>} />
            </Routes>
          </ToastProvider>
        </ColorProvider>
      </SessionProvider>
    </MemoryRouter>,
  )
}

/**
 * Wartet, bis Sitzung und Daten stehen. Erst dann ist der Zustand einer Ansicht
 * aussagekräftig – vorher prüfte man den Ladezustand und hielte ihn für das Ergebnis.
 */
export async function settle(): Promise<void> {
  await waitFor(() => expect(screen.queryByTestId('session-pending')).toBeNull(), { timeout: 6000 })
  await waitFor(() => expect(document.querySelectorAll('.skeleton').length, 'lädt noch').toBe(0), {
    timeout: 6000,
  })
}

/** Die echten Design-Tokens in jsdom verfügbar machen, damit CSS-Aussagen prüfbar sind. */
export function loadStylesheet(): void {
  if (document.getElementById('thealotta-css')) return
  const style = document.createElement('style')
  style.id = 'thealotta-css'
  style.textContent = fromRoot('src/design/tokens.css') + fromRoot('src/design/components.css')
  document.head.appendChild(style)
}
