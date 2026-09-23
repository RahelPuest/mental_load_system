import { describe, expect, it } from 'vitest'
import { planDrop, subtreeIds, isNoOp, type DragRow } from '../src/lib/tree-drag.js'

/**
 * Wohin ein gezogener Bereich fällt.
 *
 * Ein Baum, der beim Loslassen woanders landet als angezeigt, ist schwer zu bemerken und noch
 * schwerer zu erklären. Deshalb steht die Rechnung getrennt von Zeigergesten – hier lässt sie
 * sich auf jede Stelle des Baums ansetzen, ohne etwas zu ziehen.
 *
 * Der Testbaum (Zeilenhöhe 40, Einrückung 24):
 *
 *   0  Familie          depth 0   y   0
 *   1    Urlaube        depth 1   y  40
 *   2    Reisen         depth 1   y  80
 *   3  Haushalt         depth 0   y 120
 *   4    Wäsche         depth 1   y 160
 */
const H = 40
const INDENT = 24
const TREE: DragRow[] = [
  { id: 'familie', depth: 0, top: 0, height: H },
  { id: 'urlaube', depth: 1, top: 40, height: H },
  { id: 'reisen', depth: 1, top: 80, height: H },
  { id: 'haushalt', depth: 0, top: 120, height: H },
  { id: 'waesche', depth: 1, top: 160, height: H },
]

/*
  Drei Stellen je Zeile, seit es zwei Gesten gibt (docs/76):

    oberes Drittel  → die Lücke *vor* dieser Zeile
    Mitte           → *hinein* in diese Zeile
    unteres Drittel → die Lücke *danach*

  Vorher entschied allein die Mitte der Zeile zwischen davor und danach. Diese Tests standen
  deshalb auf `middleOf(i) - 1`; genau dort liegt jetzt das Hineinziehen.
*/
/** Mitte der Zeile – dort zieht man **hinein**. */
const intoRow = (i: number) => TREE[i]!.top + H / 2
/** Oberes Drittel: die Lücke *vor* dieser Zeile. */
const above = (i: number) => TREE[i]!.top + 2
/** Unteres Drittel: die Lücke *nach* dieser Zeile. */
const below = (i: number) => TREE[i]!.top + H - 2

describe('subtreeIds', () => {
  it('nimmt den Bereich und alles darunter', () => {
    expect([...subtreeIds(TREE, 'familie')]).toEqual(['familie', 'urlaube', 'reisen'])
  })

  it('ein Blatt ist nur es selbst', () => {
    expect([...subtreeIds(TREE, 'waesche')]).toEqual(['waesche'])
  })
})

describe('planDrop', () => {
  it('setzt vor den Nachbarn, über dem der Zeiger steht', () => {
    const plan = planDrop(TREE, 'waesche', above(2), 0, INDENT)
    expect(plan).toMatchObject({ depth: 1, parentId: 'familie', beforeId: 'reisen' })
  })

  it('waagerechtes Ziehen hebt eine Ebene an', () => {
    // Zwischen „Reisen" und „Haushalt": erlaubt sind Ebene 0 und 1.
    expect(planDrop(TREE, 'waesche', above(3), 0, INDENT)).toMatchObject({ depth: 1, parentId: 'familie' })
    expect(planDrop(TREE, 'waesche', above(3), -INDENT, INDENT)).toMatchObject({ depth: 0, parentId: null })
  })

  it('tiefer als eine Stufe unter die Zeile darüber geht nicht', () => {
    // „Familie" liegt auf 0, also ist unter ihr höchstens Ebene 1 möglich – auch wenn man
    // weit nach rechts zieht.
    const plan = planDrop(TREE, 'waesche', above(1), 10 * INDENT, INDENT)
    expect(plan?.depth).toBe(1)
  })

  it('macht die Zeile darunter nicht zur Waise', () => {
    /*
     * Vor „Urlaube" (Ebene 1) darf nichts auf Ebene 0 stehen: „Urlaube" hätte sonst keinen
     * übergeordneten Bereich mehr über sich.
     */
    const plan = planDrop(TREE, 'waesche', above(1), -10 * INDENT, INDENT)
    expect(plan?.depth).toBe(1)
  })

  it('am Ende der Liste bleibt kein Nachbar übrig', () => {
    const plan = planDrop(TREE, 'urlaube', 10_000, 0, INDENT)
    expect(plan).toMatchObject({ beforeId: null })
  })

  it('ein Bereich kann nicht in seinen eigenen Unterbereich fallen', () => {
    /*
     * „Familie" wird gezogen; „Urlaube" und „Reisen" verschwinden dabei aus der Liste der
     * möglichen Nachbarn. Der Zeiger steht auf deren früherer Stelle – das Ziel muss trotzdem
     * außerhalb des eigenen Teilbaums liegen.
     */
    const plan = planDrop(TREE, 'familie', above(1), INDENT, INDENT)
    expect(plan?.parentId, 'Familie landet unter sich selbst').not.toBe('familie')
    expect(['urlaube', 'reisen']).not.toContain(plan?.parentId)
  })

  it('ohne passende Zeile darüber gibt es diese Ebene nicht', () => {
    // Ganz oben kann nichts eingerückt werden – es gibt niemanden, unter den es rutschen könnte.
    expect(planDrop(TREE, 'waesche', -100, 3 * INDENT, INDENT)).toMatchObject({ depth: 0, parentId: null })
  })
})

