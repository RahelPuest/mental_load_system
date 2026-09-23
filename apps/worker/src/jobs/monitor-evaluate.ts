import { eq } from 'drizzle-orm'
import { domains, householdMemberships, monitors, withTenant, type Database } from '@thealotta/db'
import { MonitorService } from '@thealotta/services'
import type { EffectiveContext } from '@thealotta/domain'
import { monitorEvaluations, signalsRaised } from '@thealotta/observability'
import { systemActor } from '../context.js'

const service = new MonitorService()

/**
 * Eingabe des Jobs. Benannt und exportiert, weil sie über eine Queue geht: Dort ist die
 * Nutzlast `unknown`, und ein `as`-Cast auf der Leseseite würde jeden Tippfehler der
 * Schreibseite verschlucken. Genau das ist hier passiert – siehe `monitorEvaluateInput()`
 * in maintenance.ts.
 */
export interface MonitorEvaluateInput {
  householdId: string
  monitorId: string
}

/**
 * Auswertung eines Monitors im Hintergrund.
 *
 * Der Job nutzt exakt denselben Service wie die manuelle Auswertung über die API – dieselbe
 * Idempotenz, dieselbe Bündelung, dieselben Begründungen. Der Unterschied liegt nur im Akteur:
 * ein System-Akteur, für den die A3-Operationen unerreichbar sind (ADR-0008).
 */
export async function evaluateMonitorJob(
  db: Database,
  input: MonitorEvaluateInput,
  now: Date,
): Promise<{ signalsCreated: number; attentionCreated: number }> {
  return withTenant(db, [input.householdId], async (tx) => {
    const [monitor] = await tx.select().from(monitors).where(eq(monitors.id, input.monitorId)).limit(1)
    if (!monitor) return { signalsCreated: 0, attentionCreated: 0 }

    const ctx = await systemContext(tx, input.householdId, `monitor:${input.monitorId}`)

    try {
      const result = await service.evaluate(tx, ctx, input.monitorId, now)
      monitorEvaluations.labels(monitor.ruleKind, result.signalsCreated > 0 ? 'signal' : 'quiet').inc()
      for (let i = 0; i < result.signalsCreated; i += 1) signalsRaised.labels(monitor.ruleKind).inc()
      return { signalsCreated: result.signalsCreated, attentionCreated: result.attentionCreated.length }
    } catch (error) {
      monitorEvaluations.labels(monitor.ruleKind, 'error').inc()
      // Ein defekter Monitor darf die anderen nicht blockieren (docs/10, Poison-Pill-Schutz).
      await tx
        .update(monitors)
        .set({
          consecutiveFailures: monitor.consecutiveFailures + 1,
          lastError: error instanceof Error ? error.message.slice(0, 300) : 'unbekannter Fehler',
          nextEvaluationAt: new Date(now.getTime() + 60 * 60_000),
        })
        .where(eq(monitors.id, input.monitorId))
      throw error
    }
  })
}

/**
 * Ein Berechtigungskontext für System-Akteure.
 *
 * Er trägt bewusst die Rolle `admin` innerhalb genau eines Haushalts: Der Job braucht
 * Lesezugriff auf den ganzen Haushalt, kann aber wegen `kind: 'system'` keine
 * Verantwortungs- oder Rechteänderung auslösen.
 */
export async function systemContext(
  tx: Parameters<typeof withTenant>[2] extends (tx: infer T) => unknown ? T : never,
  householdId: string,
  ref: string,
): Promise<EffectiveContext> {
  const domainRows = await tx.select({ id: domains.id, path: domains.path }).from(domains).where(eq(domains.householdId, householdId))
  const [anyMember] = await tx
    .select({ id: householdMemberships.id })
    .from(householdMemberships)
    .where(eq(householdMemberships.householdId, householdId))
    .limit(1)

  return {
    actor: systemActor(ref),
    evaluatedAt: new Date(),
    householdIds: [householdId],
    householdId,
    // Der Systemkontext braucht eine Mitgliedschafts-ID nur als Referenz für Events;
    // fachliche Zuweisungen entstehen daraus nicht.
    membershipId: anyMember?.id ?? '00000000-0000-4000-8000-000000000000',
    role: 'admin',
    grants: [],
    assignments: [],
    activeCoverages: [],
    domainPaths: new Map(domainRows.map((d) => [d.id, d.path])),
    capacity: { level: 'normal', acceptsNewAssignments: true, criticalOnly: false, mutePush: false },
  }
}
