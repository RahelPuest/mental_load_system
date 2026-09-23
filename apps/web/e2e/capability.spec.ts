import { test, expect } from '@playwright/test'

/**
 * Funktionserhalt nach dem Umbau der Familienseite.
 *
 * Der Umbau hat Abschnitte zusammengelegt und Listen eingeklappt. Genau dort entsteht die
 * Gefahr, dass eine Funktion nicht vereinfacht, sondern verloren geht. Dieser Test geht
 * jede Fähigkeit dieser Seite an – auch die, die jetzt hinter einem Aufklapper liegen.
 */
test.use({ viewport: { width: 1280, height: 900 } })

test('Familie: jede Funktion ist weiterhin erreichbar', async ({ page }) => {
  await page.goto('/familie')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

  // 1 — Kapazität setzen: vier Stufen, unmittelbar sichtbar.
  for (const level of ['Normal', 'Weniger als sonst', 'Sehr wenig', 'Pause']) {
    await expect(page.getByRole('radio', { name: level }).first()).toBeVisible()
  }

  // 2 — Eine offene Zuständigkeit übernehmen.
  await expect(page.getByRole('button', { name: 'Ich übernehme' }).first()).toBeVisible()

  // 3 — Einen Bereich ohne Zuständigkeit öffnen (die Zeile selbst trägt das jetzt).
  const gaps = page.locator('section').filter({ hasText: 'Wo niemand mitdenkt' })
  await expect(gaps.locator('.row-open').first()).toBeVisible()

  // 4 — Die vollständige Zuständigkeitsliste: eingeklappt, aber vorhanden und benannt.
  const all = page.locator('summary', { hasText: 'Alle Bereiche und ihre Zuständigkeit' })
  await expect(all).toBeVisible()
  await all.click()
  await expect(page.locator('.disclosure[open] .row').first()).toBeVisible()

  // 5 — Vertretung einrichten.
  await expect(page.getByRole('button', { name: /Vertretung einrichten/ }).first()).toBeVisible()

  // 6 — Sehen, was eine Person trägt (Care Mode).
  await expect(page.getByText('Ansehen, was diese Person gerade trägt').first()).toBeVisible()

  // 7 — Mitgliederliste und Rollenverwaltung.
  const members = page.locator('summary', { hasText: 'Wer dazugehört' })
  await expect(members).toBeVisible()
  await members.click()
  await expect(page.getByRole('button', { name: /Rollen und Rechte verwalten/ })).toBeVisible()

  // 8 — Verteilung, sofern der Haushalt sie eingeschaltet hat.
  const balance = page.locator('summary', { hasText: 'Wie ist es verteilt?' })
  if ((await balance.count()) > 0) {
    await balance.click()
    await expect(page.getByText(/Das ist eine Gesprächsgrundlage/)).toBeVisible()
  }
})

test('Familie: nichts steht doppelt auf der Seite', async ({ page }) => {
  await page.goto('/familie')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

  /*
   * Vorher listete „Ohne Zuständigkeit" dieselben Bereiche wie „Verantwortung im
   * Überblick" – dieselbe Information zweimal, mit verschiedenen Aktionen. Das ist der
   * teuerste Posten im Arbeitsgedächtnis: Man muss beide Listen abgleichen, um zu wissen,
   * ob man dasselbe sieht.
   */
  const duplicates = await page.evaluate(() => {
    const vis = (e: Element) =>
      (e as HTMLElement).checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })
    const titles = Array.from(document.querySelectorAll<HTMLElement>('.content .row-title'))
      .filter(vis)
      .map((e) => e.textContent!.trim())
    const seen = new Map<string, number>()
    for (const t of titles) seen.set(t, (seen.get(t) ?? 0) + 1)
    return [...seen.entries()].filter(([, n]) => n > 1).map(([t, n]) => `${t} ×${n}`)
  })
  expect(duplicates, 'dieselbe Sache steht mehrfach sichtbar auf der Seite').toEqual([])
})
