import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Bereiche ändern, archivieren, löschen.
 *
 * Der heikle Teil ist der Pfad: Er steckt im Bereich und in jedem seiner Nachkommen. Wird er
 * beim Umbenennen oder Verschieben nicht mitgezogen, hängt ein halber Baum an einem Namen,
 * den es nicht mehr gibt – sichtbar erst irgendwann später und dann schwer zuzuordnen.
 *
 * Der zweite heikle Teil ist das Löschen. Jeder Fremdschlüssel auf `domains` steht auf
 * RESTRICT, die Datenbank verweigert es also ohnehin. Hier wird geprüft, dass daraus ein
 * Satz wird und kein Datenbankfehler.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
const base = () => `/api/v1/households/${family.householdId}`

const makeDomain = (name: string, parentId: string | null = null) =>
  h.json<{ id: string; path: string; name: string }>(family.anna, 'POST', `${base()}/domains`, { name, parentId })

const pathOf = async (id: string) => {
  const list = await h.json<{ items: { id: string; path: string; parentId: string | null; archivedAt: string | null }[] }>(
    family.anna,
    'GET',
    `${base()}/domains`,
  )
  return list.items.find((d) => d.id === id)
}

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'lifecycle')
}, 180_000)
afterAll(async () => h.stop())

describe('Ändern', () => {
  it('ein neuer Name zieht den ganzen Teilbaum mit', async () => {
    const wurzel = await makeDomain('Keller')
    const kind = await makeDomain('Werkzeug', wurzel.id)
    const enkel = await makeDomain('Bohrer', kind.id)

    await h.json(family.anna, 'PATCH', `${base()}/domains/${wurzel.id}`, { name: 'Untergeschoss' })

    expect((await pathOf(wurzel.id))?.path).toBe('untergeschoss')
    expect((await pathOf(kind.id))?.path, 'das Kind hängt noch am alten Namen').toBe('untergeschoss.werkzeug')
    expect((await pathOf(enkel.id))?.path, 'der Enkel wurde vergessen').toBe('untergeschoss.werkzeug.bohrer')
  })

  it('verschieben hängt den Teilbaum an die neue Stelle', async () => {
    const a = await makeDomain('Garten')
    const b = await makeDomain('Garage')
    const kind = await makeDomain('Schläuche', a.id)
    const enkel = await makeDomain('Kupplungen', kind.id)

    await h.json(family.anna, 'PATCH', `${base()}/domains/${kind.id}`, { parentId: b.id })

    expect((await pathOf(kind.id))?.path).toBe('garage.schlaeuche')
    expect((await pathOf(enkel.id))?.path).toBe('garage.schlaeuche.kupplungen')
  })

  it('ein Bereich kann nicht unter sich selbst wandern', async () => {
    const oben = await makeDomain('Dach')
    const unten = await makeDomain('Ziegel', oben.id)

    const res = await h.request(family.anna, 'PATCH', `${base()}/domains/${oben.id}`, { parentId: unten.id })
    expect(res.statusCode, 'der Baum hinge an sich selbst').toBe(409)
  })

  it('was nicht mitgeschickt wird, bleibt wie es war', async () => {
    const d = await makeDomain('Fahrräder')
    await h.json(family.anna, 'PATCH', `${base()}/domains/${d.id}`, { criticality: 'high' })
    await h.json(family.anna, 'PATCH', `${base()}/domains/${d.id}`, { name: 'Räder' })

    const list = await h.json<{ items: { id: string; name: string; criticality: string }[] }>(
      family.anna,
      'GET',
      `${base()}/domains`,
    )
    const after = list.items.find((x) => x.id === d.id)
    expect(after?.name).toBe('Räder')
    expect(after?.criticality, 'die Wichtigkeit wurde beim Umbenennen überschrieben').toBe('high')
  })
})

describe('Archivieren', () => {
  it('nimmt aus dem Weg, ohne etwas wegzunehmen – und ist umkehrbar', async () => {
    const d = await makeDomain('Dachboden')
    await h.json(family.anna, 'POST', `${base()}/tasks`, { title: 'Kisten sortieren', domainId: d.id })

    await h.json(family.anna, 'POST', `${base()}/domains/${d.id}/archive`)
    expect((await pathOf(d.id))?.archivedAt, 'nicht als archiviert markiert').not.toBeNull()

    await h.json(family.anna, 'POST', `${base()}/domains/${d.id}/unarchive`)
    expect((await pathOf(d.id))?.archivedAt, 'nicht zurückholbar').toBeNull()
  })

  it('ein Bereich mit Unterbereichen wird nicht still weggeräumt', async () => {
    const oben = await makeDomain('Hof')
    await makeDomain('Mülltonnen', oben.id)

    const res = await h.request(family.anna, 'POST', `${base()}/domains/${oben.id}/archive`)
    expect(res.statusCode).toBe(409)
    expect(res.body, 'die Meldung sagt nicht, was im Weg steht').toContain('Unterbereich')
  })
})

