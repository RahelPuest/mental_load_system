import { test, expect } from '@playwright/test'

/**
 * Eine Aufgabe abhaken und loswerden – auf der Seite ihres Bereichs.
 *
 * Dort stand sie zum Lesen da und zu sonst nichts. Der einzige Weg, eine Aufgabe zu erledigen
 * oder zu verwerfen, führte über die Jetzt-Ansicht – und die zeigt drei Einträge auf einmal.
 * Was darunter lag, war weder abzuhaken noch zu entfernen (docs/62).
 */
test.use({ viewport: { width: 1280, height: 900 } })

const REPARATUREN = '/bereiche/01a07d11-afa9-7262-bf12-91c8fa811686/laeuft'

async function neueAufgabe(page: import('@playwright/test').Page, name: string) {
  await page.goto(REPARATUREN)
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await page.getByRole('button', { name: 'Aufgabe', exact: true }).first().click()
  await page.getByLabel(/Was ist zu tun/i).fill(name)
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click()
  await expect(page.getByText(name).first()).toBeVisible()
}

test('eine frisch angelegte Aufgabe lässt sich wieder löschen', async ({ page }) => {
  const name = `Vertipper ${Date.now()}`
  await neueAufgabe(page, name)

  /*
    Ein Klick, kein Grundfeld: Für etwas, das zwei Sekunden alt und unberührt ist, wäre die
    Frage „warum nicht mehr?" Zeremonie.
  */
  await page.getByRole('button', { name: `„${name}“ entfernen` }).click()
  await expect(page.getByText(name)).toHaveCount(0)

  // Und nach dem Neuladen ist sie es immer noch – nicht nur aus der Anzeige genommen.
  await page.reload()
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await expect(page.getByText(name)).toHaveCount(0)
})

test('eine begonnene Aufgabe führt zum Verwerfen statt zum Löschen', async ({ page }) => {
  const name = `Angefangen ${Date.now()}`
  await neueAufgabe(page, name)

  // Über die Schnittstelle beginnen: Der Test prüft die Weiche, nicht den Weg dorthin.
  const householdId = await page.evaluate(() => localStorage.getItem('thealotta.household'))
  const csrf = await page.evaluate(() => document.cookie.match(/(?:^|;\s*)thealotta_csrf=([^;]+)/)?.[1] ??
      '')
  const base = `/api/v1/households/${householdId}`
  const liste = (await (await page.request.get(`${base}/domains/01a07d11-afa9-7262-bf12-91c8fa811686/detail`)).json()) as {
    tasks: { id: string; title: string }[]
  }
  const id = liste.tasks.find((t) => t.title === name)!.id
  await page.request.post(`${base}/tasks/${id}/start`, { headers: { 'x-csrf-token': decodeURIComponent(csrf) } })

  await page.reload()
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await page.getByRole('button', { name: `„${name}“ entfernen` }).click()

  /*
    Der Bogen erklärt, warum still löschen nicht ging – mit dem Satz des Servers, nicht mit
    einer allgemeinen Fehlermeldung. Sonst stünde da „hat nicht geklappt" und der Weg, der
    tatsächlich funktioniert, bliebe unerwähnt.
  */
  await expect(page.getByRole('heading', { name: 'Nicht mehr nötig' })).toBeVisible()
  await expect(page.getByText(/daran wurde schon gearbeitet/)).toBeVisible()

  await page.getByLabel('Warum nicht mehr?').fill('doch nicht nötig')
  await page.getByRole('button', { name: 'Aus der Übersicht nehmen' }).click()
  await expect(page.getByText(name)).toHaveCount(0)
})

test('abhaken geht auch hier – und lässt sich zurücknehmen', async ({ page }) => {
  const name = `Erledigt ${Date.now()}`
  await neueAufgabe(page, name)

  await page.getByRole('button', { name: `„${name}“ erledigt` }).click()

  /*
    §57: Abhaken ist zurücknehmbar, nicht bestätigungspflichtig. Der Weg zurück steht im
    Toast – und der lebt sechs Sekunden, also wird hier nicht erst auf das Verschwinden der
    Zeile gewartet. Ein Test, der die Rücknahme verpasst, prüfte nur noch das Abhaken.
  */
  await page.getByRole('button', { name: /Rückgängig/i }).click()
  await expect(page.getByText(name).first()).toBeVisible()

  // Aufräumen: jetzt ist sie unberührt genug zum Löschen nicht mehr – also verwerfen.
  await page.getByRole('button', { name: `„${name}“ entfernen` }).click()
  const bogen = page.getByRole('heading', { name: 'Nicht mehr nötig' })
  if (await bogen.isVisible().catch(() => false)) {
    await page.getByLabel('Warum nicht mehr?').fill('Testrest')
    await page.getByRole('button', { name: 'Aus der Übersicht nehmen' }).click()
  }
  await expect(page.getByText(name)).toHaveCount(0)
})
