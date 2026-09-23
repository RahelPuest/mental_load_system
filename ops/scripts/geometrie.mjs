/**
 * Visuelle Geometrie messen – reproduzierbar statt nach Augenmaß.
 *
 * Voraussetzung: gebaute Anwendung hinter `vite preview --port 4173` und die Anmeldung aus
 * `apps/web/e2e/.auth/state.json`.
 *
 *   node ops/scripts/geometrie.mjs 1440
 *
 * Sammelt über alle Seiten Rundungen, Höhen, Innenabstände, Rahmen, Ikonengrößen,
 * Schriftgrößen und linke Kanten und legt sie als `geo-<breite>.json` ab. Auswertung siehe
 * docs/56.
 */
import { argv } from 'node:process'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

export const ORTE = [
  ['jetzt','/jetzt'], ['plan','/plan'], ['eingang','/eingang'], ['bereiche','/bereiche'],
  ['bereich','/bereiche/01a07d11-afa5-7f8e-90a0-ed9ba4d53687'],
  ['bereich-wissen','/bereiche/01a07d11-afa5-7f8e-90a0-ed9ba4d53687/wissen'],
  ['bereich-regeln','/bereiche/01a07d11-afa5-7f8e-90a0-ed9ba4d53687/regeln'],
  ['bereich-laeuft','/bereiche/01a07d11-afa5-7f8e-90a0-ed9ba4d53687/laeuft'],
  ['bereich-verlauf','/bereiche/01a07d11-afa5-7f8e-90a0-ed9ba4d53687/verlauf'],
  ['bereich-verwalten','/bereiche/01a07d11-afa5-7f8e-90a0-ed9ba4d53687/verwalten'],
  ['bereich-leer','/bereiche/01a07d11-afaa-74c1-911e-2d5403729b55'],
  ['familie','/familie'], ['vorgaenge','/vorgaenge'],
  ['vorgang','/vorgang/01a07d12-3535-79f7-ac9e-86bc42c4653d'],
  ['wissen','/wissen'], ['regeln','/regeln'], ['kalender','/kalender'], ['ablaeufe','/ablaeufe'],
  ['essen','/essen'], ['essen-sammlung','/essen/sammlung'],
  ['essen-einkauf','/essen/einkauf'], ['essen-einstellungen','/essen/einstellungen'],
  ['uebersicht','/uebersicht'], ['hilfe','/hilfe'],
  ['einst','/einstellungen'], ['einst-haushalt','/einstellungen/haushalt'],
  ['einst-mitglieder','/einstellungen/mitglieder'], ['einst-rechte','/einstellungen/rechte'],
  ['einst-benachr','/einstellungen/benachrichtigungen'], ['einst-geraete','/einstellungen/geraete'],
  ['einst-darstellung','/einstellungen/darstellung'], ['einst-farben','/einstellungen/farben'],
  ['einst-konto','/einstellungen/konto'], ['einst-daten','/einstellungen/daten'],
  ['einst-protokoll','/einstellungen/protokoll'],
]

