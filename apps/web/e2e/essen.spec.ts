import { test, expect, type Page } from '@playwright/test'

/**
 * Die Essensplanung im Browser (docs/63).
 *
 * Geprüft wird der zentrale Ablauf aus §41 – **Woche öffnen → füllen → einen Vorschlag
 * tauschen → Einkaufsliste erzeugen** – und die zwei Zusagen, die dabei am leichtesten
 * verloren gehen: Bestehendes bleibt stehen (§24, §56), und ein Gericht braucht nur einen
 * Namen (§40, §50).
 */
test.use({ viewport: { width: 1440, height: 1100 } })

/** Räumt die offene Woche, damit jeder Test von derselben Lage aus startet. */
async function wocheLeeren(page: Page) {
  const householdId = await page.evaluate(() => localStorage.getItem('thealotta.household'))
  const csrf = await page.evaluate(() => document.cookie.match(/(?:^|;\s*)thealotta_csrf=([^;]+)/)?.[1] ??
      '')
  const base = `/api/v1/households/${householdId}`
  const heute = (await (await page.request.get(`${base}/meals/upcoming`)).json()) as { weekStart: string }
  const woche = (await (await page.request.get(`${base}/meals/week?start=${heute.weekStart}`)).json()) as {
    days: { date: string; slots: { slot: string; entry: unknown }[] }[]
  }
  for (const tag of woche.days) {
    for (const s of tag.slots) {
      if (s.entry) {
        await page.request.delete(`${base}/meals/entry?date=${tag.date}&slot=${s.slot}`, {
          headers: { 'x-csrf-token': decodeURIComponent(csrf) },
        })
      }
    }
  }
  return { base, csrf, weekStart: heute.weekStart }
}

async function oeffne(page: Page, pfad = '/essen') {
  await page.goto(pfad)
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
}

test('der Wochenplan ist ein Kalender: Tage waagerecht, Mahlzeiten senkrecht', async ({ page }) => {
  /* Das Gitter braucht Breite – darunter ist der Stapel die ehrlichere Anordnung. */
  await page.setViewportSize({ width: 1600, height: 1000 })
  await oeffne(page)

  /* Die Tage sind die Spalten. */
  const spalten = await page.getByRole('columnheader').allInnerTexts()
  for (const tag of ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']) {
    expect(spalten.some((s) => s.includes(tag)), `${tag} fehlt als Spalte`).toBe(true)
  }
  /* Die Mahlzeiten sind die Zeilen. */
  await expect(page.getByRole('rowheader')).toHaveText(['Mittag', 'Abend'])

  /*
    Vierzehn Plätze – den Mittagsplatz gibt es an jedem Tag. Ein Loch im Gitter wäre nicht zu
    erklären; an den fünf Tagen ohne eingestelltes Mittagessen ist er nur rahmenlos (§12).
  */
  await expect(page.locator('.essen-slot')).toHaveCount(14)
  await expect(page.locator('.essen-slot.ist-ausserplan')).toHaveCount(5)
})

test('schmal wird aus dem Gitter ein Stapel nach Tagen', async ({ page }) => {
  /*
    Auf dem Telefon lautet die Frage „was ist heute?", nicht „was essen wir diese Woche
    mittags?". Sieben Spalten auf 390 px wären sieben Spalten mit je zwei Wörtern Breite.
  */
  await page.setViewportSize({ width: 390, height: 900 })
  await oeffne(page)
  await expect(page.locator('.essen-woche')).toHaveCount(0)
  await expect(page.locator('.essen-stapel .essen-tag')).toHaveCount(7)
  await expect(page.locator('.essen-slot')).toHaveCount(14)
})

