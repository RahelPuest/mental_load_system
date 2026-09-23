import { test, expect, type Page } from '@playwright/test'

/**
 * Umbenennen von Anfang bis Ende (docs/75).
 *
 * Umbenannt wird ein Bereich, den dieser Test selbst anlegt und hinterher wieder entfernt –
 * ein echter Name im Demohaushalt bliebe stehen, und der nächste Lauf fände eine andere Welt
 * vor (`tree.ts` beschreibt dieselbe Vorsicht für die Baumstruktur).
 */
test.use({ viewport: { width: 1280, height: 900 } })

async function kontext(page: Page) {
  const householdId = await page.evaluate(() => localStorage.getItem('thealotta.household'))
  const csrf = await page.evaluate(() => document.cookie.match(/thealotta_csrf=([^;]+)/)?.[1] ?? '')
  return { base: `/api/v1/households/${householdId}`, headers: { 'x-csrf-token': decodeURIComponent(csrf) } }
}

test('ein Bereich lässt sich im Baum umbenennen', async ({ page }) => {
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  const { base, headers } = await kontext(page)

  /*
    Zwei Namen, von denen keiner im anderen steckt. Ein „X" und ein „X umbenannt" hätten den
    Test grün aussehen lassen, obwohl die alte Zeile noch da war: `hasText` sucht Teiltexte.
  */
  const stempel = Date.now().toString(36)
  const alt = `Wegwerf ${stempel}`
  const neu = `Frischer Name ${stempel}`
  const { id } = (await (await page.request.post(`${base}/domains`, { headers, data: { name: alt } })).json()) as {
    id: string
  }

  try {
    await page.reload()
    await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()

    await page.getByRole('button', { name: `„${alt}" umbenennen oder einordnen` }).click()
    const bogen = page.locator('.sheet')
    await expect(bogen).toBeVisible()

    const feld = bogen.getByLabel('Wie heißt der Bereich?')
    await expect(feld, 'der Bogen kommt ohne den Namen, der schon dasteht').toHaveValue(alt)
    await feld.fill(neu)
    await bogen.getByRole('button', { name: 'Speichern' }).click()

    // Der Baum zeigt den neuen Namen, ohne dass jemand die Seite neu lädt.
    await expect(bogen).toBeHidden()
    await expect(page.locator('li[data-domain]').filter({ hasText: neu })).toHaveCount(1)
    await expect(page.locator('li[data-domain]').filter({ hasText: alt })).toHaveCount(0)

    // Und der Server weiß es auch, nicht nur die Anzeige.
    const gespeichert = (await (await page.request.get(`${base}/domains`)).json()) as {
      items: { id: string; name: string; path: string }[]
    }
    const zeile = gespeichert.items.find((d) => d.id === id)
    expect(zeile?.name).toBe(neu)
    expect(zeile?.path, 'der Pfad blieb am alten Namen hängen').toContain('frischer_name')
  } finally {
    await page.request.delete(`${base}/domains/${id}`, { headers })
  }
})

test('und auf der Seite des Bereichs selbst', async ({ page }) => {
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  const { base, headers } = await kontext(page)

  const stempel = Date.now().toString(36)
  const alt = `Wegwerf ${stempel}`
  const neu = `Anders ${stempel}`
  const { id } = (await (await page.request.post(`${base}/domains`, { headers, data: { name: alt } })).json()) as {
    id: string
  }

  try {
    await page.goto(`/bereiche/${id}/wissen`)
    await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

    /*
      Der Knopf steht im Kopf, neben dem Namen – nicht im fünften Abschnitt. Geprüft wird das
      über den Ort, nicht nur über die Beschriftung.
    */
    const umbenennen = page.locator('.page-head').getByRole('button', { name: 'Umbenennen' })
    await expect(umbenennen).toBeVisible()
    await umbenennen.click()

    const bogen = page.locator('.sheet')
    await bogen.getByLabel('Wie heißt der Bereich?').fill(neu)
    await bogen.getByRole('button', { name: 'Speichern' }).click()

    // Die Überschrift zieht mit, ohne Neuladen.
    await expect(page.locator('.page-head').getByRole('heading', { name: neu })).toBeVisible()
  } finally {
    await page.request.delete(`${base}/domains/${id}`, { headers })
  }
})
