import { test, expect } from '@playwright/test'

/**
 * Die Bring-Anbindung in der Oberfläche.
 *
 * Geprüft wird ausdrücklich **nicht** das Verbinden mit einem echten Konto – dafür bräuchte
 * es Zugangsdaten, die in keinen Test gehören. Geprüft wird, dass die Seite ehrlich ist:
 * Sie sagt vor der Eingabe, dass die Schnittstelle nicht offiziell ist und dass das Passwort
 * nicht gespeichert wird. Und dass der Weg zur Einkaufsliste nur dort auftaucht, wo es eine
 * gibt.
 */
test.use({ viewport: { width: 1280, height: 900 } })

test('sagt vor der Eingabe, worauf man sich einlässt', async ({ page }) => {
  await page.goto('/einstellungen/verbindungen')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

  await expect(page.getByText(/keine offizielle Schnittstelle/)).toBeVisible()
  await expect(page.getByText(/speichert das Passwort nicht/)).toBeVisible()

  // Ohne Eingabe passiert nichts.
  await expect(page.getByRole('button', { name: 'Verbinden' })).toBeDisabled()
  await page.getByLabel('E-Mail des Bring-Kontos').fill('jemand@example.invalid')
  await expect(page.getByRole('button', { name: 'Verbinden' }), 'ohne Passwort').toBeDisabled()
})

test('der Weg zur Einkaufsliste erscheint nur mit verbundener Liste', async ({ page }) => {
  /*
   * Ein Knopf, der erst beim Drücken sagt „nichts verbunden", ist eine Sackgasse mit
   * Ankündigung. Im Demohaushalt ist nichts verbunden – also darf er nicht dastehen.
   */
  await page.goto('/bereiche/01a07d11-afa5-7f8e-90a0-ed9ba4d53687/laeuft')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await expect(page.getByRole('button', { name: 'Bring' })).toHaveCount(0)
})
