import { test, expect } from '@playwright/test'

/**
 * Das Etikett „geerbt" ist ein Knopf – und muss trotzdem aussehen wie ein Etikett.
 *
 * Geprüft wird hier nur die Geometrie, nicht die Wirkung: Übernehmen ändert die Verantwortung
 * im Demohaushalt, und dafür gibt es keinen Wiederherstellungsweg wie beim Baum (`tree.ts`).
 * Was der Klick auslöst, steht in `apps/web/test/erbe-uebernehmen.spec.tsx`.
 */
test.use({ viewport: { width: 1280, height: 900 } })

test.beforeEach(async ({ page }) => {
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
})

test('sitzt auf derselben Linie wie das Abzeichen daneben', async ({ page }) => {
  const chip = page.locator('.erbe-chip').first()
  await expect(chip).toBeVisible()

  /*
    Der erste Anlauf baute sein Äußeres selbst – eigener Innenabstand, eigene Zeilenhöhe,
    `inline-grid` statt `inline-flex`. Das saß sichtbar neben den anderen Abzeichen: Ein
    Inline-Gitter setzt seine Grundlinie anders als eine Inline-Flexbox.
  */
  const zeile = page.locator('li[data-domain]').filter({ has: page.locator('.erbe-chip') }).first()
  const abzeichen = zeile.locator('.owner-badge').first()

  const [a, b] = await Promise.all([chip.boundingBox(), abzeichen.boundingBox()])
  expect(a, 'kein Kasten – dann misst der Test nichts').toBeTruthy()
  expect(b).toBeTruthy()

  const mitte = (k: NonNullable<typeof a>) => k.y + k.height / 2
  expect(
    Math.abs(mitte(a!) - mitte(b!)),
    `„geerbt" steht ${Math.abs(mitte(a!) - mitte(b!)).toFixed(1)} px neben dem Abzeichen`,
  ).toBeLessThanOrEqual(1.5)
})

test('beim Darauffahren wechselt die Aufschrift, ohne die Zeile zu verschieben', async ({ page }) => {
  const chip = page.locator('.erbe-chip').first()
  await expect(chip).toBeVisible()

  const vorher = await chip.boundingBox()
  await expect(chip.locator('.erbe-ruhe')).toBeVisible()
  await expect(chip.locator('.erbe-aktion')).toBeHidden()

  await chip.hover()
  await expect(chip.locator('.erbe-aktion')).toBeVisible()
  await expect(chip.locator('.erbe-ruhe')).toBeHidden()

  /*
    Die Breite richtet sich nach der längeren Aufschrift. Wüchse der Knopf unter dem Zeiger,
    schöbe er die Zeile daneben weg – und die Maus stünde plötzlich woanders.
  */
  const nachher = await chip.boundingBox()
  expect(nachher!.width, 'der Knopf wächst unter dem Zeiger').toBeCloseTo(vorher!.width, 0)
  expect(nachher!.x, 'der Knopf springt unter dem Zeiger').toBeCloseTo(vorher!.x, 0)
})
