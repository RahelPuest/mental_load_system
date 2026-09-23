import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { BREAKPOINTS } from './pages.js'

/**
 * Nach einem Klick rendert die neue Seite erst ihre eigenen Skelette. Wer nur einmal auf
 * „keine Skelette" prüft, fotografiert den Zustand davor – genau das ist passiert.
 */
async function settled(page: Page, differentFrom?: string): Promise<void> {
  // Nach einem Klick steht die alte Überschrift noch da, während die neue Seite lädt.
  // Auf „irgendeine Überschrift" zu warten heißt: die alte Seite fotografieren.
  await page.waitForFunction(
    (previous) => {
      const h1 = document.querySelector('h1')
      return Boolean(h1?.textContent?.trim()) && h1!.textContent!.trim() !== previous
    },
    differentFrom ?? '\u0000',
    { timeout: 15_000 },
  )
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __clean?: number }
      w.__clean = document.querySelectorAll('.skeleton').length === 0 ? (w.__clean ?? 0) + 1 : 0
      return (w.__clean ?? 0) >= 3
    },
    null,
    { polling: 100, timeout: 15_000 },
  )
}

/**
 * Detailseiten brauchen eine echte ID – erreicht über die Navigation, nicht über einen
 * geratenen Pfad. Bis hierher waren gerade die beiden inhaltsreichsten Ansichten von der
 * Browserprüfung ausgenommen.
 */
const SHOTS = 'apps/web/e2e/.shots'
mkdirSync(SHOTS, { recursive: true })

for (const bp of BREAKPOINTS) {
  test.describe(`${bp.name} (${bp.width}px)`, () => {
    test.use({ viewport: { width: bp.width, height: bp.height } })

    test('Bereichsdetail', async ({ page }) => {
      await page.goto('/bereiche')
      await settled(page)
      const listHeading = await page.locator('h1').first().innerText()
      await page.locator('.row-open').first().click()
      await expect(page).toHaveURL(/\/bereiche\/[0-9a-f-]{36}/)
      await settled(page, listHeading)
      // Die Detailseite trägt den Bereichsnamen, nicht den Listentitel – sonst hat der
      // Klick zwar die Adresse geändert, aber nichts gerendert.
      const heading = await page.locator('h1').first().innerText()
      expect(heading, 'die Detailseite zeigt weiterhin die Liste').not.toBe('Bereiche')
      await page.screenshot({ path: `${SHOTS}/${bp.name}-bereichsdetail.png`, fullPage: bp.width < 900 })

      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      )
      expect(sideways, 'die Seite scrollt seitlich').toBe(false)
    })

    test('Vorgang', async ({ page }) => {
      await page.goto('/vorgaenge')
      await settled(page)
      const listHeading = await page.locator('h1').first().innerText()
      const first = page.locator('.row-open').first()
      if ((await first.count()) === 0) test.skip()
      await first.click()
      await expect(page).toHaveURL(/\/vorgang\/[0-9a-f-]{36}/)
      await settled(page, listHeading)
      await page.screenshot({ path: `${SHOTS}/${bp.name}-vorgang.png`, fullPage: bp.width < 900 })

      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      )
      expect(sideways, 'die Seite scrollt seitlich').toBe(false)
    })
  })
}
