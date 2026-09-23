import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync } from 'node:fs'

/**
 * Jede auswählbare Palette, in beiden Modi, tatsächlich gerendert.
 *
 * Eine Palette anzubieten, die man nicht lesen kann, wäre schlimmer als keine Auswahl.
 * tokens.spec.ts rechnet die Werte nach; hier läuft axe über das gerenderte Ergebnis.
 */
const SHOTS = 'apps/web/e2e/.shots'
mkdirSync(SHOTS, { recursive: true })

const SCHEMES = ['thealotta', 'dracula', 'catppuccin', 'nord', 'solarized'] as const

for (const scheme of SCHEMES) {
  for (const mode of ['light', 'dark'] as const) {
    test(`${scheme} ${mode}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode })
      await page.addInitScript(
        ([s, m]) => {
          localStorage.setItem('thealotta.scheme', s as string)
          localStorage.setItem('thealotta.theme', m as string)
        },
        [scheme, mode],
      )
      await page.goto('/jetzt')
      await expect(page.getByRole('heading', { name: /Was zählt gerade/ })).toBeVisible()
      await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

      // Die Wahl muss auch wirklich angekommen sein.
      const applied = await page.evaluate(() => ({
        scheme: document.documentElement.dataset['scheme'] ?? 'thealotta',
        theme: document.documentElement.dataset['theme'] ?? 'system',
      }))
      expect(applied.scheme).toBe(scheme)

      await page.screenshot({ path: `${SHOTS}/SCHEME-${scheme}-${mode}.png` })

      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(
        result.violations.map((v) => ({ regel: v.id, stellen: v.nodes.slice(0, 2).map((n) => n.target.join(' ')) })),
        `${scheme}/${mode}`,
      ).toEqual([])
    })
  }
}
