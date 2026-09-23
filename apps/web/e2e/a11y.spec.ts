import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { TARGETS } from './pages.js'

/**
 * Barrierefreiheit im echten Browser (Auftrag §38).
 *
 * jsdom kann Semantik prüfen, aber keine berechneten Kontraste, keine Überdeckungen und
 * keine Fokusreihenfolge. axe misst am gerenderten Baum.
 */
for (const target of TARGETS) {
  test(`${target.name}: keine Verstöße nach WCAG A/AA`, async ({ page }, testInfo) => {
    await page.goto(target.path)
    await expect(page.getByRole('heading', { name: target.heading }).first()).toBeVisible()
    await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const findings = result.violations.map((v) => ({
      regel: v.id,
      schwere: v.impact,
      beschreibung: v.help,
      stellen: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    }))
    if (findings.length > 0) {
      await testInfo.attach('axe', { body: JSON.stringify(findings, null, 2), contentType: 'application/json' })
    }
    expect(findings, `Verstöße auf ${target.path}`).toEqual([])
  })
}

test('der Erfassen-Dialog ist bedienbar und barrierefrei', async ({ page }) => {
  await page.goto('/jetzt')
  await page.getByRole('button', { name: 'Erfassen' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  /*
   * Die Einblendung abwarten: Während der Animation ist der Dialog halbdurchsichtig, und
   * axe rechnet dann mit gemischten Farben (4.42 statt 6.5). Ein Messfehler, kein Mangel –
   * die Tokenwerte selbst sind in tokens.spec.ts geprüft.
   */
  await page.waitForFunction(() => {
    const el = document.querySelector('[role="dialog"]') as HTMLElement | null
    if (!el) return false
    return getComputedStyle(el).opacity === '1' && el.getAnimations().every((a) => a.playState !== 'running')
  })

  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .include('[role="dialog"]')
    .analyze()
  const details = result.violations.map((v) => ({
    regel: v.id,
    stellen: v.nodes.slice(0, 3).map((n) => ({ ziel: n.target.join(' '), warum: n.failureSummary?.slice(0, 200) })),
  }))
  expect(details, 'Verstöße im Dialog').toEqual([])

  // Der Fokus liegt im Dialog, Escape schließt ihn.
  const inside = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')
    return Boolean(d && document.activeElement && d.contains(document.activeElement))
  })
  expect(inside, 'der Fokus steht nicht im Dialog').toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
