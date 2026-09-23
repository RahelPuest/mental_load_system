import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Die Essensplanung über HTTP (docs/63).
 *
 * Diese Datei geht die Akzeptanzkriterien §50–§60 der Aufgabenstellung durch – jedes einmal,
 * in seiner eigenen Formulierung. Was hier grün ist, ist zugesagt.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
const base = () => `/api/v1/households/${family.householdId}`

/** Ein fester Montag – die Woche, in der geplant wird. */
const MONTAG = '2026-04-06'
const tag = (n: number): string =>
  new Date(Date.parse(`${MONTAG}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'essen')
}, 180_000)
afterAll(async () => h.stop())

/** Für Routen, die 204 antworten: kein Rumpf zum Auslesen, aber ein Fehlschlag soll auffallen. */
async function ohneInhalt(session: Parameters<Harness['request']>[0], method: string, url: string, payload?: unknown) {
  const antwort = await h.request(session, method, url, payload)
  if (antwort.statusCode >= 400) throw new Error(`${method} ${url} → ${antwort.statusCode}: ${antwort.body}`)
  return antwort
}

async function gericht(name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const r = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/dishes`, { name, ...extra })
  return r.id
}

async function sammlung(query = '') {
  return h.json<{ items: Record<string, unknown>[] }>(family.anna, 'GET', `${base()}/dishes${query}`)
}

async function woche(start = MONTAG) {
  return h.json<{
    weekStart: string
    days: { date: string; weekday: number; slots: { slot: string; entry: { dishId: string; dishName: string; source: string; suggestionReason: string | null } | null }[] }[]
  }>(family.anna, 'GET', `${base()}/meals/week?start=${start}`)
}

async function plane(datum: string, slot: string, dishId: string) {
  await h.json(family.anna, 'PUT', `${base()}/meals/entry`, { date: datum, slot, dishId })
}

async function raeume(datum: string, slot: string) {
  await h.request(family.anna, 'DELETE', `${base()}/meals/entry?date=${datum}&slot=${slot}`)
}

/** Nach jedem Planungstest die Woche räumen – der Plan ist echter Zustand. */
async function wocheLeeren() {
  const w = await woche()
  for (const t of w.days) {
    for (const s of t.slots) {
      if (s.entry) await raeume(t.date, s.slot)
    }
  }
}

describe('§50 – ein Gericht braucht nur einen Namen', () => {
  it('speichert es und macht es sofort benutzbar', async () => {
    const id = await gericht('Kartoffelauflauf')
    const { items } = await sammlung()
    const gefunden = items.find((d) => d['id'] === id)!
    expect(gefunden['name']).toBe('Kartoffelauflauf')
    expect(gefunden['tags']).toEqual([])
    expect(gefunden['ingredients']).toEqual([])

    // Benutzbar heißt: einplanbar, ohne dass noch etwas fehlt.
    await plane(tag(0), 'dinner', id)
    const w = await woche()
    expect(w.days[0]!.slots.find((s) => s.slot === 'dinner')!.entry!.dishName).toBe('Kartoffelauflauf')
    await wocheLeeren()
  })

  it('weist einen zweiten gleichen Namen ab – „haben wir das schon?" ist die Frage', async () => {
    await gericht('Grünkohl')
    const antwort = await h.request(family.anna, 'POST', `${base()}/dishes`, { name: '  grünkohl ' })
    expect(antwort.statusCode).toBe(409)
  })
})

describe('§51 – Rezeptangaben gehören zum Gericht, nicht neben es', () => {
  it('ergänzt Zutaten und Zubereitung am selben Objekt', async () => {
    const id = await gericht('Spaghetti Bolognese')
    await ohneInhalt(family.anna, 'PATCH', `${base()}/dishes/${id}`, {
      servings: 4,
      cookMinutes: 40,
      steps: 'Zwiebeln anbraten, Hack dazu, köcheln lassen.',
      ingredients: [
        { name: 'Hackfleisch', quantity: 500, unit: 'g' },
        { name: 'Spaghetti', quantity: 500, unit: 'g' },
        { name: 'Parmesan' },
      ],
    })

    const { items } = await sammlung()
    const d = items.find((x) => x['id'] === id)!
    expect(d['servings']).toBe(4)
    expect(d['totalMinutes']).toBe(40)
    expect((d['ingredients'] as unknown[]).length).toBe(3)
    /* Kein zweites Objekt: Die Sammlung hat immer noch genau ein „Spaghetti Bolognese". */
    expect(items.filter((x) => x['name'] === 'Spaghetti Bolognese')).toHaveLength(1)
  })

  it('lässt Zutaten in Ruhe, wenn nur der Name geändert wird', async () => {
    const id = await gericht('Linsencurry', { ingredients: [{ name: 'Linsen', quantity: 250, unit: 'g' }] })
    await ohneInhalt(family.anna, 'PATCH', `${base()}/dishes/${id}`, { name: 'Linsencurry mit Reis' })
    const { items } = await sammlung()
    expect((items.find((x) => x['id'] === id)!['ingredients'] as unknown[]).length).toBe(1)
  })
})

