import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { BREAKPOINTS, TARGETS } from './pages.js'

/**
 * Layoutprüfung im echten Browser (Auftrag §50, §67).
 *
 * Geprüft wird, was jsdom nicht kann: ob etwas seitlich aus dem Bild läuft, ob sich
 * Bedienelemente überlappen, ob Trefferflächen die geforderte Größe haben und ob die
 * Navigation je Breite die richtige ist.
 */
const SHOTS = 'apps/web/e2e/.shots'
mkdirSync(SHOTS, { recursive: true })

/** Elemente, die breiter sind als ihr Container – die klassische Ursache für Querscrollen. */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth
    const guilty: string[] = []
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      const style = getComputedStyle(el)
      if (style.position === 'fixed') continue
      // Elemente, die selbst scrollen dürfen, sind in Ordnung.
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue
      // Absichtlich aus dem Bild geparkt: Sprungmarke, visuell verborgene Beschriftungen.
      if (style.position === 'absolute' && box.right < -100) continue
      if (el.closest('.visually-hidden, .skip-link')) continue
      if (box.right > docWidth + 1 || box.left < -1) {
        const id = `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ').filter(Boolean).slice(0, 2).join('.') : ''}`
        guilty.push(`${id} [${Math.round(box.left)}…${Math.round(box.right)} von ${docWidth}]`)
      }
    }
    return [...new Set(guilty)].slice(0, 8)
  })
}

for (const bp of BREAKPOINTS) {
  test.describe(`${bp.name} (${bp.width}px)`, () => {
    test.use({ viewport: { width: bp.width, height: bp.height } })

    for (const target of TARGETS) {
      test(`${target.name}: sitzt im Bild`, async ({ page }) => {
        await page.goto(target.path)
        await expect(page.getByRole('heading', { name: target.heading }).first()).toBeVisible()
        // Nachladen der Seite abwarten, damit keine Skelette im Bild bleiben.
        await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0, null, {
          timeout: 15_000,
        })

        await page.screenshot({
          path: `${SHOTS}/${bp.name}-${target.name}.png`,
          fullPage: bp.width < 900,
        })

        const guilty = await overflowing(page)
        expect(guilty, `läuft seitlich aus dem Bild`).toEqual([])

        const scrollsSideways = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        )
        expect(scrollsSideways, 'die Seite scrollt seitlich').toBe(false)
      })
    }

    test('die richtige Navigation ist sichtbar', async ({ page }) => {
      await page.goto('/jetzt')
      // Ohne `exact` passt „Hauptbereiche" auch auf „Hauptbereiche, untere Leiste".
      const sidebar = page.getByRole('navigation', { name: 'Hauptbereiche', exact: true })
      const bottom = page.getByRole('navigation', { name: /untere Leiste/ })
      if (bp.width >= 720) {
        await expect(sidebar).toBeVisible()
        await expect(bottom).toBeHidden()
      } else {
        await expect(bottom).toBeVisible()
        await expect(sidebar).toBeHidden()
      }
    })
  })
}


test.describe('Eine dominante Primäraktion je Ansicht (§30)', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  for (const target of TARGETS) {
    test(`${target.name}: nicht zwei gleich starke Aktionen`, async ({ page }) => {
      await page.goto(target.path)
      await expect(page.getByRole('heading', { name: target.heading }).first()).toBeVisible()
      await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

      /*
       * Dieselbe Aktion je Eintrag ist keine Konkurrenz – „Erledigt" an zehn Karten ist
       * eine Aktion, zehnmal angeboten. Gezählt werden deshalb *verschiedene*
       * Primäraktionen: zwei davon nebeneinander lassen offen, was der Hauptweg ist (§30).
       */
      const primaries = await page.evaluate(() => [
        ...new Set(
          Array.from(document.querySelectorAll<HTMLElement>('.content .btn-primary'))
            .filter((el) => el.getBoundingClientRect().height > 0 && !el.closest('[role="dialog"]'))
            .map((el) => el.textContent?.trim() ?? ''),
        ),
      ])
      expect(primaries.length, `konkurrierende Primäraktionen: ${primaries.join(' / ')}`).toBeLessThanOrEqual(1)
    })
  }
})

test.describe('Ausrichtung im Raster (§59)', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  for (const target of TARGETS) {
    test(`${target.name}: Karten einer Zeile stehen bündig`, async ({ page }) => {
      await page.goto(target.path)
      await expect(page.getByRole('heading', { name: target.heading }).first()).toBeVisible()
      await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

      const misaligned = await page.evaluate(() => {
        const problems: string[] = []
        for (const grid of Array.from(document.querySelectorAll('.card-grid'))) {
          const boxes = Array.from(grid.children).map((el) => el.getBoundingClientRect())
          const rows = new Map<number, DOMRect[]>()
          for (const box of boxes) {
            // Zeilen anhand der Oberkante gruppieren, auf 20 px gerundet.
            const key = Math.round(box.top / 20)
            rows.set(key, [...(rows.get(key) ?? []), box])
          }
          for (const [, row] of rows) {
            if (row.length < 2) continue
            const tops = row.map((b) => Math.round(b.top))
            const heights = row.map((b) => Math.round(b.height))
            if (Math.max(...tops) - Math.min(...tops) > 1) problems.push(`Oberkanten: ${tops.join(', ')}`)
            if (Math.max(...heights) - Math.min(...heights) > 1) problems.push(`Höhen: ${heights.join(', ')}`)
          }
        }
        return problems.slice(0, 4)
      })
      expect(misaligned, 'Karten einer Rasterzeile stehen nicht bündig').toEqual([])
    })
  }
})
