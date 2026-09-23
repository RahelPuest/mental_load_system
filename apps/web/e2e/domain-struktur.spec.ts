import { test, expect } from '@playwright/test'

/**
 * Der Aufbau der Bereichsseite (docs/54).
 *
 * Geprüft wird die Eigenschaft, um derentwillen umgebaut wurde: **Die Position eines
 * Abschnitts hängt nicht davon ab, wie viel darüber steht.** Vorher wanderten die Regeln
 * eines Bereichs mit jedem Wissenseintrag weiter nach unten – bei 50 Einträgen lagen sie
 * fünf Bildschirme unter dem Seitenanfang.
 */
const SCHUHE = '01a07d11-afa5-7f8e-90a0-ed9ba4d53687'

test('links stehen die Abschnitte, rechts der gewählte', async ({ page }) => {
  await page.goto(`/bereiche/${SCHUHE}`)
  await expect(page.getByRole('heading', { name: 'Was wir wissen' })).toBeVisible()

  const menue = page.locator('.master')
  for (const punkt of ['Was wir wissen', 'Regeln', 'Läuft gerade', 'Was hier passiert ist', 'Diesen Bereich verwalten']) {
    await expect(menue.getByText(punkt, { exact: true })).toBeVisible()
  }
  // Als Abschnitt nahm die Verwaltung 26 % der Seitenhöhe – jetzt ist sie ein Menüpunkt.
  await expect(page.locator('.split-detail').getByRole('heading', { name: 'Diesen Bereich verwalten' })).toHaveCount(0)
})

/*
  Jeder Abschnitt nennt sich selbst und sagt, wofür er da ist – an derselben Stelle, in
  derselben Form. Vorher standen diese Sätze gesammelt auf der Übersicht; wer den Abschnitt
  öffnete, fand dort nur noch den Titel im Seitenkopf.
*/
test('jeder Abschnitt sagt, wofür er da ist', async ({ page }) => {
  const zwecke: [string, string, string][] = [
    ['/wissen', 'Was wir wissen', 'Angaben, Notizen, offene Fragen und Entscheidungen zu diesem Bereich.'],
    ['/regeln', 'Regeln', 'Was von selbst geprüft wird, damit niemand daran denken muss.'],
    ['/laeuft', 'Läuft gerade', 'Offene Aufgaben und mehrschrittige Vorgänge in diesem Bereich.'],
    ['/verlauf', 'Was hier passiert ist', 'Der Verlauf dieses Bereichs und die Übergabe an jemand anderen.'],
    ['/verwalten', 'Diesen Bereich verwalten', 'Sichtbarkeit, Name, Einordnung, Archivieren, Löschen.'],
  ]
  for (const [pfad, titel, zweck] of zwecke) {
    await page.goto(`/bereiche/${SCHUHE}${pfad}`)
    await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
    await expect(page.locator('.split-detail').getByRole('heading', { name: titel }).first()).toBeVisible()
    await expect(page.getByText(zweck), `${pfad}: kein Zwecksatz`).toBeVisible()
  }
})

test('der Menüpunkt führt zur Verwaltung, der Bereich bleibt im Kopf stehen', async ({ page }) => {
  await page.goto(`/bereiche/${SCHUHE}`)
  await page.locator('.master').getByText('Diesen Bereich verwalten', { exact: true }).click()
  await page.waitForURL(/\/verwalten$/)

  /*
    Der Seitentitel gehört dem Bereich, nicht dem Abschnitt (docs/61).

    Vorher stand hier „Diesen Bereich verwalten" – ein Echo des Menüpunkts, den man gerade
    selbst gedrückt hat, während der Bereich auf eine Brotkrume schrumpfte. Jetzt trägt der
    Kopf durchgehend „Schuhe", und der Abschnitt nennt sich eine Ebene tiefer.
  */
  await expect(page.getByRole('heading', { name: 'Schuhe', level: 1 })).toBeVisible()
  await expect(page.locator('.split-detail').getByRole('heading', { name: 'Diesen Bereich verwalten' })).toHaveCount(1)
})

/**
 * Der Kopf steht still, während der Inhalt wechselt.
 *
 * Das ist die Eigenschaft, um derentwillen die Übersicht entfallen ist: Sie war die einzige
 * Seite, die sagte, wer für den Bereich mitdenkt – auf den anderen fünf war diese Auskunft
 * weg, obwohl sie für jede von ihnen gilt.
 */
