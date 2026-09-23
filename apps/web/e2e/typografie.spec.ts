import { test, expect } from '@playwright/test'
import { TARGETS } from './pages.js'

/**
 * Die typografische Regel der Richtung A – gemessen an der gerenderten Seite (docs/69).
 *
 * A trennt Benennen und Arbeiten **nicht über zwei Schriften**, sondern über Gewicht und
 * Breite derselben. Daraus folgen zwei Zusagen, die man nur im Browser prüfen kann, weil
 * Schrift vererbt wird:
 *
 * 1. **Es gibt genau eine Familie.** Eine zweite wäre kein Detail, sondern eine andere
 *    Gestalt – und sie schliche sich ein, sobald ein Bauteil `font-family` selbst setzt.
 * 2. **Der schmale Schnitt bleibt den großen Graden vorbehalten.** Die Breitenachse ist der
 *    Grund für die Schriftwahl; sie an Kleintext zu verwenden hieße, Text zu stauchen statt
 *    Titel zu setzen.
 *
 * Die Vorgängerfassung dieser Datei prüfte die Arbeitsteilung zweier Familien (Richtung C,
 * `docs/67`). Sie ist nicht gelöscht, sondern auf die Regel umgestellt, die jetzt gilt – die
 * Zusage „Typografie ist eine Entscheidung, keine Gewohnheit" bleibt dieselbe.
 */
const SAMMLE = `(() => {
  const vis = (e) => e.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
  const out = [];
  for (const e of document.querySelectorAll('main *, .sidebar *, .appbar *')) {
    if (e.children.length || !e.textContent || !e.textContent.trim() || !vis(e)) continue;
    const cs = getComputedStyle(e);
    out.push({
      familie: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
      px: Math.round(parseFloat(cs.fontSize)),
      breite: Math.round(parseFloat(cs.fontStretch) || 100),
      wo: e.tagName.toLowerCase() + '.' + String(e.className || '').slice(0, 28),
      text: e.textContent.trim().slice(0, 24),
    });
  }
  return out;
})()`

type Fund = { familie: string; px: number; breite: number; wo: string; text: string }

/** Ab dieser Größe darf der schmale Schnitt stehen – darunter ist es Kleintext. */
const GROSSER_GRAD = 22

for (const target of TARGETS) {
  test(`${target.name}: eine Schrift, zwei Ausprägungen`, async ({ page }) => {
    await page.goto(target.path)
    await expect(page.getByRole('heading', { name: target.heading }).first()).toBeVisible()
    await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
    await page.evaluate(() => document.fonts.ready)

    const funde = (await page.evaluate(SAMMLE)) as Fund[]
    const zeig = (f: Fund) => `${f.familie} ${f.px}px/${f.breite}% in ${f.wo} – „${f.text}"`

    const fremd = [...new Set(funde.map((f) => f.familie))]
      .filter((f) => f !== 'Bricolage Grotesque')
      .sort()
    expect(fremd, `fremde Schriftfamilie im Bild: ${fremd.join(', ')}`).toEqual([])

    /*
      Der schmale Schnitt gehört den Titeln. Ein gestauchter Kleintext ist der sichtbarste
      Weg, eine Gestalt billig aussehen zu lassen – und er entsteht von selbst, sobald eine
      Rolle ihre Breite nicht ausdrücklich setzt und sie von einer Überschrift erbt.
    */
    const gestaucht = funde.filter((f) => f.breite < 100 && f.px < GROSSER_GRAD)
    expect(gestaucht.map(zeig), 'schmaler Schnitt an Kleintext').toEqual([])
  })
}