describe('§52 – nach Tags filtern', () => {
  it('zeigt nur, was alle gewählten Tags trägt', async () => {
    await gericht('Ofengemüse', { tags: ['vegetarisch', 'schnell'] })
    await gericht('Schnitzel', { tags: ['Fleisch', 'schnell'] })
    await gericht('Auberginenauflauf', { tags: ['vegetarisch', 'aufwendig'] })

    const { items } = await sammlung('?tags=vegetarisch,schnell')
    const namen = items.map((d) => d['name'])
    expect(namen).toContain('Ofengemüse')
    expect(namen).not.toContain('Schnitzel')
    expect(namen).not.toContain('Auberginenauflauf')
  })

  it('sucht auch in Zutaten – „was mache ich mit den Linsen?"', async () => {
    const { items } = await sammlung('?q=hackfleisch')
    expect(items.map((d) => d['name'])).toContain('Spaghetti Bolognese')
  })
})

describe('§8/§48 – Nutzungszahlen entstehen aus der Planung', () => {
  it('zählt mit, ohne dass jemand etwas pflegt', async () => {
    const id = await gericht('Kürbissuppe')
    const vorher = (await sammlung()).items.find((d) => d['id'] === id)!
    expect(vorher['plannedCount']).toBe(0)
    expect(vorher['lastPlannedOn']).toBeNull()

    /* In der Vergangenheit planen: geplant ist nicht gegessen, gewesen schon. */
    await plane('2026-01-12', 'dinner', id)
    const nachher = (await sammlung()).items.find((d) => d['id'] === id)!
    expect(nachher['plannedCount']).toBe(1)
    expect(nachher['lastPlannedOn']).toBe('2026-01-12')

    await raeume('2026-01-12', 'dinner')
  })
})

describe('§55/§56 – Woche füllen', () => {
  it('füllt freie Plätze', async () => {
    const w = await woche()
    const frei = w.days.flatMap((d) => d.slots.filter((s) => s.entry === null))
    expect(frei.length).toBeGreaterThan(0)

    const ergebnis = await h.json<{ filled: unknown[] }>(family.anna, 'POST', `${base()}/meals/week/fill`, {
      weekStart: MONTAG,
      seed: 1,
    })
    expect(ergebnis.filled.length).toBe(frei.length)

    const nachher = await woche()
    expect(nachher.days.every((d) => d.slots.every((s) => s.entry !== null))).toBe(true)
    await wocheLeeren()
  })

  it('lässt bereits Geplantes unverändert', async () => {
    const chili = await gericht('Chili sin Carne', { tags: ['vegetarisch'] })
    await plane(tag(0), 'dinner', chili)
    await plane(tag(1), 'dinner', chili)

    await h.json(family.anna, 'POST', `${base()}/meals/week/fill`, { weekStart: MONTAG, seed: 2 })

    const w = await woche()
    const montag = w.days.find((d) => d.date === tag(0))!.slots.find((s) => s.slot === 'dinner')!
    const dienstag = w.days.find((d) => d.date === tag(1))!.slots.find((s) => s.slot === 'dinner')!
    expect(montag.entry!.dishId).toBe(chili)
    expect(dienstag.entry!.dishId).toBe(chili)
    expect(montag.entry!.source).toBe('manual')
    await wocheLeeren()
  })

  it('nennt bei jedem Vorschlag einen Grund in Worten', async () => {
    await h.json(family.anna, 'POST', `${base()}/meals/week/fill`, { weekStart: MONTAG, seed: 3 })
    const w = await woche()
    const vorschlaege = w.days.flatMap((d) => d.slots).filter((s) => s.entry?.source === 'suggested')
    expect(vorschlaege.length).toBeGreaterThan(0)
    for (const v of vorschlaege) {
      expect(v.entry!.suggestionReason).toBeTruthy()
      expect(v.entry!.suggestionReason).not.toMatch(/\d+\s?%|score/i)
    }
    await wocheLeeren()
  })
})

