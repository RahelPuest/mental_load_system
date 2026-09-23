import { defineConfig, devices } from '@playwright/test'

/**
 * Prüfung im echten Browser.
 *
 * jsdom kann Struktur, Semantik und Zustände prüfen – aber kein Layout. Alles, was der
 * Auftrag unter §3.6 (Ästhetik), §50 (Breakpoints) und §67 (Desktop/Tablet/Mobile) verlangt,
 * braucht eine echte Layoutberechnung. Diese Konfiguration liefert sie.
 *
 * Voraussetzung: laufender Stack (`pnpm stack:up`, API und `pnpm dev:web`).
 */
const BASE = process.env['E2E_BASE_URL'] ?? 'http://localhost:4173'

export default defineConfig({
  testDir: './apps/web/e2e',
  outputDir: './apps/web/e2e/.artifacts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    colorScheme: 'light',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  /*
   * Gebautes Bündel statt Entwicklungsserver – siehe apps/web/vite.config.ts.
   *
   * Der Build liegt bewusst im npm-Skript, nicht hier: Mit `reuseExistingServer` startet
   * Playwright den Befehl nicht, wenn schon ein Server läuft – und prüfte dann stillschweigend
   * einen alten Stand. Genau das ist passiert, und die Aufnahmen sahen unverändert aus,
   * obwohl der Code längst anders war.
   */
  webServer: process.env['E2E_BASE_URL']
    ? undefined
    : {
        command: 'pnpm --filter @thealotta/web exec vite preview',
        url: 'http://localhost:4173',
        reuseExistingServer: true,
        timeout: 120_000,
      },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testIgnore: /touch\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'apps/web/e2e/.auth/state.json' },
    },
    {
      /* Berührung statt Maus: erst hier gilt `pointer: coarse` und damit die 44-px-Regel. */
      name: 'touch',
      dependencies: ['setup'],
      testMatch: /touch\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        storageState: 'apps/web/e2e/.auth/state.json',
      },
    },
  ],
})