test('Bereichsname und Zuständigkeit stehen über jedem Abschnitt', async ({ page }) => {
  for (const pfad of ['', '/wissen', '/regeln', '/laeuft', '/verlauf', '/verwalten']) {
    await page.goto(`/bereiche/${SCHUHE}${pfad}`)
    await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
    await expect(page.getByRole('heading', { name: 'Schuhe', level: 1 }), `${pfad}: kein Bereichsname`).toBeVisible()
    await expect(page.locator('.domain-meta .owner-badge'), `${pfad}: keine Zuständigkeit`).toBeVisible()
    await expect(page.locator('.crumbs a').first(), `${pfad}: kein Weg zurück`).toBeVisible()
  }
})

/** Die Übersicht ist weg – und mit ihr die Zusammenfassung, die die linke Spalte schon trug. */
test('es gibt keine Übersicht mehr', async ({ page }) => {
  await page.goto(`/bereiche/${SCHUHE}`)
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await expect(page.locator('.master').getByText('Übersicht', { exact: true })).toHaveCount(0)
  await expect(page.locator('.ueberblick')).toHaveCount(0)
  // Der nackte Pfad bleibt gültig: Er führt auf den ersten Abschnitt.
  await expect(page.locator('.split-detail').getByRole('heading', { name: 'Was wir wissen' })).toBeVisible()
})

/*
 * Die Eigenschaft „Position hängt nicht am Inhalt" steht bewusst nicht hier, sondern in
 * `apps/web/test/domain-struktur.spec.tsx`. Sie im Browser zu prüfen hieße, Notizen im
 * Demohaushalt anzulegen – und für Notizen gibt es keinen Löschweg. Ein Test, der bei jedem
 * Lauf Datenmüll hinterlässt, ist teurer als er wert ist.
 */

/**
 * Die Spalten stehen still.
 *
 * Sie taten es nicht: Der Inhalt ist zentriert, und ein klassischer Scrollbalken nimmt rund
 * 15 px Breite. Zwischen einer Auswahl, die scrollt (Übersicht, Verlauf), und einer, die es
 * nicht tut (Regeln, Verwalten), sprang deshalb die ganze Seite um etwa 8 px zur Seite –
 * bei jedem Wechsel des Abschnitts. Auf macOS mit überlagerten Balken fällt das nicht auf,
 * auf Windows und Linux bei jedem Klick.
 */
test('die Spalten springen beim Wechsel des Abschnitts nicht', async ({ page }) => {
  /*
    Die Fensterhöhe ist hier ein Teil des Aufbaus, nicht Beiwerk.

    Der Test taugt nur etwas, wenn unter den geprüften Abschnitten **beide** Fälle vorkommen:
    einer, der scrollt, und einer, der es nicht tut – genau dazwischen sprang die Seite früher.
    Auf dem voreingestellten Fenster (720 px) scrollt seit dem Wechsel der Gestaltsprache
    jeder Abschnitt, weil Richtung A größere Grade und gerahmte Felder benutzt (docs/69); die
    Selbstprüfung unten fiel deshalb aus und meldete zu Recht „nichts geprüft".

    900 px liegt gemessen zwischen den Abschnitten: „Regeln" und „Läuft gerade" passen (900),
    „Was wir wissen" nicht (1090). Damit prüft der Test wieder die Grenze, um die es geht.
  */
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`/bereiche/${SCHUHE}`)
  await expect(page.getByRole('heading', { name: 'Was wir wissen' })).toBeVisible()

  // Die Rinne für den Balken bleibt reserviert – das ist die Ursache, nicht das Symptom.
  const gutter = await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter)
  expect(gutter, 'ohne reservierte Rinne springt die Seite, sobald eine Auswahl scrollt').toBe('stable')

  const kante = async (pfad: string) => {
    await page.goto(`/bereiche/${SCHUHE}${pfad}`)
    await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
    return page.evaluate(() => ({
      navi: Math.round(document.querySelector('.master')!.getBoundingClientRect().left),
      inhalt: Math.round(document.querySelector('.split-detail')!.getBoundingClientRect().left),
      scrollt: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    }))
  }

  const gemessen = []
  for (const pfad of ['', '/wissen', '/regeln', '/laeuft', '/verlauf', '/verwalten']) {
    gemessen.push({ pfad: pfad || '/(ohne Abschnitt)', ...(await kante(pfad)) })
  }

  const erste = gemessen[0]!
  for (const m of gemessen) {
    expect(m.navi, `${m.pfad}: die Navigationsspalte steht woanders`).toBe(erste.navi)
    expect(m.inhalt, `${m.pfad}: die Inhaltsspalte steht woanders`).toBe(erste.inhalt)
  }
  // Und die Messung ist etwas wert: Es waren wirklich beide Fälle dabei.
  expect(new Set(gemessen.map((m) => m.scrollt)).size, 'alle Seiten scrollten gleich – nichts geprüft').toBe(2)
})
