import { test as setup, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

/** Einmal anmelden, Sitzung für alle weiteren Prüfungen sichern. */
const STATE = 'apps/web/e2e/.auth/state.json'

setup('anmelden', async ({ page }) => {
  const email = process.env['E2E_EMAIL']
  const password = process.env['E2E_PASSWORD'] ?? 'Korrekt-Pferd-Batterie-Klammer-7'
  if (!email) throw new Error('E2E_EMAIL fehlt – Adresse eines Demokontos angeben.')

  await page.goto('/')
  await page.getByLabel(/E-Mail/i).fill(email)
  await page.getByLabel(/Passwort/i).fill(password)
  await page.getByRole('button', { name: /Anmelden/i }).click()

  await expect(page.getByRole('heading', { name: /Was zählt gerade/i })).toBeVisible({ timeout: 20_000 })
  await page.context().storageState({ path: STATE })
  // Sanity: die Datei ist da und enthält Cookies.
  expect(JSON.parse(readFileSync(STATE, 'utf8')).cookies.length).toBeGreaterThan(0)
})
