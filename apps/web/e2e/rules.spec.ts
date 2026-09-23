import { test, expect, type Page } from '@playwright/test'

/**
 * Regeln einrichten: beobachten, regelmäßig, und eine, die auf eine andere folgt.
 *
 * Vorher gab es nur die erste Art. Im Untertitel des Bogens stand ausdrücklich „es legt keine
 * Aufgabe an" – regelmäßige Aufgaben waren gar nicht einrichtbar, obwohl das Datenmodell sie
 * seit jeher vorsah (`defaultResponse: create_task` wurde gespeichert und nie gelesen).
 */
test.use({ viewport: { width: 1280, height: 900 } })

const REPARATUREN = '/bereiche/01a07d11-afa9-7262-bf12-91c8fa811686'

/*
 * Der Weg zum Bogen hängt davon ab, ob es schon Regeln gibt: im Leerzustand „Regel
 * einrichten", sonst der Knopf in der Abschnittsüberschrift. Beide führen zum selben Bogen –
 * und beide muss es geben, sonst kommt man nach der ersten Regel nicht mehr zur zweiten.
 */
async function openSheet(page: Page) {
  // Seit die Übersicht nur noch zusammenfasst, liegen die Regeln auf ihrer eigenen Seite.
  await page.goto(`${REPARATUREN}/regeln`)
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  const leer = page.getByRole('button', { name: 'Regel einrichten' })
  if (await leer.isVisible().catch(() => false)) await leer.click()
  else await page.getByRole('button', { name: 'Weitere Regel' }).click()
  await expect(page.getByLabel('Was für eine Regel?')).toBeVisible()
}

/**
 * Regeln sind echter Zustand – was ein Test anlegt, räumt er weg.
 *
 * `removeRules` steht am Ende eines Testkörpers und wird deshalb übersprungen, sobald vorher
 * eine Erwartung fehlschlägt. Genau so sind im Demohaushalt über die Zeit sechzehn Regeln
 * liegen geblieben, bis `/regeln` mit 41 Bedienelementen über seinem Budget lag – ein roter
 * Test, der nichts über das Produkt aussagte, sondern über die Testhygiene.
 *
 * Deshalb zusätzlich ein `afterEach`: Jeder Name dieser Datei endet auf einen Zeitstempel,
 * und was so heißt, gehört keinem Haushalt, sondern einem Testlauf. Es verschwindet, ob der
 * Test durchläuft oder nicht.
 */
test.afterEach(async ({ page }) => {
  const householdId = await page.evaluate(() => localStorage.getItem('thealotta.household'))
  if (!householdId) return
  const csrf = await page.evaluate(
    () => document.cookie.match(/(?:^|;\s*)thealotta_csrf=([^;]+)/)?.[1] ?? '',
  )
  const base = `/api/v1/households/${householdId}`
  const antwort = await page.request.get(`${base}/monitors`)
  if (!antwort.ok()) return
  const list = (await antwort.json()) as { items: { id: string; name: string }[] }
  for (const rule of list.items.filter((m) => / \d{13}$/.test(m.name))) {
    await page.request.delete(`${base}/monitors/${rule.id}`, {
      headers: { 'x-csrf-token': decodeURIComponent(csrf) },
    })
  }
})

async function removeRules(page: Page, names: string[]) {
  const householdId = await page.evaluate(() => localStorage.getItem('thealotta.household'))
  const csrf = await page.evaluate(() => document.cookie.match(/(?:^|;\s*)thealotta_csrf=([^;]+)/)?.[1] ??
      '')
  const base = `/api/v1/households/${householdId}`
  const list = (await (await page.request.get(`${base}/monitors`)).json()) as {
    items: { id: string; name: string }[]
  }
  for (const rule of list.items.filter((m) => names.includes(m.name))) {
    await page.request.delete(`${base}/monitors/${rule.id}`, {
      headers: { 'x-csrf-token': decodeURIComponent(csrf) },
    })
  }
}

test('die drei Arten von Regel stehen zur Wahl', async ({ page }) => {
  await openSheet(page)
  await expect(page.getByLabel('Was für eine Regel?').locator('option')).toHaveText([
    'Auf eine Angabe achten und sich melden',
    'Regelmäßig eine Aufgabe anlegen',
    'Eine Aufgabe, die auf eine andere folgt',
  ])
})