describe('Löschen', () => {
  it('ein leerer Bereich verschwindet wirklich', async () => {
    const d = await makeDomain('Versehen')
    await h.json(family.anna, 'DELETE', `${base()}/domains/${d.id}`)
    expect(await pathOf(d.id), 'der Bereich steht noch in der Liste').toBeUndefined()
  })

  it('auch nach dem Übernehmen – Zuständigkeit ist eine Aussage über den Bereich, kein Inhalt', async () => {
    const d = await makeDomain('Kurz angelegt')
    await h.json(family.anna, 'POST', `${base()}/domains/${d.id}/claim`, {})
    await h.json(family.anna, 'DELETE', `${base()}/domains/${d.id}`)
    expect(await pathOf(d.id)).toBeUndefined()
  })

  it('ein Bereich mit Inhalt sagt, was drinsteht – statt eines Datenbankfehlers', async () => {
    const d = await makeDomain('Voll')
    await h.json(family.anna, 'POST', `${base()}/tasks`, { title: 'Etwas', domainId: d.id })

    const res = await h.request(family.anna, 'DELETE', `${base()}/domains/${d.id}`)
    expect(res.statusCode).toBe(409)
    expect(res.body, 'sagt nicht, was drinsteht').toContain('1 Aufgabe')
    expect(res.body, 'Zahl und Wort passen nicht zusammen').not.toContain('1 Aufgaben')
    expect(res.body, 'nennt den Ausweg nicht').toContain('archivier')
    expect(await pathOf(d.id), 'trotz Fehler gelöscht').toBeDefined()
  })
})

describe('Verschieben', () => {
  /*
   * Jeder Test bekommt seinen eigenen übergeordneten Bereich.
   *
   * Der Haushalt sammelt über die Datei hinweg Bereiche an; „das Geschwister darüber" wäre
   * sonst irgendeines aus einem früheren Test. Ein eigener Container macht die Nachbarschaft
   * eindeutig – und genau darum geht es beim Verschieben.
   */
  const childrenOf = async (parentId: string) => {
    const list = await h.json<{ items: { id: string; name: string; parentId: string | null; path: string }[] }>(
      family.anna,
      'GET',
      `${base()}/domains`,
    )
    return list.items.filter((d) => d.parentId === parentId).map((d) => d.name)
  }

  it('hoch und runter ändern die Reihenfolge, nicht den Baum', async () => {
    const box = await makeDomain(`Kiste ${Date.now()}`)
    // Namen so gewählt, dass die alphabetische Reihenfolge nicht die gewünschte ist.
    const zebra = await makeDomain('Zebra', box.id)
    const anker = await makeDomain('Anker', box.id)

    expect(await childrenOf(box.id), 'ohne Positionen gilt die alphabetische Reihenfolge').toEqual(['Anker', 'Zebra'])

    await h.json(family.anna, 'POST', `${base()}/domains/${zebra.id}/move`, { direction: 'up' })
    expect(await childrenOf(box.id)).toEqual(['Zebra', 'Anker'])

    await h.json(family.anna, 'POST', `${base()}/domains/${zebra.id}/move`, { direction: 'down' })
    expect(await childrenOf(box.id)).toEqual(['Anker', 'Zebra'])

    const after = await pathOf(anker.id)
    expect(after?.path, 'der Pfad hat sich beim reinen Umsortieren geändert').toBe(anker.path)
  })

  it('am Rand sagt es, dass es nicht weitergeht – statt still nichts zu tun', async () => {
    const box = await makeDomain(`Rand ${Date.now()}`)
    const only = await makeDomain('Alleine', box.id)

    const res = await h.request(family.anna, 'POST', `${base()}/domains/${only.id}/move`, { direction: 'up' })
    expect(res.statusCode).toBe(409)
    expect(res.body).toContain('ganz oben')
  })

  it('hinein macht den Bereich zum Kind seines Vorgängers', async () => {
    const box = await makeDomain(`Hinein ${Date.now()}`)
    const first = await makeDomain('Aaa Vorne', box.id)
    const second = await makeDomain('Bbb Hinten', box.id)

    await h.json(family.anna, 'POST', `${base()}/domains/${second.id}/move`, { direction: 'in' })

    const moved = await pathOf(second.id)
    expect(moved?.parentId).toBe(first.id)
    expect(moved?.path).toBe(`${first.path}.bbb_hinten`)
  })

  it('der oberste Bereich einer Ebene hat niemanden, unter den er rutschen könnte', async () => {
    const box = await makeDomain(`Oben ${Date.now()}`)
    const first = await makeDomain('Aaa Erster', box.id)
    await makeDomain('Bbb Zweiter', box.id)

    const res = await h.request(family.anna, 'POST', `${base()}/domains/${first.id}/move`, { direction: 'in' })
    expect(res.statusCode).toBe(409)
    expect(res.body).toContain('nach unten')
  })

  it('hinaus hebt den Bereich eine Ebene an – mit seinen eigenen Kindern', async () => {
    const oben = await makeDomain(`Ebene1 ${Date.now()}`)
    const mitte = await makeDomain('Ebene2', oben.id)
    const unten = await makeDomain('Ebene3', mitte.id)

    await h.json(family.anna, 'POST', `${base()}/domains/${mitte.id}/move`, { direction: 'out' })

    expect((await pathOf(mitte.id))?.parentId, 'nicht angehoben').toBeNull()
    expect((await pathOf(unten.id))?.path, 'das Kind blieb zurück').toBe('ebene2.ebene3')
  })

  it('ein Bereich, der schon ganz oben liegt, kann nicht weiter hinaus', async () => {
    const d = await makeDomain(`Wurzelbereich ${Date.now()}`)
    const res = await h.request(family.anna, 'POST', `${base()}/domains/${d.id}/move`, { direction: 'out' })
    expect(res.statusCode).toBe(409)
  })

  it('Unterbereiche stehen direkt unter ihrem Bereich, nicht irgendwo', async () => {
    const box = await makeDomain(`Baum ${Date.now()}`)
    const a = await makeDomain('Mmm Erst', box.id)
    await makeDomain('Zzz Kind', a.id)
    await makeDomain('Nnn Zweit', box.id)

    const list = await h.json<{ items: { name: string }[] }>(family.anna, 'GET', `${base()}/domains`)
    const names = list.items.map((d) => d.name)
    const i = names.indexOf('Mmm Erst')
    expect(names[i + 1], `Reihenfolge: ${names.slice(i, i + 3).join(' → ')}`).toBe('Zzz Kind')
    expect(names[i + 2]).toBe('Nnn Zweit')
  })
})