test('§41 – der zentrale Ablauf: füllen, tauschen, Einkaufsliste', async ({ page }) => {
  await oeffne(page)
  await wocheLeeren(page)
  await page.reload()
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

  // 1 — Woche füllen.
  await page.getByRole('button', { name: 'Freie Woche füllen' }).click()
  await expect(page.locator('.essen-slot.ist-belegt').first()).toBeVisible()
  const belegt = await page.locator('.essen-slot.ist-belegt').count()
  expect(belegt, 'nicht alle Plätze wurden gefüllt').toBeGreaterThan(5)

  /*
    Jeder Vorschlag sagt in Worten, warum er dasteht (§25) – und nennt keine Punktzahl (§26).

    Seit die Zelle nur noch den Namen trägt, steht die Begründung im Bogen der Mahlzeit. Die
    Zusage ist dieselbe geblieben, der Ort hat sich verschoben: geprüft wird sie dort, wo sie
    zu lesen ist.
  */
  const ersterPlatz = page.locator('.essen-slot.ist-belegt').first()
  const ersterName = (await ersterPlatz.locator('.t-sub').innerText()).trim()
  await ersterPlatz.getByRole('button', { name: new RegExp(`${ersterName}.*ändern`) }).click()
  const herkunft = page.locator('.essen-herkunft')
  await expect(herkunft).toBeVisible()
  const grund = await herkunft.innerText()
  expect(grund, 'der Vorschlag erklärt sich nicht').toMatch(/Vorschlag/)
  expect(grund, `Punktzahl im Text: ${grund}`).not.toMatch(/\d+\s?%|score/i)
  await page.keyboard.press('Escape')

  /* Und im Gitter selbst steht keine Zahl, die wie eine Bewertung aussieht. */
  const imGitter = await page.locator('.essen-woche').innerText()
  expect(imGitter, 'Punktzahl im Wochenplan').not.toMatch(/\d+\s?%|score/i)

  // 2 — Einen Vorschlag tauschen; die übrigen bleiben stehen (§57).
  const vorher = await page.locator('.essen-eintrag .t-sub').allInnerTexts()
  await page.locator('.essen-slot.ist-belegt').nth(2).getByRole('button', { name: /Anderes Gericht/ }).click()
  await expect(page.locator('.essen-slot.ist-belegt')).toHaveCount(belegt)
  const nachher = await page.locator('.essen-eintrag .t-sub').allInnerTexts()
  const geaendert = vorher.filter((v, i) => v !== nachher[i])
  expect(geaendert.length, `${geaendert.length} Tage haben sich geändert statt höchstens einer`).toBeLessThanOrEqual(1)

  // 3 — Einkaufsliste erzeugen.
  await page.getByRole('link', { name: 'Einkaufsliste erzeugen' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await page.getByRole('button', { name: 'Aus dem Wochenplan erzeugen' }).click()
  await expect(page.locator('.setting-row').first()).toBeVisible()

  /*
    Aufräumen. Eine Einkaufsliste ist echter Zustand – bliebe sie stehen, fände der nächste
    Lauf einen anderen Demohaushalt vor als der vorige.
  */
  const { base, csrf } = await wocheLeeren(page)
  const liste = (await (await page.request.get(`${base}/meals/shopping`)).json()) as {
    id: string | null
    items: { id: string }[]
  }
  for (const i of liste.items) {
    await page.request.delete(`${base}/meals/shopping/${liste.id}/items/${i.id}`, {
      headers: { 'x-csrf-token': decodeURIComponent(csrf) },
    })
  }
})

test('§56 – „Woche füllen" lässt Geplantes unangetastet', async ({ page }) => {
  await oeffne(page)
  const { base, csrf, weekStart } = await wocheLeeren(page)

  /* Montag von Hand setzen – über die Schnittstelle, der Test prüft die Zusage, nicht den Weg. */
  const gerichte = (await (await page.request.get(`${base}/dishes`)).json()) as { items: { id: string; name: string }[] }
  const chili = gerichte.items.find((d) => d.name === 'Chili sin Carne') ?? gerichte.items[0]!
  await page.request.put(`${base}/meals/entry`, {
    headers: { 'x-csrf-token': decodeURIComponent(csrf) },
    data: { date: weekStart, slot: 'dinner', dishId: chili.id },
  })

  await page.reload()
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await page.getByRole('button', { name: 'Freie Woche füllen' }).click()
  await expect(page.locator('.essen-slot.ist-belegt').first()).toBeVisible()

  /*
    Ausdrücklich die Abendzeile, nicht „der erste belegte Platz".

    Das Gitter hat an jedem Tag auch einen Mittagsplatz, und „Freie Woche füllen" belegt die,
    die der Haushalt eingestellt hat – im Demobestand Samstag und Sonntag. Der erste belegte
    Platz im Dokument war damit das Samstagsmittagessen, nicht der Montagabend. Der Test hing
    also daran, ob gerade ein Mittagessen geplant ist, und fiel je nach Reihenfolge der Tests
    einmal so und einmal anders aus.
  */
  const abend = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Abend' }) })
  const montag = abend.locator('.essen-slot.ist-belegt').first()
  await expect(montag.locator('.t-sub')).toHaveText(chili.name)
  /*
    Von Hand gesetzt ist kein Vorschlag. Daran hängt mehr als Kosmetik: „Ganze Woche neu
    vorschlagen" fasst nur Vorschläge an, und was es anfasst, muss man sehen (§24).

    Seit die Zelle nur den Namen trägt, steht die Herkunft im Bogen der Mahlzeit – also wird
    sie dort geprüft, an beiden Plätzen.
  */
  await montag.getByRole('button', { name: new RegExp(`${chili.name}.*ändern`) }).click()
  await expect(page.locator('.essen-herkunft')).toHaveText(/Von Hand geplant/)
  await page.keyboard.press('Escape')

  const zweiter = abend.locator('.essen-slot.ist-belegt').nth(1)
  const zweiterName = (await zweiter.locator('.t-sub').innerText()).trim()
  await zweiter.getByRole('button', { name: new RegExp(`${zweiterName}.*ändern`) }).click()
  await expect(page.locator('.essen-herkunft')).toHaveText(/Vorschlag/)
  await page.keyboard.press('Escape')

  await wocheLeeren(page)
})

test('§40/§50 – ein Gericht braucht nur einen Namen', async ({ page }) => {
  const name = `Testgericht ${Date.now()}`
  await oeffne(page, '/essen/sammlung')

  await page.getByRole('button', { name: 'Gericht', exact: true }).first().click()
  await page.getByLabel('Wie heißt das Gericht?').fill(name)
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()

  await expect(page.getByText(name).first()).toBeVisible()
  /* Und sofort benutzbar: Es steht in der Auswahl für einen Platz im Plan. */
  await expect(page.getByText(name).first().locator('..')).toContainText('noch nie')

  /*
    Aufräumen – und zugleich die Gegenprobe: Löschen steht im Bogen, nicht an jeder Zeile.
    Ein Gericht, das nie auf dem Plan stand, darf ganz verschwinden.
  */
  await page.getByRole('button', { name: `„${name}" öffnen` }).click()
  await page.getByRole('button', { name: 'Löschen', exact: true }).click()
  await expect(page.getByText(name)).toHaveCount(0)
})

test('§3/§33 – Zutaten lassen sich am Gericht eintragen und landen auf der Einkaufsliste', async ({ page }) => {
  const name = `Zutatentest ${Date.now()}`
  await oeffne(page, '/essen/sammlung')

  /*
    Der Weg, der zwischenzeitlich nicht zu finden war.

    Das Feld lag hinter einem Schalter, der wie ein Tag aussah – wer eine Einkaufsliste wollte,
    fand ihn nicht und schloss daraus, dass es kein Feld gibt. Jetzt ist es ein Aufklapper mit
    Namen, und der Test geht genau diesen Weg: Gericht anlegen, öffnen, Zutaten eintragen,
    einplanen, Liste erzeugen.
  */
  await page.getByRole('button', { name: 'Gericht', exact: true }).first().click()
  await page.getByLabel('Wie heißt das Gericht?').fill(name)
  await page.getByRole('group').filter({ hasText: 'Zutaten, Zeiten und Zubereitung' }).getByText('Zutaten, Zeiten und Zubereitung').click()
  await page.getByLabel('Portionen').fill('4')
  await page.getByRole('button', { name: 'Zutat', exact: true }).click()
  await page.getByLabel('Menge für Zutat 1').fill('3')
  await page.getByLabel('Einheit für Zutat 1').fill('Stück')
  await page.getByLabel('Name der Zutat 1').fill('Testzwiebel')
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(page.getByText(name).first()).toBeVisible()

  /* Die Sammlung zeigt, dass Zutaten hinterlegt sind – die Lücke wäre sonst unsichtbar. */
  await expect(page.getByText(name).first().locator('..')).toContainText('1 Zutaten')

  const { base, csrf, weekStart } = await (async () => {
    await oeffne(page)
    return wocheLeeren(page)
  })()
  const gerichte = (await (await page.request.get(`${base}/dishes`)).json()) as { items: { id: string; name: string }[] }
  const dish = gerichte.items.find((d) => d.name === name)!
  await page.request.put(`${base}/meals/entry`, {
    headers: { 'x-csrf-token': decodeURIComponent(csrf) },
    data: { date: weekStart, slot: 'dinner', dishId: dish.id },
  })

  await oeffne(page, '/essen/einkauf')
  await page.getByRole('button', { name: 'Aus dem Wochenplan erzeugen' }).click()
  await expect(page.getByText('Testzwiebel')).toBeVisible()
  await expect(page.getByText(/3 Stück Testzwiebel/)).toBeVisible()

  /* Aufräumen: Liste, Plan und Gericht. */
  const liste = (await (await page.request.get(`${base}/meals/shopping`)).json()) as {
    id: string | null
    items: { id: string }[]
  }
  for (const i of liste.items) {
    await page.request.delete(`${base}/meals/shopping/${liste.id}/items/${i.id}`, {
      headers: { 'x-csrf-token': decodeURIComponent(csrf) },
    })
  }
  await oeffne(page)
  await wocheLeeren(page)
  await page.request.delete(`${base}/dishes/${dish.id}`, {
    headers: { 'x-csrf-token': decodeURIComponent(csrf) },
  })
})

test('wofür ein Gericht passt, lässt sich am Gericht wählen', async ({ page }) => {
  const name = `Mittagstest ${Date.now()}`
  await oeffne(page, '/essen/sammlung')

  await page.getByRole('button', { name: 'Gericht', exact: true }).first().click()
  await page.getByLabel('Wie heißt das Gericht?').fill(name)
  /*
    Der Selektor steht oben, nicht im Aufklapper: Er steuert die Vorschläge, statt zu
    beschreiben – wer ihn erst nach dem Aufklappen fände, bekäme Pfannkuchen zum Abendessen
    und wüsste nicht, warum.
  */
  await page.getByLabel('Wofür passt das?').selectOption('lunch')
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()

  await expect(page.getByText(name).first()).toBeVisible()
  /* Nur die Abweichung steht in der Liste – „mittags und abends" wäre bei fast allen Rauschen. */
  await expect(page.getByText(name).first().locator('..')).toContainText('nur mittags')

  // Aufräumen: nie geplant, also löschbar.
  await page.getByRole('button', { name: `„${name}" öffnen` }).click()
  await page.getByRole('button', { name: 'Löschen', exact: true }).click()
  await expect(page.getByText(name)).toHaveCount(0)
})

test('§14 – einplanen geht auch ohne Ziehen', async ({ page }) => {
  await oeffne(page)
  await wocheLeeren(page)
  await page.reload()
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

  /*
    Der Weg ohne Maus: Gericht antippen, dann einen Platz. Ziehen ist der bequemere Weg,
    nicht der einzige – mit Tastatur und Vorleseprogramm gibt es ihn gar nicht.
  */
  await page.locator('.essen-rail .essen-karte').first().click()
  await expect(page.getByText(/ist ausgewählt/)).toBeVisible()
  await page.getByRole('button', { name: /hier einplanen/ }).first().click()

  await expect(page.locator('.essen-slot.ist-belegt')).toHaveCount(1)
  await wocheLeeren(page)
})

test('§52/§45 – Tagfilter wirken auf die Sammlung', async ({ page }) => {
  await oeffne(page, '/essen/sammlung')
  const alle = await page.locator('.setting-row .t-sub').count()

  /* Die Tagliste ist zugeklappt: Suchen ist der häufigere Weg, Filtern die Absicht. */
  await page.getByRole('button', { name: /Nach Tags filtern/ }).click()
  await page.getByRole('button', { name: 'vegetarisch', exact: true }).first().click()
  await expect(page.locator('.setting-row .t-sub')).not.toHaveCount(alle)
  const gefiltert = await page.locator('.setting-row .t-sub').count()
  expect(gefiltert).toBeGreaterThan(0)
  expect(gefiltert).toBeLessThan(alle)
})

test('§7 – die Sammlung lässt sich nach „lange nicht gegessen" sortieren', async ({ page }) => {
  await oeffne(page, '/essen/sammlung')
  await page.getByLabel('Sortierung').selectOption('long_ago')

  /* „Noch nie" steht oben – genau diese Gerichte sucht man hier, nicht die zuletzt gekochten. */
  const erste = await page.locator('.setting-row').first().innerText()
  expect(erste).toMatch(/noch nie|Monaten|über einem Jahr/)
})

test('ein versehentlich entferntes Gericht kommt zurück', async ({ page }) => {
  /*
    Der Löschknopf steht vierzehnmal auf der Seite, wenige Pixel neben „anderes Gericht“ –
    der Fehlgriff ist die wahrscheinlichste Fehlbedienung des Wochenplans (docs/68, E7).
    Geprüft wird die Zusage des Designsystems: zurücknehmbar statt bestätigungspflichtig.
  */
  await oeffne(page)
  const { base, csrf, weekStart } = await wocheLeeren(page)
  const gerichte = (await (await page.request.get(`${base}/dishes`)).json()) as { items: { id: string; name: string }[] }
  const dish = gerichte.items.find((d) => d.name === 'Chili sin Carne')!
  await page.request.put(`${base}/meals/entry`, {
    headers: { 'x-csrf-token': decodeURIComponent(csrf) },
    data: { date: weekStart, slot: 'dinner', dishId: dish.id, servings: 5 },
  })
  await page.reload()
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

  const platz = page.locator('.essen-slot.ist-belegt').first()
  await expect(platz.locator('.t-sub')).toHaveText(dish.name)
  await platz.getByRole('button', { name: new RegExp(`${dish.name}.*aus dem Plan nehmen`) }).click()
  await expect(page.locator('.essen-slot.ist-belegt')).toHaveCount(0)

  await page.getByRole('button', { name: 'Rückgängig' }).click()
  await expect(page.locator('.essen-slot.ist-belegt').first().locator('.t-sub')).toHaveText(dish.name)

  /* Und zwar vollständig: Die Portionsangabe darf beim Zurückholen nicht verloren gehen. */
  await page.getByRole('button', { name: new RegExp(`${dish.name}.*ändern`) }).first().click()
  await expect(page.getByLabel('Für wie viele?')).toHaveValue('5')
  await page.keyboard.press('Escape')

  await wocheLeeren(page)
})

test('§34/§13 – Portionen und Kopieren stehen im Bogen der Mahlzeit', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await oeffne(page)
  const { base, csrf, weekStart } = await wocheLeeren(page)
  const gerichte = (await (await page.request.get(`${base}/dishes`)).json()) as { items: { id: string; name: string }[] }
  const dish = gerichte.items.find((d) => d.name === 'Chili sin Carne')!
  await page.request.put(`${base}/meals/entry`, {
    headers: { 'x-csrf-token': decodeURIComponent(csrf) },
    data: { date: weekStart, slot: 'dinner', dishId: dish.id },
  })
  await page.reload()
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

  /*
    Die Zelle ist ein Ziel, nicht fünf: Der Name öffnet den Bogen, in dem alles steht, was
    zu **dieser einen Mahlzeit** gehört – Portionen, Notiz, Festhalten, Kopieren, Entfernen.
  */
  await page.getByRole('button', { name: new RegExp(`${dish.name}.*ändern`) }).click()
  await page.getByLabel('Für wie viele?').fill('6')
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  /*
    Die Zelle trägt die Portionszahl nicht mehr – sie trägt nur den Namen. Dass der Wert
    gespeichert wurde, zeigt der Bogen beim nächsten Öffnen; das ist ohnehin die stärkere
    Zusage als ein Chip, der nur die Anzeige wiederholt.
  */
  await expect(page.locator('.essen-slot.ist-belegt').first()).toBeVisible()
  await page.getByRole('button', { name: new RegExp(`${dish.name}.*ändern`) }).first().click()
  await expect(page.getByLabel('Für wie viele?')).toHaveValue('6')
  await page.keyboard.press('Escape')

  /* §13: Kopieren – der Platz bleibt, ein zweiter kommt dazu. */
  await page.getByRole('button', { name: new RegExp(`${dish.name}.*ändern`) }).first().click()
  const ziel = page.getByLabel('Wohin kopieren?')
  await ziel.selectOption({ index: 2 })
  await page.getByRole('button', { name: 'Kopieren', exact: true }).click()
  await expect(page.locator('.essen-slot.ist-belegt')).toHaveCount(2)

  await wocheLeeren(page)
})

test('§36 – eine Zeile der Einkaufsliste lässt sich ändern', async ({ page }) => {
  await oeffne(page)
  const { base, csrf, weekStart } = await wocheLeeren(page)
  const gerichte = (await (await page.request.get(`${base}/dishes`)).json()) as { items: { id: string; name: string }[] }
  const dish = gerichte.items.find((d) => d.name === 'Chili sin Carne')!
  await page.request.put(`${base}/meals/entry`, {
    headers: { 'x-csrf-token': decodeURIComponent(csrf) },
    data: { date: weekStart, slot: 'dinner', dishId: dish.id },
  })

  await oeffne(page, '/essen/einkauf')
  await page.getByRole('button', { name: 'Aus dem Wochenplan erzeugen' }).click()
  await expect(page.locator('.einkauf-zeile').first()).toBeVisible()

  /* Abhaken ist ein Griff, ändern der zweite – beide je Zeile erreichbar. */
  await page.getByRole('button', { name: /„Zwiebel" ändern/ }).click()
  const bogen = page.getByRole('dialog')
  await bogen.getByLabel('Menge').fill('7')
  await bogen.getByLabel('Notiz', { exact: true }).fill('rote nehmen')
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(page.getByText(/7 Stück Zwiebel/)).toBeVisible()
  await expect(page.getByText('rote nehmen')).toBeVisible()

  /*
    Und die Korrektur überlebt das Neuerzeugen (§36) – sonst verlöre der zweite Klick genau
    die Arbeit, für die man sich beim ersten Zeit genommen hat.
  */
  await page.getByRole('button', { name: 'Aus dem Wochenplan erzeugen' }).click()
  await expect(page.getByText(/7 Stück Zwiebel/)).toBeVisible()

  const liste = (await (await page.request.get(`${base}/meals/shopping`)).json()) as {
    id: string | null
    items: { id: string }[]
  }
  for (const i of liste.items) {
    await page.request.delete(`${base}/meals/shopping/${liste.id}/items/${i.id}`, {
      headers: { 'x-csrf-token': decodeURIComponent(csrf) },
    })
  }
  await oeffne(page)
  await wocheLeeren(page)
})

test('§22 – füllen lässt sich auf Abendessen oder einen Tag begrenzen', async ({ page }) => {
  await oeffne(page)
  await wocheLeeren(page)
  await page.reload()
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)

  await page.getByLabel('Was soll gefüllt werden?').selectOption('dinner')
  await page.getByRole('button', { name: 'Füllen', exact: true }).click()
  await expect(page.locator('.essen-slot.ist-belegt').first()).toBeVisible()

  /* Sieben Abendessen belegt, die beiden Mittagsplätze am Wochenende nicht. */
  await expect(page.locator('.essen-slot.ist-belegt')).toHaveCount(7)
  await wocheLeeren(page)
})

test('§7 – Favoriten lassen sich zuerst zeigen', async ({ page }) => {
  await oeffne(page, '/essen/sammlung')
  await page.getByLabel('Sortierung').selectOption('favorit')
  /* Ohne Bewertungen gibt es keine Favoriten – die Liste bleibt vollständig und stürzt nicht ab. */
  await expect(page.locator('.setting-row').first()).toBeVisible()
})

test('§38 – heute steht kompakt auf der Familienseite', async ({ page }) => {
  const { base, csrf } = await (async () => {
    await oeffne(page)
    return wocheLeeren(page)
  })()
  const heute = (await (await page.request.get(`${base}/meals/upcoming`)).json()) as { today: string }
  const gerichte = (await (await page.request.get(`${base}/dishes`)).json()) as { items: { id: string; name: string }[] }
  const dish = gerichte.items[0]!
  await page.request.put(`${base}/meals/entry`, {
    headers: { 'x-csrf-token': decodeURIComponent(csrf) },
    data: { date: heute.today, slot: 'dinner', dishId: dish.id },
  })

  await oeffne(page, '/familie')
  const abschnitt = page.getByRole('region', { name: 'Was es zu essen gibt' })
  await expect(abschnitt.getByText(dish.name)).toBeVisible()
  /* Kompakt heißt: eine Auskunft und ein Weg – keine Planungsoberfläche (§38). */
  await expect(abschnitt.getByRole('link', { name: 'Zum Wochenplan' })).toBeVisible()
  await expect(abschnitt.getByRole('button', { name: /füllen/ })).toHaveCount(0)

  await oeffne(page)
  await wocheLeeren(page)
})