test('eine regelmäßige Aufgabe an einem festen Wochentag', async ({ page }) => {
  const name = `Müll ${Date.now()}`
  await openSheet(page)

  await page.getByLabel('Was für eine Regel?').selectOption('regelmaessig')
  await page.getByLabel('Wie heißt die Aufgabe?').fill(name)
  await page.getByLabel('Wann zum ersten Mal?').fill('2026-03-12')
  await page.getByLabel('Wiederholt sich').selectOption('P1W')

  /*
   * Die Vorschau ist der Prüfstein: Wer die Regel liest, soll sie verstehen, ohne zu wissen,
   * was `{ weekdays: [4] }` bedeutet.
   */
  await expect(page.locator('.notice-accent')).toContainText(`„${name}“ ist donnerstags dran.`)

  await page.getByRole('button', { name: 'Einrichten', exact: true }).click()
  await expect(page.getByText(name).first()).toBeVisible()

  await removeRules(page, [name])
})

/**
 * Die Wiederholungsoptionen folgen dem Muster, das man aus Kalendern kennt: erst das Datum,
 * dann Vorschläge, die sich daraus ableiten. „Monatlich am zweiten Donnerstag" ergibt nur
 * Sinn, wenn der gewählte Tag ein zweiter Donnerstag ist.
 */
test('die Vorschläge leiten sich aus dem gewählten Datum ab', async ({ page }) => {
  await openSheet(page)
  await page.getByLabel('Was für eine Regel?').selectOption('regelmaessig')
  await page.getByLabel('Wie heißt die Aufgabe?').fill('Elternabend')
  // 2026-03-12 ist ein Donnerstag und der zweite Donnerstag des Monats.
  await page.getByLabel('Wann zum ersten Mal?').fill('2026-03-12')

  await expect(page.getByLabel('Wiederholt sich').locator('option')).toHaveText([
    'Täglich',
    'Wöchentlich am Donnerstag',
    'An jedem Werktag (Mo–Fr)',
    'Monatlich am zweiten Donnerstag',
    'Monatlich am 12.',
    'Jährlich am 12. März',
    'Benutzerdefiniert …',
  ])
})

test('ein Datum ohne zweiten Wochentag bietet ihn auch nicht an', async ({ page }) => {
  await openSheet(page)
  await page.getByLabel('Was für eine Regel?').selectOption('regelmaessig')
  await page.getByLabel('Wie heißt die Aufgabe?').fill('Monatsende')
  // Der 30. ist der fünfte seines Wochentags – „am fünften Montag" gibt es nicht in jedem Monat.
  await page.getByLabel('Wann zum ersten Mal?').fill('2026-03-30')

  const optionen = await page.getByLabel('Wiederholt sich').locator('option').allInnerTexts()
  expect(optionen.some((o) => o.startsWith('Monatlich am ') && !/^Monatlich am \d/.test(o))).toBe(false)
  expect(optionen).toContain('Monatlich am 30.')
})

test('jede Wiederholung liest sich als Satz', async ({ page }) => {
  await openSheet(page)
  await page.getByLabel('Was für eine Regel?').selectOption('regelmaessig')
  await page.getByLabel('Wie heißt die Aufgabe?').fill('Elternabend')
  await page.getByLabel('Wann zum ersten Mal?').fill('2026-03-12')

  const erwartet: [string, string][] = [
    ['P1D', '„Elternabend“ ist täglich dran.'],
    // „Wöchentlich am Donnerstag" ist ein fester Tag, kein Sieben-Tage-Abstand.
    ['P1W', '„Elternabend“ ist donnerstags dran.'],
    ['werktags', '„Elternabend“ ist an jedem Werktag dran.'],
    ['nth', '„Elternabend“ ist am zweiten Donnerstag jedes Monats dran.'],
    ['monthday', '„Elternabend“ ist am 12. jedes Monats dran.'],
    ['P1Y', '„Elternabend“ ist jedes Jahr dran.'],
  ]
  for (const [wert, satz] of erwartet) {
    await page.getByLabel('Wiederholt sich').selectOption(wert)
    await expect(page.locator('.notice-accent')).toContainText(satz)
  }
})

test('das Ende steht hinter „dran", nicht mittendrin', async ({ page }) => {
  await openSheet(page)
  await page.getByLabel('Was für eine Regel?').selectOption('regelmaessig')
  await page.getByLabel('Wie heißt die Aufgabe?').fill('Kurzserie')
  await page.getByLabel('Wann zum ersten Mal?').fill('2026-03-12')
  await page.getByLabel('Wiederholt sich').selectOption('P1D')

  await page.getByLabel('Endet').selectOption('nach')
  await page.getByLabel('Wie oft insgesamt?').fill('6')
  await expect(page.locator('.notice-accent')).toContainText('ist täglich dran, 6-mal.')

  await page.getByLabel('Endet').selectOption('am')
  await page.getByLabel('Letzter Termin').fill('2026-12-31')
  await expect(page.locator('.notice-accent')).toContainText('ist täglich dran, bis zum 31.12.2026.')
})

