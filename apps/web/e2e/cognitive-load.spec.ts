import { test, expect } from '@playwright/test'
import { TARGETS } from './pages.js'

/**
 * Wahrgenommene Komplexität als Budget – gemessen, nicht geschätzt.
 *
 * Der Funktionsumfang darf beliebig wachsen. Was nicht wachsen darf, ist die Menge dessen,
 * was gleichzeitig um Aufmerksamkeit konkurriert. Diese Grenzen sind bewusst großzügig
 * gesetzt: Sie sollen Rückschritte fangen, nicht Gestaltung verbieten.
 *
 * Gemessen wird nur, was tatsächlich sichtbar ist – Inhalt hinter einem Aufklapper zählt
 * nicht, denn er verlangt gerade keine Aufmerksamkeit.
 */
const MEASURE = `(() => {
  const main = document.querySelector('.content');
  if (!main) return null;
  const vis = (e) => e.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
  const all = Array.from(main.querySelectorAll('*')).filter(vis);
  const leaves = all.filter((e) => e.textContent && e.textContent.trim() && e.children.length === 0);
  const c = (s) => all.filter((e) => e.matches(s)).length;
  return {
    interactive: c('button, a[href], select, input, textarea, summary'),
    fontSizes: Array.from(new Set(leaves.map((e) => getComputedStyle(e).fontSize))),
    primaries: Array.from(new Set(all.filter((e) => e.matches('.btn-primary')).map((e) => e.textContent.trim()))),
    sections: c('section.section'),
    loud: c('.btn-primary, .chip-attention, .notice-attention, .notice-critical, .tinted-attention, .tinted-critical'),
  };
})()`

test.use({ viewport: { width: 1280, height: 900 } })

for (const target of TARGETS) {
  test(`${target.name}: bleibt im Aufmerksamkeitsbudget`, async ({ page }) => {
    await page.goto(target.path)
    await expect(page.getByRole('heading', { name: target.heading }).first()).toBeVisible()
    await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

    const m = (await page.evaluate(MEASURE)) as {
      interactive: number
      fontSizes: string[]
      primaries: string[]
      sections: number
      loud: number
    }

    // Schriftgrößen: Die Skala hat neun Rollen; auf einer Ansicht sind fünf bis sechs
    // gleichzeitig genug, um Hierarchie zu zeigen. Mehr liest sich als Zufall.
    expect(m.fontSizes.length, `Schriftgrößen gleichzeitig: ${m.fontSizes.join(', ')}`).toBeLessThanOrEqual(7)

    // Genau eine dominante Aktion – dieselbe Aktion mehrfach zählt als eine.
    expect(m.primaries.length, `konkurrierende Primäraktionen: ${m.primaries.join(' / ')}`).toBeLessThanOrEqual(1)

    // Abschnitte sind mentale Einheiten. Mehr als sechs gleichzeitig auf einer Seite heißt:
    // Die Gruppierung bildet die Datenstruktur ab, nicht das mentale Modell.
    expect(m.sections, 'zu viele gleichrangige Abschnitte').toBeLessThanOrEqual(6)

    // Was laut ruft, muss selten sein: Wenn zehn Dinge Aufmerksamkeit verlangen, hat keines
    // Priorität.
    expect(m.loud, 'zu viele Elemente rufen gleichzeitig nach Aufmerksamkeit').toBeLessThanOrEqual(8)

    /*
      Bedienelemente auf einen Blick. Listen mit vielen Einträgen sind erlaubt – aber eine
      Ansicht mit über 40 Zielen verlangt zu viel Sortierarbeit vom Blick.

      Einzelne Ansichten tragen ein eigenes Budget (`interactiveBudget` in `pages.ts`). Es
      gilt nur dort, wo die Ziele gleichartig sind und die Zahl mit dem Inhalt wächst – eine
      Einkaufsliste ist eine Reihenfolge zum Abarbeiten, kein Feld konkurrierender Angebote.
    */
    expect(m.interactive, 'zu viele Bedienelemente gleichzeitig').toBeLessThanOrEqual(
      target.interactiveBudget ?? 40,
    )
  })
}
