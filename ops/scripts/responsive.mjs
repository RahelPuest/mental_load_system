/**
 * Responsive-Prüfung über alle Seiten und neun Breiten (docs/65).
 *
 * Voraussetzung: gebaute Anwendung hinter `vite preview --port 4173` und die Anmeldung aus
 * `apps/web/e2e/.auth/state.json`.
 *
 *   node ops/scripts/responsive.mjs
 *
 * Meldet je Breite: die vorkommenden Inhaltsbreiten, das Seitenpolster und jede Seite mit
 * waagerechtem Überlauf samt den Elementen, die über den Rand ragen. Erwartet wird **eine**
 * Inhaltsbreite und **ein** Polster je Breite – mehrere heißen: Seiten rechnen verschieden.
 */
import { chromium } from '@playwright/test'
import { ORTE } from './geometrie.mjs'
const b = await chromium.launch()
const BREITEN = [360, 390, 480, 768, 834, 1024, 1280, 1440, 1920]
for (const w of BREITEN) {
  const c = await b.newContext({ storageState: 'apps/web/e2e/.auth/state.json', viewport: { width: w, height: 900 } })
  const p = await c.newPage()
  const probleme = []
  let cw = new Set(), pad = new Set()
  for (const [name, u] of ORTE) {
    await p.goto('http://localhost:4173' + u, { timeout: 15000 })
    await p.waitForLoadState('networkidle'); await p.waitForTimeout(80)
    const r = await p.evaluate(() => {
      const main = document.querySelector('.content')
      const rr = main?.getBoundingClientRect()
      const ueber = document.documentElement.scrollWidth - document.documentElement.clientWidth
      // Elemente, die über den rechten Rand hinausragen
      const raus = [...document.querySelectorAll('main *, .appbar *')]
        .filter((e) => { const q = e.getBoundingClientRect(); return q.width > 0 && q.right > document.documentElement.clientWidth + 1 })
        .slice(0, 3).map((e) => `${e.tagName}.${e.className.toString().slice(0,26)}`)
      return { ueber, raus, cw: rr ? Math.round(rr.width) : 0,
        padL: main ? Math.round(parseFloat(getComputedStyle(main).paddingLeft)) : 0 }
    })
    if (r.ueber > 0) probleme.push(`${name}: ${r.ueber}px Überlauf ${r.raus.join(',')}`)
    cw.add(r.cw); pad.add(r.padL)
  }
  console.log(`${String(w).padStart(5)}px  Inhaltsbreiten ${[...cw].sort((a,x)=>a-x).join('/')}  Seitenpolster ${[...pad].join('/')}` +
    (probleme.length ? `\n         ⚠ ${probleme.slice(0,4).join(' | ')}` : ''))
  await c.close()
}
await b.close()