test('benutzerdefiniert öffnet die feineren Einstellungen', async ({ page }) => {
  await openSheet(page)
  await page.getByLabel('Was für eine Regel?').selectOption('regelmaessig')
  await page.getByLabel('Wie heißt die Aufgabe?').fill('Blumen gießen')
  await page.getByLabel('Wann zum ersten Mal?').fill('2026-03-12')
  await page.getByLabel('Wiederholt sich').selectOption('custom')

  await page.getByLabel('Alle …').fill('3')
  await expect(page.locator('.notice-accent')).toContainText('alle 3 Tage dran')

  // Bei Wochen kommen die Wochentage dazu – ohne einen gewählten Tag geht es nicht weiter.
  await page.getByLabel('Einheit').selectOption('W')
  await expect(page.getByRole('button', { name: 'Mi' })).toBeVisible()
  await page.getByRole('button', { name: 'Mi' }).click()
  await page.getByRole('button', { name: 'Sa' }).click()
  await expect(page.locator('.notice-accent')).toContainText('ist mittwochs und samstags dran')

  // Bei Monaten die Frage, wonach im Monat.
  await page.getByLabel('Einheit').selectOption('M')
  await expect(page.getByLabel('Wonach im Monat?')).toBeVisible()
})

test('eine Aufgabe, die auf eine andere folgt', async ({ page }) => {
  const erste = `Rasen ${Date.now()}`
  const zweite = `Schnittgut ${Date.now()}`

  // Erst die vorangehende Regel, sonst gibt es nichts, woran man sich hängen könnte.
  await openSheet(page)
  await page.getByLabel('Was für eine Regel?').selectOption('regelmaessig')
  await page.getByLabel('Wie heißt die Aufgabe?').fill(erste)
  await page.getByRole('button', { name: 'Einrichten', exact: true }).click()
  await expect(page.getByText(erste).first()).toBeVisible()

  await openSheet(page)
  await page.getByLabel('Was für eine Regel?').selectOption('folgt')
  await page.getByLabel('Wie heißt die Aufgabe?').fill(zweite)
  await page.getByLabel('Nach welcher Aufgabe?').selectOption({ label: erste })
  await page.getByLabel('Wie lange danach?').fill('2')

  await expect(page.locator('.notice-accent')).toContainText(`„${zweite}“ ist 2 Tage nach „${erste}“ dran.`)

  await page.getByRole('button', { name: 'Einrichten', exact: true }).click()
  await expect(page.getByText(zweite).first()).toBeVisible()

  await removeRules(page, [erste, zweite])
})

test('ohne vorangehende Regel sagt der Bogen, was fehlt', async ({ page }) => {
  await openSheet(page)
  await page.getByLabel('Was für eine Regel?').selectOption('folgt')

  /*
   * Nur Regeln, die eine Aufgabe anlegen, können eine andere nach sich ziehen. Gibt es keine,
   * steht das als Satz da – statt einer leeren Auswahl, aus der man nichts wählen kann.
   */
  const auswahl = page.getByLabel('Nach welcher Aufgabe?')
  if ((await auswahl.count()) === 0) {
    await expect(page.getByText(/braucht es zuerst eine Regel, die eine Aufgabe anlegt/)).toBeVisible()
  } else {
    await expect(auswahl.locator('option')).not.toHaveCount(1)
  }
})

test('eine Regel lässt sich abschalten und wieder einschalten', async ({ page }) => {
  const name = `Abschalten ${Date.now()}`
  await openSheet(page)
  await page.getByLabel('Was für eine Regel?').selectOption('regelmaessig')
  await page.getByLabel('Wie heißt die Aufgabe?').fill(name)
  await page.getByRole('button', { name: 'Einrichten', exact: true }).click()
  await expect(page.getByText(name).first()).toBeVisible()

  /*
   * Eine Regel, die Aufgaben anlegt, muss man stoppen können – sonst legt sie weiter an, und
   * das Einzige, was hilft, wäre der Datenbankzugriff.
   */
  await page.getByRole('button', { name: `„${name}“ abschalten` }).click()
  await expect(page.getByText('ausgesetzt').first()).toBeVisible()
  await expect(page.getByRole('button', { name: `„${name}“ wieder einschalten` })).toBeVisible()

  await page.getByRole('button', { name: `„${name}“ wieder einschalten` }).click()
  await expect(page.getByRole('button', { name: `„${name}“ abschalten` })).toBeVisible()

  await removeRules(page, [name])
})

test('eine Regel, die nie gelaufen ist, lässt sich löschen', async ({ page }) => {
  const name = `Versehen ${Date.now()}`
  await openSheet(page)
  await page.getByLabel('Was für eine Regel?').selectOption('regelmaessig')
  await page.getByLabel('Wie heißt die Aufgabe?').fill(name)
  await page.getByRole('button', { name: 'Einrichten', exact: true }).click()
  await expect(page.getByText(name).first()).toBeVisible()

  await page.getByRole('button', { name: `„${name}“ löschen` }).click()
  await expect(page.getByText(name)).toHaveCount(0)
})

