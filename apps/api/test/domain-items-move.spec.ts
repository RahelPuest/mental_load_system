import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Inhalte eines Bereichs in einen anderen umhängen (docs/72).
 *
 * Der Anlass ist das Aufteilen: „Jacken und Schuhe" wird zu „Jacken" und „Schuhe". Was dabei
 * zählt, ist nicht das Umsetzen einer Fremdschlüsselspalte – das wäre eine Zeile –, sondern
 * dass nichts zurückbleibt, das ohne seinen Partner sinnlos ist: eine Regel ohne die Angabe,
 * die sie beobachtet; ein Hinweis, der auf eine Regel zeigt, die es im Bereich nicht mehr
 * gibt; eine Aufgabe ohne ihren Vorgang.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
const base = () => `/api/v1/households/${family.householdId}`

const bereich = (name: string) =>
  h.json<{ id: string; name: string }>(family.anna, 'POST', `${base()}/domains`, { name })

const detail = (id: string) =>
  h.json<{
    states: { definition: { id: string; label: string } }[]
    knowledge: { id: string; title: string }[]
    questions: { id: string; body: string }[]
    decisions: { id: string; title: string }[]
    monitors: { id: string; name: string }[]
    processes: { id: string; title: string }[]
    tasks: { id: string; title: string }[]
    attention: { id: string; title: string }[]
  }>(family.anna, 'GET', `${base()}/domains/${id}/detail`)

const verschiebe = (von: string, nach: string, items: { kind: string; id: string }[]) =>
  h.request(family.anna, 'POST', `${base()}/domains/${von}/move-items`, { targetDomainId: nach, items })

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'umhaengen')
}, 180_000)
afterAll(async () => h.stop())

