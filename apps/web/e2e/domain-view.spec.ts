import { test, expect, type Page } from '@playwright/test'

/**
 * Der Aufbau der Bereichsseite.
 *
 * Zwei Dinge werden hier festgehalten, die man beim Ändern leicht wieder verliert: dass der
 * Name nur einmal oben steht, und dass die Abschnitte in der Reihenfolge stehen, in der ein
 * Bereich entsteht – Verantwortung, Wissen, Regeln, was daraus läuft, Verwaltung.
 */
test.use({ viewport: { width: 1280, height: 900 } })

const SCHUHE = '/bereiche/01a07d11-afa5-7f8e-90a0-ed9ba4d53687'

async function open(page: Page, path = SCHUHE) {
  await page.goto(path)
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
}

test('der Name des Bereichs steht genau einmal im Kopf', async ({ page }) => {
  await open(page)

  const head = page.locator('.page-head')
  await expect(head.getByRole('heading', { name: 'Schuhe' })).toBeVisible()

  /*
   * Vorher stand über der Überschrift der volle Pfad als Text – „Kinder / Kind A / Kleidung /
   * Schuhe" über „Schuhe". Der letzte Teil ist die Überschrift selbst.
   */
  const crumbLabels = await page.locator('.crumbs a').allInnerTexts()
  expect(crumbLabels, 'der Bereich steht in seinem eigenen Pfad').not.toContain('Schuhe')
})

test('die Brotkrumen führen den Weg zurück – jede einzeln', async ({ page }) => {
  await open(page)

  await expect(page.locator('.crumbs a')).toHaveText(['Bereiche', 'Kinder', 'Kind A', 'Kleidung'])

  await page.locator('.crumbs a', { hasText: 'Kind A' }).click()
  await expect(page.getByRole('heading', { name: 'Kind A', exact: true })).toBeVisible()
  await expect(page.locator('.crumbs a')).toHaveText(['Bereiche', 'Kinder'])

  await page.locator('.crumbs a', { hasText: 'Bereiche' }).click()
  await expect(page).toHaveURL(/\/bereiche$/)
})

test('ein Bereich der obersten Ebene hat nur die Wurzel als Krume', async ({ page }) => {
  await open(page)
  await page.locator('.crumbs a', { hasText: 'Kinder' }).click()
  await expect(page.getByRole('heading', { name: 'Kinder', exact: true })).toBeVisible()
  await expect(page.locator('.crumbs a')).toHaveText(['Bereiche'])
})

test('die Abschnitte stehen in der Reihenfolge, in der ein Bereich entsteht', async ({ page }) => {
  await open(page)

  /*
   * Die Reihenfolge steht in der linken Spalte, nicht mehr untereinander im Inhalt.
   *
   * Solange eine Übersicht dieselben Abschnitte noch einmal als Zusammenfassung auflistete,
   * gab es zwei Reihenfolgen für dieselbe Sache – und die Frage, welche die maßgebliche ist
   * (docs/61). Es ist die Spalte: Sie steht auf jedem Abschnitt.
   */
  const punkte = (await page.locator('.master li').allInnerTexts()).map((t) =>
    t.replace(/\s+\d+\s*$/, '').trim(),
  )
  expect(punkte).toEqual([
    'Was wir wissen',
    'Regeln',
    'Läuft gerade',
    'Was hier passiert ist',
    'Diesen Bereich verwalten',
  ])
})

