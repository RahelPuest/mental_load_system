/**
 * Wohin ein gezogener Bereich fällt.
 *
 * Beim Ziehen in einem Baum sagt die senkrechte Bewegung, *zwischen welche* Zeilen etwas
 * soll, und die waagerechte, *auf welcher Ebene*. Beides zusammen ergibt genau ein Ziel:
 * ein übergeordneter Bereich und ein Nachbar, vor dem der gezogene stehen soll.
 *
 * Diese Rechnung steht bewusst getrennt von Zeigergesten und Bildschirmkoordinaten. Sie ist
 * der Ort, an dem sich Fehler verstecken – ein Baum, der beim Loslassen woanders landet als
 * angezeigt, ist schwer zu bemerken und noch schwerer zu erklären.
 */

export interface DragRow {
  id: string
  /** 0 für oberste Ebene. */
  depth: number
  /** Obere Kante und Höhe in Seitenkoordinaten. */
  top: number
  height: number
}

export interface DropPlan {
  /** Lücke zwischen den Zeilen, gezählt in der Liste ohne den gezogenen Teilbaum. */
  index: number
  depth: number
  parentId: string | null
  beforeId: string | null
  /**
   * Gesetzt, wenn der Zeiger mitten auf einer Zeile steht: Dann geht es **in** diesen Bereich
   * hinein. Die Oberfläche hebt ihn hervor, statt nur eine Linie zu zeichnen – eine Linie
   * zwischen zwei Zeilen und „wird Unterbereich von" sind zwei verschiedene Aussagen.
   */
  intoId: string | null
}

/** Ein Bereich und alles darunter – dorthin kann er nicht fallen. */
export function subtreeIds(rows: readonly DragRow[], id: string): Set<string> {
  const start = rows.findIndex((r) => r.id === id)
  if (start < 0) return new Set()
  const out = new Set([id])
  for (let i = start + 1; i < rows.length && rows[i]!.depth > rows[start]!.depth; i += 1) {
    out.add(rows[i]!.id)
  }
  return out
}

/**
 * Das Ziel für eine Zeigerposition.
 *
 * `pointerY` ist die Position in derselben Koordinate wie `top`. `dx` ist die waagerechte
 * Strecke seit dem Aufnehmen; je `indentPx` verschiebt sich die Zielebene um eine Stufe.
 *
 * **Zwei Gesten, nicht eine** (docs/76):
 *
 *   – Nahe an der *Kante* zwischen zwei Zeilen heißt: dazwischen einsortieren. Die Ebene
 *     ergibt sich dann aus den Nachbarn und aus `dx`.
 *   – *Mitten auf* einer Zeile heißt: in diesen Bereich hinein, als sein Unterbereich.
 *
 * Bis dahin gab es nur die erste. Einen Bereich unter einen anderen zu hängen ging damit
 * ausschließlich über „direkt darunter schieben und dann nach rechts" – eine Bewegung, die
 * man kennen muss, und die nur für die Zeile *unmittelbar darüber* funktioniert. Wer einen
 * Bereich auf einen anderen zog, sah nichts passieren; das ist die Geste, die alle kennen.
 *
 * Gibt `null` zurück, wenn der Zug nichts ändern würde – dann muss auch nichts angezeigt und
 * nichts gesendet werden.
 */
export function planDrop(
  rows: readonly DragRow[],
  draggedId: string,
  pointerY: number,
  dx: number,
  indentPx: number,
): DropPlan | null {
  const dragged = rows.find((r) => r.id === draggedId)
  if (!dragged) return null

  const hidden = subtreeIds(rows, draggedId)
  const rest = rows.filter((r) => !hidden.has(r.id))

  /*
    Die Zeile unter dem Zeiger, und wo darin.

    Die Zeile zerfällt in Drittel: oberes Drittel „davor", unteres „danach", mittleres
    „hinein". Ein halb so breites Band wäre am Finger nicht sicher zu treffen; ein breiteres
    ginge auf Kosten des Sortierens, und das ist die häufigere Handlung.
  */
  const treffer = rest.findIndex((r) => pointerY >= r.top && pointerY < r.top + r.height)
  if (treffer >= 0) {
    const zeile = rest[treffer]!
    const anteil = (pointerY - zeile.top) / zeile.height
    if (anteil > 1 / 3 && anteil < 2 / 3) {
      /*
        Hinein: ans Ende der Kinder dieser Zeile. Nicht an den Anfang – wer etwas in einen
        Bereich zieht, fügt hinzu; die vorhandenen Kinder waren vorher da und bleiben oben.
      */
      let ende = treffer + 1
      while (ende < rest.length && rest[ende]!.depth > zeile.depth) ende += 1
      return { index: ende, depth: zeile.depth + 1, parentId: zeile.id, beforeId: null, intoId: zeile.id }
    }
  }

  // Die Lücke: wie viele der übrigen Zeilen liegen mit ihrer Mitte oberhalb des Zeigers.
  let index = rest.length
  for (const [i, row] of rest.entries()) {
    if (pointerY < row.top + row.height / 2) {
      index = i
      break
    }
  }

  const previous = rest[index - 1]
  const next = rest[index]

  /*
   * Die zulässigen Ebenen ergeben sich aus den Nachbarn:
   *  – höchstens eine Stufe tiefer als die Zeile darüber (sonst hinge man in der Luft),
   *  – mindestens so tief wie die Zeile darunter (sonst würde sie zur Waise, weil ihr
   *    übergeordneter Bereich plötzlich unter ihr stünde).
   */
  const maxDepth = previous ? previous.depth + 1 : 0
  const minDepth = next ? next.depth : 0
  const wanted = dragged.depth + Math.round(dx / indentPx)
  const depth = Math.max(minDepth, Math.min(maxDepth, wanted))

  // Der übergeordnete Bereich ist der nächste Vorfahre oberhalb auf `depth - 1`.
  let parentId: string | null = null
  if (depth > 0) {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (rest[i]!.depth === depth - 1) {
        parentId = rest[i]!.id
        break
      }
    }
    // Keine passende Zeile darüber: Diese Ebene gibt es hier nicht.
    if (!parentId) return null
  }

  // Vor den Nachbarn darunter – aber nur, wenn der auf derselben Ebene liegt. Sonst ans Ende.
  const beforeId = next && next.depth === depth ? next.id : null

  return { index, depth, parentId, beforeId, intoId: null }
}

/**
 * Ob der Plan etwas ändert.
 *
 * Ein Zug, der die Zeile dort ablegt, wo sie schon war, soll nichts senden – sonst schreibt
 * jedes versehentliche Antippen eine Änderung ins Protokoll.
 */
export function isNoOp(
  plan: DropPlan,
  rows: readonly DragRow[],
  draggedId: string,
  currentParentId: string | null,
): boolean {
  if (plan.parentId !== currentParentId) return false

  // Der Nachbar, vor dem die Zeile jetzt schon steht – ohne den eigenen Teilbaum gerechnet.
  const hidden = subtreeIds(rows, draggedId)
  const dragIndex = rows.findIndex((r) => r.id === draggedId)
  const currentBefore = rows.slice(dragIndex + 1).find((r) => !hidden.has(r.id) && r.depth === plan.depth)

  return (plan.beforeId ?? null) === (currentBefore?.id ?? null)
}
