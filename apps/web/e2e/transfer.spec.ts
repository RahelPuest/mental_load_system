import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

/**
 * Daten mitnehmen und zurückbringen – von der Oberfläche aus.
 *
 * Der Weg über die API ist in `apps/api/test/transfer.spec.ts` geprüft. Hier geht es um das,
 * was nur im Browser stimmen kann: dass der Knopf wirklich eine Datei anbietet, und dass
 * eine unbrauchbare Datei eine verständliche Auskunft ergibt statt eines stillen Nichts.
 *
 * Der Import wird bewusst **nur mit unbrauchbaren Dateien** geprüft: Ein echter Import legt
 * Objekte im Demohaushalt an, und für Notizen gibt es keinen Löschweg. Ein Test, der bei
 * jedem Lauf Datenmüll hinterlässt, ist teurer als er wert ist.
 */
test.use({ viewport: { width: 1280, height: 900 } })

test('der Knopf liefert eine Datei, keine Ankündigung', async ({ page }, testInfo) => {
  await page.goto('/einstellungen/daten')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Datei speichern' }).click()
  const datei = await download

  expect(datei.suggestedFilename(), 'der Name nennt Haushalt und Datum').toMatch(/^thealotta-.+-\d{4}-\d{2}-\d{2}\.json$/)

  const inhalt = JSON.parse(readFileSync((await datei.path())!, 'utf8')) as Record<string, unknown>
  expect(inhalt['format']).toBe('thealotta.household')
  expect(Array.isArray(inhalt['bereiche']) && (inhalt['bereiche'] as unknown[]).length).toBeGreaterThan(0)

  // Was ausdrücklich nicht mitgeht.
  const roh = JSON.stringify(inhalt)
  for (const verboten of ['passwordHash', 'csrf', 'session']) {
    expect(roh, `„${verboten}" gehört nicht in eine Sicherungsdatei`).not.toContain(verboten)
  }
  void testInfo
})

test('eine unlesbare Datei sagt, was ihr fehlt', async ({ page }) => {
  await page.goto('/einstellungen/daten')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

  const pfad = test.info().outputPath('kaputt.json')
  writeFileSync(pfad, '{ das ist kein json')
  await page.locator('input[type=file]').setInputFiles(pfad)
  await expect(page.getByText('Diese Datei ist kein lesbares JSON.')).toBeVisible()

  const fremd = test.info().outputPath('fremd.json')
  writeFileSync(fremd, JSON.stringify({ format: 'etwas-anderes', version: 1 }))
  await page.locator('input[type=file]').setInputFiles(fremd)
  await expect(page.getByText('Das ist keine Thealotta-Sicherungsdatei.')).toBeVisible()

  const alteFassung = test.info().outputPath('alt.json')
  writeFileSync(alteFassung, JSON.stringify({ format: 'thealotta.household', version: 99 }))
  await page.locator('input[type=file]').setInputFiles(alteFassung)
  await expect(page.getByText(/Fassung 99/)).toBeVisible()
})
