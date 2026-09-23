import { test, expect } from '@playwright/test'

/**
 * Farbwahl für Personen und Bereiche.
 *
 * Geprüft wird nicht, dass ein Klick etwas speichert, sondern dass die Wahl dort ankommt, wo
 * sie etwas bedeutet: auf den Karten und Zeilen der anderen Seiten. Eine Farbe, die nur im
 * Farbwähler stimmt, hätte niemandem geholfen.
 */
test.use({ viewport: { width: 1280, height: 900 } })

/*
 * Die Wahl ist echter Zustand auf dem Server. Ohne Aufräumen färbte ein Lauf den nächsten
 * ein – und über die Oberfläche aufzuräumen hieße, sich beim Aufräumen auf genau das zu
 * verlassen, was gerade geprüft wird. Deshalb direkt über die Schnittstelle: Das ist
 * unabhängig davon, ob eine Seite gerade rendert, und hinterlässt nichts.
 */
async function resetColors(page: import('@playwright/test').Page) {
  const householdId = await page.evaluate(() => localStorage.getItem('thealotta.household'))
  if (!householdId) return
  /*
   * Mutationen brauchen dasselbe CSRF-Token wie im Browser. Ohne es antwortet der Server mit
   * 403 – was ohne Statusprüfung als stilles Nicht-Aufräumen durchgegangen wäre.
   */
  const csrf = await page.evaluate(() => document.cookie.match(/(?:^|;\s*)thealotta_csrf=([^;]+)/)?.[1] ??
      '')
  const base = `/api/v1/households/${householdId}/colors`
  const map = (await (await page.request.get(base)).json()) as {
    members: Record<string, string>
    domains: Record<string, string>
  }
  for (const [subject, entries] of [
    ['member', map.members ?? {}],
    ['domain', map.domains ?? {}],
  ] as const) {
    for (const id of Object.keys(entries)) {
      const res = await page.request.put(`${base}/${subject}/${id}`, {
        data: { tone: null },
        headers: { 'x-csrf-token': decodeURIComponent(csrf) },
      })
      // Einen Status im Aufräumen zu ignorieren heißt, den nächsten Lauf zu vergiften.
      expect(res.status(), `Zurücksetzen von ${subject}/${id} scheiterte: ${await res.text()}`).toBe(200)
    }
  }
  const after = (await (await page.request.get(base)).json()) as { members: object; domains: object }
  expect(Object.keys(after.members ?? {}).length + Object.keys(after.domains ?? {}).length).toBe(0)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/jetzt')
  await resetColors(page)
})
test.afterEach(async ({ page }) => resetColors(page))

test('eine gewählte Farbe überlebt das Neuladen und gilt überall', async ({ page }) => {
  await page.goto('/einstellungen/farben')
  await expect(page.getByRole('heading', { name: 'Deine Farbe' })).toBeVisible()

  const mine = page.locator('.colorpicker').first()
  await expect(mine.locator('.swatch')).toHaveCount(12)

  // Der zehnte Ton ist einer der vier neuen – er beweist, dass die Palette vollständig trägt.
  await mine.locator('.swatch').nth(9).click()
  await expect(mine.locator('.colorpicker-state')).toContainText('Indigo')
  await expect(mine.locator('.swatch.is-active')).toHaveClass(/m-10/)

  await page.reload()
  await expect(page.locator('.colorpicker').first().locator('.colorpicker-state')).toContainText(
    'Indigo – selbst gewählt',
  )

  // Und auf der Familienseite trägt dieselbe Person denselben Ton.
  await page.goto('/familie')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await expect(page.locator('.person-dot.m-10').first()).toBeVisible()
})

test('die Farbe ist nicht das einzige Signal', async ({ page }) => {
  await page.goto('/einstellungen/farben')
  const mine = page.locator('.colorpicker').first()
  await mine.locator('.swatch').nth(2).click()

  // Der gewählte Ton trägt ein Häkchen, und sein Name steht für Vorleseprogramme daneben.
  await expect(mine.locator('.swatch.is-active .swatch-mark')).toHaveText('✓')
  await expect(mine.locator('.colorpicker-state')).toContainText('Violett')
  await expect(mine.getByRole('radio', { name: 'Violett' })).toHaveAttribute('aria-checked', 'true')
})

test('jeder Bereich hat eine Farbe', async ({ page }) => {
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('li.tone-edge')].map((li) => ({
      text: (li.textContent ?? '').trim().slice(0, 30),
      tone: li.className.match(/\bm-\d+\b/)?.[0] ?? null,
      style: getComputedStyle(li).borderLeftStyle,
      width: getComputedStyle(li).borderLeftWidth,
    })),
  )

  expect(rows.length, 'keine Bereiche im Testbestand').toBeGreaterThan(0)
  for (const row of rows) {
    expect(row.tone, `„${row.text}" hat keine Farbe`).not.toBeNull()
    expect(row.width, `„${row.text}" hat keine sichtbare Kante`).not.toBe('0px')
    // Die Kante sagt, um welchen Bereich es geht – nicht, wie es um ihn steht.
    expect(row.style, `„${row.text}" hat eine andere Kantenform als die übrigen`).toBe('solid')
  }
})

test('„niemand zuständig" steht im Text, nicht in der Kantenform', async ({ page }) => {
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

  const vacant = page.locator('li.tone-edge').filter({ hasText: 'niemand zuständig' })
  expect(await vacant.count(), 'kein unbesetzter Bereich im Testbestand').toBeGreaterThan(0)
  await expect(vacant.first().getByText('niemand zuständig')).toBeVisible()
})
