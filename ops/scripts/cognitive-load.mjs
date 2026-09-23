/**
 * Kognitive Last messen – reproduzierbar statt aus dem Bauch.
 *
 * Voraussetzung: `pnpm --filter @thealotta/web exec vite build` und ein laufender
 * `vite preview --port 4173`, dazu die Anmeldung aus `apps/web/e2e/.auth/state.json`
 * (entsteht beim ersten `pnpm test:e2e`).
 *
 *   node ops/scripts/cognitive-load.mjs
 *
 * Gezählt wird nur, was tatsächlich sichtbar ist. Inhalt hinter einem geschlossenen
 * Aufklapper zählt nicht: Er verlangt gerade keine Aufmerksamkeit.
 */
import { chromium } from '@playwright/test'

const PLACES = [
  ['jetzt', '/jetzt'], ['plan', '/plan'], ['eingang', '/eingang'],
  ['bereiche', '/bereiche'], ['bereich-detail', '/bereiche/01a07d11-afa5-7f8e-90a0-ed9ba4d53687'],
  ['familie', '/familie'], ['vorgaenge', '/vorgaenge'],
  ['vorgang-detail', '/vorgang/01a07d12-3535-79f7-ac9e-86bc42c4653d'],
  ['wissen', '/wissen'], ['regeln', '/regeln'], ['kalender', '/kalender'],
  ['ablaeufe', '/ablaeufe'], ['uebersicht', '/uebersicht'], ['hilfe', '/hilfe'],
  ['einst-haushalt', '/einstellungen/haushalt'], ['einst-mitglieder', '/einstellungen/mitglieder'],
  ['einst-rechte', '/einstellungen/rechte'], ['einst-daten', '/einstellungen/daten'],
]

const M = () => {
  const main = document.querySelector('.content')
  if (!main) return null
  const vis = (e) => e.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })
  const all = [...main.querySelectorAll('*')].filter(vis)
  const leaves = all.filter((e) => e.textContent.trim() && !e.children.length)
  const c = (s) => all.filter((e) => e.matches(s)).length
  // Entscheidungen: Stellen, an denen der Nutzer aus mehreren Möglichkeiten wählen muss.
  const decisions = c('select') + c('[role="radiogroup"]') + c('input[type="checkbox"]')
    + [...new Set(all.filter((e) => e.matches('[role="radio"]')).map((e) => e.closest('[role="radiogroup"], .chips, section') ?? e))].length
  return {
    int: c('button, a[href], select, input, textarea, summary'),
    pairs: new Set(leaves.map((e) => { const s = getComputedStyle(e); return s.fontSize + '/' + s.fontWeight })).size,
    box: c('.panel, .card, section.section, .notice, .tinted'),
    sec: c('section.section'),
    loud: c('.btn-primary, .chip-attention, .notice-attention, .notice-critical, .tinted-attention, .tinted-critical'),
    prim: new Set(all.filter((e) => e.matches('.btn-primary')).map((e) => e.textContent.trim())).size,
    dec: decisions,
    h: Math.round(main.getBoundingClientRect().height),
    ovf: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }
}

const b = await chromium.launch()
const ctx = await b.newContext({ storageState: 'apps/web/e2e/.auth/state.json' })
const out = {}
for (const [w, label] of [[390, 'mobil'], [768, 'tablet'], [1280, 'desktop']]) {
  const p = await ctx.newPage()
  await p.setViewportSize({ width: w, height: 900 })
  for (const [name, path] of PLACES) {
    await p.goto('http://localhost:4173' + path)
    try { await p.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0, null, { timeout: 8000 }) } catch { /* Ohne Skelett-Ende messen wir eben den Zustand, der da ist. */ }
    const m = await p.evaluate(M)
    ;(out[name] ??= {})[label] = m
  }
  await p.close()
}
await b.close()

const head = ['Ort', 'BP', 'Bedien', 'Entsch', 'Paare', 'Kästen', 'Absch', 'Laut', 'Primär', 'Höhe', 'Ovf']
const rows = []
for (const [name, byBp] of Object.entries(out))
  for (const [bp, m] of Object.entries(byBp))
    rows.push([name, bp, m?.int ?? '-', m?.dec ?? '-', m?.pairs ?? '-', m?.box ?? '-', m?.sec ?? '-', m?.loud ?? '-', m?.prim ?? '-', m?.h ?? '-', m?.ovf ?? '-'])
const wd = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)))
const ln = (r) => r.map((v, i) => String(v).padEnd(wd[i])).join(' ')
console.log(ln(head)); console.log(wd.map((n) => '-'.repeat(n)).join(' '))
rows.sort((a, b2) => (b2[2] === '-' ? -1 : b2[2]) - (a[2] === '-' ? -1 : a[2])).forEach((r) => console.log(ln(r)))
