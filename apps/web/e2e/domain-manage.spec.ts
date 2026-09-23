import { test, expect } from '@playwright/test'

/**
 * Bereiche nachträglich ändern, wegräumen und löschen.
 *
 * Bis hierher gab es keinen Weg zurück: Ein einmal angelegter Bereich behielt seinen Namen,
 * seinen Platz im Baum und seine Existenz. Diese Datei geht die drei Wege durch – und prüft
 * vor allem, dass der zerstörerische von ihnen sagt, was er anrichtet, bevor er es tut.
 */
test.use({ viewport: { width: 1280, height: 900 } })

/*
 * Seit docs/54 ist die Verwaltung eine eigene Seite: Als Abschnitt nahm sie 26 % der
 * Seitenhöhe für Handlungen, die zweimal im Leben eines Bereichs vorkommen. Erreichbar ist
 * sie über das Zahnrad im Kopf und über die Fußzeile – zwei Wege, beide ohne Aufklapper.
 */
const openManage = async (page: import('@playwright/test').Page) => {
  await page.locator('.master, .abschnitt-chips').getByText('Diesen Bereich verwalten', { exact: true }).click()
  await page.waitForURL(/\/verwalten$/)
  /* Der Seitenkopf trägt den Bereich (docs/61); der Abschnitt nennt sich eine Ebene tiefer. */
  await expect(
    page.locator('.split-detail').getByRole('heading', { name: 'Diesen Bereich verwalten' }),
  ).toBeVisible()
}

async function createDomain(page: import('@playwright/test').Page, name: string) {
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await page.getByRole('button', { name: 'Bereich anlegen' }).click()
  await page.getByLabel('Wie heißt der Bereich?').fill(name)
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click()
  await page.waitForURL(/\/bereiche\/[0-9a-f-]+/)
  return page.url().split('/').pop()!
}

test('umbenennen wirkt sofort und überall', async ({ page }) => {
  const name = `Prüfung ${Date.now()}`
  await createDomain(page, name)

  await openManage(page)
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await page.getByLabel('Wie heißt der Bereich?').fill(`${name} neu`)
  await page.getByRole('button', { name: 'Speichern' }).click()

  // Der Seitenkopf trägt den Bereich (docs/61) – dort muss der neue Name sofort stehen.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${name} neu`)
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await expect(page.getByText(`${name} neu`)).toBeVisible()

  // Aufräumen: Der Bereich ist leer, also lässt er sich löschen.
  await page.getByText(`${name} neu`).click()
  await openManage(page)
  await page.getByRole('button', { name: 'Löschen', exact: true }).click()
  await page.getByRole('button', { name: 'Wirklich löschen' }).click()
  await page.waitForURL(/\/bereiche$/)
  await expect(page.getByText(`${name} neu`)).toHaveCount(0)
})

test('archivieren räumt weg und lässt sich zurücknehmen', async ({ page }) => {
  const name = `Archiv ${Date.now()}`
  const id = await createDomain(page, name)

  await openManage(page)
  // Die Folge steht da, bevor man klickt – seit M1 in einer Zeile statt in zweien.
  await expect(page.getByText(/Behält alles, jederzeit umkehrbar/)).toBeVisible()
  await page.getByRole('button', { name: 'Archivieren' }).click()

  await page.waitForURL(/\/bereiche$/)
  await expect(page.getByText(name), 'der archivierte Bereich steht noch in der Liste').toHaveCount(0)

  await page.goto(`/bereiche/${id}`)
  await openManage(page)
  await expect(page.getByText('Dieser Bereich ist archiviert.')).toBeVisible()
  await page.getByRole('button', { name: 'Zurückholen' }).click()
  await page.waitForTimeout(800)

  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await expect(page.getByText(name), 'zurückgeholt, aber nicht wieder da').toBeVisible()

  await page.getByText(name).click()
  await openManage(page)
  await page.getByRole('button', { name: 'Löschen', exact: true }).click()
  await page.getByRole('button', { name: 'Wirklich löschen' }).click()
  await page.waitForURL(/\/bereiche$/)
})

test('löschen fragt nach – und sagt bei vollem Bereich, was drinsteht', async ({ page }) => {
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await page.getByText('Schuhe').first().click()
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

  await openManage(page)

  // Ein Klick löscht nicht – erst die zweite, ausdrücklich benannte Bestätigung.
  await page.getByRole('button', { name: 'Löschen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Wirklich löschen' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abbrechen' })).toBeVisible()

  await page.getByRole('button', { name: 'Wirklich löschen' }).click()

  /*
   * Der Server weiß, was im Weg steht, und schreibt es auf. Käme hier „Fehler." an, wäre die
   * Erklärung zwar übertragen, aber verworfen worden – genau das war lange der Fall.
   */
  const notice = page.locator('.notice-attention').last()
  await expect(notice).toContainText('steht schon etwas')
  await expect(notice).toContainText('Aufgaben')
  await expect(notice, 'der Ausweg wird nicht genannt').toContainText('archivier')
  await expect(page).toHaveURL(/\/bereiche\/[0-9a-f-]+/)
})

test('die drei Wege sind ohne Suchen zu finden', async ({ page }) => {
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await page.getByText('Schuhe').first().click()
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

  /*
   * Auffindbar heißt: ein benannter Weg von der Bereichsseite aus, ohne Aufklapper und ohne
   * Raten. Zwei gibt es – das Zahnrad im Kopf und der Verweis in der Fußzeile.
   */
  await expect(page.locator('.master').getByText('Diesen Bereich verwalten', { exact: true })).toBeVisible()

  await openManage(page)
  for (const label of ['Bearbeiten', 'Archivieren', 'Löschen']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
  }

  /*
    Und die Seite sagt, wo man ist: im Kopf der Bereich, darunter der Abschnitt. Vorher trug
    der Kopf den Abschnittsnamen und der Bereich fiel auf eine Brotkrume zurück (docs/61).
  */
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schuhe')
  await expect(page.locator('.split-detail').getByRole('heading', { level: 2 })).toHaveText(
    'Diesen Bereich verwalten',
  )
})
