import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { monitors, stateDefinitions, uuidv7, withTenant } from '@thealotta/db'
import { monitorEvaluateInput, scanDueMonitors } from '../src/jobs/maintenance.js'
import { evaluateMonitorJob } from '../src/jobs/monitor-evaluate.js'
import { seedWorkerFixture, type WorkerFixture } from './db-helpers.js'

/**
 * Die Naht zwischen Scanner und Auswertung.
 *
 * `monitor.scan` findet fällige Monitore, `monitor.evaluate` wertet sie aus. Beide Seiten
 * waren einzeln getestet – die Übergabe dazwischen nicht. Sie war falsch: Eingereiht wurde
 * `{ id, householdId }`, gelesen `{ householdId, monitorId }`. `monitorId` war immer
 * `undefined`, jede Auswertung scheiterte mit `UNDEFINED_VALUE`, und der Idempotenztest blieb
 * grün, weil er `evaluateMonitorJob` direkt mit der richtigen Form aufruft.
 *
 * Deshalb prüft dieser Test nicht die Enden, sondern den Weg: was der Scanner liefert, muss
 * ohne Zutun als Eingabe der Auswertung taugen.
 */
let f: WorkerFixture
const NOW = new Date('2026-09-07T09:00:00.000Z')

beforeAll(async () => {
  f = await seedWorkerFixture('naht')
}, 180_000)
afterAll(async () => f?.handle.close())

describe('Übergabe von monitor.scan an monitor.evaluate', () => {
  it('was der Scanner findet, wertet die Auswertung tatsächlich aus', async () => {
    const definitionId = uuidv7()
    const monitorId = uuidv7()

    await withTenant(f.db, [f.householdId], async (tx) => {
      await tx.insert(stateDefinitions).values({
        id: definitionId,
        householdId: f.householdId,
        domainId: f.domainId,
        key: `naht-${monitorId.slice(-8)}`,
        label: 'Reifenwechsel',
        dataType: 'date',
      })
      await tx.insert(monitors).values({
        id: monitorId,
        householdId: f.householdId,
        domainId: f.domainId,
        stateDefinitionId: definitionId,
        name: 'Reifen prüfen',
        ruleKind: 'state_unknown',
        // In der Vergangenheit, damit der Scanner ihn als fällig findet.
        nextEvaluationAt: new Date(NOW.getTime() - 60_000),
      })
    })

    const faellig = await scanDueMonitors(f.db)
    const unser = faellig.find((m) => m.id === monitorId)
    expect(unser, 'der angelegte Monitor muss als fällig gefunden werden').toBeDefined()

    const eingabe = monitorEvaluateInput(unser!)

    // Der eigentliche Punkt: beide Felder gefüllt. Mit dem Fehler wäre monitorId undefined.
    expect(eingabe).toEqual({ householdId: f.householdId, monitorId })

    // Und der Beweis, dass die Auswertung den Monitor damit auch findet: Ein leerer oder
    // falscher Bezeichner hätte hier still { signalsCreated: 0 } ergeben, ohne den Monitor
    // je anzufassen. Der gesetzte Auswertungszeitpunkt schließt das aus.
    await evaluateMonitorJob(f.db, eingabe, NOW)

    const [danach] = await withTenant(f.db, [f.householdId], async (tx) =>
      tx.select().from(monitors).where(eq(monitors.id, monitorId)).limit(1),
    )
    expect(danach?.lastEvaluatedAt, 'die Auswertung muss den Monitor erreicht haben').not.toBeNull()
  })

  it('die Übersetzung nimmt die Monitorkennung, nicht die des Haushalts', () => {
    const eingabe = monitorEvaluateInput({ id: 'monitor-1', householdId: 'haushalt-1' })
    expect(eingabe.monitorId).toBe('monitor-1')
    expect(eingabe.householdId).toBe('haushalt-1')
  })
})
