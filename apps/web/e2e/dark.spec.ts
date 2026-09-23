import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync } from 'node:fs'
import { TARGETS } from './pages.js'

/**
 * Der Dunkelmodus, tatsächlich gerendert (Auftrag §67: „Dark/Light Mode, falls unterstützt").
 *
 * Bis hierher war er nur rechnerisch geprüft – Kontraste in tokens.spec.ts. Wie er aussieht,
 * hat niemand gesehen. Wer sein Betriebssystem dunkel stellt, bekommt aber genau diesen
 * Modus zu sehen, ohne dass er ihn gewählt hätte.
 */
const SHOTS = 'apps/web/e2e/.shots'
mkdirSync(SHOTS, { recursive: true })

test.use({ colorScheme: 'dark', viewport: { width: 1280, height: 900 } })

for (const target of TARGETS.slice(0, 6)) {
  test(`${target.name}: dunkel`, async ({ page }) => {
    await page.goto(target.path)
    await expect(page.getByRole('heading', { name: target.heading }).first()).toBeVisible()
    await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
    await page.screenshot({ path: `${SHOTS}/DARK-${target.name}.png` })

    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(
      result.violations.map((v) => ({ regel: v.id, stellen: v.nodes.slice(0, 2).map((n) => n.target.join(' ')) })),
      `Verstöße im Dunkelmodus auf ${target.path}`,
    ).toEqual([])
  })
}
