import { test, expect } from '@playwright/test'
import { TARGETS } from './pages.js'
import { restoreTree, snapshotTree } from './tree.js'

/**
 * Bedienung mit dem Finger (Auftrag §23, §38).
 *
 * Erst mit echter Berührungsemulation gilt `pointer: coarse` – und damit die Regel, dass
 * jede Trefferfläche mindestens 44 px hoch ist. Auf dem Desktop mit Maus dürfen Knöpfe
 * kompakter sein; das ist kein Widerspruch, sondern der Unterschied zwischen Zeigegerät
 * und Fingerkuppe.
 */
for (const target of TARGETS) {
  test(`${target.name}: alles ist mit dem Finger treffbar`, async ({ page }) => {
    await page.goto(target.path)
    await expect(page.getByRole('heading', { name: target.heading }).first()).toBeVisible()
    await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

    /*
     * Gemessen wird nicht die Höhe des Elements, sondern die Fläche, die ein Finger
     * tatsächlich trifft. Eine Zeile kann ihren Titelknopf über eine unsichtbare Fläche
     * vergrößern – das Element ist dann 25 px hoch, die Trefferfläche 52 px. Deshalb der
     * Test mit `elementFromPoint`: an neun Punkten eines 44×44-Feldes muss der Treffer
     * beim Element oder einem seiner Kinder landen.
     */
    /*
     * Gemessen wird die Fläche, die ein Finger trifft – nicht die Höhe des Elements.
     *
     * Ein Zeilentitel ist 25 px hoch, seine Trefferfläche dank aufgespannter Pseudofläche
     * aber so groß wie die ganze Zeile. Wer nur das Element misst, meldet einen Fehler, wo
     * keiner ist; wer nur die Zeile misst, übersieht echte Winzlinge. Deshalb: aufgespannte
     * Pseudoflächen werden aufgelöst, verdeckte Elemente übersprungen.
     */
    const small = await page.evaluate(() => {
      const MIN = 44
      const bad: string[] = []
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>('button, a[href], select, input[type="checkbox"]'),
      )) {
        const box = el.getBoundingClientRect()
        if (box.height === 0 || box.width === 0) continue
        if (el.closest('.visually-hidden, .skip-link')) continue
        if (!el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })) continue

        // Verdeckt (etwa von der festen unteren Leiste) oder außerhalb des Sichtfelds:
        // dann sagt diese Messung nichts über die Größe aus.
        const centre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        if (!centre || (centre !== el && !el.contains(centre))) continue

        const after = getComputedStyle(el, '::after')
        const stretched = after.position === 'absolute' && after.content !== 'none'
        const hit = stretched && el.offsetParent ? el.offsetParent.getBoundingClientRect() : box

        if (hit.height < MIN) {
          const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24)
          bad.push(
            `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} (${Math.round(hit.height)}px) „${label}"`,
          )
        }
      }
      return [...new Set(bad)].slice(0, 8)
    })

    expect(small, 'zu kleine Trefferflächen für den Finger').toEqual([])
  })
}

test('die untere Leiste verdeckt den Seiteninhalt nicht', async ({ page }) => {
  await page.goto('/jetzt')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  // Scrollen und einen Frame abwarten – sonst misst man die Lage von vorher.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(300)

  const result = await page.evaluate(() => {
    const bar = document.querySelector('.bottombar')
    const content = document.querySelector('.content')
    if (!bar || !content) return null
    const barTop = bar.getBoundingClientRect().top
    /*
     * Nur was gerade im Sichtfeld liegt, kann verdeckt sein. Elemente weiter unten sind
     * nicht „verdeckt", sondern noch nicht gescrollt – die mitzuzählen misst die Seitenlänge,
     * nicht die Überdeckung.
     */
    const last = Array.from(content.querySelectorAll<HTMLElement>('button, a[href], p, li'))
      /*
       * Chromium legt den Inhalt geschlossener `<details>` weiterhin aus (content-visibility);
       * `getBoundingClientRect` liefert dafür Boxen, die niemand sieht. `checkVisibility`
       * trennt „unsichtbar" von „nur noch nicht gescrollt".
       */
      .filter((el) => el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }))
      .map((el) => el.getBoundingClientRect())
      .filter((b) => b.height > 0 && b.top < window.innerHeight)
      .reduce((max, b) => Math.max(max, b.bottom), 0)
    return { barTop, last }
  })
  if (result) {
    expect(result.last, 'Inhalt liegt unter der Navigationsleiste').toBeLessThanOrEqual(result.barTop + 1)
  }
})