describe('§57 – einzelnen Vorschlag neu würfeln', () => {
  it('ändert nur den einen Tag', async () => {
    await h.json(family.anna, 'POST', `${base()}/meals/week/fill`, { weekStart: MONTAG, seed: 4 })
    const vorher = await woche()
    const donnerstag = tag(3)

    /* Erst räumen, dann nur diesen Platz füllen – das ist „anderer Vorschlag". */
    await raeume(donnerstag, 'dinner')
    await h.json(family.anna, 'POST', `${base()}/meals/week/fill`, {
      weekStart: MONTAG,
      only: [{ date: donnerstag, slot: 'dinner' }],
      seed: 77,
    })

    const nachher = await woche()
    for (const t of vorher.days) {
      for (const s of t.slots) {
        if (t.date === donnerstag && s.slot === 'dinner') continue
        const jetzt = nachher.days.find((d) => d.date === t.date)!.slots.find((x) => x.slot === s.slot)!
        expect(jetzt.entry?.dishId, `${t.date} ${s.slot} hat sich geändert`).toBe(s.entry?.dishId)
      }
    }
    await wocheLeeren()
  })
})

describe('§58 – nichts doppelt in einer Woche', () => {
  it('plant jedes Gericht höchstens einmal, solange die Sammlung reicht', async () => {
    await h.json(family.anna, 'POST', `${base()}/meals/week/fill`, { weekStart: MONTAG, seed: 5 })
    const w = await woche()
    const ids = w.days.flatMap((d) => d.slots).map((s) => s.entry!.dishId)
    expect(new Set(ids).size).toBe(ids.length)
    await wocheLeeren()
  })
})

describe('§13 – verschieben und tauschen', () => {
  it('verschiebt auf einen freien Platz', async () => {
    const id = await gericht('Pfannkuchen')
    await plane(tag(0), 'dinner', id)
    await ohneInhalt(family.anna, 'POST', `${base()}/meals/move`, {
      from: { date: tag(0), slot: 'dinner' },
      to: { date: tag(2), slot: 'dinner' },
    })

    const w = await woche()
    expect(w.days.find((d) => d.date === tag(0))!.slots.find((s) => s.slot === 'dinner')!.entry).toBeNull()
    expect(w.days.find((d) => d.date === tag(2))!.slots.find((s) => s.slot === 'dinner')!.entry!.dishId).toBe(id)
    await wocheLeeren()
  })

  it('tauscht, wenn das Ziel belegt ist – statt eines der beiden zu verlieren', async () => {
    const a = await gericht('Fischstäbchen')
    const b = await gericht('Reisgericht')
    await plane(tag(0), 'dinner', a)
    await plane(tag(1), 'dinner', b)

    await ohneInhalt(family.anna, 'POST', `${base()}/meals/move`, {
      from: { date: tag(0), slot: 'dinner' },
      to: { date: tag(1), slot: 'dinner' },
    })

    const w = await woche()
    expect(w.days.find((d) => d.date === tag(0))!.slots.find((s) => s.slot === 'dinner')!.entry!.dishId).toBe(b)
    expect(w.days.find((d) => d.date === tag(1))!.slots.find((s) => s.slot === 'dinner')!.entry!.dishId).toBe(a)
    await wocheLeeren()
  })
})

describe('§12 – Mittagessen ist konfigurierbar', () => {
  it('zeigt standardmäßig nur am Wochenende einen Mittagsplatz', async () => {
    const w = await woche()
    const montag = w.days.find((d) => d.weekday === 1)!
    const samstag = w.days.find((d) => d.weekday === 6)!
    expect(montag.slots.map((s) => s.slot)).toEqual(['dinner'])
    expect(samstag.slots.map((s) => s.slot)).toEqual(['lunch', 'dinner'])
  })

  it('folgt der Einstellung des Haushalts', async () => {
    await ohneInhalt(family.anna, 'PATCH', `${base()}/meals/settings`, { lunchWeekdays: [0, 3, 6] })
    const w = await woche()
    expect(w.days.find((d) => d.weekday === 3)!.slots.map((s) => s.slot)).toEqual(['lunch', 'dinner'])
    await ohneInhalt(family.anna, 'PATCH', `${base()}/meals/settings`, { lunchWeekdays: [0, 6] })
  })

  it('behält ein eingetragenes Mittagessen auch an einem Tag ohne Mittagsplatz (Ferien)', async () => {
    const id = await gericht('Brotzeit')
    await plane(tag(0), 'lunch', id) // Montag – normalerweise kein Mittagsplatz
    const w = await woche()
    const montag = w.days.find((d) => d.date === tag(0))!
    expect(montag.slots.map((s) => s.slot)).toEqual(['lunch', 'dinner'])
    expect(montag.slots.find((s) => s.slot === 'lunch')!.entry!.dishId).toBe(id)
    await wocheLeeren()
  })
})

