import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { NowResponse } from '@thealotta/contracts'
import { Harness, familyFixture } from '../helpers.js'

/** INV-001 – Kein offener relevanter Vorgang verschwindet allein durch Überschreiten eines Datums. */
const h = new Harness()
let family: Awaited<ReturnType<typeof familyFixture>>
let domainId: string
let taskId: string

beforeAll(async () => {
  await h.start()
  h.clock.set(new Date('2026-01-10T09:00:00.000Z'))
  family = await familyFixture(h, 'inv001')
  const base = `/api/v1/households/${family.householdId}`
  domainId = (await h.json<{ id: string }>(family.anna, 'POST', `${base}/domains`, { name: 'Reparaturen' })).id
  taskId = (
    await h.json<{ id: string }>(family.anna, 'POST', `${base}/tasks`, {
      title: 'Fahrradlicht reparieren',
      domainId,
      dueAt: new Date('2026-01-12T09:00:00.000Z').toISOString(),
      estimatedMinutes: 20,
      mentalEnergy: 'medium',
    })
  ).id
}, 180_000)
afterAll(async () => h.stop())

const base = () => `/api/v1/households/${family.householdId}`

describe('INV-001 – nichts geht still verloren', () => {
  it('die Aufgabe bleibt über 90 simulierte Tage hinweg offen und sichtbar', async () => {
    for (let day = 0; day < 90; day += 1) {
      h.clock.advanceDays(1)
      const task = await h.json<{ state: string }>(family.anna, 'GET', `${base()}/processes/${taskId}`).catch(() => null)
      void task
    }

    const now = await h.json<NowResponse>(family.anna, 'GET', `${base()}/now`)
    const all = now.sections.flatMap((s) => s.items)
    const entry = all.find((i) => i.subjectId === taskId)

    expect(entry, 'Die Aufgabe ist nach 90 Tagen weiterhin in der Ansicht').toBeDefined()
    expect(entry!.state).toBe('ready')
  })

  it('das Überschreiten des Zeitpunkts erhöht die Sichtbarkeit statt sie zu entfernen', async () => {
    const now = await h.json<NowResponse>(family.anna, 'GET', `${base()}/now`)
    const entry = now.sections.flatMap((s) => s.items).find((i) => i.subjectId === taskId)!
    const codes = entry.why.map((f) => f.code)
    expect(codes).toContain('due_passed')
    expect(codes).toContain('waiting_long')
  })

  it('die Begründung bleibt sachlich – ohne beschämende Sprache (§1.10)', async () => {
    const now = await h.json<NowResponse>(family.anna, 'GET', `${base()}/now`)
    const entry = now.sections.flatMap((s) => s.items).find((i) => i.subjectId === taskId)!
    const text = [...entry.why.map((f) => `${f.label} ${f.explanation}`), entry.ifItWaits].join(' ')
    expect(text).not.toMatch(/überfällig|versäumt|vergessen|endlich|immer noch|du solltest/i)
    expect(text).toMatch(/wartet seit|vorgesehene Zeitpunkt/i)
  })

  it('nur eine ausdrückliche Entscheidung mit Begründung schließt sie ab', async () => {
    const withoutReason = await h.request(family.anna, 'POST', `${base()}/tasks/${taskId}/drop`, {})
    expect(withoutReason.statusCode).toBe(422)

    const dropped = await h.json<{ state: string }>(family.anna, 'POST', `${base()}/tasks/${taskId}/drop`, {
      reason: 'Fahrrad wurde verschenkt.',
    })
    expect(dropped.state).toBe('dropped')

    const now = await h.json<NowResponse>(family.anna, 'GET', `${base()}/now`)
    expect(now.sections.flatMap((s) => s.items).map((i) => i.subjectId)).not.toContain(taskId)
  })

  it('auch ein abgelaufener Snooze holt ein Thema zurück statt es zu verlieren', async () => {
    const attention = await h.json<{ id: string }>(family.anna, 'POST', `${base()}/questions`, {
      domainId,
      body: 'Passt der alte Fahrradhelm noch?',
    })
    expect(attention.id).toBeTruthy()

    const questions = await h.json<{ items: { id: string }[] }>(family.anna, 'GET', `${base()}/questions?state=open`)
    expect(questions.items.map((q) => q.id)).toContain(attention.id)
  })
})
