import { and, eq, inArray, isNull, lte } from 'drizzle-orm'
import {
  domains,
  householdMemberships,
  monitors,
  tasks,
  waitingStates,
  type Tx,
} from '@thealotta/db'
import { authorize, type EffectiveContext } from '@thealotta/domain'
import { CalendarService } from './calendar.service.js'
import { DomainService } from './domain.service.js'

const calendarService = new CalendarService(null as never)
const domainService = new DomainService()

/**
 * Der gemeinsame Plan: was ansteht, für alle sichtbar.
 *
 * Die „Jetzt"-Ansicht beantwortet „was soll *ich* tun". Diese hier beantwortet die andere
 * Frage, die in einem Haushalt ständig gestellt wird: „Was steht diese Woche an – und bei
 * wem?" Ohne sie muss man die Antwort im Kopf zusammensetzen, und genau das soll das
 * Produkt abnehmen.
 *
 * Zwei Dinge bleiben dabei unberührt:
 *  - Die Berechtigungen. Wer einen Bereich nicht sehen darf, sieht seine Aufgaben auch
 *    hier nicht (INV-005). Fremde Kalendertitel bleiben verborgen, wenn die Freigabe nur
 *    „belegt" sagt (§14.3).
 *  - Die Trennung von Verantwortung und Ausführung. Jeder Eintrag nennt beide, wenn sie
 *    auseinanderfallen (INV-009).
 */
export interface AgendaEntry {
  kind: 'event' | 'task' | 'check'
  id: string
  title: string
  at: string
  endsAt: string | null
  allDay: boolean
  domain: { id: string; name: string } | null
  /** Wer mitdenkt. */
  owner: { membershipId: string; displayName: string } | null
  /** Wer ausführt, falls jemand anderes. */
  assignee: { membershipId: string; displayName: string } | null
  /** Inhalt verborgen, weil die Kalenderfreigabe nur „belegt" erlaubt. */
  hidden: boolean
}

export interface AgendaDay {
  date: string
  entries: AgendaEntry[]
}

export interface AgendaResponse {
  from: string
  to: string
  /**
   * Was schon länger dasteht. Ein Plan, der nur nach vorn schaut, versteckt genau das,
   * weswegen man ihn aufmacht – und §36 verbietet dabei den Ton des Vorwurfs: Der
   * Zeitpunkt ist vorbei, mehr sagt es nicht.
   */
  overdue: AgendaEntry[]
  days: AgendaDay[]
  /** Offene Sachen ohne Datum, gebündelt nach Person – der größere Teil des Alltags. */
  perMember: {
    membershipId: string
    displayName: string
    open: number
    waiting: number
    items: { id: string; title: string; domain: string | null }[]
  }[]
  unassigned: { id: string; title: string; domain: string | null }[]
}

const OPEN_STATES = ['ready', 'in_progress', 'blocked', 'waiting', 'deferred']

