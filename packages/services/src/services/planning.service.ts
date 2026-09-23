import { and, eq, isNull, sql } from 'drizzle-orm'
import { planningPreferences, situationalCues, tasks, type Tx } from '@thealotta/db'
import type { PlanHorizon, PlanStrategy } from '@thealotta/contracts'
import type { Cue } from '@thealotta/domain'

export interface PlanningSettings {
  horizon: PlanHorizon
  strategy: PlanStrategy
  aging: boolean
  slack: boolean
}

/**
 * Die Vorgaben, wenn niemand etwas eingestellt hat.
 *
 * „Frist zuerst" als Anfang, weil es die Reihenfolge ist, die niemand erklären muss.
 * Alterung und Puffer sind AN: Das erste ist die Zusicherung, dass nichts verhungert, das
 * zweite folgt dem am besten belegten Befund dieser Ansicht (Planungsfehlschluss).
 * Beides auszuschalten ist möglich – aber es ist eine Entscheidung, keine Voreinstellung.
 */
export const PLANNING_DEFAULTS: PlanningSettings = {
  horizon: 'day',
  strategy: 'deadline_first',
  aging: true,
  slack: true,
}

export class PlanningService {
  /** Persönliche Vorgaben des Betrachters; fehlt die Zeile, gilt die Vorgabe. */
  async settingsFor(tx: Tx, householdId: string, membershipId: string): Promise<PlanningSettings> {
    const [row] = await tx
      .select()
      .from(planningPreferences)
      .where(and(eq(planningPreferences.householdId, householdId), eq(planningPreferences.viewerMembershipId, membershipId)))
      .limit(1)
    if (!row) return PLANNING_DEFAULTS
    return {
      horizon: row.horizon as PlanHorizon,
      strategy: row.strategy as PlanStrategy,
      aging: row.aging,
      slack: row.slack,
    }
  }