describe('An eine Stelle setzen', () => {
  const childrenOf = async (parentId: string | null) => {
    const list = await h.json<{ items: { id: string; name: string; parentId: string | null }[] }>(
      family.anna,
      'GET',
      `${base()}/domains`,
    )
    return list.items.filter((d) => d.parentId === parentId).map((d) => d.name)
  }

  it('setzt vor einen bestimmten Bereich – nicht nur einen Schritt weiter', async () => {
    const box = await makeDomain(`Setzen ${Date.now()}`)
    const a = await makeDomain('A', box.id)
    await makeDomain('B', box.id)
    await makeDomain('C', box.id)
    const d = await makeDomain('D', box.id)

    // In einem Zug von hinten nach ganz vorne – mit `move` wären das drei Schritte.
    await h.json(family.anna, 'POST', `${base()}/domains/${d.id}/reposition`, {
      parentId: box.id,
      beforeId: a.id,
    })
    expect(await childrenOf(box.id)).toEqual(['D', 'A', 'B', 'C'])
  })

  it('ans Ende, wenn kein Bereich davor genannt ist', async () => {
    const box = await makeDomain(`Ende ${Date.now()}`)
    const a = await makeDomain('A', box.id)
    await makeDomain('B', box.id)

    await h.json(family.anna, 'POST', `${base()}/domains/${a.id}/reposition`, {
      parentId: box.id,
      beforeId: null,
    })
    expect(await childrenOf(box.id)).toEqual(['B', 'A'])
  })

  it('wechselt Ebene und Reihenfolge in einem Zug – mit dem ganzen Teilbaum', async () => {
    const stamp = Date.now()
    const links = await makeDomain(`Links ${stamp}`)
    const rechts = await makeDomain(`Rechts ${stamp}`)
    const erst = await makeDomain('Erst', rechts.id)
    const zieh = await makeDomain('Zieh', links.id)
    const kind = await makeDomain('Kind', zieh.id)

    await h.json(family.anna, 'POST', `${base()}/domains/${zieh.id}/reposition`, {
      parentId: rechts.id,
      beforeId: erst.id,
    })

    expect(await childrenOf(rechts.id)).toEqual(['Zieh', 'Erst'])
    const moved = await pathOf(zieh.id)
    expect((await pathOf(kind.id))?.path, 'das Kind blieb zurück').toBe(`${moved?.path}.kind`)
  })

  it('vor sich selbst geht nicht', async () => {
    const box = await makeDomain(`Selbst ${Date.now()}`)
    const a = await makeDomain('A', box.id)
    const res = await h.request(family.anna, 'POST', `${base()}/domains/${a.id}/reposition`, {
      parentId: box.id,
      beforeId: a.id,
    })
    expect(res.statusCode).toBe(409)
  })

  it('in den eigenen Unterbereich geht nicht – der Baum hinge an sich selbst', async () => {
    const oben = await makeDomain(`Oben ${Date.now()}`)
    const unten = await makeDomain('Unten', oben.id)
    const res = await h.request(family.anna, 'POST', `${base()}/domains/${oben.id}/reposition`, {
      parentId: unten.id,
      beforeId: null,
    })
    expect(res.statusCode).toBe(409)
  })

  it('ein Ziel auf einer anderen Ebene wird abgewiesen, statt still zu landen', async () => {
    const stamp = Date.now()
    const a = await makeDomain(`AA ${stamp}`)
    const b = await makeDomain(`BB ${stamp}`)
    const tief = await makeDomain('Tief', b.id)

    const res = await h.request(family.anna, 'POST', `${base()}/domains/${a.id}/reposition`, {
      parentId: null,
      beforeId: tief.id,
    })
    expect(res.statusCode).toBe(409)
  })
})