test('die Seite bleibt überschaubar', async ({ page }) => {
  await open(page)

  const m = await page.evaluate(() => {
    const main = document.querySelector('.content')!
    const vis = (e: Element) =>
      (e as HTMLElement).checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })
    const all = [...main.querySelectorAll('*')].filter(vis)
    const leaves = all.filter((e) => e.textContent!.trim() && !e.children.length)
    return {
      interactive: all.filter((e) => e.matches('button, a[href], select, input, textarea, summary')).length,
      pairs: new Set(leaves.map((e) => { const s = getComputedStyle(e); return `${s.fontSize}/${s.fontWeight}` })).size,
      topSections: all.filter((e) => e.matches('section.section') && !e.parentElement!.closest('section.section')).length,
      primaries: new Set(all.filter((e) => e.matches('.btn-primary')).map((e) => e.textContent!.trim())).size,
    }
  })

  expect(m.topSections, 'zu viele gleichrangige Abschnitte').toBeLessThanOrEqual(4)
  expect(m.interactive, 'zu viele Bedienelemente gleichzeitig').toBeLessThanOrEqual(28)
  expect(m.pairs, `Größe-Gewicht-Paare: ${m.pairs}`).toBeLessThanOrEqual(11)
  expect(m.primaries, 'mehr als eine dominante Aktion').toBeLessThanOrEqual(1)
})

test('wer mitdenkt, steht als Zeile im Kopf – nicht als eigener Abschnitt', async ({ page }) => {
  await open(page)

  const meta = page.locator('.domain-meta')
  await expect(meta).toBeVisible()
  await expect(meta.getByText('verantwortlich')).toBeVisible()
  await expect(page.locator('.content h2').filter({ hasText: 'Wer mitdenkt' })).toHaveCount(0)

  // Das Ändern liegt hinter einem Klick – die Formulare dafür braucht man selten.
  await meta.getByRole('button', { name: 'Verantwortung ändern' }).click()
  await expect(page.getByRole('dialog').getByText('An wen übergeben?')).toBeVisible()
})

test('Unterbereiche stehen als Weg nach unten oben, nicht in der Verwaltung', async ({ page }) => {
  await open(page, '/bereiche/01a07d11-afa4-78f4-8268-75bc6e3acce4')

  const nav = page.getByRole('navigation', { name: 'Untergeordnete Bereiche' })
  await expect(nav.getByRole('link', { name: 'Schuhe' })).toBeVisible()
  await nav.getByRole('link', { name: 'Schuhe' }).click()
  await expect(page.getByRole('heading', { name: 'Schuhe', level: 1 })).toBeVisible()
})

test('Wissen ist ein Abschnitt mit Teilen, nicht drei gleichrangige', async ({ page }) => {
  /*
   * Die Einträge stehen seit Review C3 auf der Seite des Abschnitts, nicht auf der Übersicht.
   * Damit rückt die Staffelung eine Ebene nach oben: „Was wir wissen" ist der Seitentitel,
   * die drei Teile stehen darunter. Die Aussage bleibt dieselbe – es ist eine Sache mit drei
   * Teilen, nicht drei Themen nebeneinander.
   */
  await open(page, `${SCHUHE}/wissen`)

  /*
   * Drei Ebenen, seit der Kopf dem Bereich gehört (docs/61): „Schuhe" – „Was wir wissen" –
   * die drei Teile. Vorher trug der Seitenkopf den Abschnittsnamen, und die Teile standen
   * eine Stufe höher.
   */
  await expect(page.locator('.split-detail h2')).toHaveText([/Was wir wissen/])
  await expect(page.locator('.split-detail h3')).toHaveText([/Angaben/, /Notizen und Fragen/, /Entscheidungen/])

  /*
   * Die Überschriftenebene allein reicht nicht: Wenn die Teile genauso groß gesetzt sind wie
   * das, worunter sie stehen, behauptet das Markup eine Hierarchie, die im Bild nicht steht.
   */
  /* Der Bereichsname steht über beiden Spalten (docs/61), die Abschnitte in der rechten. */
  const sizes = await page.evaluate(() => {
    const px = (sel: string) => parseFloat(getComputedStyle(document.querySelector(sel)!).fontSize)
    return { h1: px('.page-head h1'), h2: px('.split-detail h2'), h3: px('.split-detail h3') }
  })
  expect(sizes.h1, 'der Abschnitt ist nicht kleiner als der Bereich').toBeGreaterThan(sizes.h2)
  expect(sizes.h2, 'die Teile sind nicht kleiner als der Abschnitt').toBeGreaterThan(sizes.h3)
})