const dayKey = (d: Date, timezone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

export class AgendaService {
  constructor(private readonly calendar: CalendarService = calendarService) {}

  async build(
    tx: Tx,
    ctx: EffectiveContext,
    range: { from: Date; to: Date; timezone: string },
  ): Promise<AgendaResponse> {
    const members = await tx
      .select({ id: householdMemberships.id, displayName: householdMemberships.displayName })
      .from(householdMemberships)
      .where(and(eq(householdMemberships.householdId, ctx.householdId), eq(householdMemberships.status, 'active')))
    const nameOf = new Map(members.map((m) => [m.id, m.displayName]))

    const domainRows = await tx.select().from(domains).where(eq(domains.householdId, ctx.householdId))
    const domainById = new Map(domainRows.map((d) => [d.id, d]))
    const owners = await domainService.list(tx, ctx, range.from)
    const ownerByDomain = new Map(owners.map((o) => [o.id, o.effectiveOwner]))

    const taskRows = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.householdId, ctx.householdId), inArray(tasks.state, OPEN_STATES)))
      .limit(500)
    const visible = taskRows.filter((t) => can(ctx, 'task:read', t.domainId))

    const waiting = visible.length
      ? await tx
          .select({ taskId: waitingStates.taskId })
          .from(waitingStates)
          .where(and(inArray(waitingStates.taskId, visible.map((t) => t.id)), isNull(waitingStates.releasedAt)))
      : []
    const waitingTasks = new Set(waiting.map((w) => w.taskId))

    /* ── Datierte Einträge ─────────────────────────────────────────── */
    const entries: AgendaEntry[] = []

    const events = await this.calendar.events(tx, ctx, { from: range.from, to: range.to })
    for (const event of events) {
      entries.push({
        kind: 'event',
        id: event.id,
        title: event.title,
        at: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        allDay: event.allDay,
        domain: null,
        owner: null,
        assignee: null,
        hidden: event.contentHidden,
      })
    }

    const overdue: AgendaEntry[] = []

    for (const task of visible) {
      if (!task.dueAt) continue
      if (task.dueAt > range.to) continue
      const domain = task.domainId ? domainById.get(task.domainId) : undefined
      const owner = task.domainId ? ownerByDomain.get(task.domainId) : null
      const entry: AgendaEntry = {
        kind: 'task',
        id: task.id,
        title: task.title,
        at: task.dueAt.toISOString(),
        endsAt: null,
        allDay: false,
        domain: domain ? { id: domain.id, name: domain.name } : null,
        owner: owner ? { membershipId: owner.membershipId, displayName: owner.displayName } : null,
        assignee:
          task.assigneeMembershipId && task.assigneeMembershipId !== owner?.membershipId
            ? {
                membershipId: task.assigneeMembershipId,
                displayName: nameOf.get(task.assigneeMembershipId) ?? 'unbekannt',
              }
            : null,
        hidden: false,
      }
      if (task.dueAt < range.from) overdue.push(entry)
      else entries.push(entry)
    }

    /* Fällige Prüfungen sind Termine mit dem System selbst. */
    const checks = await tx
      .select()
      .from(monitors)
      .where(
        and(
          eq(monitors.householdId, ctx.householdId),
          eq(monitors.enabled, true),
          lte(monitors.nextEvaluationAt, range.to),
        ),
      )
      .limit(100)
    for (const check of checks) {
      if (!can(ctx, 'task:read', check.domainId)) continue
      const domain = domainById.get(check.domainId)
      const owner = ownerByDomain.get(check.domainId)
      const target = check.nextEvaluationAt < range.from ? overdue : entries
      target.push({
        kind: 'check',
        id: check.id,
        title: check.name,
        at: check.nextEvaluationAt.toISOString(),
        endsAt: null,
        allDay: true,
        domain: domain ? { id: domain.id, name: domain.name } : null,
        owner: owner ? { membershipId: owner.membershipId, displayName: owner.displayName } : null,
        assignee: null,
        hidden: false,
      })
    }

    const byDay = new Map<string, AgendaEntry[]>()
    for (const entry of entries) {
      const key = dayKey(new Date(entry.at), range.timezone)
      byDay.set(key, [...(byDay.get(key) ?? []), entry])
    }
    const days: AgendaDay[] = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => ({
        date,
        entries: list.sort((a, b) => a.at.localeCompare(b.at)),
      }))

    /* ── Offenes ohne Datum, nach Person ───────────────────────────── */
    const undated = visible.filter((t) => !t.dueAt)
    const bucket = new Map<string, typeof undated>()
    const unassigned: AgendaResponse['unassigned'] = []
    for (const task of undated) {
      const owner = task.domainId ? ownerByDomain.get(task.domainId) : null
      const holder = task.assigneeMembershipId ?? owner?.membershipId ?? null
      if (!holder) {
        unassigned.push({
          id: task.id,
          title: task.title,
          domain: task.domainId ? (domainById.get(task.domainId)?.name ?? null) : null,
        })
        continue
      }
      bucket.set(holder, [...(bucket.get(holder) ?? []), task])
    }

    const perMember = members
      .map((member) => {
        const list = bucket.get(member.id) ?? []
        return {
          membershipId: member.id,
          displayName: member.displayName,
          open: list.length,
          waiting: list.filter((t) => waitingTasks.has(t.id)).length,
          items: list.slice(0, 3).map((t) => ({
            id: t.id,
            title: t.title,
            domain: t.domainId ? (domainById.get(t.domainId)?.name ?? null) : null,
          })),
        }
      })
      /* Wer nichts trägt, verschwindet nicht – sonst sähe es aus, als gäbe es die Person nicht. */
      .sort((a, b) => b.open - a.open)

    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      overdue: overdue.sort((a, b) => a.at.localeCompare(b.at)).slice(0, 20),
      days,
      perMember,
      unassigned: unassigned.slice(0, 10),
    }
  }
}

function can(ctx: EffectiveContext, capability: 'task:read', domainId: string | null): boolean {
  try {
    authorize(ctx, capability, { type: 'generic', id: null, householdId: ctx.householdId, domainId })
    return true
  } catch {
    return false
  }
}
