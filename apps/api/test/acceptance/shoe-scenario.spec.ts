import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MS } from '@thealotta/domain'
import type { NowResponse } from '@thealotta/contracts'
import { Harness, familyFixture } from '../helpers.js'

/**
 * Akzeptanzszenario aus §44 – der vertikale Slice von Ende zu Ende.
 *
 *   OWN → KNOW → MONITOR → ANTICIPATE → TRIGGER → ACT → LEARN → KNOW
 *
 * Der Test läuft mit kontrollierter Uhr und ohne Wartezeiten.
 */
const h = new Harness()

let family: Awaited<ReturnType<typeof familyFixture>>
let schuheDomainId: string
let shoeSizeDefId: string
let monitorId: string
let attentionId: string
let processId: string
let taskId: string

beforeAll(async () => {
  await h.start()

  // Sieben Wochen vor „heute" beginnen: die letzte Messung liegt dann zurück.
  h.clock.set(new Date('2026-07-20T09:00:00.000Z'))
  family = await familyFixture(h, 'schuhe')
}, 180_000)

afterAll(async () => h.stop())

describe('§44 – Akzeptanzszenario „Schuhe Kind A"', () => {
  it('OWN: die Familie legt den Bereich Kinder → Kind A → Kleidung → Schuhe an', async () => {
    const { anna, householdId } = family
    const base = `/api/v1/households/${householdId}`

    const kinder = await h.json<{ id: string }>(anna, 'POST', `${base}/domains`, {
      name: 'Kinder',
      ownershipInheritance: 'own',
    })
    const person = await h.json<{ id: string }>(anna, 'POST', `${base}/persons`, {
      displayName: 'Kind A',
      personKind: 'child',
    })
    const kindA = await h.json<{ id: string }>(anna, 'POST', `${base}/domains`, {
      name: 'Kind A',
      parentId: kinder.id,
      subjectPersonId: person.id,
    })
    const kleidung = await h.json<{ id: string }>(anna, 'POST', `${base}/domains`, {
      name: 'Kleidung',
      parentId: kindA.id,
    })
    const schuhe = await h.json<{ id: string }>(anna, 'POST', `${base}/domains`, {
      name: 'Schuhe',
      parentId: kleidung.id,
    })
    schuheDomainId = schuhe.id

    // Anna übernimmt die Verantwortung – ausdrücklich, nicht implizit.
    await h.json(anna, 'POST', `${base}/domains/${schuhe.id}/claim`, {})

    const domains = await h.json<{ items: { id: string; path: string; effectiveOwner: { displayName: string } | null }[] }>(
      anna,
      'GET',
      `${base}/domains`,
    )
    const entry = domains.items.find((d) => d.id === schuhe.id)
    expect(entry?.path).toBe('kinder.kind_a.kleidung.schuhe')
    expect(entry?.effectiveOwner?.displayName).toBe('Anna')

  })

  it('KNOW: Schuhgröße 29 wird erfasst, Prüfintervall sechs Wochen', async () => {
    const { anna, householdId } = family
    const base = `/api/v1/households/${householdId}`

    const definition = await h.json<{ id: string }>(anna, 'POST', `${base}/domains/${schuheDomainId}/state-definitions`, {
      key: 'shoe_size',
      label: 'Schuhgröße',
      dataType: 'number',
      freshnessInterval: 'P6W',
      isCritical: false,
      sensitivity: 'normal',
    })
    shoeSizeDefId = definition.id

    const written = await h.json<{ value: { valueKind: string; value: unknown; verifiedAt: string } }>(
      anna,
      'PUT',
      `${base}/state-definitions/${shoeSizeDefId}/value`,
      { valueKind: 'known', value: 29, confirm: true },
    )
    expect(written.value.value).toBe(29)
    expect(written.value.verifiedAt).toBeTruthy()
  })

  it('MONITOR: eine Regel beobachtet die Aktualität der Angabe', async () => {
    const { anna, householdId } = family
    const monitor = await h.json<{ id: string }>(anna, 'POST', `/api/v1/households/${householdId}/monitors`, {
      domainId: schuheDomainId,
      stateDefinitionId: shoeSizeDefId,
      name: 'Schuhgröße prüfen',
      ruleKind: 'state_freshness',
      config: {},
      defaultResponse: 'attention_item',
    })
    monitorId = monitor.id
  })

  it('MONITOR: solange die Angabe frisch ist, meldet sich das System nicht', async () => {
    const { anna, householdId } = family
    h.clock.advanceWeeks(3)
    const result = await h.json<{ signalsCreated: number }>(
      anna,
      'POST',
      `/api/v1/households/${householdId}/monitors/${monitorId}/evaluate`,
    )
    expect(result.signalsCreated).toBe(0)
  })

  it('ANTICIPATE: nach sieben Wochen entsteht genau ein Aufmerksamkeitseintrag mit Begründung', async () => {
    const { anna, householdId } = family
    h.clock.advanceWeeks(4) // insgesamt 7 Wochen seit der Messung

    const result = await h.json<{ signalsCreated: number; attentionCreated: string[] }>(
      anna,
      'POST',
      `/api/v1/households/${householdId}/monitors/${monitorId}/evaluate`,
    )
    expect(result.signalsCreated).toBe(1)
    expect(result.attentionCreated).toHaveLength(1)

    const list = await h.json<{
      items: { id: string; title: string; whyNow: string; state: string; supportingSignals: unknown[] }[]
    }>(anna, 'GET', `/api/v1/households/${householdId}/attention?state=open`)
    expect(list.items).toHaveLength(1)

    const item = list.items[0]!
    attentionId = item.id
    expect(item.title).toContain('Schuhgröße')
    // INV-008: Die Begründung nennt Datum und Intervall – kein „irgendwas ist fällig".
    expect(item.whyNow).toMatch(/zuletzt am \d{2}\.\d{2}\.\d{4}/)
    expect(item.whyNow).toContain('6 Wochen')
    expect(item.supportingSignals).toHaveLength(1)
  })

  it('§11: eine zweite Auswertung erzeugt kein Duplikat (Idempotenz)', async () => {
    const { anna, householdId } = family
    const again = await h.json<{ signalsCreated: number; signalsSkipped: number }>(
      anna,
      'POST',
      `/api/v1/households/${householdId}/monitors/${monitorId}/evaluate`,
    )
    expect(again.signalsCreated).toBe(0)

    const list = await h.json<{ items: unknown[] }>(anna, 'GET', `/api/v1/households/${householdId}/attention?state=open`)
    expect(list.items).toHaveLength(1)
  })

  it('ACT: aus dem Hinweis wird durch eine menschliche Entscheidung ein Vorgang', async () => {
    const { anna, householdId } = family
    const result = await h.json<{ processId: string; attentionState: string }>(
      anna,
      'POST',
      `/api/v1/households/${householdId}/attention/${attentionId}/promote`,
      { processTitle: 'Passform Schuhe überprüfen' },
    )
    processId = result.processId
    expect(result.attentionState).toBe('converted')
  })

  it('ACT: der nächste konkrete Schritt hat Kontext, Dauer und Energiebedarf', async () => {
    const { anna, householdId } = family
    const task = await h.json<{ id: string }>(anna, 'POST', `/api/v1/households/${householdId}/tasks`, {
      title: 'Beim nächsten Schuheanziehen Zehenraum prüfen',
      processId,
      assigneeMembershipId: family.benMembershipId,
      estimatedMinutes: 2,
      mentalEnergy: 'low',
    })
    taskId = task.id

    const process = await h.json<{ nextActions: { id: string; title: string }[]; nextStepHint: string }>(
      anna,
      'GET',
      `/api/v1/households/${householdId}/processes/${processId}`,
    )
    expect(process.nextActions.map((t) => t.id)).toEqual([taskId])
    expect(process.nextStepHint).toContain('Zehenraum')
  })

  it('ACT: die Aufgabe erscheint unter „Jetzt" mit vollständiger Begründung', async () => {
    const { ben, householdId } = family
    const now = await h.json<NowResponse>(ben, 'GET', `/api/v1/households/${householdId}/now`)

    const nowSection = now.sections.find((s) => s.key === 'now')!
    const entry = nowSection.items.find((i) => i.subjectId === taskId)
    expect(entry).toBeDefined()

    // §22: jedes Element beantwortet warum, wem es gehört, wer ausführt und was es kostet.
    const codes = entry!.why.map((f) => f.code)
    expect(codes).toContain('low_cost')
    expect(codes).toContain('process_origin')
    expect(entry!.why.find((f) => f.code === 'process_origin')!.explanation).toContain('Schuhgröße')

    // INV-009: Verantwortung und Ausführung sind verschiedene Dinge.
    expect(entry!.owner?.displayName).toBe('Anna')
    expect(entry!.owner?.isYou).toBe(false)
    expect(entry!.assignee?.displayName).toBe('Ben')
    expect(entry!.assignee?.isYou).toBe(true)

    expect(entry!.estimatedMinutes).toBe(2)
    expect(entry!.mentalEnergy).toBe('low')
    expect(entry!.ifItWaits.length).toBeGreaterThan(10)
    expect(nowSection.limit).toBe(3)
  })

  it('LEARN: Ben führt aus, bestätigt die Größe – und die Verantwortung bleibt bei Anna', async () => {
    const { anna, ben, householdId } = family
    const base = `/api/v1/households/${householdId}`

    const result = await h.json<{ state: string; alreadyDone: boolean }>(ben, 'POST', `${base}/tasks/${taskId}/complete`, {
      note: 'Zehenraum ist knapp geworden.',
      stateUpdates: [{ stateDefinitionId: shoeSizeDefId, valueKind: 'known', value: 29 }],
    })
    expect(result.state).toBe('done')

    // Freshness ist zurückgesetzt: die Angabe wurde gerade bestätigt.
    const value = await h.json<{ isStale: boolean; verifiedAt: string }>(
      anna,
      'GET',
      `${base}/state-definitions/${shoeSizeDefId}/value`,
    )
    expect(value.isStale).toBe(false)
    expect(new Date(value.verifiedAt).getTime()).toBe(h.clock.now().getTime())

    // Erneuter Abschluss ist idempotent, kein Fehler.
    const again = await h.json<{ alreadyDone: boolean }>(ben, 'POST', `${base}/tasks/${taskId}/complete`, {})
    expect(again.alreadyDone).toBe(true)

    // INV-009 / §44: Ownership unverändert, obwohl Person B ausgeführt hat.
    const domains = await h.json<{ items: { id: string; effectiveOwner: { displayName: string } | null }[] }>(
      anna,
      'GET',
      `${base}/domains`,
    )
    expect(domains.items.find((d) => d.id === schuheDomainId)?.effectiveOwner?.displayName).toBe('Anna')
  })

  it('MONITOR: nach der Bestätigung meldet sich die Regel nicht mehr und löst das Signal auf', async () => {
    const { anna, householdId } = family
    const result = await h.json<{ signalsCreated: number; bucketsResolved: number }>(
      anna,
      'POST',
      `/api/v1/households/${householdId}/monitors/${monitorId}/evaluate`,
    )
    expect(result.signalsCreated).toBe(0)
    expect(result.bucketsResolved).toBeGreaterThan(0)
  })

  it('KNOW → ACT: aus der Beobachtung „Schuhe werden knapp" entsteht ein neuer Vorgang', async () => {
    const { anna, householdId } = family
    const base = `/api/v1/households/${householdId}`

    // Ein paar Tage später wird tatsächlich nachgemessen. Der zeitliche Abstand ist wichtig:
    // innerhalb des Konfliktfensters wären zwei abweichende Angaben ein sichtbarer Widerspruch
    // statt einer Korrektur (§10).
    h.clock.advanceDays(3)

    const captured = await h.json<{ id: string; suggestion: { targetType: string; reason: string } }>(
      anna,
      'POST',
      `${base}/capture`,
      { text: 'Schuhe von Kind A werden knapp, neue besorgen' },
    )
    expect(captured.suggestion.targetType).toBe('task')
    expect(captured.suggestion.reason.length).toBeGreaterThan(10)

    const playbook = await h.json<{ id: string }>(anna, 'POST', `${base}/knowledge`, {
      domainId: schuheDomainId,
      kind: 'how_to',
      title: 'Marke X passt gut',
      body: 'Bei Kind A passen Modelle von Marke X gut; Weite mittel.',
    })
    expect(playbook.id).toBeTruthy()

    const process = await h.json<{ id: string }>(anna, 'POST', `${base}/processes`, {
      domainId: schuheDomainId,
      title: 'Neue Schuhe besorgen',
      goal: 'Kind A hat wieder passende Schuhe.',
    })

    const measure = await h.json<{ id: string }>(anna, 'POST', `${base}/tasks`, {
      title: 'Füße messen',
      processId: process.id,
      estimatedMinutes: 5,
      mentalEnergy: 'low',
    })

    const detail = await h.json<{ nextActions: { id: string }[] }>(anna, 'GET', `${base}/processes/${process.id}`)
    expect(detail.nextActions.map((t) => t.id)).toEqual([measure.id])

    // Abschluss mit neuem Wissen und aktualisiertem Zustand – der LEARN-Rückfluss.
    await h.json(anna, 'POST', `${base}/tasks/${measure.id}/complete`, {
      stateUpdates: [{ stateDefinitionId: shoeSizeDefId, valueKind: 'known', value: 30, note: 'nachgemessen' }],
    })
    await h.json(anna, 'POST', `${base}/processes/${process.id}/complete`, {
      outcome: 'achieved',
      learnings: 'Marke X in Größe 30 gekauft.',
    })

    const value = await h.json<{ value: number; origin: string; confirmedAt: string }>(
      anna,
      'GET',
      `${base}/state-definitions/${shoeSizeDefId}/value`,
    )
    expect(value.value).toBe(30)
    expect(value.origin).toBe('human')
    expect(value.confirmedAt).toBeTruthy()

    const knowledge = await h.json<{ items: { title: string }[] }>(anna, 'GET', `${base}/knowledge?domainId=${schuheDomainId}`)
    expect(knowledge.items.map((k) => k.title)).toContain('Marke X passt gut')
  })

  it('§33: die Historie erzählt den Vorgang lückenlos nach', async () => {
    const { anna, householdId } = family
    const history = await h.json<{ items: { eventType: string; subjectType: string }[] }>(
      anna,
      'GET',
      `/api/v1/households/${householdId}/history?subjectId=${taskId}`,
    )
    const types = history.items.map((e) => e.eventType)
    expect(types).toContain('task.created')
    expect(types).toContain('task.state_changed')

    const domainHistory = await h.json<{ items: { eventType: string }[] }>(
      anna,
      'GET',
      `/api/v1/households/${householdId}/history?domainId=${schuheDomainId}`,
    )
    expect(domainHistory.items.length).toBeGreaterThan(0)
  })

  it('§34: eine reine Personenhistorie gibt es bewusst nicht', async () => {
    const { anna, householdId } = family
    const response = await h.request(anna, 'GET', `/api/v1/households/${householdId}/history`)
    expect(response.statusCode).toBe(422)
    expect(response.json<{ detail: string }>().detail).toContain('Personenhistorie')
  })

  it('Zeitreise: der Ablauf umfasst 7 Wochen bis zum Hinweis plus 3 Tage bis zum Nachmessen', () => {
    const elapsed = h.clock.now().getTime() - new Date('2026-07-20T09:00:00.000Z').getTime()
    expect(elapsed).toBe(7 * MS.week + 3 * MS.day)
  })
})
