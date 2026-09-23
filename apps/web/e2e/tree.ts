import { expect, type Page } from '@playwright/test'

/**
 * Den Bereichsbaum sichern und wiederherstellen.
 *
 * Der Baum ist echter Zustand auf dem Server. Ein Test, der eine Zeile verschiebt und dabei
 * scheitert, hinterlässt den nächsten Lauf in einer anderen Welt – der scheitert dann an
 * etwas, das kein Fehler ist.
 *
 * Wiederhergestellt wird über die Schnittstelle und nicht über die Oberfläche: Aufräumen
 * darf sich nicht auf genau das verlassen, was gerade geprüft wird.
 */
export interface TreeSnapshot {
  items: { id: string; parentId: string | null }[]
}

async function context(page: Page) {
  const householdId = await page.evaluate(() => localStorage.getItem('thealotta.household'))
  const csrf = await page.evaluate(() => document.cookie.match(/(?:^|;\s*)thealotta_csrf=([^;]+)/)?.[1] ??
      '')
  return { base: `/api/v1/households/${householdId}`, headers: { 'x-csrf-token': decodeURIComponent(csrf) } }
}

export async function snapshotTree(page: Page): Promise<TreeSnapshot> {
  const { base } = await context(page)
  const body = (await (await page.request.get(`${base}/domains`)).json()) as TreeSnapshot
  return { items: body.items.map((d) => ({ id: d.id, parentId: d.parentId })) }
}

/** Zwei Aufnahmen sind gleich, wenn Reihenfolge und Elternschaft übereinstimmen. */
const same = (a: TreeSnapshot, b: TreeSnapshot) =>
  a.items.length === b.items.length &&
  a.items.every((item, i) => item.id === b.items[i]?.id && item.parentId === b.items[i]?.parentId)

export async function restoreTree(page: Page, snap: TreeSnapshot): Promise<void> {
  /*
   * Erst nachsehen, dann schreiben.
   *
   * Dreizehn Schreibaufrufe vor und nach jedem Test kosteten die Suite anderthalb Minuten –
   * für Tests, die den Baum gar nicht anfassen. Wer nichts verändert hat, muss nichts
   * zurückstellen.
   */
  if (same(await snapshotTree(page), snap)) return

  const { base, headers } = await context(page)
  /*
   * In der ursprünglichen Reihenfolge, jeweils ans Ende der eigenen Ebene: Weil übergeordnete
   * Bereiche in dieser Reihenfolge vor ihren Unterbereichen stehen, ist die Elternschaft beim
   * Anhängen schon wieder richtig.
   */
  for (const item of snap.items) {
    const res = await page.request.post(`${base}/domains/${item.id}/reposition`, {
      headers,
      data: { parentId: item.parentId, beforeId: null },
    })
    expect(res.status(), `Wiederherstellen von ${item.id} scheiterte: ${await res.text()}`).toBe(200)
  }
}