/**
 * Die zweite Geste: mitten auf eine Zeile ziehen (docs/76).
 *
 * Bis dahin ging „unter einen anderen Bereich hängen" nur über „direkt darunter schieben und
 * dann nach rechts" – eine Bewegung, die man kennen muss, und die nur für die Zeile
 * unmittelbar darüber funktioniert. Wer einen Bereich auf einen anderen zog, sah nichts.
 */
describe('planDrop – hinein', () => {
  it('mitten auf eine Zeile heißt: wird ihr Unterbereich', () => {
    const plan = planDrop(TREE, 'waesche', intoRow(0), 0, INDENT)
    expect(plan).toMatchObject({ depth: 1, parentId: 'familie', intoId: 'familie' })
  })

  it('auch ohne jede waagerechte Bewegung – das ist der Punkt', () => {
    expect(planDrop(TREE, 'waesche', intoRow(0), 0, INDENT)?.parentId).toBe('familie')
  })

  it('landet hinter den vorhandenen Unterbereichen, nicht davor', () => {
    /*
      Wer etwas in einen Bereich zieht, fügt hinzu. „Familie" hat schon „Urlaube" und
      „Reisen"; die waren vorher da und bleiben oben.
    */
    const plan = planDrop(TREE, 'waesche', intoRow(0), 0, INDENT)
    expect(plan?.beforeId, 'es drängelt sich vor die vorhandenen').toBeNull()
    expect(plan?.index, 'die Marke steht nicht hinter dem Teilbaum').toBe(3)
  })

  it('in den eigenen Teilbaum geht es nicht', () => {
    // „Urlaube" und „Reisen" sind beim Ziehen von „Familie" gar nicht in der Liste.
    const plan = planDrop(TREE, 'familie', intoRow(1), 0, INDENT)
    expect(plan?.intoId).not.toBe('urlaube')
    expect(plan?.parentId).not.toBe('familie')
  })

  it('an den Rändern derselben Zeile wird weiterhin einsortiert', () => {
    expect(planDrop(TREE, 'waesche', above(0), 0, INDENT), 'oben').toMatchObject({ intoId: null, index: 0 })
    expect(planDrop(TREE, 'waesche', below(0), 0, INDENT), 'unten').toMatchObject({ intoId: null })
  })
})

describe('isNoOp', () => {
  it('erkennt den Zug, der nichts ändert', () => {
    const plan = planDrop(TREE, 'urlaube', above(2), 0, INDENT)!
    expect(plan.beforeId).toBe('reisen')
    expect(isNoOp(plan, TREE, 'urlaube', 'familie'), 'Urlaube steht dort schon').toBe(true)
  })

  it('eine andere Ebene ist nie ein Nullzug', () => {
    /*
     * Vor „Haushalt" – dort ist Ebene 0 zulässig, weil darunter ohnehin ein Bereich auf
     * Ebene 0 folgt. (Eine Zeile weiter oben wäre dasselbe Ziehen wirkungslos: „Reisen"
     * stünde darunter und dürfte nicht zur Waise werden. Das prüft der Test oben.)
     */
    const plan = planDrop(TREE, 'urlaube', above(3), -INDENT, INDENT)!
    expect(plan).toMatchObject({ depth: 0, parentId: null })
    expect(isNoOp(plan, TREE, 'urlaube', 'familie')).toBe(false)
  })

  it('ein neuer Nachbar ist eine Änderung', () => {
    const plan = planDrop(TREE, 'reisen', above(1), 0, INDENT)!
    expect(plan.beforeId).toBe('urlaube')
    expect(isNoOp(plan, TREE, 'reisen', 'familie')).toBe(false)
  })
})