test('die Übernahme steht direkt neben der Lücke', async ({ page }) => {
  // „Reparaturen" hat keine Zuständigkeit.
  await open(page, '/bereiche/01a07d11-afa9-7262-bf12-91c8fa811686')

  /*
   * Ist niemand zuständig, ist das Übernehmen die häufigste Handlung auf dieser Seite. Sie
   * gehört neben die Aussage, die sie ändert – nicht hinter einen Klick und nicht ans andere
   * Ende der Seite.
   */
  const meta = page.locator('.domain-meta')
  await expect(meta.getByText('niemand zuständig')).toBeVisible()
  await expect(meta.getByRole('button', { name: 'Ich übernehme das' })).toBeVisible()
  await expect(meta.getByRole('button', { name: 'Verantwortung ändern' })).toHaveCount(0)
})

test('die Abschnitte sind voneinander getrennt, nicht nur voneinander entfernt', async ({ page }) => {
  /*
   * Gemessen auf „Was hier passiert ist": Seit die Übersicht entfallen ist, trägt kein
   * Abschnitt mehr drei Unterabschnitte untereinander – der Verlauf ist der Ort, an dem
   * zwei nebeneinanderstehen (Verlauf und Wissensübergabe).
   */
  await open(page, `${SCHUHE}/verlauf`)

  const layout = await page.evaluate(() => {
    const vis = (e: Element) =>
      (e as HTMLElement).checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })
    const rel = (v: number[]) => {
      const c = v.map((x) => x / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
    }
    const rgb = (s: string) => s.match(/\d+/g)!.map(Number)
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [rel(a), rel(b)].sort((m, n) => n - m)
      return (x! + 0.05) / (y! + 0.05)
    }

    const top = [...document.querySelectorAll<HTMLElement>('.content section.section')].filter(
      (s) => vis(s) && !s.parentElement!.closest('section.section'),
    )
    const page_ = rgb(getComputedStyle(document.body).backgroundColor)
    const withRule = top.filter((s) => getComputedStyle(s).borderTopWidth !== '0px')
    const ruleContrast = withRule.length
      ? ratio(rgb(getComputedStyle(withRule[0]!).borderTopColor), page_)
      : 0

    // Abstand über der Überschrift gegen Abstand von der Überschrift zu ihrem Inhalt.
    const first = top[1]!
    const head = first.querySelector(':scope > header')!.getBoundingClientRect()
    const body = first.querySelector(':scope > header')!.nextElementSibling!.getBoundingClientRect()
    const outer = first.getBoundingClientRect().top - top[0]!.getBoundingClientRect().bottom
    const inner = body.top - head.bottom

    // Abstand über und unter der Linie – sie soll zu dem gehören, was sie einleitet.
    const ruled0 = withRule[0]!
    let prev = ruled0.previousElementSibling
    while (prev && !vis(prev)) prev = prev.previousElementSibling
    const aboveLine = ruled0.getBoundingClientRect().top - prev!.getBoundingClientRect().bottom
    const belowLine =
      ruled0.querySelector(':scope > header')!.getBoundingClientRect().top - ruled0.getBoundingClientRect().top

    // Trennlinien in einer Karte sollen deren Kanten erreichen.
    const inCard = [...document.querySelectorAll<HTMLElement>('.panel section.section')].filter(
      (x) => vis(x) && getComputedStyle(x).borderTopWidth !== '0px',
    )[0]
    const bleed = inCard
      ? (() => {
          const card = inCard.closest('.panel')!.getBoundingClientRect()
          const line = inCard.getBoundingClientRect()
          return Math.max(line.left - card.left, card.right - line.right)
        })()
      : 0

    return {
      sections: top.length,
      ruled: withRule.length,
      ruleContrast,
      outer,
      inner,
      aboveLine,
      belowLine,
      bleed,
      surfaces: top.map((s) => [...s.querySelectorAll('.panel')].filter(vis).length),
      nestedVisible: [...document.querySelectorAll<HTMLElement>('.content .panel .panel')]
        .filter(vis)
        .filter((e) => getComputedStyle(e).borderTopWidth !== '0px' && getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)')
        .length,
    }
  })

  // Jeder Abschnitt außer dem ersten trägt eine Linie.
  expect(layout.ruled).toBe(layout.sections - 1)
  /*
   * Die feinste Randstufe (≥1.1) ist für Kartenkanten gedacht, wo die Füllung die Arbeit tut.
   * Eine Linie, die allein die Struktur trägt, braucht die nächste Stufe.
   */
  expect(layout.ruleContrast, `Trennlinie zur Seite: ${layout.ruleContrast.toFixed(2)}:1`).toBeGreaterThanOrEqual(1.4)

  // Was zusammengehört, steht enger beieinander als das, was getrennt ist (Gestalt: Nähe).
  expect(layout.outer, `außen ${layout.outer}px, innen ${layout.inner}px`).toBeGreaterThan(layout.inner * 2)

  // Eine Fläche je Abschnitt – und keine Fläche, die in einer anderen noch als Kasten wirkt.
  expect(layout.nestedVisible, 'ein Kasten steckt sichtbar in einem anderen').toBe(0)

  /*
   * Die Linie gehört zu der Überschrift, die sie einleitet – also steht über ihr etwa doppelt
   * so viel Luft wie darunter. Klebt die Überschrift an der Linie, ist meist ein Abstandstoken
   * ungültig: `padding-top: var(--s-7)` etwa wurde stillschweigend verworfen, weil die Skala
   * keine Stufe 7 hat.
   */
  const ratio = layout.aboveLine / layout.belowLine
  expect(layout.belowLine, 'die Überschrift klebt an der Linie').toBeGreaterThan(8)
  expect(ratio, `über ${Math.round(layout.aboveLine)}px, unter ${Math.round(layout.belowLine)}px`).toBeGreaterThan(1.5)
  expect(ratio, 'über und unter der Linie ist fast gleich viel Luft').toBeLessThan(3)

  // Eine Linie, die eine Karte in Teile schneidet, muss sie auch durchschneiden.
  expect(layout.bleed, `Trennlinie in der Karte ${Math.round(layout.bleed)}px eingerückt`).toBeLessThanOrEqual(2)
})

