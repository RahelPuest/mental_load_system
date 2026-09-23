import { dishIngredients, dishTags, dishes, mealPlanEntries, uuidv7, type Tx } from '@thealotta/db'

/**
 * Die Essensplanung des Demohaushalts (docs/63).
 *
 * Eigene Datei, damit sie zweimal benutzbar ist: beim Anlegen eines neuen Demohaushalts und
 * beim Nachrüsten eines bestehenden. Zwei Kopien derselben Liste würden auseinanderlaufen –
 * und dann zeigte der Demohaushalt etwas anderes als das, was der Test erwartet.
 */
export async function seedMeals(
  tx: Tx,
  householdId: string,
  annaMembership: string,
  benMembership: string,
): Promise<void> {
  /*
    Essensplanung (docs/63).

    Eine Sammlung, die einen Wochenplan trägt: gut ein Dutzend Gerichte, davon einige mit
    Zutaten und einige ohne. Der Mix ist Absicht – „Brotzeit" und „Pizza bestellen" sind
    vollwertige Einträge (§4), und ein Demohaushalt, in dem jedes Gericht durchgepflegt ist,
    zeigt genau den Zustand nicht, in dem echte Sammlungen leben.
  */
  const GERICHTE: {
    name: string
    tags: string[]
    /** Wofür es passt. Fehlt es, gilt „beides" – die Voreinstellung. */
    passt?: 'lunch' | 'dinner'
    servings?: number
    prep?: number
    cook?: number
    zutaten?: [string, number | null, string | null][]
  }[] = [
    {
      name: 'Spaghetti Bolognese',
      tags: ['Nudeln', 'Fleisch', 'italienisch', 'alle mögen es'],
      servings: 4,
      prep: 10,
      cook: 30,
      zutaten: [
        ['Hackfleisch', 500, 'g'],
        ['Spaghetti', 500, 'g'],
        ['Tomaten', 2, 'Dose'],
        ['Zwiebel', 1, 'Stück'],
        ['Knoblauchzehe', 2, 'Stück'],
        ['Parmesan', null, null],
      ],
    },
    {
      name: 'Chili sin Carne',
      tags: ['vegetarisch', 'Eintopf', 'mexikanisch', 'gut vorzubereiten'],
      servings: 4,
      prep: 15,
      cook: 30,
      zutaten: [
        ['Kidneybohnen', 2, 'Dose'],
        ['Mais', 1, 'Dose'],
        ['Tomaten', 2, 'Dose'],
        ['Zwiebel', 1, 'Stück'],
        ['Paprika', 2, 'Stück'],
        ['Reis', 300, 'g'],
      ],
    },
    {
      name: 'Kartoffelsuppe',
      tags: ['Suppe', 'deutsch', 'Herbst', 'gut vorzubereiten'],
      servings: 4,
      prep: 15,
      cook: 30,
      zutaten: [
        ['Kartoffeln', 1, 'kg'],
        ['Möhren', 3, 'Stück'],
        ['Lauch', 1, 'Stück'],
        ['Gemüsebrühe', null, null],
      ],
    },
    {
      name: 'Pfannkuchen',
      tags: ['vegetarisch', 'schnell', 'Kinder mögen es'],
      servings: 4,
      prep: 10,
      cook: 20,
      zutaten: [
        ['Mehl', 300, 'g'],
        ['Milch', 500, 'ml'],
        ['Eier', 4, 'Stück'],
      ],
    },
    {
      name: 'Linsencurry',
      tags: ['vegan', 'Reis', 'asiatisch', 'gut vorzubereiten'],
      servings: 4,
      prep: 10,
      cook: 25,
      zutaten: [
        ['Rote Linsen', 300, 'g'],
        ['Kokosmilch', 400, 'ml'],
        ['Zwiebel', 1, 'Stück'],
        ['Reis', 250, 'g'],
      ],
    },
    {
      name: 'Ofengemüse mit Feta',
      tags: ['vegetarisch', 'Auflauf', 'mediterran', 'Sommer'],
      servings: 4,
      prep: 15,
      cook: 35,
      zutaten: [
        ['Zucchini', 2, 'Stück'],
        ['Paprika', 2, 'Stück'],
        ['Kartoffeln', 800, 'g'],
        ['Feta', 200, 'g'],
      ],
    },
    {
      name: 'Fischstäbchen mit Kartoffelpüree',
      tags: ['Fisch', 'Kartoffeln', 'schnell', 'Kinder mögen es'],
      servings: 4,
      prep: 5,
      cook: 20,
      zutaten: [
        ['Fischstäbchen', 15, 'Stück'],
        ['Kartoffeln', 1, 'kg'],
        ['Milch', 200, 'ml'],
      ],
    },
    {
      name: 'Nudeln mit Tomatensoße',
      tags: ['Nudeln', 'vegetarisch', 'sehr schnell', 'wenig Energie'],
      servings: 4,
      prep: 5,
      cook: 15,
      zutaten: [
        ['Nudeln', 500, 'g'],
        ['Passierte Tomaten', 700, 'g'],
      ],
    },
    {
      name: 'Kürbissuppe',
      tags: ['vegetarisch', 'Suppe', 'Herbst'],
      servings: 4,
      prep: 15,
      cook: 25,
      zutaten: [
        ['Hokkaido', 1, 'Stück'],
        ['Kokosmilch', 400, 'ml'],
        ['Ingwer', null, null],
      ],
    },
    {
      name: 'Gemüseauflauf',
      tags: ['vegetarisch', 'Auflauf', 'aufwendig', 'Wochenende'],
      servings: 4,
      prep: 25,
      cook: 40,
      zutaten: [
        ['Brokkoli', 500, 'g'],
        ['Sahne', 200, 'ml'],
        ['Käse', 150, 'g'],
      ],
    },
    /* Gerichte ohne Zutaten – vollwertig, aber ohne Einkauf (§4). */
    { name: 'Brotzeit', tags: ['sehr schnell', 'Brot', 'wenig Energie'], passt: 'dinner' },
    { name: 'Pizza bestellen', tags: ['sehr schnell', 'Wochenende'] },
    { name: 'Reste', tags: ['Resteverwertung', 'sehr schnell'] },
    { name: 'Bei Oma essen', tags: ['Wochenende'] },
  ]

  const dishIdByName = new Map<string, string>()
  for (const g of GERICHTE) {
    const dishId = uuidv7()
    dishIdByName.set(g.name, dishId)
    await tx.insert(dishes).values({
      id: dishId,
      householdId,
      name: g.name,
      servings: g.servings ?? null,
      prepMinutes: g.prep ?? null,
      cookMinutes: g.cook ?? null,
      createdBy: annaMembership,
    })
    await tx
      .insert(dishTags)
      .values(g.tags.map((tag) => ({ id: uuidv7(), householdId, dishId, tag })))
    if (g.zutaten) {
      await tx.insert(dishIngredients).values(
        g.zutaten.map(([name, menge, einheit], position) => ({
          id: uuidv7(),
          householdId,
          dishId,
          position,
          name,
          quantity: menge === null ? null : String(menge),
          unit: einheit,
        })),
      )
    }
  }

  const heute = new Date()
  const montag = new Date(heute.getTime() - ((heute.getUTCDay() + 6) % 7) * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const plusTage = (iso: string, n: number) =>
    new Date(Date.parse(`${iso}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10)

  /*
    Eine Vergangenheit, damit „lange nicht gegessen" etwas zu sagen hat.

    Ohne sie wären alle Gerichte gleich alt, und der Unterschied zwischen den
    Vorschlagsarten wäre im Demohaushalt nicht zu sehen.

    Gezählt wird ab **Montag dieser Woche**, nicht ab heute: Ein Abstand von drei Tagen ab
    Mittwoch läge sonst in der laufenden Woche und kollidierte mit den zwei Abenden, die
    unten geplant werden – ein Platz je Tag und Mahlzeit, und das zu Recht.
  */
  const vorTagen = (n: number) => plusTage(montag, -n)
  const VERGANGEN: [string, number][] = [
    ['Nudeln mit Tomatensoße', 2],
    ['Brotzeit', 5],
    ['Spaghetti Bolognese', 9],
    ['Pfannkuchen', 12],
    ['Fischstäbchen mit Kartoffelpüree', 16],
    ['Chili sin Carne', 23],
    ['Pizza bestellen', 26],
    ['Kartoffelsuppe', 40],
    ['Linsencurry', 55],
    ['Gemüseauflauf', 80],
  ]
  for (const [name, tage] of VERGANGEN) {
    await tx.insert(mealPlanEntries).values({
      id: uuidv7(),
      householdId,
      onDate: vorTagen(tage),
      slot: 'dinner',
      dishId: dishIdByName.get(name)!,
      createdBy: annaMembership,
    })
  }

  /* Und zwei Abende in dieser Woche, damit der Plan nicht leer aufgeht. */
  await tx.insert(mealPlanEntries).values([
    {
      id: uuidv7(),
      householdId,
      onDate: plusTage(montag, 0),
      slot: 'dinner',
      dishId: dishIdByName.get('Kürbissuppe')!,
      createdBy: annaMembership,
    },
    {
      id: uuidv7(),
      householdId,
      onDate: plusTage(montag, 3),
      slot: 'dinner',
      dishId: dishIdByName.get('Ofengemüse mit Feta')!,
      createdBy: benMembership,
    },
  ])
}