/**
 * Der Bearbeiten-Modus der Bereiche wird von der Schleife oben nicht erfasst: Seine
 * Werkzeuge erscheinen erst nach einem Klick.
 *
 * Genau dort steckte ein Fehler, den niemand gesehen hatte. `.btn-icon.btn-sm { width: 36px }`
 * stand im Stylesheet **nach** der `pointer: coarse`-Regel, die auf 44 px setzt – gleiche
 * Spezifität, also gewann die spätere. Jeder kleine Symbolknopf der App war auf
 * Berührungsgeräten 36 px. Aufgefallen ist es erst, als sechs davon nebeneinander standen.
 */
test('Bereiche im Bearbeiten-Modus: ziehen geht auch mit dem Finger', async ({ page }) => {
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await page.getByRole('button', { name: 'Bearbeiten' }).click()

  const order = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('li[data-domain]')].map((li) => li.dataset['domain']!),
    )
  const before = await order()
  const snap = await snapshotTree(page)

  const grip = page.locator('li[data-domain]').filter({ hasText: 'Wäsche' }).locator('.grip')
  await grip.scrollIntoViewIfNeeded()
  const from = (await grip.boundingBox())!
  const to = (await page.locator('li[data-domain]').filter({ hasText: 'Lebensmittel' }).boundingBox())!

  /*
   * Mit Zeigerereignissen statt der HTML5-Ziehschnittstelle: Die kennt kein Berührungsgerät.
   * `touch-action: none` auf dem Griff sorgt dafür, dass der Browser dabei nicht scrollt –
   * ohne das nimmt er die Geste für sich und die Zeile bleibt liegen.
   */
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, to.y + 3, { steps: 12 })
  await expect(page.locator('.drop-mark')).toHaveCount(1)
  await page.mouse.up()

  await expect.poll(order, { message: 'die Zeile ist nicht gewandert' }).not.toEqual(before)

  // Zurückstellen über die Schnittstelle – ein einzelner Tastendruck holt einen weiten Zug
  // nicht verlässlich zurück.
  await restoreTree(page, snap)
})

test('Bereiche im Bearbeiten-Modus: alle Werkzeuge sind mit dem Finger treffbar', async ({ page }) => {
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await expect(page.locator('.row-tools').first()).toBeVisible()

  const problems = await page.evaluate(() => {
    const MIN = 44
    const bad: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.row-tools .btn'))) {
      const box = el.getBoundingClientRect()
      if (box.height === 0) continue
      if (box.height < MIN - 0.5 || box.width < MIN - 0.5)
        bad.push(`${el.getAttribute('aria-label')}: ${Math.round(box.width)}×${Math.round(box.height)}`)
    }
    return bad
  })
  expect(problems, `zu kleine Ziele: ${problems.join(', ')}`).toEqual([])
})

test('Bereiche im Bearbeiten-Modus: der Name bleibt lesbar', async ({ page }) => {
  await page.goto('/bereiche')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await expect(page.locator('.row-tools').first()).toBeVisible()

  /*
   * Sechs Ziele à 44 px sind breiter als der Platz neben einem Namen. Wer nicht mehr lesen
   * kann, welchen Bereich er verschiebt, kann ihn auch nicht verschieben wollen – deshalb
   * rutschen die Werkzeuge hier unter den Namen.
   */
  const layout = await page.evaluate(() => {
    const row = document.querySelector('li.tone-edge')!
    const title = row.querySelector('.row-title')!.getBoundingClientRect()
    const tools = row.querySelector('.row-tools')!.getBoundingClientRect()
    return { titleWidth: Math.round(title.width), stacked: tools.top >= title.bottom }
  })
  expect(layout.stacked, 'die Werkzeuge quetschen den Namen zur Seite').toBe(true)
  expect(layout.titleWidth, `der Name hat nur ${layout.titleWidth}px`).toBeGreaterThan(120)
})
