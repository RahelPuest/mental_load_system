import { test, expect, type Page } from '@playwright/test'
import { restoreTree, snapshotTree, type TreeSnapshot } from './tree.js'

/**
 * Bereiche umbauen: ziehen, Farbe, löschen.
 *
 * Verschoben wird mit dem Zeiger – senkrecht für die Reihenfolge, waagerecht für die Ebene.
 * Ziehen darf aber nicht der einzige Weg sein (WCAG 2.5.7), deshalb bewegen die Pfeiltasten
 * dieselbe Zeile, wenn der Griff den Fokus hat. Beide Wege stehen hier.
 */
test.use({ viewport: { width: 1280, height: 900 } })

const rows = (page: Page) => page.locator('li[data-domain]')
const row = (page: Page, name: string) => rows(page).filter({ hasText: name }).first()

/** Namen mit ihrer Ebene, in Anzeigereihenfolge – das ist es, was man auf der Seite sieht. */
async function tree(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('li[data-domain]')].map((li) => ({
      name: li.querySelector('.row-title')?.textContent ?? '',
      depth: Number(li.dataset['depth'] ?? 0),
    })),
  )
}
const names = async (page: Page) => (await tree(page)).map((r) => r.name)
const depthOf = async (page: Page, name: string) => (await tree(page)).find((r) => r.name === name)?.depth

let original: TreeSnapshot | null = null

test.beforeEach(async ({ page }) => {
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  original ??= await snapshotTree(page)
  await restoreTree(page, original)
})

test.afterEach(async ({ page }) => {
  if (original) await restoreTree(page, original)
})

async function edit(page: Page) {
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await expect(page.getByRole('button', { name: 'Fertig' })).toBeVisible()
}

/**
 * Eine Zeile an die Stelle einer anderen ziehen.
 *
 * `dx` verschiebt zusätzlich waagerecht – so entsteht ein Ebenenwechsel. Beide Zeilen werden
 * vorher ins Bild geholt: Der Zeiger arbeitet in Fensterkoordinaten, und was außerhalb liegt,
 * trifft er nicht (das hat beim ersten Versuch eine Weile gekostet).
 */
async function drag(page: Page, from: string, to: string, dx = 0) {
  const grip = row(page, from).locator('.grip')
  await grip.scrollIntoViewIfNeeded()
  const start = (await grip.boundingBox())!
  const target = (await row(page, to).boundingBox())!

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + start.width / 2 + dx, target.y + 3, { steps: 12 })
  await expect(page.locator('.drop-mark'), 'keine Einfügemarke – der Zug ist nicht angekommen').toHaveCount(1)
  await page.mouse.up()
}

test('im Normalzustand steht kein Werkzeug im Weg', async ({ page }) => {
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await expect(page.locator('.row-tools')).toHaveCount(0)
  await expect(page.locator('.grip')).toHaveCount(0)
})

test('ziehen ändert die Reihenfolge', async ({ page }) => {
  await edit(page)
  const before = await names(page)

  await drag(page, 'Wäsche', 'Lebensmittel')
  await expect.poll(async () => (await names(page)).indexOf('Wäsche')).toBeLessThan(before.indexOf('Wäsche'))

  // Zurückstellen erledigt `afterEach` – hier zählt nur, dass der Zug angekommen ist.
  void before
})

test('ein Knopf hebt den Bereich eine Ebene an – mitsamt seiner Unterbereiche', async ({ page }) => {
  await edit(page)
  const kleidung = (await depthOf(page, 'Kleidung'))!
  const schuhe = (await depthOf(page, 'Schuhe'))!

  await row(page, 'Kleidung').getByRole('button', { name: /eine Ebene höher/ }).click()

  await expect.poll(() => depthOf(page, 'Kleidung')).toBe(kleidung - 1)
  await expect.poll(() => depthOf(page, 'Schuhe'), { message: 'das Kind blieb zurück' }).toBe(schuhe - 1)
})

test('auf der obersten Ebene steht der Knopf still, statt jedes Mal dasselbe zu antworten', async ({ page }) => {
  await edit(page)
  const first = (await names(page))[0]!

  const button = row(page, first).getByRole('button', { name: /eine Ebene höher/ })
  await expect(button).toBeDisabled()
  await expect(button).toHaveAttribute('title', /obersten Ebene/)

  // Eingerückte Zeilen können es sehr wohl.
  await expect(row(page, 'Schuhe').getByRole('button', { name: /eine Ebene höher/ })).toBeEnabled()
})