/**
 * Ein leerer Bereich muss füllbar sein.
 *
 * Das ging einmal verloren: Die Abschnitte waren bei einem leeren Bereich ausgeblendet, damit
 * nicht „vier leere Hüllen untereinander" stehen. Solange die Optionen in einer Nebenspalte
 * lagen, ging das – man konnte trotzdem etwas anlegen. Nachdem sie in die Hauptspalte
 * gewandert waren, hieß Ausblenden: kein Weg mehr, den Bereich zu füllen. Ausgerechnet dort,
 * wo man es am ehesten will.
 */
test.describe('ein leerer Bereich', () => {
  // „Urlaube" hat weder Angaben noch Vorgänge, Regeln oder Entscheidungen.
  const LEER = '/bereiche/01a07d11-afaa-74c1-911e-2d5403729b55'

  test('zeigt dieselben Abschnitte wie ein voller', async ({ page }) => {
    await open(page, LEER)
    const punkte = (await page.locator('.master li').allInnerTexts()).map((t) => t.replace(/\s+\d+\s*$/, '').trim())
    expect(punkte).toEqual([
      'Was wir wissen',
      'Regeln',
      'Läuft gerade',
      'Was hier passiert ist',
      'Diesen Bereich verwalten',
    ])
  })

  /*
   * Jeder Abschnitt muss von sich aus zu beginnen sein. Die Übersicht bot dafür je einen
   * Knopf an – sie ist entfallen (docs/61), also muss der Weg im Abschnitt selbst stehen.
   * Sonst wäre ein leerer Bereich eine Sackgasse mit fünf Türen.
   */
  test('bietet in jedem Abschnitt einen Weg, ihn zu füllen', async ({ page }) => {
    const wege: [string, RegExp[]][] = [
      ['/wissen', [/Angabe/, /Notiz/, /Frage/, /Entscheidung/]],
      ['/regeln', [/Regel einrichten/]],
      ['/laeuft', [/Aufgabe/, /Vorgang/]],
    ]
    for (const [pfad, labels] of wege) {
      await open(page, `${LEER}${pfad}`)
      for (const label of labels) {
        await expect(page.getByRole('button', { name: label }).first(), `${pfad}: kein Weg für ${label}`).toBeVisible()
      }
    }
  })

  test('ist nicht länger als ein voller Bereich', async ({ page }) => {
    /*
     * Gemessen wird die Inhaltsspalte, nicht die Seite: Die Navigationsspalte ist auf jedem
     * Bereich gleich hoch und setzt damit eine Untergrenze, die mit dem Leerzustand nichts
     * zu tun hat.
     *
     * Dieser Test war zwischenzeitlich blind: Er suchte `.with-rail`, das es nach einem
     * Umbau nicht mehr gab, fiel auf `.content` zurück – und war grün, während der leere
     * Bereich tatsächlich länger war als der volle (1975 gegen 1911 px, Review C2). Deshalb
     * jetzt ein Wähler, dessen Fehlen auffällt.
     */
    const heightOf = async (path: string) => {
      await open(page, path)
      return page.evaluate(() => {
        const spalte = document.querySelector('.split-detail')
        if (!spalte) throw new Error('Inhaltsspalte nicht gefunden – misst der Test noch das Richtige?')
        return Math.round(spalte.getBoundingClientRect().height)
      })
    }

    /*
     * Ein großer Leerzustand mit Symbol, Titel und Absatz ist für Seiten gedacht, auf denen
     * sonst nichts steht. Viermal untereinander ergibt er eine leere Seite, die länger ist
     * als eine volle – gemessen 2728 px gegen 2388 px, bevor daraus knappe Zeilen wurden.
     */
    const leer = await heightOf(LEER)
    const voll = await heightOf(SCHUHE)
    expect(leer, `leer ${leer}px, voll ${voll}px`).toBeLessThanOrEqual(voll)
  })
})

