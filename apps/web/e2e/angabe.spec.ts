import { test, expect } from '@playwright/test'

/**
 * Der Bogen „Neue Angabe" – mit dem Wertfeld, das er seit docs/73 hat.
 *
 * Geprüft wird nur, was der Browser rechnen muss: dass das zusätzliche Feld den Bogen auf dem
 * Telefon nicht sprengt und dass es zur gewählten Art passt. Angelegt wird hier nichts – eine
 * Angabe im Demohaushalt bliebe stehen und der nächste Lauf fände eine andere Welt vor.
 */
const BEREICH = '/bereiche/01a07d11-afa5-7f8e-90a0-ed9ba4d53687/wissen'

async function bogen(page: import('@playwright/test').Page) {
  await page.goto(BEREICH)
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await page.getByRole('button', { name: 'Angabe', exact: true }).click()
  const sheet = page.locator('.sheet')
  await expect(sheet).toBeVisible()
  return sheet
}

test('das Wertfeld steht im Bogen und richtet sich nach der Art', async ({ page }) => {
  const sheet = await bogen(page)

  // Text: ein gewöhnliches Eingabefeld.
  await expect(sheet.getByLabel(/^Wert/)).toHaveAttribute('type', 'text')

  await sheet.getByLabel('Art der Angabe').selectOption('number')
  await expect(sheet.getByLabel(/^Wert/)).toHaveAttribute('type', 'number')

  await sheet.getByLabel('Art der Angabe').selectOption('date')
  await expect(sheet.getByLabel(/^Wert/)).toHaveAttribute('type', 'date')

  // „Ja / Nein" ist eine Wahl, kein Feld, in das man tippt.
  await sheet.getByLabel('Art der Angabe').selectOption('boolean')
  await expect(sheet.locator('select').filter({ hasText: 'bitte wählen' })).toBeVisible()
})

test('„weiß ich nicht" nimmt das Feld weg, statt es zu sperren', async ({ page }) => {
  const sheet = await bogen(page)
  await expect(sheet.getByLabel(/^Wert/)).toBeVisible()

  /*
    Ein leeres, graues Feld daneben lädt dazu ein, doch etwas hineinzuschreiben, das dann nicht
    gespeichert wird.
  */
  await sheet.getByLabel('Weiß ich (noch) nicht').check()
  await expect(sheet.getByLabel(/^Wert/)).toHaveCount(0)
})

test.describe('auf dem Telefon', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('der Bogen läuft mit dem zusätzlichen Feld nicht aus dem Bild', async ({ page }) => {
    const sheet = await bogen(page)

    const kasten = await sheet.boundingBox()
    expect(kasten!.x, 'der Bogen beginnt links außerhalb').toBeGreaterThanOrEqual(0)
    expect(kasten!.x + kasten!.width, 'der Bogen ragt rechts hinaus').toBeLessThanOrEqual(390)

    // Der Knopf zum Anlegen muss erreichbar bleiben – notfalls durch Rollen im Bogen.
    await sheet.getByRole('button', { name: 'Anlegen' }).scrollIntoViewIfNeeded()
    await expect(sheet.getByRole('button', { name: 'Anlegen' })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      'die Seite lässt sich seitlich schieben',
    ).toBe(true)
  })
})