const SAMMLER = () => {
  const px = (v) => Math.round(parseFloat(v) || 0)
  const sichtbar = (e) => {
    const r = e.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'
  }
  const out = { radien: {}, hoehen: {}, ikonen: {}, abstaende: {}, typo: {}, kanten: {}, rahmen: {} }
  const add = (topf, schluessel, wert) => {
    const t = (out[topf][schluessel] ??= {})
    t[wert] = (t[wert] ?? 0) + 1
  }

  for (const e of document.querySelectorAll('main *, .appbar *, .sidebar *, .bottombar *')) {
    if (!sichtbar(e)) continue
    const cs = getComputedStyle(e)
    const rolle =
      e.matches('.btn-primary') ? 'btn-primary' :
      e.matches('.btn-secondary') ? 'btn-secondary' :
      e.matches('.btn-destructive') ? 'btn-destructive' :
      e.matches('.btn-ghost') ? 'btn-ghost' :
      e.matches('.btn-icon') ? 'btn-icon' :
      e.matches('button.btn, .btn') ? 'btn-sonstige' :
      e.matches('input[type=search]') ? 'input-search' :
      e.matches('input') ? 'input' :
      e.matches('select') ? 'select' :
      e.matches('textarea') ? 'textarea' :
      e.matches('.chip') ? 'chip' :
      e.matches('.panel') ? 'panel' :
      e.matches('.card') ? 'card' :
      e.matches('.notice') ? 'notice' :
      e.matches('.sheet, .dialog, [role=dialog]') ? 'dialog' :
      e.matches('.row') ? 'row' :
      e.matches('.setting-row') ? 'setting-row' :
      e.matches('.nav-link') ? 'nav-link' :
      e.matches('.master .row') ? 'master-row' :
      e.matches('svg') ? 'icon' : null
    if (!rolle) continue

    const r = e.getBoundingClientRect()
    if (rolle === 'icon') {
      add('ikonen', 'svg', `${Math.round(r.width)}×${Math.round(r.height)}`)
      add('ikonen', 'stroke', cs.strokeWidth || '?')
      continue
    }
    add('radien', rolle, cs.borderRadius.split(' ')[0])
    if (/btn|input|select|chip|nav-link|row/.test(rolle)) add('hoehen', rolle, `${Math.round(r.height)}`)
    if (/btn|chip|input|select/.test(rolle)) add('abstaende', `${rolle}-padX`, `${px(cs.paddingLeft)}/${px(cs.paddingRight)}`)
    if (/panel|card|notice|dialog|setting-row/.test(rolle)) add('abstaende', `${rolle}-pad`, `${px(cs.paddingTop)} ${px(cs.paddingRight)} ${px(cs.paddingBottom)} ${px(cs.paddingLeft)}`)
    const bw = px(cs.borderTopWidth)
    if (bw) add('rahmen', rolle, `${bw}px ${cs.borderTopColor}`)
  }

  for (const sel of ['h1','h2','h3','.t-body','.t-body-sm','.t-caption','.t-sub','.t-overline']) {
    for (const e of document.querySelectorAll(`main ${sel}`)) {
      if (!sichtbar(e)) continue
      const cs = getComputedStyle(e)
      add('typo', sel, `${px(cs.fontSize)}/${cs.fontWeight}/${Math.round(parseFloat(cs.lineHeight))}`)
    }
  }

  // Linke Kanten der Hauptelemente – die visuelle Achse
  for (const sel of ['.content > *', 'h1', '.section', '.panel', '.card', '.btn', '.row']) {
    for (const e of document.querySelectorAll(`main ${sel}`)) {
      if (!sichtbar(e)) continue
      add('kanten', sel, `${Math.round(e.getBoundingClientRect().left)}`)
    }
  }

  // Abstände zwischen Geschwistern gleicher Art
  const paare = [['.section','.section'],['.panel','.panel'],['.card','.card'],['li','li'],['.field','.field']]
  for (const [a] of paare) {
    const els = [...document.querySelectorAll(`main ${a}`)].filter(sichtbar)
    for (let i = 1; i < els.length; i++) {
      if (els[i].previousElementSibling !== els[i-1]) continue
      const l = Math.round(els[i].getBoundingClientRect().top - els[i-1].getBoundingClientRect().bottom)
      if (l >= 0 && l < 200) add('abstaende', `${a}+${a}`, `${l}`)
    }
  }
  return out
}

const zusammen = {}
const misch = (ziel, quelle) => {
  for (const [topf, gruppen] of Object.entries(quelle)) {
    const zt = (ziel[topf] ??= {})
    for (const [k, werte] of Object.entries(gruppen)) {
      const zk = (zt[k] ??= {})
      for (const [w, n] of Object.entries(werte)) zk[w] = (zk[w] ?? 0) + n
    }
  }
}

/*
  Nur messen, wenn dieses Skript selbst aufgerufen wurde.

  `responsive.mjs` importiert von hier die Ortsliste – und startete dabei jedes Mal ungefragt
  eine vollständige Messung samt Datei. Ein Import darf nichts tun.
*/
if (import.meta.url !== pathToFileURL(argv[1] ?? '').href) {
  /* importiert – nur `ORTE` und `SAMMLER` bereitstellen */
} else {
const b = await chromium.launch()
const breite = Number(argv[2] ?? 1440)
const c = await b.newContext({ storageState: 'apps/web/e2e/.auth/state.json', viewport: { width: breite, height: 900 } })
const p = await c.newPage()
for (const [name, u] of ORTE) {
  try {
    await p.goto('http://localhost:4173' + u, { timeout: 15000 })
    await p.waitForLoadState('networkidle'); await p.waitForTimeout(150)
    misch(zusammen, await p.evaluate(SAMMLER))
  } catch (e) { console.error('FEHLER', name, String(e).slice(0,80)) }
}
await b.close()
writeFileSync(`geo-${breite}.json`, JSON.stringify(zusammen, null, 1))
console.log(`geo-${breite}.json geschrieben`)
}
