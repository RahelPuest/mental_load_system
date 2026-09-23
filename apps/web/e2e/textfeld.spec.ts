import { test, expect } from '@playwright/test'

/**
 * Fließtextfelder lassen sich vergrößern (docs/74).
 *
 * Ob ein Feld wirklich wächst, rechnet nur der Browser aus: `min-height: min(60vh, 640px)`
 * hängt am Fenster, und jsdom rechnet kein Layout. Geschrieben und gespeichert wird hier
 * nichts – der Bogen wird geöffnet, vermessen und wieder geschlossen.
 */
const BEREICH = '/bereiche/01a07d11-afa5-7f8e-90a0-ed9ba4d53687/wissen'

async function notizBogen(page: import('@playwright/test').Page) {
  await page.goto(BEREICH)
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await page.getByRole('button', { name: 'Notiz', exact: true }).click()
  const sheet = page.locator('.sheet')
  await expect(sheet).toBeVisible()
  return sheet
}

test('„Größer" macht die Schreibfläche deutlich höher', async ({ page }) => {
  const sheet = await notizBogen(page)
  const feld = sheet.locator('textarea')

  const vorher = (await feld.boundingBox())!.height
  await sheet.getByRole('button', { name: 'Größer' }).click()
  const nachher = (await feld.boundingBox())!.height

  /*
    „Deutlich" heißt hier: mehr als das Doppelte. Ein Feld, das um zwanzig Prozent wächst,
    beantwortet die Frage nicht, wegen der jemand den Knopf drückt.
  */
  expect(nachher, `${vorher} px → ${nachher} px`).toBeGreaterThan(vorher * 2)

  await sheet.getByRole('button', { name: 'Kleiner' }).click()
  expect((await feld.boundingBox())!.height, 'der Rückweg führt nicht zurück').toBeCloseTo(vorher, 0)
})

test('die Fußzeile bleibt im Bild, auch wenn das Feld groß ist', async ({ page }) => {
  const sheet = await notizBogen(page)
  await sheet.getByRole('button', { name: 'Größer' }).click()

  /*
    Ein Feld, das höher ist als das Fenster, schiebt seine eigene Fußzeile hinaus – und damit
    den Weg zurück und die Auszeichnungshinweise, wegen derer die Zeile überhaupt da steht.
  */
  const fuss = sheet.locator('.textarea-fuss')
  await expect(fuss).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Kleiner' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Vorschau' })).toBeVisible()
})

test.describe('auf dem Telefon', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('das große Feld passt in den Bogen', async ({ page }) => {
    const sheet = await notizBogen(page)
    await sheet.getByRole('button', { name: 'Größer' }).click()

    const feld = (await sheet.locator('textarea').boundingBox())!
    expect(feld.height, 'das Feld ist höher als das Fenster').toBeLessThanOrEqual(844)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      'die Seite lässt sich seitlich schieben',
    ).toBe(true)
  })
})