  /**
   * Hat der Betrachter je etwas eingestellt?
   *
   * Getrennt von `settingsFor`, weil „keine Zeile" hier etwas anderes bedeutet als dort:
   * Dort heißt es „nimm die Vorgabe", hier heißt es „diese Person hat nie eine Liste
   * gewollt – zeig ihr keine".
   */
  async hasPreference(tx: Tx, householdId: string, membershipId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: planningPreferences.id })
      .from(planningPreferences)
      .where(and(eq(planningPreferences.householdId, householdId), eq(planningPreferences.viewerMembershipId, membershipId)))
      .limit(1)
    return row !== undefined
  }

  /** Vorgaben merken. Ein Upsert, weil „einmal eingestellt" kein Sonderfall ist. */
  async remember(tx: Tx, householdId: string, membershipId: string, settings: PlanningSettings): Promise<void> {
    await tx
      .insert(planningPreferences)
      .values({ householdId, viewerMembershipId: membershipId, ...settings })
      .onConflictDoUpdate({
        target: planningPreferences.viewerMembershipId,
        set: { ...settings, updatedAt: new Date() },
      })
  }

  /** Alle nicht archivierten Anlässe des Haushalts. */
  async cues(tx: Tx, householdId: string): Promise<Cue[]> {
    const rows = await tx
      .select({ id: situationalCues.id, label: situationalCues.label })
      .from(situationalCues)
      .where(and(eq(situationalCues.householdId, householdId), isNull(situationalCues.archivedAt)))
    return rows
  }

  /**
   * Einen Anlass anlegen.
   *
   * Der Name ist die Nachhälfte von „wenn …": „beim nächsten Einkauf", nicht „Einkauf".
   * Das ist keine Kosmetik – die Wirkung der Vorsatzbildung hängt daran, dass ein konkreter
   * Auslöser benannt ist und nicht ein Themengebiet (docs/80 §5).
   *
   * Gleich benannte Anlässe wären zwei Listen für dieselbe Situation; der eindeutige Index
   * in 0013 verhindert das, hier wird der bestehende zurückgegeben statt ein Fehler geworfen.
   */
  async createCue(tx: Tx, householdId: string, label: string): Promise<Cue> {
    const sauber = label.trim()
    const [row] = await tx
      .insert(situationalCues)
      .values({ householdId, label: sauber })
      .onConflictDoNothing()
      .returning({ id: situationalCues.id, label: situationalCues.label })
    if (row) return row
    const [vorhanden] = await tx
      .select({ id: situationalCues.id, label: situationalCues.label })
      .from(situationalCues)
      .where(and(eq(situationalCues.householdId, householdId), eq(situationalCues.label, sauber)))
      .limit(1)
    return vorhanden!
  }

  /**
   * Anlässe mit der Zahl daran hängender Aufgaben.
   *
   * Die Zahl ist der einzige Grund, warum diese Liste nützlich ist: Ein Anlass ohne Aufgaben
   * ist eine leere Absicht, und einer mit sieben ist eine Einkaufsliste.
   */
  async cuesWithCounts(
    tx: Tx,
    householdId: string,
  ): Promise<{ id: string; label: string; lastOccurredAt: Date | null; taskCount: number }[]> {
    const rows = await tx
      .select({
        id: situationalCues.id,
        label: situationalCues.label,
        lastOccurredAt: situationalCues.lastOccurredAt,
        taskCount: sql<number>`count(${tasks.id})::int`,
      })
      .from(situationalCues)
      .leftJoin(tasks, eq(tasks.cueId, situationalCues.id))
      .where(and(eq(situationalCues.householdId, householdId), isNull(situationalCues.archivedAt)))
      .groupBy(situationalCues.id, situationalCues.label, situationalCues.lastOccurredAt)
      .orderBy(situationalCues.label)
    return rows
  }

  /** Einen Anlass zur Seite legen. Kein DELETE: Aufgaben hängen daran (0013, ON DELETE SET NULL). */
  async archiveCue(tx: Tx, householdId: string, cueId: string, now: Date): Promise<void> {
    await tx
      .update(situationalCues)
      .set({ archivedAt: now })
      .where(and(eq(situationalCues.householdId, householdId), eq(situationalCues.id, cueId)))
  }

  /**
   * Bestätigen, dass der Anlass eingetreten ist.
   *
   * Rein informativ – es steuert keine Sichtbarkeit. Sonst wäre es wieder die Umstandsauswahl
   * aus Migration 0006: ein Filter, der ohne gepflegte Selbstauskunft falsch filtert.
   */
  async markCueOccurred(tx: Tx, householdId: string, cueId: string, now: Date): Promise<void> {
    await tx
      .update(situationalCues)
      .set({ lastOccurredAt: now })
      .where(and(eq(situationalCues.householdId, householdId), eq(situationalCues.id, cueId)))
  }

  /** Eine Aufgabe an einen Anlass hängen – oder lösen (null). */
  async attachCue(tx: Tx, householdId: string, taskId: string, cueId: string | null): Promise<void> {
    await tx
      .update(tasks)
      .set({ cueId })
      .where(and(eq(tasks.householdId, householdId), eq(tasks.id, taskId)))
  }

  /**
   * Zuordnung Aufgabe → Anlass.
   *
   * Bewusst als eigene Abfrage und nicht als Verbund: Der Anlass ist eine Beigabe zur
   * Aufgabe, keine Voraussetzung. Fehlt er, fehlt nichts.
   */
  async cueBySubject(tx: Tx, householdId: string): Promise<Map<string, Cue>> {
    const rows = await tx
      .select({ taskId: tasks.id, cueId: situationalCues.id, label: situationalCues.label })
      .from(tasks)
      .innerJoin(situationalCues, eq(situationalCues.id, tasks.cueId))
      .where(and(eq(tasks.householdId, householdId), isNull(situationalCues.archivedAt)))
    return new Map(rows.map((r) => [r.taskId, { id: r.cueId, label: r.label }]))
  }
}

/**
 * Mitternacht in der Zeitzone des Haushalts, ausgedrückt als echter Zeitpunkt.
 *
 * Die Domänenschicht bekommt den fertigen Zeitpunkt und rechnet nur noch mit Millisekunden –
 * sie kennt keine Zeitzonen und soll keine kennen. Ohne diese Umrechnung läge der Tagesbeginn
 * je nach Sommerzeit ein oder zwei Stunden falsch, und eine Aufgabe mit Frist um 00:30 landete
 * im falschen Abschnitt.
 */
export function startOfDayIn(timezone: string, at: Date): Date {
  const versatz = zoneOffsetMs(timezone, at)
  const lokal = new Date(at.getTime() + versatz)
  const mitternachtLokal = Date.UTC(lokal.getUTCFullYear(), lokal.getUTCMonth(), lokal.getUTCDate())
  return new Date(mitternachtLokal - versatz)
}

/** Versatz der Zone zu genau diesem Zeitpunkt – inklusive Sommerzeit. */
function zoneOffsetMs(timezone: string, at: Date): number {
  const teile = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const p: Record<string, string> = {}
  for (const teil of teile) if (teil.type !== 'literal') p[teil.type] = teil.value
  const alsUtc = Date.UTC(
    Number(p['year']),
    Number(p['month']) - 1,
    Number(p['day']),
    Number(p['hour']) % 24,
    Number(p['minute']),
    Number(p['second']),
  )
  return alsUtc - at.getTime()
}