describe('Was gewählt wurde, wechselt den Bereich', () => {
  it('Notiz, Frage und Entscheidung wandern in einem Aufruf', async () => {
    const quelle = await bereich('Jacken und Schuhe')
    const ziel = await bereich('Schuhe')

    const notiz = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/knowledge`, {
      domainId: quelle.id,
      title: 'Größe 29 passt seit Mai',
    })
    const frage = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/questions`, {
      domainId: quelle.id,
      body: 'Wo liegen die Gummistiefel?',
    })
    const entscheidung = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/decisions`, {
      domainId: quelle.id,
      title: 'Keine Marken-Turnschuhe',
      decisionKind: 'hard_rule',
    })

    const antwort = await verschiebe(quelle.id, ziel.id, [
      { kind: 'knowledge', id: notiz.id },
      { kind: 'question', id: frage.id },
      { kind: 'decision', id: entscheidung.id },
    ])
    expect(antwort.statusCode).toBe(200)
    expect(antwort.json<{ moved: unknown[] }>().moved).toHaveLength(3)

    const nachher = await detail(ziel.id)
    expect(nachher.knowledge.map((k) => k.id)).toContain(notiz.id)
    expect(nachher.questions.map((q) => q.id)).toContain(frage.id)
    expect(nachher.decisions.map((d) => d.id)).toContain(entscheidung.id)

    const alt = await detail(quelle.id)
    expect(alt.knowledge, 'die Notiz steht doppelt').toHaveLength(0)
    expect(alt.decisions).toHaveLength(0)
  })
})

describe('Was zusammengehört, bleibt zusammen', () => {
  it('eine Regel nimmt die Angabe mit, die sie beobachtet', async () => {
    const quelle = await bereich('Kleidung gemischt')
    const ziel = await bereich('Nur Schuhe')

    const angabe = await h.json<{ id: string }>(
      family.anna,
      'POST',
      `${base()}/domains/${quelle.id}/state-definitions`,
      { key: `schuhgroesse_${Date.now()}`, label: 'Schuhgröße', dataType: 'number', freshnessInterval: 'P6W' },
    )
    const regel = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/monitors`, {
      domainId: quelle.id,
      stateDefinitionId: angabe.id,
      name: 'Schuhgröße prüfen',
      ruleKind: 'state_freshness',
      config: {},
    })

    // Gewählt ist nur die Regel – die Angabe muss von allein mitkommen.
    const antwort = await verschiebe(quelle.id, ziel.id, [{ kind: 'monitor', id: regel.id }])
    expect(antwort.statusCode).toBe(200)
    const body = antwort.json<{ mitgenommen: { kind: string; id: string; grund: string }[] }>()
    expect(body.mitgenommen.map((m) => m.id)).toContain(angabe.id)
    expect(body.mitgenommen[0]?.grund, 'ohne Begründung wirkt es wie ein Nebeneffekt').toBeTruthy()

    const nachher = await detail(ziel.id)
    expect(nachher.monitors.map((m) => m.id)).toContain(regel.id)
    expect(nachher.states.map((s) => s.definition.id)).toContain(angabe.id)
    expect((await detail(quelle.id)).states, 'die Angabe blieb ohne ihre Regel zurück').toHaveLength(0)
  })

  it('und umgekehrt: die Angabe nimmt ihre Regel mit', async () => {
    const quelle = await bereich('Gemischt zwei')
    const ziel = await bereich('Getrennt zwei')

    const angabe = await h.json<{ id: string }>(
      family.anna,
      'POST',
      `${base()}/domains/${quelle.id}/state-definitions`,
      { key: `jackengroesse_${Date.now()}`, label: 'Jackengröße', dataType: 'number', freshnessInterval: 'P6W' },
    )
    const regel = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/monitors`, {
      domainId: quelle.id,
      stateDefinitionId: angabe.id,
      name: 'Jackengröße prüfen',
      ruleKind: 'state_freshness',
      config: {},
    })

    await verschiebe(quelle.id, ziel.id, [{ kind: 'state', id: angabe.id }])

    const nachher = await detail(ziel.id)
    expect(nachher.monitors.map((m) => m.id), 'die Regel schaut jetzt über eine Bereichsgrenze').toContain(regel.id)
  })

  it('ein Vorgang nimmt seine Aufgaben mit', async () => {
    const quelle = await bereich('Vorgang Quelle')
    const ziel = await bereich('Vorgang Ziel')

    const vorgang = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/processes`, {
      domainId: quelle.id,
      title: 'Winterschuhe besorgen',
    })
    const aufgabe = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, {
      title: 'Größe messen',
      processId: vorgang.id,
      domainId: quelle.id,
    })

    const antwort = await verschiebe(quelle.id, ziel.id, [{ kind: 'process', id: vorgang.id }])
    expect(antwort.statusCode).toBe(200)
    expect(antwort.json<{ mitgenommen: { id: string }[] }>().mitgenommen.map((m) => m.id)).toContain(aufgabe.id)

    expect((await detail(ziel.id)).processes.map((p) => p.id)).toContain(vorgang.id)

    /*
      Die Aufgabe steht nicht in `tasks` des Bereichs – diese Liste zeigt nur freistehende
      Aufgaben, alles andere haengt sichtbar am Vorgang. Dass sie mit umgezogen ist, sagt der
      Verlauf der Aufgabe selbst.
    */
    const verlauf = await h.json<{ items: { eventType: string; payload: { domainId?: string } }[] }>(
      family.anna,
      'GET',
      `${base()}/history?subjectId=${aufgabe.id}`,
    )
    const umzug = verlauf.items.find((e) => e.eventType === 'domain.item_moved')
    expect(umzug, 'die Aufgabe blieb im alten Bereich liegen').toBeTruthy()
    expect(umzug?.payload.domainId).toBe(ziel.id)
  })

  it('eine Aufgabe, die zu einem Vorgang gehört, geht nicht einzeln – und sagt warum', async () => {
    const quelle = await bereich('Einzeln Quelle')
    const ziel = await bereich('Einzeln Ziel')

    const vorgang = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/processes`, {
      domainId: quelle.id,
      title: 'Regenjacke reparieren',
    })
    const aufgabe = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, {
      title: 'Reißverschluss ansehen',
      processId: vorgang.id,
      domainId: quelle.id,
    })

    const abgelehnt = await verschiebe(quelle.id, ziel.id, [{ kind: 'task', id: aufgabe.id }])
    expect(abgelehnt.statusCode).toBe(409)
    const fehler = abgelehnt.json<{ code: string; detail: string }>()
    expect(fehler.code).toBe('task_belongs_to_process')
    expect(fehler.detail, 'die Meldung nennt den Ausweg nicht').toMatch(/Vorgang/)
  })

  it('eine freistehende Aufgabe geht sehr wohl', async () => {
    const quelle = await bereich('Frei Quelle')
    const ziel = await bereich('Frei Ziel')
    const aufgabe = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/tasks`, {
      title: 'Schuhe imprägnieren',
      domainId: quelle.id,
    })

    expect((await verschiebe(quelle.id, ziel.id, [{ kind: 'task', id: aufgabe.id }])).statusCode).toBe(200)
    expect((await detail(ziel.id)).tasks.map((t) => t.id)).toContain(aufgabe.id)
  })

  it('ein offener Hinweis folgt seiner Regel', async () => {
    const quelle = await bereich('Hinweis Quelle')
    const ziel = await bereich('Hinweis Ziel')

    const angabe = await h.json<{ id: string }>(
      family.anna,
      'POST',
      `${base()}/domains/${quelle.id}/state-definitions`,
      { key: `mnkey_${Date.now()}`, label: 'Mütze', dataType: 'text', freshnessInterval: 'P1W' },
    )
    await h.json(family.anna, 'PUT', `${base()}/state-definitions/${angabe.id}/value`, {
      valueKind: 'known',
      value: 'blau',
      confirm: true,
    })
    const regel = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/monitors`, {
      domainId: quelle.id,
      stateDefinitionId: angabe.id,
      name: 'Mütze prüfen',
      ruleKind: 'state_freshness',
      config: {},
    })

    h.clock.advanceWeeks(3)
    const lauf = await h.json<{ attentionCreated: unknown[] }>(
      family.anna,
      'POST',
      `${base()}/monitors/${regel.id}/evaluate`,
    )
    expect(lauf.attentionCreated.length, 'ohne Hinweis prüft dieser Test nichts').toBe(1)

    await verschiebe(quelle.id, ziel.id, [{ kind: 'monitor', id: regel.id }])

    expect((await detail(ziel.id)).attention.length, 'der Hinweis blieb ohne seine Regel zurück').toBe(1)
    expect((await detail(quelle.id)).attention).toHaveLength(0)
    h.clock.advanceWeeks(-3)
  })
})

describe('Was nicht geht, endet in einem Satz', () => {
  it('ein Eintrag aus einem anderen Bereich wird nicht mitverschoben', async () => {
    const quelle = await bereich('Fremd Quelle')
    const woanders = await bereich('Fremd Woanders')
    const ziel = await bereich('Fremd Ziel')

    const notiz = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/knowledge`, {
      domainId: woanders.id,
      title: 'Steht woanders',
    })

    const abgelehnt = await verschiebe(quelle.id, ziel.id, [{ kind: 'knowledge', id: notiz.id }])
    expect(abgelehnt.statusCode, 'eine fremde Kennung verschob stillschweigend nichts').toBe(404)
    expect((await detail(woanders.id)).knowledge.map((k) => k.id)).toContain(notiz.id)
  })

  it('Quelle und Ziel dürfen nicht derselbe Bereich sein', async () => {
    const eins = await bereich('Derselbe')
    const notiz = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/knowledge`, {
      domainId: eins.id,
      title: 'Bleibt hier',
    })
    const abgelehnt = await verschiebe(eins.id, eins.id, [{ kind: 'knowledge', id: notiz.id }])
    expect(abgelehnt.statusCode).toBe(409)
    expect(abgelehnt.json<{ code: string }>().code).toBe('invalid_target')
  })

  it('in einen archivierten Bereich wird nichts gelegt', async () => {
    const quelle = await bereich('Archiv Quelle')
    const ziel = await bereich('Archiv Ziel')
    await h.json(family.anna, 'POST', `${base()}/domains/${ziel.id}/archive`, {})

    const notiz = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/knowledge`, {
      domainId: quelle.id,
      title: 'Soll nicht ins Archiv',
    })
    const abgelehnt = await verschiebe(quelle.id, ziel.id, [{ kind: 'knowledge', id: notiz.id }])
    expect(abgelehnt.statusCode).toBe(409)
    expect(abgelehnt.json<{ code: string }>().code).toBe('target_archived')
  })
})

describe('Beide Bereiche erzählen davon', () => {
  it('der Verlauf zeigt den Umzug an der Quelle und am Ziel', async () => {
    const quelle = await bereich('Verlauf Quelle')
    const ziel = await bereich('Verlauf Ziel')
    const notiz = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/knowledge`, {
      domainId: quelle.id,
      title: 'Zieht um',
    })
    await verschiebe(quelle.id, ziel.id, [{ kind: 'knowledge', id: notiz.id }])

    const verlauf = (domainId: string) =>
      h.json<{ items: { eventType: string }[] }>(family.anna, 'GET', `${base()}/history?domainId=${domainId}`)

    expect(
      (await verlauf(ziel.id)).items.map((e) => e.eventType),
      'am Ziel steht nicht, woher es kam',
    ).toContain('domain.item_moved')
    expect(
      (await verlauf(quelle.id)).items.map((e) => e.eventType),
      'an der Quelle ist der Eintrag still verschwunden (INV-001)',
    ).toContain('domain.items_left')
  })
})
