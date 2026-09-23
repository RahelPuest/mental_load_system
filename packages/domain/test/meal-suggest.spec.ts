import { describe, expect, it } from 'vitest'
import { baseOf, popularity, suggestMeals, type DishCandidate, type SlotRequest } from '../src/meals/suggest.js'

/**
 * Die Auswahl von Gerichten (docs/63).
 *
 * Geprüft werden **Eigenschaften**, nicht Zahlen: „B kommt deutlich häufiger als A" statt
 * „B hat Gewicht 3,4". Die Gewichte dürfen sich ändern, ohne dass diese Datei falsch wird –
 * die Aussagen darin sind das Versprechen, nicht die Formel.
 *
 * Alle Läufe sind deterministisch: Der Startwert wird übergeben. Ein Test, der mit
 * `Math.random()` arbeitet, ist entweder blind oder gelegentlich rot.
 */
const HEUTE = '2026-03-16' // ein Montag

function gericht(over: Partial<DishCandidate> & { id: string }): DishCandidate {
  return {
    name: over.id,
    tags: [],
    totalMinutes: null,
    excluded: false,
    suitableFor: 'both',
    lastPlannedOn: null,
    plannedCount: 0,
    ratings: [],
    ...over,
  }
}

const tag = (offset: number): string =>
  new Date(Date.parse(`${HEUTE}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10)

const abende = (n: number): SlotRequest[] =>
  Array.from({ length: n }, (_, i) => ({ date: tag(i), slot: 'dinner' as const }))

describe('§53 – was lange nicht dran war, kommt eher', () => {
  it('wählt das seit Monaten nicht Geplante deutlich häufiger als das von gestern', () => {
    const a = gericht({ id: 'gestern', lastPlannedOn: tag(-1), plannedCount: 12 })
    const b = gericht({ id: 'lange-her', lastPlannedOn: '2025-12-10', plannedCount: 12 })

    /*
      Über viele Läufe zählen, nicht einen einzelnen ansehen: Die Auswahl ist eine gewichtete
      Ziehung, kein Ranking. Ein einzelner Lauf darf „gestern" ergeben – auf hundert Läufe
      gesehen darf er es nicht überwiegen.
    */
    let langeHer = 0
    for (let seed = 0; seed < 200; seed += 1) {
      const { suggestions } = suggestMeals([{ date: HEUTE, slot: 'dinner' }], [a, b], {
        mode: 'variety',
        seed,
      })
      if (suggestions[0]?.dishId === 'lange-her') langeHer += 1
    }
    expect(langeHer, `nur ${langeHer} von 200`).toBeGreaterThan(150)
  })

  it('nennt den Grund in Worten, nicht als Punktzahl (§25, §26)', () => {
    const { suggestions } = suggestMeals(
      [{ date: HEUTE, slot: 'dinner' }],
      [gericht({ id: 'alt', lastPlannedOn: '2025-10-01' })],
      { mode: 'variety', seed: 1 },
    )
    expect(suggestions[0]!.reason).toBe('Lange nicht gegessen')
    expect(suggestions[0]!.reason).not.toMatch(/\d+\s*%|[Ss]core/)
  })

  it('behandelt „noch nie geplant" wie „sehr lange her" und sagt das auch so', () => {
    const { suggestions } = suggestMeals(
      [{ date: HEUTE, slot: 'dinner' }],
      [gericht({ id: 'neu' })],
      { mode: 'balanced', seed: 3 },
    )
    expect(suggestions[0]!.reason).toBe('Noch nie geplant')
  })
})

describe('§54 – Beliebtheit erhöht die Chance, ohne alles zu bestimmen', () => {
  it('wählt Beliebtes häufiger', () => {
    const beliebt = gericht({ id: 'beliebt', ratings: ['love', 'love', 'like'], lastPlannedOn: tag(-20) })
    const neutral = gericht({ id: 'neutral', ratings: ['neutral', 'neutral'], lastPlannedOn: tag(-20) })

    let treffer = 0
    for (let seed = 0; seed < 200; seed += 1) {
      const { suggestions } = suggestMeals([{ date: HEUTE, slot: 'dinner' }], [beliebt, neutral], {
        mode: 'favourites',
        seed,
      })
      if (suggestions[0]?.dishId === 'beliebt') treffer += 1
    }
    expect(treffer).toBeGreaterThan(120)
  })

  it('lässt aber auch das Unbeliebtere vorkommen – sonst stünden immer dieselben fünf da', () => {
    const beliebt = gericht({ id: 'beliebt', ratings: ['love', 'love'], lastPlannedOn: tag(-20) })
    const neutral = gericht({ id: 'neutral', ratings: ['neutral'], lastPlannedOn: tag(-20) })

    const gesehen = new Set<string>()
    for (let seed = 0; seed < 200; seed += 1) {
      const { suggestions } = suggestMeals([{ date: HEUTE, slot: 'dinner' }], [beliebt, neutral], {
        mode: 'favourites',
        seed,
      })
      gesehen.add(suggestions[0]!.dishId)
    }
    expect(gesehen.size, 'die Auswahl ist zu einer Rangliste geworden').toBe(2)
  })

  it('zählt ein „eher nicht" doppelt – am Tisch sitzt jemand, der nichts isst', () => {
    expect(popularity(['love', 'love', 'love', 'rather_not'])).toBeLessThan(popularity(['like', 'like']))
  })
})

describe('§58 – keine Wiederholung in derselben Woche', () => {
  it('plant kein Gericht zweimal, solange es genug Alternativen gibt', () => {
    const auswahl = Array.from({ length: 10 }, (_, i) => gericht({ id: `g${i}`, lastPlannedOn: tag(-40) }))
    const { suggestions } = suggestMeals(abende(7), auswahl, { mode: 'balanced', seed: 42 })

    const ids = suggestions.map((s) => s.dishId)
    expect(new Set(ids).size, `doppelt: ${ids.join(', ')}`).toBe(ids.length)
  })

  it('füllt lieber doppelt als gar nicht, wenn die Sammlung zu klein ist', () => {
    /* §58 sagt „ohne guten Grund". Ein leerer Slot ist ein guter Grund. */
    const { suggestions, unfilled } = suggestMeals(abende(4), [gericht({ id: 'einziges' })], {
      mode: 'balanced',
      seed: 7,
    })
    expect(suggestions).toHaveLength(4)
    expect(unfilled).toHaveLength(0)
  })

  it('berücksichtigt, was in dieser Woche schon von Hand steht', () => {
    const auswahl = [gericht({ id: 'a' }), gericht({ id: 'b' })]
    const { suggestions } = suggestMeals([{ date: tag(3), slot: 'dinner' }], auswahl, {
      mode: 'balanced',
      seed: 5,
      alreadyPlanned: [{ date: tag(0), dishId: 'a' }],
    })
    expect(suggestions[0]!.dishId).toBe('b')
  })
})

describe('§19 – nicht vier Nudelgerichte hintereinander', () => {
  it('meidet am Folgetag dieselbe Basis, wenn es Alternativen gibt', () => {
    const nudeln = ['bolognese', 'carbonara', 'lasagne'].map((id) =>
      gericht({ id, tags: ['Nudeln'], lastPlannedOn: tag(-30) }),
    )
    /*
      Mehr Gerichte als Plätze – sonst prüft der Test nichts.

      Bei sieben Gerichten auf sieben Abende ist der letzte Platz zwangsläufig das übrig
      gebliebene Gericht, ähnlich oder nicht. Die Zusage lautet „wenn es Alternativen gibt".
    */
    const andere = ['suppe', 'auflauf', 'salat', 'eintopf'].flatMap((basis) =>
      [1, 2].map((n) =>
        gericht({
          id: `${basis}${n}`,
          tags: [basis.charAt(0).toUpperCase() + basis.slice(1)],
          lastPlannedOn: tag(-30),
        }),
      ),
    )

    const { suggestions } = suggestMeals(abende(7), [...nudeln, ...andere], { mode: 'balanced', seed: 11 })
    const basen = suggestions.map((s) => {
      const d = [...nudeln, ...andere].find((x) => x.id === s.dishId)!
      return baseOf(d)
    })
    for (let i = 1; i < basen.length; i += 1) {
      expect(basen[i], `Tag ${i}: zweimal ${basen[i]} hintereinander`).not.toBe(basen[i - 1])
    }
  })

  it('leitet Ähnlichkeit aus Tags ab, nicht aus dem Namen', () => {
    // „Nudelauflauf" ohne Tag gilt als unähnlich – geraten wird nicht.
    expect(baseOf({ tags: [] })).toBeNull()
    expect(baseOf({ tags: ['vegetarisch', 'nudeln'] })).toBe('nudeln')
  })
})

describe('§20/§21 – Filter und Tagesregeln', () => {
  it('lässt nur passende Gerichte zu', () => {
    const veg = gericht({ id: 'veg', tags: ['vegetarisch'] })
    const fleisch = gericht({ id: 'fleisch', tags: ['Fleisch'] })
    const { suggestions } = suggestMeals(abende(3), [veg, fleisch], {
      mode: 'balanced',
      seed: 2,
      requireTags: ['vegetarisch'],
    })
    expect(suggestions.every((s) => s.dishId === 'veg')).toBe(true)
  })

  it('wendet eine Tagesregel nur auf ihren Wochentag an', () => {
    const schnell = gericht({ id: 'schnell', totalMinutes: 20 })
    const lang = gericht({ id: 'lang', totalMinutes: 120 })
    const { suggestions } = suggestMeals(
      [
        { date: tag(0), slot: 'dinner' }, // Montag
        { date: tag(5), slot: 'dinner' }, // Samstag
      ],
      [schnell, lang],
      {
        mode: 'balanced',
        seed: 4,
        dayRules: [{ weekday: 1, slot: null, maxMinutes: 30, requireTags: [], excludeTags: [] }],
      },
    )
    expect(suggestions.find((s) => s.date === tag(0))!.dishId).toBe('schnell')
  })

  it('schließt ein Gericht ohne Zeitangabe nicht durch eine Zeitgrenze aus (§6)', () => {
    const ohneZeit = gericht({ id: 'ohne-zeit' })
    const { suggestions, unfilled } = suggestMeals([{ date: HEUTE, slot: 'dinner' }], [ohneZeit], {
      mode: 'balanced',
      seed: 1,
      maxMinutes: 20,
    })
    expect(unfilled, 'die Pflegelücke wird bestraft statt das Gericht').toHaveLength(0)
    expect(suggestions[0]!.dishId).toBe('ohne-zeit')
  })

  it('sagt, wenn nichts passt – statt still einen leeren Platz zu lassen', () => {
    const { suggestions, unfilled } = suggestMeals(
      [{ date: HEUTE, slot: 'dinner' }],
      [gericht({ id: 'fleisch', tags: ['Fleisch'] })],
      { mode: 'balanced', seed: 1, requireTags: ['vegan'] },
    )
    expect(suggestions).toHaveLength(0)
    expect(unfilled[0]!.reason).toContain('Kein Gericht passt')
  })
})

describe('Wofür ein Gericht passt', () => {
  it('schlägt ein Mittagsgericht abends nicht vor', () => {
    const { suggestions, unfilled } = suggestMeals(
      [{ date: HEUTE, slot: 'dinner' }],
      [gericht({ id: 'pfannkuchen', suitableFor: 'lunch' })],
      { mode: 'balanced', seed: 1 },
    )
    expect(suggestions).toHaveLength(0)
    expect(unfilled).toHaveLength(1)
  })

  it('schlägt es mittags sehr wohl vor', () => {
    const { suggestions } = suggestMeals(
      [{ date: HEUTE, slot: 'lunch' }],
      [gericht({ id: 'pfannkuchen', suitableFor: 'lunch' })],
      { mode: 'balanced', seed: 1 },
    )
    expect(suggestions[0]!.dishId).toBe('pfannkuchen')
  })

  it('lässt „beides" überall zu – das ist die Voreinstellung (§6)', () => {
    for (const slot of ['lunch', 'dinner'] as const) {
      const { suggestions } = suggestMeals([{ date: HEUTE, slot }], [gericht({ id: 'chili' })], {
        mode: 'balanced',
        seed: 1,
      })
      expect(suggestions[0]!.dishId, `${slot} leer geblieben`).toBe('chili')
    }
  })

  it('wählt in einer Woche je Mahlzeit aus dem passenden Vorrat', () => {
    const mittags = ['suppe', 'brotzeit'].map((id) => gericht({ id, suitableFor: 'lunch' }))
    const abends = ['chili', 'auflauf', 'curry'].map((id) => gericht({ id, suitableFor: 'dinner' }))
    const slots: SlotRequest[] = [
      { date: tag(0), slot: 'lunch' },
      { date: tag(0), slot: 'dinner' },
      { date: tag(1), slot: 'lunch' },
      { date: tag(1), slot: 'dinner' },
    ]
    const { suggestions, unfilled } = suggestMeals(slots, [...mittags, ...abends], {
      mode: 'balanced',
      seed: 8,
    })
    expect(unfilled).toHaveLength(0)
    for (const v of suggestions) {
      const passend = v.slot === 'lunch' ? mittags : abends
      expect(passend.map((d) => d.id), `${v.slot} bekam ein fremdes Gericht`).toContain(v.dishId)
    }
  })
})

describe('§29 – ausgeschlossene Gerichte', () => {
  it('schlägt ein ausgeschlossenes Gericht nie vor, auch wenn es das einzige wäre', () => {
    const { suggestions, unfilled } = suggestMeals(
      [{ date: HEUTE, slot: 'dinner' }],
      [gericht({ id: 'nie', excluded: true })],
      { mode: 'balanced', seed: 1 },
    )
    expect(suggestions).toHaveLength(0)
    expect(unfilled).toHaveLength(1)
  })
})

describe('§31 – Jahreszeit verschiebt, sie schließt nicht aus', () => {
  it('bevorzugt im Winter ein Wintergericht', () => {
    const winter = gericht({ id: 'kuerbis', tags: ['Winter'], lastPlannedOn: tag(-30) })
    const sommer = gericht({ id: 'grillen', tags: ['Sommer'], lastPlannedOn: tag(-30) })

    let treffer = 0
    for (let seed = 0; seed < 200; seed += 1) {
      const { suggestions } = suggestMeals([{ date: '2026-01-15', slot: 'dinner' }], [winter, sommer], {
        mode: 'balanced',
        seed,
      })
      if (suggestions[0]?.dishId === 'kuerbis') treffer += 1
    }
    expect(treffer).toBeGreaterThan(130)
  })

  it('schließt das Gericht der falschen Jahreszeit aber nicht aus', () => {
    const gesehen = new Set<string>()
    const winter = gericht({ id: 'kuerbis', tags: ['Winter'] })
    const sommer = gericht({ id: 'grillen', tags: ['Sommer'] })
    for (let seed = 0; seed < 200; seed += 1) {
      const { suggestions } = suggestMeals([{ date: '2026-01-15', slot: 'dinner' }], [winter, sommer], {
        mode: 'balanced',
        seed,
      })
      gesehen.add(suggestions[0]!.dishId)
    }
    expect(gesehen.size).toBe(2)
  })
})

describe('Wiederholbarkeit', () => {
  it('liefert bei gleichem Startwert dasselbe Ergebnis', () => {
    const auswahl = Array.from({ length: 8 }, (_, i) => gericht({ id: `g${i}` }))
    const a = suggestMeals(abende(5), auswahl, { mode: 'balanced', seed: 99 })
    const b = suggestMeals(abende(5), auswahl, { mode: 'balanced', seed: 99 })
    expect(a).toEqual(b)
  })

  it('und bei anderem Startwert ein anderes – sonst wäre „nochmal würfeln" wirkungslos', () => {
    const auswahl = Array.from({ length: 8 }, (_, i) => gericht({ id: `g${i}` }))
    const ergebnisse = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        suggestMeals([{ date: HEUTE, slot: 'dinner' }], auswahl, { mode: 'balanced', seed })
          .suggestions[0]!.dishId,
      ),
    )
    expect(ergebnisse.size).toBeGreaterThan(1)
  })
})