/**
 * Wo man eine Regel einrichtet.
 *
 * Es gibt zwei Orte, und beide muss es geben: im Bereich, wenn man gerade dort ist, und auf
 * der Beobachtungsseite, wo alle Regeln des Haushalts stehen. Die zweite Seite listete sie
 * lange nur auf – wer eine anlegen wollte, musste wissen, dass das anderswo geht.
 */
test('von der Beobachtungsseite aus, mit Bereichswahl als erster Frage', async ({ page }) => {
  const name = `Von der Liste ${Date.now()}`

  await page.goto('/regeln')
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await page.getByRole('button', { name: 'Regel einrichten' }).click()

  // Hier steht der Bereich noch nicht fest – also ist er die erste Frage.
  await expect(page.getByLabel('Für welchen Bereich?')).toBeVisible()
  await page.getByLabel('Für welchen Bereich?').selectOption({ label: 'Reparaturen' })

  await page.getByLabel('Was für eine Regel?').selectOption('regelmaessig')
  await page.getByLabel('Wie heißt die Aufgabe?').fill(name)
  await page.getByLabel('Wann zum ersten Mal?').fill('2026-03-12')
  await page.getByLabel('Wiederholt sich').selectOption('P1W')
  await expect(page.locator('.notice-accent')).toContainText(`„${name}“ ist donnerstags dran.`)

  await page.getByRole('button', { name: 'Einrichten', exact: true }).click()
  await expect(page.getByText(name).first()).toBeVisible()

  await removeRules(page, [name])
})

test('im Bereich steht der Bereich schon fest', async ({ page }) => {
  await openSheet(page)
  // Dieselbe Maske, eine Frage weniger – man ist ja schon im Bereich.
  await expect(page.getByLabel('Für welchen Bereich?')).toHaveCount(0)
  await expect(page.getByLabel('Was für eine Regel?')).toBeVisible()
})

/**
 * Eine eingerichtete Regel lässt sich ändern.
 *
 * Vorher nicht: Die Schnittstelle nahm nur „an/aus" entgegen, und gelöscht werden darf eine
 * Regel nur, solange sie nie gelaufen ist. Eine Regel mit falschem Rhythmus war damit
 * eingefroren – man konnte sie bloß stilllegen und daneben eine zweite anlegen.
 */
test('eine bestehende Regel lässt sich ändern', async ({ page }) => {
  const name = `Wäsche ${Date.now()}`
  await openSheet(page)
  await page.getByLabel('Was für eine Regel?').selectOption('regelmaessig')
  await page.getByLabel('Wie heißt die Aufgabe?').fill(name)
  await page.getByLabel('Wann zum ersten Mal?').fill('2026-03-12')
  await page.getByLabel('Wiederholt sich').selectOption('P1W')
  await page.getByRole('button', { name: 'Einrichten', exact: true }).click()
  await expect(page.getByText(name).first()).toBeVisible()

  await page.getByRole('button', { name: `„${name}“ ändern` }).click()

  /*
    Der Prüfstein des Bearbeitens: Das Formular steht gefüllt da. Wer nur den Namen ändern
    will, darf den Rhythmus nicht neu zusammensuchen müssen.
  */
  await expect(page.getByLabel('Wie heißt die Aufgabe?')).toHaveValue(name)
  await expect(page.getByLabel('Was für eine Regel?')).toHaveValue('regelmaessig')
  await expect(page.getByLabel('Wiederholt sich')).toHaveValue('P1W')

  await page.getByLabel('Wiederholt sich').selectOption('P1D')
  await page.getByLabel('Wie heißt die Aufgabe?').fill(`${name} neu`)
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()

  await expect(page.getByText(`${name} neu`).first()).toBeVisible()

  /*
    Und geändert ist auch, was gespeichert wurde – nicht nur, was in der Liste steht. Der
    Bogen liest die Regel neu vom Server, also zeigt er, was dort tatsächlich liegt.
  */
  await page.getByRole('button', { name: `„${name} neu“ ändern` }).click()
  await expect(page.getByLabel('Wiederholt sich')).toHaveValue('P1D')
  await page.keyboard.press('Escape')

  /*
    Danach legt derselbe Bogen wieder neu an, statt weiter dieselbe Regel zu ändern – sonst
    überschriebe der nächste „Weitere Regel"-Klick unbemerkt die eben geänderte.
  */
  await page.getByRole('button', { name: 'Weitere Regel' }).click()
  await expect(page.getByRole('heading', { name: 'Regel einrichten' })).toBeVisible()
  await expect(page.getByLabel('Was für eine Regel?')).toHaveValue('beobachten')
  await page.keyboard.press('Escape')

  await removeRules(page, [`${name} neu`])
})
