import { test, expect, type Page } from '@playwright/test'

/**
 * Einen Bereich auf einen anderen ziehen, damit er sein Unterbereich wird (docs/76).
 *
 * Gemeldet als „geht nicht": Bis dahin gab es nur „direkt darunter schieben und dann nach
 * rechts". Die Geste, die alle kennen – auf die Zeile ziehen –, tat nichts.
 *
 * Gearbeitet wird mit zwei Wegwerfbereichen, die dieser Test selbst anlegt und hinterher
 * entfernt: Der Baum ist echter Zustand auf dem Server (siehe `tree.ts`).
 */
test.use({ viewport: { width: 1280, height: 900 } })

async function kontext(page: Page) {
  const householdId = await page.evaluate(() => localStorage.getItem('thealotta.household'))
  const csrf = await page.evaluate(() => document.cookie.match(/thealotta_csrf=([^;]+)/)?.[1] ?? '')
  return { base: `/api/v1/households/${householdId}`, headers: { 'x-csrf-token': decodeURIComponent(csrf) } }
}

test('auf eine Zeile gezogen wird der Bereich zu ihrem Unterbereich', async ({ page }) => {
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  const { base, headers } = await kontext(page)

  const s = Date.now().toString(36)
  const anlegen = async (name: string) =>
    ((await (await page.request.post(`${base}/domains`, { headers, data: { name } })).json()) as { id: string }).id
  const zielId = await anlegen(`Zielbereich ${s}`)
  const zieherId = await anlegen(`Zugbereich ${s}`)

  try {
    await page.reload()
    await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()

    const ziel = page.locator(`li[data-domain="${zielId}"]`)
    const zieher = page.locator(`li[data-domain="${zieherId}"]`)
    expect(await zieher.getAttribute('data-depth'), 'der Zugbereich liegt nicht oben').toBe('0')

    const griff = zieher.locator('.grip')
    const g = (await griff.boundingBox())!
    const z = (await ziel.boundingBox())!

    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    // Genau auf die Mitte der Zielzeile – ohne jede waagerechte Bewegung.
    for (let i = 1; i <= 8; i += 1) {
      const t = i / 8
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + (z.y + z.height / 2 - (g.y + g.height / 2)) * t)
    }

    // Die Zielzeile sagt vorher, was passieren wird – nicht erst das Ergebnis.
    await expect(ziel, 'das Ziel ist nicht hervorgehoben').toHaveClass(/ist-ziel/)

    await page.mouse.up()
    await expect(page.locator(`li[data-domain="${zieherId}"]`)).toHaveAttribute('data-depth', '1')

    // Und der Server weiß es auch.
    const liste = (await (await page.request.get(`${base}/domains`)).json()) as {
      items: { id: string; parentId: string | null }[]
    }
    expect(liste.items.find((d) => d.id === zieherId)?.parentId).toBe(zielId)
  } finally {
    await page.request.delete(`${base}/domains/${zieherId}`, { headers }).catch(() => undefined)
    await page.request.delete(`${base}/domains/${zielId}`, { headers }).catch(() => undefined)
  }
})
