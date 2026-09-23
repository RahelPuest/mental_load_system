import { describe, expect, it } from 'vitest'
import {
  aggregateIngredients,
  formatQuantity,
  scaleQuantity,
  type PlannedIngredient,
} from '../src/meals/shopping.js'

/**
 * Aus Gerichten wird eine Einkaufsliste (docs/63, §32–§35).
 *
 * Die Leitlinie steht in jedem zweiten Test: **Im Zweifel zwei Zeilen statt einer falschen.**
 * Eine Summe, die nicht stimmt, merkt man erst im Laden – zwei Zeilen sieht man vorher.
 */
function zutat(over: Partial<PlannedIngredient> & { name: string }): PlannedIngredient {
  return {
    quantity: null,
    unit: null,
    dishName: 'Gericht',
    baseServings: null,
    plannedServings: null,
    ...over,
  }
}

describe('§34 – Portionen skalieren', () => {
  it('rechnet von vier auf sechs Portionen hoch', () => {
    expect(scaleQuantity(500, 4, 6)).toBe(750)
  })

  it('lässt die Menge in Ruhe, wenn die Portionszahl gleich ist', () => {
    expect(scaleQuantity(500, 4, 4)).toBe(500)
  })

  it('skaliert nicht, wenn das Rezept keine Portionsangabe hat', () => {
    /*
      Sonst müsste geraten werden, für wie viele es gedacht war – und ein geratener Faktor
      ist im Einkaufswagen teurer als eine Zeile, die man selbst anpasst.
    */
    expect(scaleQuantity(500, null, 6)).toBe(500)
  })

  it('lässt eine Zutat ohne Menge eine Zutat ohne Menge sein', () => {
    expect(scaleQuantity(null, 4, 6)).toBeNull()
  })
})

describe('§35 – zusammenzählen, was zusammengehört', () => {
  it('legt gleiche Zutat mit gleicher Einheit zusammen', () => {
    const liste = aggregateIngredients([
      zutat({ name: 'Zwiebel', quantity: 2, unit: 'Stück', dishName: 'Chili' }),
      zutat({ name: 'Zwiebel', quantity: 3, unit: 'Stück', dishName: 'Curry' }),
    ])
    expect(liste).toHaveLength(1)
    expect(liste[0]).toMatchObject({ name: 'Zwiebel', quantity: 5, unit: 'Stück' })
    expect(liste[0]!.fromDishes).toEqual(['Chili', 'Curry'])
  })

  it('rechnet innerhalb einer Einheitenfamilie um: 500 g und 1 kg sind 1500 g', () => {
    const liste = aggregateIngredients([
      zutat({ name: 'Hackfleisch', quantity: 500, unit: 'g', dishName: 'Bolognese' }),
      zutat({ name: 'Hackfleisch', quantity: 1, unit: 'kg', dishName: 'Chili' }),
    ])
    expect(liste).toHaveLength(1)
    expect(liste[0]).toMatchObject({ quantity: 1500, unit: 'g' })
  })

  it('ignoriert Groß- und Kleinschreibung beim Namen', () => {
    const liste = aggregateIngredients([
      zutat({ name: 'zwiebel', quantity: 1, unit: 'Stück' }),
      zutat({ name: 'Zwiebel', quantity: 1, unit: 'Stück' }),
    ])
    expect(liste).toHaveLength(1)
    expect(liste[0]!.quantity).toBe(2)
  })

  it('legt unbekannte Einheiten nur mit sich selbst zusammen', () => {
    const liste = aggregateIngredients([
      zutat({ name: 'Tomaten', quantity: 2, unit: 'Dose' }),
      zutat({ name: 'Tomaten', quantity: 1, unit: 'Dose' }),
    ])
    expect(liste).toHaveLength(1)
    expect(liste[0]).toMatchObject({ quantity: 3, unit: 'Dose' })
  })
})

describe('§35 – im Zweifel nicht zusammenlegen', () => {
  it('trennt Dosen von Gramm – niemand weiß, wie viel eine Dose wiegt', () => {
    const liste = aggregateIngredients([
      zutat({ name: 'Tomaten', quantity: 2, unit: 'Dose', dishName: 'Chili' }),
      zutat({ name: 'Tomaten', quantity: 400, unit: 'g', dishName: 'Suppe' }),
    ])
    expect(liste).toHaveLength(2)
  })

  it('sagt bei getrennten Zeilen auch, warum – stille Verweigerung wäre schlechter', () => {
    const liste = aggregateIngredients([
      zutat({ name: 'Tomaten', quantity: 2, unit: 'Dose' }),
      zutat({ name: 'Tomaten', quantity: 400, unit: 'g' }),
    ])
    expect(liste.every((z) => z.splitReason !== null)).toBe(true)
    expect(liste[0]!.splitReason).toContain('Einheit')
  })

  it('zählt eine Zutat ohne Menge zu nichts dazu', () => {
    const liste = aggregateIngredients([
      zutat({ name: 'Parmesan', dishName: 'Bolognese' }),
      zutat({ name: 'Parmesan', quantity: 50, unit: 'g', dishName: 'Auflauf' }),
    ])
    expect(liste).toHaveLength(2)
    expect(liste.find((z) => z.quantity === null)!.splitReason).toContain('ohne Mengenangabe')
  })

  it('lässt eine einzelne Zeile ohne Erklärung stehen – es gab nichts zusammenzulegen', () => {
    const liste = aggregateIngredients([zutat({ name: 'Parmesan' })])
    expect(liste[0]!.splitReason).toBeNull()
  })
})

describe('Skalierung und Summe zusammen', () => {
  it('skaliert zuerst und zählt dann zusammen', () => {
    const liste = aggregateIngredients([
      // 4 Portionen Rezept, geplant für 6 → 750 g
      zutat({ name: 'Nudeln', quantity: 500, unit: 'g', baseServings: 4, plannedServings: 6 }),
      // 2 Portionen Rezept, geplant für 2 → unverändert 250 g
      zutat({ name: 'Nudeln', quantity: 250, unit: 'g', baseServings: 2, plannedServings: 2 }),
    ])
    expect(liste[0]!.quantity).toBe(1000)
  })
})

describe('Wie eine Menge dasteht', () => {
  it('schreibt ganze Zahlen ohne Nachkomma', () => {
    expect(formatQuantity(500, 'g')).toBe('500 g')
  })

  it('schreibt Brüche mit Komma und ohne nachlaufende Nullen', () => {
    expect(formatQuantity(1.5, 'kg')).toBe('1,5 kg')
  })

  it('kommt ohne Einheit aus', () => {
    expect(formatQuantity(2, null)).toBe('2')
  })

  it('zeigt bei fehlender Menge nur die Einheit oder nichts', () => {
    expect(formatQuantity(null, null)).toBe('')
  })
})
