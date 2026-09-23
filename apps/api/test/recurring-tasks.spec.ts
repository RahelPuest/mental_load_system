import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Harness, familyFixture } from './helpers.js'

/**
 * Regelmäßige Aufgaben und Aufgaben, die einer anderen folgen.
 *
 * Der interessante Teil ist nicht, dass eine Regel ein Signal erzeugt – das konnte sie immer.
 * Neu ist, dass daraus eine **Aufgabe** wird: `defaultResponse: 'create_task'` stand seit jeher
 * in der Tabelle, wurde beim Anlegen gespeichert und beim Auswerten nie gelesen.
 */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let domainId: string
const base = () => `/api/v1/households/${family.householdId}`

interface Outcome {
  signalsCreated: number
  tasksCreated: string[]
  attentionCreated: string[]
}

const rule = (name: string, config: Record<string, unknown>, ruleKind = 'schedule') =>
  h.json<{ id: string }>(family.anna, 'POST', `${base()}/monitors`, {
    domainId,
    name,
    ruleKind,
    config,
    defaultResponse: 'create_task',
  })

const evaluate = (id: string) => h.json<Outcome>(family.anna, 'POST', `${base()}/monitors/${id}/evaluate`)

/*
 * Aufgaben haben keine eigene Listenroute – sie erscheinen dort, wo sie hingehören: in der
 * Jetzt-Ansicht, im Vorgang, im Bereich. Für die Prüfung ist die Datenbank der ehrlichste
 * Ort: Sie zeigt auch, was die Oberfläche gerade nicht zeigt.
 */
async function tasksNamed(title: string) {
  const { tasks, withTenant } = await import('@thealotta/db')
  const { and, eq } = await import('drizzle-orm')
  return withTenant(h.app.db, [family.householdId], async (tx) =>
    tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.householdId, family.householdId), eq(tasks.title, title))),
  )
}

beforeAll(async () => {
  await h.start()
  family = await familyFixture(h, 'recurring')
  domainId = (await h.json<{ id: string }>(family.anna, 'POST', `${base()}/domains`, { name: 'Haushalt' })).id
}, 180_000)
afterAll(async () => h.stop())

