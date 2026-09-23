import { test, expect } from '@playwright/test'

/**
 * Anzahl-Anzeigen in der Navigation.
 *
 * Jede Anordnung hat ihr übliches Muster: In einer Zeile mit Text steht die Zahl am Ende der
 * Zeile, auf einer Kachel an der Ecke des Symbols. Was hier festgehalten wird, ist der
 * Übergang dazwischen – denn genau dort ist es einmal schiefgegangen: Der Block für breite
 * Fenster stellte den Eintrag auf eine Zeile um, ließ die Zahl aber in der Ecke stehen, elf
 * Pixel über der Zeilenmitte.
 */
const BADGE = '.nav-link .chip, .bottombar a .tab-count'

async function badgeOf(page: import('@playwright/test').Page) {
  await page.goto('/jetzt')
  await page.waitForFunction(
    (sel) => document.querySelectorAll(sel).length > 0,
    BADGE,
    { timeout: 15_000 },
  )
  return page.evaluate((sel) => {
    const badge = document.querySelector(sel)!
    const link = badge.closest('a, button')!
    const lr = link.getBoundingClientRect()
    const br = badge.getBoundingClientRect()
    return {
      position: getComputedStyle(badge).position,
      offsetFromMiddle: Math.round(br.top + br.height / 2 - (lr.top + lr.height / 2)),
      gapToRight: Math.round(lr.right - br.right),
      inside: br.left >= lr.left && br.right <= lr.right + 0.5 && br.top >= lr.top && br.bottom <= lr.bottom,
      text: badge.textContent?.trim() ?? '',
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  }, BADGE)
}

test.describe('breite Fenster: die Zahl steht am Ende ihrer Zeile', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('mittig auf der Zeile, bündig rechts', async ({ page }) => {
    const b = await badgeOf(page)
    expect(b.position, 'in einer Textzeile gehört die Zahl nicht in die Ecke').toBe('static')
    expect(Math.abs(b.offsetFromMiddle), 'die Zahl hängt über oder unter der Zeilenmitte').toBeLessThanOrEqual(1)
    // Bündig heißt: derselbe Abstand wie der Innenabstand der Zeile, nicht irgendwo dazwischen.
    expect(b.gapToRight, 'die Zahl steht nicht am Zeilenende').toBeLessThanOrEqual(16)
    expect(b.inside).toBe(true)
  })
})

test.describe('schmale Symbolleiste: die Zahl sitzt an der Ecke des Symbols', () => {
  test.use({ viewport: { width: 900, height: 900 } })

  test('Abzeichen an der Kachel, ohne herauszuragen', async ({ page }) => {
    const b = await badgeOf(page)
    expect(b.position, 'auf einer Kachel gehört die Zahl an die Ecke').toBe('absolute')
    expect(b.inside, 'das Abzeichen ragt aus seiner Kachel heraus').toBe(true)
  })
})

test.describe('Handy: die untere Leiste zeigt die Anzahl, nicht nur einen Punkt', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('die Zahl steht da und passt auf die Kachel', async ({ page }) => {
    const b = await badgeOf(page)
    expect(b.text, 'ein Punkt sagt „irgendetwas" – die Anzahl ist bekannt').toMatch(/^\d+\+?$/)
    expect(b.inside).toBe(true)
    expect(b.overflow, 'die Leiste läuft seitlich aus dem Bild').toBe(0)
  })

  test('auch dreistellig bleibt die Kachel heil', async ({ page }) => {
    await page.goto('/jetzt')
    await page.waitForFunction((sel) => document.querySelectorAll(sel).length > 0, BADGE)
    const fits = await page.evaluate((sel) => {
      const badge = document.querySelector(sel)!
      badge.textContent = '99+'
      const link = badge.closest('a')!
      const lr = link.getBoundingClientRect()
      const br = badge.getBoundingClientRect()
      return br.right <= lr.right + 0.5 && document.documentElement.scrollWidth <= document.documentElement.clientWidth
    }, BADGE)
    expect(fits, 'eine dreistellige Anzahl sprengt die Kachel').toBe(true)
  })
})