test('waagerecht ziehen ändert die Ebene – und die Kinder wandern mit', async ({ page }) => {
  await edit(page)
  const kleidung = (await depthOf(page, 'Kleidung'))!
  const schuhe = (await depthOf(page, 'Schuhe'))!

  // Auf sich selbst gezogen, aber eine Einrückung nach links: nur die Ebene ändert sich.
  await drag(page, 'Kleidung', 'Kleidung', -24)
  await expect.poll(() => depthOf(page, 'Kleidung')).toBe(kleidung - 1)
  await expect.poll(() => depthOf(page, 'Schuhe'), { message: 'das Kind blieb zurück' }).toBe(schuhe - 1)

})

test('während des Ziehens ist zu sehen, wohin es fällt', async ({ page }) => {
  await edit(page)
  const grip = row(page, 'Wäsche').locator('.grip')
  await grip.scrollIntoViewIfNeeded()
  const start = (await grip.boundingBox())!
  const target = (await row(page, 'Urlaube').boundingBox())!

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + start.width / 2, target.y + 3, { steps: 10 })

  // Die aufgenommene Zeile tritt zurück, die Marke zeigt Stelle und Ebene.
  await expect(row(page, 'Wäsche')).toHaveClass(/is-dragged/)
  const mark = page.locator('.drop-mark')
  await expect(mark).toHaveCount(1)
  const indent = await mark.evaluate((el) => getComputedStyle(el).marginLeft)
  expect(indent, 'die Marke ist nicht auf die Zielebene eingerückt').not.toBe('0px')

  await page.mouse.up()
  await expect.poll(async () => (await names(page)).indexOf('Wäsche')).toBeLessThan(6)
})

test('Pfeiltasten bewegen dieselbe Zeile – ziehen ist nicht der einzige Weg', async ({ page }) => {
  await edit(page)
  const before = await names(page)

  const grip = row(page, 'Wäsche').locator('.grip')
  await grip.focus()
  await expect(grip).toHaveAttribute('aria-label', /Pfeiltasten/)

  await grip.press('ArrowUp')
  await expect.poll(async () => (await names(page)).indexOf('Wäsche')).toBe(before.indexOf('Wäsche') - 1)

})

test('am Rand kommt eine Auskunft, keine Fehlermeldung – und zwar an der Zeile', async ({ page }) => {
  await edit(page)
  const first = (await names(page))[0]!

  await row(page, first).locator('.grip').press('ArrowUp')

  const notice = row(page, first).locator('.row-drawer .notice')
  await expect(notice).toContainText('ganz oben')
  await expect(notice, 'am Ende einer Liste anzukommen ist kein Fehler').toHaveClass(/notice-quiet/)
})

test('die Farbe wird unter ihrer Zeile gewählt und wirkt sofort', async ({ page }) => {
  await edit(page)
  const target = row(page, 'Wäsche')
  const before = await target.getAttribute('class')

  await target.getByRole('button', { name: /Farbe von/ }).click()
  await expect(target.locator('.row-drawer .swatch')).toHaveCount(12)
  await target.locator('.row-drawer .swatch').nth(11).click()
  await expect(row(page, 'Wäsche')).toHaveClass(/m-12/)

  await row(page, 'Wäsche').locator('.row-drawer .linklike').click()
  await expect.poll(async () => row(page, 'Wäsche').getAttribute('class')).toBe(before)
})

test('löschen fragt nach und sagt bei vollem Bereich, was drinsteht', async ({ page }) => {
  await edit(page)
  const target = row(page, 'Reparaturen')

  await target.getByRole('button', { name: /löschen/ }).click()
  await expect(target.getByRole('button', { name: 'Wirklich löschen' })).toBeVisible()
  await target.getByRole('button', { name: 'Wirklich löschen' }).click()

  const notice = row(page, 'Reparaturen').locator('.row-drawer .notice')
  await expect(notice).toContainText('steht schon etwas')
  await expect(rows(page).filter({ hasText: 'Reparaturen' }), 'trotz Ablehnung gelöscht').toHaveCount(1)
})

test('ein leerer Bereich lässt sich anlegen und wieder entfernen', async ({ page }) => {
  const name = `Wegwerf ${Date.now()}`
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await page.getByRole('button', { name: 'Bereich anlegen' }).click()
  await page.getByLabel('Wie heißt der Bereich?').fill(name)
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click()
  await page.waitForURL(/\/bereiche\/[0-9a-f-]+/)

  await edit(page)
  await row(page, name).getByRole('button', { name: /löschen/ }).click()
  await row(page, name).getByRole('button', { name: 'Wirklich löschen' }).click()
  await expect(rows(page).filter({ hasText: name })).toHaveCount(0)
})