describe('Aus einer Regel wird eine Aufgabe', () => {
  it('eine fällige Regel legt eine Aufgabe an – nicht nur einen Hinweis', async () => {
    // Anker in der Vergangenheit: die Regel ist sofort fällig.
    const r = await rule('Wäsche waschen', { every: 'P3D', anchor: '2020-01-01T00:00:00.000Z' })
    const out = await evaluate(r.id)

    expect(out.signalsCreated).toBe(1)
    expect(out.tasksCreated, 'kein Weg von der Regel zur Aufgabe').toHaveLength(1)
    expect(out.attentionCreated, 'zusätzlich noch ein Hinweis – doppelt gemoppelt').toHaveLength(0)

    const [task] = await tasksNamed('Wäsche waschen')
    expect(task?.state).toBe('ready')
  })

  it('solange die Aufgabe offen ist, entsteht keine zweite', async () => {
    const r = await rule('Müll rausbringen', { every: 'P1D', anchor: '2020-01-01T00:00:00.000Z' })
    await evaluate(r.id)
    /*
     * Wer die Wäsche seit drei Wochen nicht gemacht hat, braucht keine drei Wäsche-Aufgaben,
     * sondern eine, die seit drei Wochen offen ist.
     */
    const zweite = await evaluate(r.id)
    expect(zweite.tasksCreated).toHaveLength(0)
    expect(await tasksNamed('Müll rausbringen')).toHaveLength(1)
  })

  it('eine Regel ohne diese Antwort erzeugt weiterhin einen Hinweis', async () => {
    const r = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/monitors`, {
      domainId,
      name: 'Nur nachsehen',
      ruleKind: 'schedule',
      config: { every: 'P1D', anchor: '2020-01-01T00:00:00.000Z' },
    })
    const out = await evaluate(r.id)
    expect(out.tasksCreated).toHaveLength(0)
    expect(out.attentionCreated).toHaveLength(1)
  })
})

describe('Die Muster kommen bis zur Aufgabe durch', () => {
  it('an Wochentagen: die Begründung nennt den Tag, nicht ein Intervall', async () => {
    const r = await rule('Gelbe Tonne', { weekdays: [0, 1, 2, 3, 4, 5, 6], anchor: '2020-01-01T00:00:00.000Z' })
    await evaluate(r.id)

    const [task] = await tasksNamed('Gelbe Tonne')
    expect(task?.rationale ?? '', 'die Begründung nennt das Muster nicht').toMatch(
      /tags\b|montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonntags/,
    )
  })

  it('am Monatstag: eine Regel, deren Tag noch nicht da ist, meldet sich nicht', async () => {
    // Aus der Harness-Uhr abgeleitet, nicht aus der Wanduhr: sonst hängt das Ergebnis davon ab,
    // welcher Tag im echten Kalender gerade ist.
    const uebermorgen = new Date(h.clock.now().getTime() + 2 * 24 * 3600_000).getUTCDate()
    const r = await rule('Miete überweisen', { monthday: uebermorgen, anchor: h.clock.now().toISOString() })
    const out = await evaluate(r.id)
    expect(out.signalsCreated, 'meldet sich, obwohl der Tag noch nicht da ist').toBe(0)
  })
})

describe('Eine Aufgabe, die einer anderen folgt', () => {
  it('wartet, solange die vorangehende Aufgabe offen ist', async () => {
    const erste = await rule('Wäsche in die Maschine', { every: 'P7D', anchor: '2020-01-01T00:00:00.000Z' })
    await evaluate(erste.id)

    const folge = await rule('Wäsche aufhängen', { afterMonitorId: erste.id, delay: 'P0D' }, 'dependency_recheck')
    const out = await evaluate(folge.id)

    expect(out.signalsCreated, 'meldet sich, obwohl der erste Schritt noch offen ist').toBe(0)
  })

  it('meldet sich, sobald die vorangehende Aufgabe erledigt ist', async () => {
    const erste = await rule('Rasen mähen', { every: 'P7D', anchor: '2020-01-01T00:00:00.000Z' })
    await evaluate(erste.id)
    const [task] = await tasksNamed('Rasen mähen')
    await h.json(family.anna, 'POST', `${base()}/tasks/${task!.id}/complete`, {})

    const folge = await rule('Schnittgut wegbringen', { afterMonitorId: erste.id, delay: 'P0D' }, 'dependency_recheck')
    const out = await evaluate(folge.id)

    expect(out.tasksCreated, 'die Folgeaufgabe entsteht nicht').toHaveLength(1)
    expect(await tasksNamed('Schnittgut wegbringen')).toHaveLength(1)
  })

  it('die Frist zählt ab der Erledigung, nicht ab dem Kalender', async () => {
    const erste = await rule('Fenster putzen', { every: 'P7D', anchor: '2020-01-01T00:00:00.000Z' })
    await evaluate(erste.id)
    const [task] = await tasksNamed('Fenster putzen')
    await h.json(family.anna, 'POST', `${base()}/tasks/${task!.id}/complete`, {})

    // Eine Woche Frist: gerade erledigt, also noch lange nichts zu tun.
    const folge = await rule('Rahmen nachwischen', { afterMonitorId: erste.id, delay: 'P7D' }, 'dependency_recheck')
    const out = await evaluate(folge.id)

    expect(out.signalsCreated, 'die Frist wird nicht abgewartet').toBe(0)
  })
})

describe('Eine Regel wieder loswerden', () => {
  it('abschalten lässt sie stehen, aber stumm', async () => {
    const r = await rule('Später mal', { every: 'P1D', anchor: '2020-01-01T00:00:00.000Z' })
    await h.json(family.anna, 'PATCH', `${base()}/monitors/${r.id}`, { enabled: false })

    const out = await evaluate(r.id)
    expect(out.signalsCreated, 'eine abgeschaltete Regel meldet sich trotzdem').toBe(0)

    const list = await h.json<{ items: { id: string; enabled: boolean }[] }>(family.anna, 'GET', `${base()}/monitors`)
    expect(list.items.find((m) => m.id === r.id)?.enabled, 'die Regel ist verschwunden statt stumm').toBe(false)
  })

  it('wieder einschalten geht auch', async () => {
    const r = await rule('Doch wieder', { every: 'P1D', anchor: '2020-01-01T00:00:00.000Z' })
    await h.json(family.anna, 'PATCH', `${base()}/monitors/${r.id}`, { enabled: false })
    await h.json(family.anna, 'PATCH', `${base()}/monitors/${r.id}`, { enabled: true })
    expect((await evaluate(r.id)).signalsCreated).toBe(1)
  })

  it('eine Regel ohne Vergangenheit lässt sich löschen', async () => {
    const r = await rule('Versehen', { every: 'P30D' })
    await h.json(family.anna, 'DELETE', `${base()}/monitors/${r.id}`)

    const list = await h.json<{ items: { id: string }[] }>(family.anna, 'GET', `${base()}/monitors`)
    expect(list.items.some((m) => m.id === r.id)).toBe(false)
  })

  it('eine Regel, die sich schon gemeldet hat, wird nicht gelöscht – sonst fehlte der Grund von damals', async () => {
    const r = await rule('Hat gefeuert', { every: 'P1D', anchor: '2020-01-01T00:00:00.000Z' })
    await evaluate(r.id)

    const res = await h.request(family.anna, 'DELETE', `${base()}/monitors/${r.id}`)
    expect(res.statusCode).toBe(409)
    expect(res.body, 'die Meldung nennt den Ausweg nicht').toContain('Schalte die Regel ab')
  })
})

/*
 * Der Harness hat eine feste Uhr. Das ist ein Geschenk: Eine Wiederholung lässt sich damit
 * über Wochen prüfen, ohne zu warten – man schiebt die Uhr weiter. Man muss die Daten dann
 * aber auch aus ihr ableiten und nicht aus `Date.now()`.
 */
const heute = () => h.clock.now()
const tagVon = (d: Date) => d.toISOString().slice(0, 10)
const plusTage = (n: number) => tagVon(new Date(heute().getTime() + n * 24 * 3600_000))

describe('Die Aufgabe trägt das Datum ihres Termins', () => {
  it('fällig am Termin, nicht zum Zeitpunkt der Auswertung', async () => {
    /*
     * Der Auswerter läuft im Hintergrund, wann er eben läuft. Stünde im Fälligkeitsdatum
     * „jetzt", wäre eine Aufgabe „am 15." mal am 15. und mal am 16. fällig.
     */
    const r = await rule('Fällig gestern', { every: 'P1D', anchor: `${plusTage(-1)}T00:00:00.000Z` })
    await evaluate(r.id)

    const [task] = await tasksNamed('Fällig gestern')
    expect(task?.dueAt, 'die Aufgabe hat kein Fälligkeitsdatum').toBeTruthy()
    expect(tagVon(task!.dueAt!), 'fällig heute statt am Termin').toBe(plusTage(0))
  })
})

describe('Anfang und Ende einer Reihe', () => {
  it('vor dem Startdatum passiert nichts', async () => {
    const r = await rule('Erst später', { every: 'P1D', startsOn: plusTage(7) })
    expect((await evaluate(r.id)).signalsCreated, 'meldet sich vor dem Start').toBe(0)
  })

  it('nach dem Enddatum ist Schluss', async () => {
    const r = await rule('Schon vorbei', { every: 'P1D', anchor: '2020-01-01T00:00:00.000Z', until: plusTage(-1) })
    expect((await evaluate(r.id)).signalsCreated, 'meldet sich nach dem Ende').toBe(0)
  })

  it('nach der vereinbarten Anzahl ist Schluss', async () => {
    const r = await rule('Genau zweimal', { every: 'P1D', anchor: '2020-01-01T00:00:00.000Z', count: 2 })

    // Erstes Mal.
    expect((await evaluate(r.id)).signalsCreated).toBe(1)
    const [erste] = await tasksNamed('Genau zweimal')
    await h.json(family.anna, 'POST', `${base()}/tasks/${erste!.id}/complete`, {})

    // Einen Tag weiter – sonst ist der nächste Termin noch nicht da.
    h.clock.advanceDays(1)
    expect((await evaluate(r.id)).signalsCreated).toBe(1)
    const offen = (await tasksNamed('Genau zweimal')).find((t) => !t.completedAt)
    await h.json(family.anna, 'POST', `${base()}/tasks/${offen!.id}/complete`, {})

    // Und noch einen: Die Reihe ist fertig, nicht kaputt.
    h.clock.advanceDays(1)
    expect((await evaluate(r.id)).signalsCreated, 'die Reihe läuft über ihr Ende hinaus').toBe(0)

    h.clock.advanceDays(-2)
  })
})

describe('Am n-ten Wochentag', () => {
  it('richtet sich ein und beschreibt sich in Worten', async () => {
    const r = await rule('Elternabend', { nthWeekday: { nth: 2, weekday: 2 }, anchor: '2020-01-01T00:00:00.000Z' })
    await evaluate(r.id)

    const [task] = await tasksNamed('Elternabend')
    expect(task?.rationale ?? '').toContain('am zweiten Dienstag jedes Monats')
  })
})

describe('Ein Bereich zeigt, was in ihm offen ist', () => {
  it('die Aufgabe aus einer Regel steht im Bereich – nicht nur in der Jetzt-Ansicht', async () => {
    /*
     * Die Detailantwort eines Bereichs führte alles außer den Aufgaben: Zustände, Regeln,
     * Wissen, Fragen, Entscheidungen, Vorgänge, Hinweise, Unterbereiche. Wer für einen Bereich
     * verantwortlich war, konnte nicht nachsehen, was dort ansteht (Audit K1).
     */
    const r = await rule('Im Bereich sichtbar', { every: 'P1D', anchor: '2020-01-01T00:00:00.000Z' })
    await evaluate(r.id)

    const detail = await h.json<{ tasks: { title: string; dueAt: string | null }[] }>(
      family.anna,
      'GET',
      `${base()}/domains/${domainId}/detail`,
    )
    const task = detail.tasks.find((t) => t.title === 'Im Bereich sichtbar')
    expect(task, 'die Aufgabe fehlt im Bereich').toBeTruthy()
    expect(task?.dueAt, 'ohne Fälligkeit ist nicht zu sehen, ob es drängt').toBeTruthy()
  })

  it('Vorgangsschritte stehen bei ihrem Vorgang, nicht doppelt im Bereich', async () => {
    const vorgang = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/processes`, {
      domainId,
      title: 'Mehrschrittiges',
    })
    await h.json(family.anna, 'POST', `${base()}/tasks`, {
      title: 'Schritt im Vorgang',
      domainId,
      processId: vorgang.id,
    })

    const detail = await h.json<{ tasks: { title: string }[]; processes: { id: string }[] }>(
      family.anna,
      'GET',
      `${base()}/domains/${domainId}/detail`,
    )
    expect(detail.processes.some((p) => p.id === vorgang.id)).toBe(true)
    expect(
      detail.tasks.some((t) => t.title === 'Schritt im Vorgang'),
      'der Schritt steht zweimal – man müsste beide Listen abgleichen',
    ).toBe(false)
  })

  it('Erledigtes und Verworfenes verschwindet aus der Liste', async () => {
    const r = await rule('Wird erledigt', { every: 'P1D', anchor: '2020-01-01T00:00:00.000Z' })
    await evaluate(r.id)
    const [task] = await tasksNamed('Wird erledigt')
    await h.json(family.anna, 'POST', `${base()}/tasks/${task!.id}/complete`, {})

    const detail = await h.json<{ tasks: { title: string }[] }>(
      family.anna,
      'GET',
      `${base()}/domains/${domainId}/detail`,
    )
    expect(detail.tasks.some((t) => t.title === 'Wird erledigt')).toBe(false)
  })
})