describe('§59 – Einkaufsliste aus dem Wochenplan', () => {
  it('führt die Zutaten der geplanten Gerichte zusammen', async () => {
    const chili = await gericht('Chili mit Bohnen', {
      servings: 4,
      ingredients: [
        { name: 'Zwiebel', quantity: 2, unit: 'Stück' },
        { name: 'Tomaten', quantity: 2, unit: 'Dose' },
      ],
    })
    const curry = await gericht('Gemüsecurry', {
      servings: 4,
      ingredients: [
        { name: 'Zwiebel', quantity: 3, unit: 'Stück' },
        { name: 'Reis', quantity: 300, unit: 'g' },
      ],
    })
    await plane(tag(0), 'dinner', chili)
    await plane(tag(1), 'dinner', curry)

    const gebaut = await h.json<{ listId: string; items: { name: string; quantity: number | null; unit: string | null }[] }>(
      family.anna,
      'POST',
      `${base()}/meals/shopping/build`,
      { weekStart: MONTAG },
    )
    const zwiebeln = gebaut.items.find((i) => i.name === 'Zwiebel')!
    expect(zwiebeln.quantity).toBe(5)
    expect(gebaut.items.map((i) => i.name)).toContain('Reis')

    /* §36: Die Liste bleibt danach bearbeitbar. */
    const eigen = await h.json<{ id: string }>(
      family.anna,
      'PUT',
      `${base()}/meals/shopping/${gebaut.listId}/items`,
      { name: 'Küchenrolle' },
    )
    expect(eigen.id).toBeTruthy()

    const jetzt = await h.json<{ items: { name: string; origin: string }[] }>(
      family.anna,
      'GET',
      `${base()}/meals/shopping?start=${MONTAG}`,
    )
    expect(jetzt.items.find((i) => i.name === 'Küchenrolle')!.origin).toBe('manual')

    /* Und erneutes Erzeugen wirft die eigene Zeile nicht weg (§36). */
    await h.json(family.anna, 'POST', `${base()}/meals/shopping/build`, { weekStart: MONTAG })
    const danach = await h.json<{ items: { name: string }[] }>(
      family.anna,
      'GET',
      `${base()}/meals/shopping?start=${MONTAG}`,
    )
    expect(danach.items.map((i) => i.name)).toContain('Küchenrolle')
    expect(danach.items.filter((i) => i.name === 'Zwiebel')).toHaveLength(1)

    await wocheLeeren()
  })

  it('lässt eine von Hand geänderte Zeile beim Neuerzeugen stehen', async () => {
    const dish = await gericht('Nudelauflauf', {
      servings: 4,
      ingredients: [{ name: 'Sahne', quantity: 200, unit: 'ml' }],
    })
    await plane(tag(4), 'dinner', dish)
    const gebaut = await h.json<{ listId: string; items: { id: string; name: string }[] }>(
      family.anna,
      'POST',
      `${base()}/meals/shopping/build`,
      { weekStart: MONTAG },
    )
    const sahne = gebaut.items.find((i) => i.name === 'Sahne')!
    await h.json(family.anna, 'PUT', `${base()}/meals/shopping/${gebaut.listId}/items`, {
      id: sahne.id,
      quantity: 400,
    })

    await h.json(family.anna, 'POST', `${base()}/meals/shopping/build`, { weekStart: MONTAG })
    const danach = await h.json<{ items: { name: string; quantity: number | null }[] }>(
      family.anna,
      'GET',
      `${base()}/meals/shopping?start=${MONTAG}`,
    )
    expect(danach.items.find((i) => i.name === 'Sahne')!.quantity, 'die Korrektur wurde überschrieben').toBe(400)
    await wocheLeeren()
  })
})

describe('§60 – heute auf der Familienseite', () => {
  it('gibt das heute Geplante kompakt zurück', async () => {
    const heute = '2026-09-07' // die feste Uhr des Harness
    const id = await gericht('Chili für heute', { cookMinutes: 25 })
    await plane(heute, 'dinner', id)

    const antwort = await h.json<{ today: string; items: { date: string; slot: string; dishName: string; totalMinutes: number | null }[] }>(
      family.anna,
      'GET',
      `${base()}/meals/upcoming?days=2`,
    )
    const heutigesAbendessen = antwort.items.find((i) => i.date === heute && i.slot === 'dinner')!
    expect(heutigesAbendessen.dishName).toBe('Chili für heute')
    expect(heutigesAbendessen.totalMinutes).toBe(25)

    await raeume(heute, 'dinner')
  })
})

