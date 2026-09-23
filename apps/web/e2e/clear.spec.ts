import { test, expect } from '@playwright/test'

/**
 * Alle Einträge löschen – die harte Bestätigung.
 *
 * Geprüft wird hier nur die Sperre, nicht die Löschung selbst: Ein Test, der den
 * Demohaushalt leert, wäre beim zweiten Lauf ohne Daten. Was tatsächlich fällt, prüft
 * `apps/api/test/clear.spec.ts` gegen Wegwerf-Haushalte.
 */
test.use({ viewport: { width: 1280, height: 900 } })

test('der Knopf bleibt gesperrt, bis das Wort genau stimmt', async ({ page }) => {
  await page.goto('/einstellungen/daten')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

  // Geschlossen steht nur der Weg dorthin, nicht die Handlung selbst.
  await expect(page.getByRole('button', { name: 'Endgültig löschen' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Alles löschen' }).click()

  // Die Folge steht da, bevor man tippt.
  await expect(page.getByText('Es gibt keine Karenzzeit und keinen Papierkorb.')).toBeVisible()

  const knopf = page.getByRole('button', { name: 'Endgültig löschen' })
  const feld = page.getByLabel('Zur Bestätigung eingeben')

  await expect(knopf, 'ohne Eingabe').toBeDisabled()
  for (const daneben of ['alles löschen', 'ALLES LOESCHEN', 'ALLES LÖSCHEN ', 'löschen']) {
    await feld.fill(daneben)
    await expect(knopf, `„${daneben}" darf nicht genügen`).toBeDisabled()
  }
  await feld.fill('ALLES LÖSCHEN')
  await expect(knopf, 'mit dem richtigen Wort').toBeEnabled()

  // „Behalten" räumt den Dialog weg – und die Eingabe gleich mit.
  await page.getByRole('button', { name: 'Behalten' }).click()
  await expect(page.getByRole('button', { name: 'Alles löschen' })).toBeVisible()
  await page.getByRole('button', { name: 'Alles löschen' }).click()
  await expect(page.getByLabel('Zur Bestätigung eingeben')).toHaveValue('')
})

test('die beiden zerstörenden Wege verlangen Verschiedenes', async ({ page }) => {
  /*
   * Zwei Bestätigungen mit derselben Eingabe wären eine Falle: Wer im falschen Dialog das
   * Richtige tippt, merkt es erst danach. „Alles löschen" verlangt ein festes Wort, die
   * Haushaltslöschung den Namen des Haushalts.
   */
  await page.goto('/einstellungen/daten')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

  await page.getByRole('button', { name: 'Alles löschen' }).click()
  await expect(page.getByText('Erwartet: ALLES LÖSCHEN')).toBeVisible()
  await page.getByRole('button', { name: 'Behalten' }).click()

  await page.getByRole('button', { name: 'Löschung vorbereiten' }).click()
  const erwartet = await page.locator('.field-hint, .hint').filter({ hasText: 'Erwartet:' }).first().innerText()
  expect(erwartet, 'die Haushaltslöschung darf nicht dasselbe Wort verlangen').not.toContain('ALLES LÖSCHEN')
})