test('die Farbe steht als Punkt im Kopf, nicht als Aufklapper in der Verwaltung', async ({ page }) => {
  await open(page)

  /*
   * Der Knopf ist zugleich die Anzeige: Er trägt den Ton, der gerade gilt. Vorher stand die
   * Farbe nur als Wort im Titel eines Aufklappers ganz unten – man sah sie nirgends.
   */
  const button = page.locator('.head-actions .color-button')
  await expect(button).toBeVisible()
  await expect(button).toHaveClass(/\bm-\d+\b/)
  await expect(button).toHaveAttribute('aria-label', /Farbe von/)
  await expect(page.locator('summary').filter({ hasText: 'Farbe' })).toHaveCount(0)

  await button.click()
  const pop = page.getByRole('dialog', { name: /Farbe von/ })
  await expect(pop.locator('.swatch')).toHaveCount(12)

  // Ein Blick zur Seite, keine Unterbrechung: das Ausklapp hängt unter seinem Knopf.
  const geometry = await page.evaluate(() => {
    const b = document.querySelector('.color-button')!.getBoundingClientRect()
    const p = document.querySelector('.popover')!.getBoundingClientRect()
    return { below: p.top >= b.bottom, gap: p.top - b.bottom }
  })
  expect(geometry.below, 'das Ausklapp steht nicht unter seinem Knopf').toBe(true)
  expect(geometry.gap).toBeLessThan(20)

  await page.keyboard.press('Escape')
  await expect(pop).toHaveCount(0)
})