describe('§9/§10 – Bewertung je Person', () => {
  it('hält die Stimmen getrennt und niemand bewertet für andere', async () => {
    const id = await gericht('Pizza')
    await ohneInhalt(family.anna, 'PUT', `${base()}/dishes/${id}/preference`, { rating: 'love' })
    await ohneInhalt(family.ben, 'PUT', `${base()}/dishes/${id}/preference`, { rating: 'rather_not' })

    const { items } = await sammlung()
    const stimmen = (items.find((d) => d['id'] === id)!['ratings'] as { rating: string }[])
    expect(stimmen).toHaveLength(2)
    expect(stimmen.map((s) => s.rating).sort()).toEqual(['love', 'rather_not'])
  })

  it('nimmt eine Stimme zurück', async () => {
    const id = await gericht('Sushi')
    await ohneInhalt(family.anna, 'PUT', `${base()}/dishes/${id}/preference`, { rating: 'like' })
    await ohneInhalt(family.anna, 'PUT', `${base()}/dishes/${id}/preference`, { rating: null })
    const { items } = await sammlung()
    expect(items.find((d) => d['id'] === id)!['ratings']).toEqual([])
  })
})

describe('Wofür ein Gericht passt', () => {
  it('bleibt ohne Angabe für beides zuständig', async () => {
    const id = await gericht('Ohne Angabe')
    const { items } = await sammlung()
    expect(items.find((d) => d['id'] === id)!['suitableFor']).toBe('both')
  })

  it('hält ein Mittagsgericht aus den Abendvorschlägen heraus', async () => {
    const nurMittags = await gericht('Nur mittags', { suitableFor: 'lunch' })

    /*
      Ein Wochenplan hat fünf reine Abendplätze. Über mehrere Würfe darf das Mittagsgericht
      an keinem davon auftauchen – auch nicht durch Zufall.
    */
    for (let seed = 0; seed < 5; seed += 1) {
      await h.json(family.anna, 'POST', `${base()}/meals/week/fill`, { weekStart: MONTAG, seed })
      const w = await woche()
      const abends = w.days.flatMap((d) => d.slots.filter((s) => s.slot === 'dinner'))
      expect(abends.map((s) => s.entry?.dishId)).not.toContain(nurMittags)
      await wocheLeeren()
    }
  })

  it('lässt sich nachträglich ändern', async () => {
    const id = await gericht('Wandelbar')
    await ohneInhalt(family.anna, 'PATCH', `${base()}/dishes/${id}`, { suitableFor: 'dinner' })
    const { items } = await sammlung()
    expect(items.find((d) => d['id'] === id)!['suitableFor']).toBe('dinner')
  })

  it('weist eine unbekannte Angabe ab', async () => {
    const antwort = await h.request(family.anna, 'POST', `${base()}/dishes`, {
      name: `Unsinn ${Date.now()}`,
      suitableFor: 'nachts',
    })
    /* 422 wie überall bei einem Wert, den das Vokabular nicht kennt. */
    expect(antwort.statusCode).toBe(422)
  })
})

describe('§29 – ein Gericht von Vorschlägen ausnehmen', () => {
  it('behält es in der Sammlung und lässt es aus den Vorschlägen heraus', async () => {
    const id = await gericht('Rosenkohlauflauf', { excludedFromSuggestions: true })
    const { items } = await sammlung()
    expect(items.map((d) => d['id'])).toContain(id)

    for (let seed = 0; seed < 5; seed += 1) {
      await h.json(family.anna, 'POST', `${base()}/meals/week/fill`, { weekStart: MONTAG, seed })
      const w = await woche()
      expect(w.days.flatMap((d) => d.slots).map((s) => s.entry?.dishId)).not.toContain(id)
      await wocheLeeren()
    }
  })
})

describe('Die Sammlung bleibt erklärbar', () => {
  it('verweigert das Löschen eines Gerichts, das schon auf dem Tisch stand', async () => {
    const id = await gericht('Schon dagewesen')
    await plane('2026-02-02', 'dinner', id)

    const antwort = await h.request(family.anna, 'DELETE', `${base()}/dishes/${id}`)
    expect(antwort.statusCode).toBe(409)
    expect(antwort.body).toContain('Räum es stattdessen weg')

    await raeume('2026-02-02', 'dinner')
  })

  it('löscht ein Gericht, das nie geplant war', async () => {
    const id = await gericht('Nie dagewesen')
    const antwort = await h.request(family.anna, 'DELETE', `${base()}/dishes/${id}`)
    expect(antwort.statusCode).toBe(204)
  })
})
