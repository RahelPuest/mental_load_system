import { and, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm'
import {
  attentionItems,
  monitors,
  processes,
  taskDependencies,
  tasks,
  temporaryCoverages,
  waitingStates,
  withTenant,
  withoutTenant,
  type Database,
  type Tx,
} from '@thealotta/db'
import { coverageExpireTarget, isStalled, uuidToTaskLike } from './helpers.js'
import type { MonitorEvaluateInput } from './monitor-evaluate.js'
import { systemActor } from '../context.js'
import { recordEvent } from './events.js'

export interface MaintenanceResult {
  overdueReassessed: number
  deferReleased: number
  waitingRechecked: number
  snoozedWoken: number
  coveragesActivated: number
  coveragesExpired: number
  stalledProcesses: number
}

/**
 * Sammeljob für zeitgesteuerte Übergänge.
 *
 * Zentrale Eigenschaft: Er überführt nichts in einen Endzustand. Jede Wirkung ist
 * „wieder sichtbar machen" oder „neu bewerten" – nie „stillschweigend schließen" (INV-001).
 * Alle Schritte sind idempotent: eine zweite Ausführung ändert nichts mehr.
 */
export async function runMaintenance(db: Database, householdId: string, now: Date): Promise<MaintenanceResult> {
  const actor = systemActor('job:maintenance')

  return withTenant(db, [householdId], async (tx) => {
    const result: MaintenanceResult = {
      overdueReassessed: 0,
      deferReleased: 0,
      waitingRechecked: 0,
      snoozedWoken: 0,
      coveragesActivated: 0,
      coveragesExpired: 0,
      stalledProcesses: 0,
    }

    // 1 ── Verpasste Zeitpunkte: neu bewerten, nicht verwerfen (§29).
    const overdue = await tx
      .update(tasks)
      .set({ overdueSince: sql`coalesce(overdue_since, due_at)`, lastReassessedAt: now })
      .where(
        and(
          eq(tasks.householdId, householdId),
          inArray(tasks.state, ['ready', 'in_progress', 'blocked', 'waiting', 'deferred']),
          isNotNull(tasks.dueAt),
          lte(tasks.dueAt, now),
          // Höchstens stündlich neu bewerten – sonst schreibt der Job bei jedem Lauf.
          or(isNull(tasks.lastReassessedAt), lt(tasks.lastReassessedAt, new Date(now.getTime() - 3_600_000))),
        ),
      )
      .returning({ id: tasks.id })
    result.overdueReassessed = overdue.length
    for (const t of overdue) {
      await recordEvent(tx, householdId, actor, {
        eventType: 'task.overdue_reassessed',
        subjectType: 'task',
        subjectId: t.id,
        payload: { reassessedAt: now.toISOString() },
        publish: false,
      })
    }

    // 2 ── Zurückgestellte Aufgaben kommen zurück.
    const undeferred = await tx
      .update(tasks)
      .set({ state: 'ready', version: sql`version + 1` })
      .where(
        and(
          eq(tasks.householdId, householdId),
          eq(tasks.state, 'deferred'),
          isNotNull(tasks.deferUntil),
          lte(tasks.deferUntil, now),
        ),
      )
      .returning({ id: tasks.id })
    result.deferReleased = undeferred.length

    // 3 ── Wartende Aufgaben werden zur Wiedervorlage sichtbar (§27).
    const dueWaits = await tx
      .select({ id: waitingStates.id, taskId: waitingStates.taskId })
      .from(waitingStates)
      .where(and(eq(waitingStates.householdId, householdId), isNull(waitingStates.releasedAt), lte(waitingStates.recheckAt, now)))

    for (const w of dueWaits) {
      await tx.update(waitingStates).set({ releasedAt: now, releaseReason: 'recheck_due' }).where(eq(waitingStates.id, w.id))
      await tx
        .update(tasks)
        .set({ state: 'ready', version: sql`version + 1` })
        .where(and(eq(tasks.id, w.taskId), eq(tasks.state, 'waiting')))
      await recordEvent(tx, householdId, actor, {
        eventType: 'task.waiting_released',
        subjectType: 'task',
        subjectId: w.taskId,
        payload: { reason: 'recheck_due' },
      })
    }
    result.waitingRechecked = dueWaits.length

    // 4 ── Abgelaufene Snoozes holen das Thema zurück.
    const woken = await tx
      .update(attentionItems)
      .set({ state: 'open', snoozedUntil: null, version: sql`version + 1` })
      .where(
        and(
          eq(attentionItems.householdId, householdId),
          eq(attentionItems.state, 'snoozed'),
          isNotNull(attentionItems.snoozedUntil),
          lte(attentionItems.snoozedUntil, now),
        ),
      )
      .returning({ id: attentionItems.id })
    result.snoozedWoken = woken.length

    // 5 ── Vertretungen aktivieren und auslaufen lassen (INV-014).
    const activated = await tx
      .update(temporaryCoverages)
      .set({ state: 'active', version: sql`version + 1` })
      .where(
        and(
          eq(temporaryCoverages.householdId, householdId),
          eq(temporaryCoverages.state, 'scheduled'),
          lte(temporaryCoverages.startsAt, now),
        ),
      )
      .returning({ id: temporaryCoverages.id })
    result.coveragesActivated = activated.length

    const expiring = await tx
      .select()
      .from(temporaryCoverages)
      .where(
        and(
          eq(temporaryCoverages.householdId, householdId),
          eq(temporaryCoverages.state, 'active'),
          lte(temporaryCoverages.endsAt, now),
        ),
      )
    for (const coverage of expiring) {
      const target = coverageExpireTarget(coverage.returnMode)
      await tx
        .update(temporaryCoverages)
        .set({ state: target, returnedAt: target === 'returned' ? now : null, version: sql`version + 1` })
        .where(eq(temporaryCoverages.id, coverage.id))
      await recordEvent(tx, householdId, actor, {
        eventType: target === 'returned' ? 'ownership.coverage_returned' : 'ownership.coverage_return_pending',
        subjectType: 'temporary_coverage',
        subjectId: coverage.id,
        payload: { domainId: coverage.domainId, returnMode: coverage.returnMode },
      })
    }
    result.coveragesExpired = expiring.length

    // 6 ── Vorgänge ohne nächsten Schritt sichtbar machen (INV-P04).
    result.stalledProcesses = await detectStalledProcesses(tx, householdId, now, actor)

    return result
  })
}

async function detectStalledProcesses(
  tx: Tx,
  householdId: string,
  now: Date,
  actor: ReturnType<typeof systemActor>,
): Promise<number> {
  const active = await tx
    .select()
    .from(processes)
    .where(and(eq(processes.householdId, householdId), eq(processes.state, 'active')))

  let count = 0
  for (const process of active) {
    const taskRows = await tx.select().from(tasks).where(eq(tasks.processId, process.id))
    const deps = await tx.select().from(taskDependencies).where(eq(taskDependencies.householdId, householdId))

    if (
      !isStalled(
        process.state,
        taskRows.map(uuidToTaskLike),
        deps.map((d) => ({ taskId: d.taskId, dependsOnTaskId: d.dependsOnTaskId })),
        now,
      )
    ) {
      continue
    }

    const inserted = await tx
      .insert(attentionItems)
      .values({
        householdId,
        domainId: process.domainId,
        signalKind: 'process_stalled',
        title: `${process.title}: nächsten Schritt festlegen`,
        whyNow:
          `Der Vorgang „${process.title}" ist offen, hat aber gerade keinen ausführbaren nächsten Schritt. ` +
          `Damit ist unklar, was als Nächstes passieren soll.`,
        ifItWaits: 'Der Vorgang bleibt bestehen, kommt aber nicht voran.',
        severity: 'notice',
        origin: 'system_rule',
        originRef: `process:${process.id}`,
      })
      .onConflictDoNothing()
      .returning({ id: attentionItems.id })

    if (inserted.length > 0) {
      count += 1
      await recordEvent(tx, householdId, actor, {
        eventType: 'process.stalled',
        subjectType: 'process',
        subjectId: process.id,
        payload: { domainId: process.domainId },
      })
    }
  }
  return count
}

/** Scanner: fällige Monitore über alle Haushalte, begrenzt und ohne Doppelvergabe. */
/** Ein fälliger Monitor, wie ihn der Scanner findet: `id` ist die des Monitors. */
export interface DueMonitor {
  id: string
  householdId: string
}

/**
 * Übersetzt einen gefundenen Monitor in die Eingabe von `evaluateMonitorJob`.
 *
 * Diese drei Zeilen sind der Grund, warum es diese Funktion gibt. Vorher reihte main.ts die
 * Zeile des Scanners unverändert ein – `{ id, householdId }` – und die Gegenseite las
 * `{ householdId, monitorId }`. `monitorId` war also immer `undefined`, jede Auswertung
 * scheiterte mit `UNDEFINED_VALUE`, und niemand merkte es: Der Idempotenztest ruft
 * `evaluateMonitorJob` direkt mit der richtigen Form auf, die Naht dazwischen war ungeprüft.
 * Jetzt liegt sie in einer Funktion, die man ohne Queue testen kann.
 */
export function monitorEvaluateInput(monitor: DueMonitor): MonitorEvaluateInput {
  return { householdId: monitor.householdId, monitorId: monitor.id }
}

export async function scanDueMonitors(db: Database, limit = 200): Promise<DueMonitor[]> {
  return withoutTenant(db, 'monitor_scanner_is_cross_tenant', async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, household_id FROM monitors
      WHERE enabled = true AND next_evaluation_at <= now()
      ORDER BY next_evaluation_at
      LIMIT ${limit}
    `)
    return (rows as unknown as { id: string; household_id: string }[]).map((r) => ({
      id: r.id,
      householdId: r.household_id,
    }))
  })
}

/** Haushalte, die überhaupt Wartung brauchen – vermeidet Arbeit proportional zur Nutzerzahl. */
export async function scanHouseholdsNeedingMaintenance(db: Database, limit = 500): Promise<string[]> {
  return withoutTenant(db, 'maintenance_scanner_is_cross_tenant', async (tx) => {
    const rows = await tx.execute(sql`
      SELECT DISTINCT household_id FROM (
        SELECT household_id FROM tasks
          WHERE state IN ('ready','in_progress','blocked','waiting','deferred')
            AND ((due_at IS NOT NULL AND due_at <= now()) OR (defer_until IS NOT NULL AND defer_until <= now()))
        UNION ALL
        SELECT household_id FROM waiting_states WHERE released_at IS NULL AND recheck_at <= now()
        UNION ALL
        SELECT household_id FROM attention_items WHERE state = 'snoozed' AND snoozed_until <= now()
        UNION ALL
        SELECT household_id FROM temporary_coverages
          WHERE (state = 'scheduled' AND starts_at <= now()) OR (state = 'active' AND ends_at <= now())
        UNION ALL
        SELECT household_id FROM processes WHERE state = 'active'
      ) AS due
      LIMIT ${limit}
    `)
    return (rows as unknown as { household_id: string }[]).map((r) => r.household_id)
  })
}

void monitors
