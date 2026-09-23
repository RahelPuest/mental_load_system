import { and, eq, isNull, sql } from 'drizzle-orm'
import {
  capacityStates,
  domains,
  householdMemberships,
  monitors,
  needs,
  processes,
  questions,
  responsibilityAssignments,
  stateDefinitions,
  stateValues,
  temporaryCoverages,
  waitingStates,
  type Tx,
} from '@thealotta/db'
import { OWNING_ASSIGNMENT_KINDS, type CapacityLevel, type Criticality } from '@thealotta/contracts'
import { authorize, notFound, type EffectiveContext } from '@thealotta/domain'

export type Band = 'deutlich mehr' | 'mehr' | 'ausgeglichen' | 'weniger' | 'deutlich weniger'

export interface BalanceDimension {
  key: string
  label: string
  question: string
  /** Bewusst kein Zahlenwert nach außen – nur das Band (ADR-0012 / INV-015). */
  members: { membershipId: string; displayName: string; band: Band }[]
  evenlyShared: boolean
}

export interface BalanceReport {
  dimensions: BalanceDimension[]
  dataQuality: {
    domainsTotal: number
    domainsWithOwner: number
    statesWithEffortEstimate: number
    statesTotal: number
    note: string
  }
  note: string
}

/**
 * §32 und ADR-0012: Verteilung sichtbar machen, ohne Scheinpräzision.
 *
 * Nach außen gibt es keine Zahl. „Du machst 47 %, ich 53 %" wirkt objektiv, ist es nicht, und
 * verwandelt ein Gespräch in einen Streit über die Messmethode. Stattdessen Bänder je Dimension
 * plus eine ehrliche Angabe, worauf die Einschätzung überhaupt beruht.
 */
export class FamilyService {
  async balance(tx: Tx, ctx: EffectiveContext): Promise<BalanceReport> {
    authorize(ctx, 'capacity:read_others', { type: 'balance', id: null, householdId: ctx.householdId })

    const [members, domainRows, assignments, monitorRows, processRows, stateDefs, stateVals, waits] = await Promise.all([
      tx
        .select({ id: householdMemberships.id, displayName: householdMemberships.displayName })
        .from(householdMemberships)
        .where(and(eq(householdMemberships.householdId, ctx.householdId), eq(householdMemberships.status, 'active'))),
      tx.select().from(domains).where(and(eq(domains.householdId, ctx.householdId), isNull(domains.archivedAt))),
      tx
        .select()
        .from(responsibilityAssignments)
        .where(
          and(eq(responsibilityAssignments.householdId, ctx.householdId), isNull(responsibilityAssignments.effectiveTo)),
        ),
      tx.select().from(monitors).where(eq(monitors.householdId, ctx.householdId)),
      tx
        .select()
        .from(processes)
        .where(and(eq(processes.householdId, ctx.householdId), eq(processes.state, 'active'))),
      tx.select().from(stateDefinitions).where(eq(stateDefinitions.householdId, ctx.householdId)),
      tx.select().from(stateValues).where(eq(stateValues.householdId, ctx.householdId)),
      tx.select().from(waitingStates).where(and(eq(waitingStates.householdId, ctx.householdId), isNull(waitingStates.releasedAt))),
    ])

    const owning = assignments.filter((a) => (OWNING_ASSIGNMENT_KINDS as readonly string[]).includes(a.assignmentKind))
    const ownedDomains = (membershipId: string): Set<string> =>
      new Set(owning.filter((a) => a.membershipId === membershipId).map((a) => a.domainId))

    const raw = members.map((member) => {
      const owned = ownedDomains(member.id)
      const criticalOwned = domainRows.filter(
        (d) => owned.has(d.id) && (d.criticality === 'high' || d.criticality === 'critical'),
      ).length
      const checks = monitorRows.filter((m) => owned.has(m.domainId) && m.enabled).length
      const running = processRows.filter((p) => owned.has(p.domainId)).length
      const unknowns = stateDefs.filter((def) => {
        if (!owned.has(def.domainId)) return false
        return stateVals.find((v) => v.stateDefinitionId === def.id)?.valueKind === 'unknown'
      }).length
      const external = waits.filter((w) => w.waitingKind === 'external_party' || w.waitingKind === 'delivery').length

      return {
        membershipId: member.id,
        displayName: member.displayName,
        values: {
          areas: owned.size,
          critical: criticalOwned,
          checks,
          running,
          uncertainty: unknowns,
          external: owned.size > 0 ? external : 0,
        },
      }
    })

    const dimension = (key: keyof (typeof raw)[number]['values'], label: string, question: string): BalanceDimension => {
      const values = raw.map((r) => r.values[key])
      const total = values.reduce((a, b) => a + b, 0)
      const mean = values.length > 0 ? total / values.length : 0
      const spread = Math.max(...values, 0) - Math.min(...values, 0)

      return {
        key,
        label,
        question,
        // Ohne Streuung gibt es nichts zu besprechen – dann heißt das Band für alle „ausgeglichen".
        evenlyShared: spread <= 1,
        members: raw.map((r) => ({
          membershipId: r.membershipId,
          displayName: r.displayName,
          band: toBand(r.values[key], mean, spread),
        })),
      }
    }

    const statesWithEffort = stateDefs.filter((d) => d.freshnessInterval !== null).length

    return {
      dimensions: [
        dimension('areas', 'Verantwortungsbereiche', 'Für wie viele Bereiche denkt jemand mit?'),
        dimension('critical', 'Wichtige Bereiche', 'Wer trägt die Bereiche, bei denen Liegenbleiben spürbar wäre?'),
        dimension('checks', 'Regelmäßiges Nachhalten', 'Wer muss an wiederkehrende Prüfungen denken?'),
        dimension('running', 'Laufende Vorgänge', 'Wer hat gerade wie viel in Arbeit?'),
        dimension('uncertainty', 'Offene Unklarheiten', 'Wo ist noch vieles ungeklärt?'),
        dimension('external', 'Abhängigkeiten nach außen', 'Wer wartet auf Antworten von Dritten?'),
      ],
      dataQuality: {
        domainsTotal: domainRows.length,
        domainsWithOwner: new Set(owning.map((a) => a.domainId)).size,
        statesWithEffortEstimate: statesWithEffort,
        statesTotal: stateDefs.length,
        note:
          `Die Einschätzung beruht auf ${new Set(owning.map((a) => a.domainId)).size} von ${domainRows.length} ` +
          `Bereichen mit eingetragener Verantwortung. Was niemandem zugeordnet ist, taucht hier nicht auf.`,
      },
      note:
        'Das ist eine Gesprächsgrundlage, kein Messergebnis. Vieles vom eigentlichen Mental Load – ' +
        'Vorausdenken, Aushandeln, im Kopf behalten – lässt sich nicht zählen und steht deshalb hier nicht.',
    }
  }

  /**
   * §25.2 Care Mode: „Person A braucht gerade Entlastung."
   *
   * Keine medizinische Bewertung – nur die Frage, was übernommen werden muss, was pausieren kann
   * und wo gerade niemand zuständig wäre.
   */
  async careMode(tx: Tx, ctx: EffectiveContext, membershipId: string, now: Date) {
    authorize(ctx, 'capacity:read_others', { type: 'care_mode', id: null, householdId: ctx.householdId })

    const [member] = await tx
      .select()
      .from(householdMemberships)
      .where(and(eq(householdMemberships.householdId, ctx.householdId), eq(householdMemberships.id, membershipId)))
      .limit(1)
    if (!member) throw notFound('Die Person')

    const [assignments, domainRows, coverages, capacity, processRows, monitorRows] = await Promise.all([
      tx
        .select()
        .from(responsibilityAssignments)
        .where(
          and(
            eq(responsibilityAssignments.householdId, ctx.householdId),
            eq(responsibilityAssignments.membershipId, membershipId),
            isNull(responsibilityAssignments.effectiveTo),
          ),
        ),
      tx.select().from(domains).where(and(eq(domains.householdId, ctx.householdId), isNull(domains.archivedAt))),
      tx
        .select()
        .from(temporaryCoverages)
        .where(
          and(
            eq(temporaryCoverages.householdId, ctx.householdId),
            sql`${temporaryCoverages.state} IN ('scheduled','active','pending_return')`,
          ),
        ),
      tx
        .select()
        .from(capacityStates)
        .where(and(eq(capacityStates.membershipId, membershipId), isNull(capacityStates.clearedAt)))
        .limit(1),
      tx
        .select()
        .from(processes)
        .where(and(eq(processes.householdId, ctx.householdId), eq(processes.state, 'active'))),
      tx.select().from(monitors).where(and(eq(monitors.householdId, ctx.householdId), eq(monitors.enabled, true))),
    ])

    const owned = assignments
      .filter((a) => (OWNING_ASSIGNMENT_KINDS as readonly string[]).includes(a.assignmentKind))
      .map((a) => domainRows.find((d) => d.id === a.domainId))
      .filter((d): d is typeof domainRows[number] => Boolean(d))

    const covered = new Set(coverages.map((c) => c.domainId))
    const rank: Record<Criticality, number> = { critical: 0, high: 1, normal: 2, low: 3 }

    const entries = owned
      .map((domain) => {
        const criticality = domain.criticality as Criticality
        const needsHandover = criticality === 'critical' || criticality === 'high'
        return {
          domainId: domain.id,
          name: domain.name,
          criticality,
          hasCoverage: covered.has(domain.id),
          activeProcesses: processRows.filter((p) => p.domainId === domain.id).length,
          activeChecks: monitorRows.filter((m) => m.domainId === domain.id).length,
          recommendation: needsHandover
            ? covered.has(domain.id)
              ? ('covered' as const)
              : ('needs_handover' as const)
            : ('can_pause' as const),
          reason: needsHandover
            ? covered.has(domain.id)
              ? 'Bereits vertreten – hier ist nichts zu tun.'
              : 'Wichtiger Bereich ohne Vertretung. Hier sollte jemand übernehmen.'
            : 'Kann ruhen. Was liegen bleibt, bleibt sichtbar und geht nicht verloren.',
        }
      })
      .sort((a, b) => rank[a.criticality] - rank[b.criticality])

    return {
      member: { membershipId: member.id, displayName: member.displayName },
      capacity: {
        level: (capacity[0]?.level ?? 'normal') as CapacityLevel,
        endsAt: capacity[0]?.endsAt ?? null,
        active: Boolean(capacity[0] && (!capacity[0].endsAt || capacity[0].endsAt.getTime() > now.getTime())),
      },
      needsHandover: entries.filter((e) => e.recommendation === 'needs_handover'),
      alreadyCovered: entries.filter((e) => e.recommendation === 'covered'),
      canPause: entries.filter((e) => e.recommendation === 'can_pause'),
      note:
        'Das ist kein Urteil über eine Person und keine medizinische Einschätzung. Es zeigt nur, ' +
        'was jemand gerade trägt und wo eine Vertretung sinnvoll wäre.',
    }
  }

  /**
   * §19 Wissensübergabe: Was müsste jemand wissen, um diesen Bereich zu übernehmen?
   *
   * Kern der Idee: Die übernehmende Person füllt selbst aus. Die bisher verantwortliche Person
   * korrigiert nur – sie soll nicht zur Projektleitung der eigenen Entlastung werden.
   */
  async handover(tx: Tx, ctx: EffectiveContext, domainId: string) {
    const [domain] = await tx
      .select()
      .from(domains)
      .where(and(eq(domains.householdId, ctx.householdId), eq(domains.id, domainId)))
      .limit(1)
    if (!domain) throw notFound('Der Bereich')
    authorize(ctx, 'domain:read', {
      type: 'domain',
      id: domainId,
      householdId: ctx.householdId,
      domainId,
      sensitivity: domain.sensitivity as never,
    })

    const [defs, values, openQuestions, monitorRows] = await Promise.all([
      tx
        .select()
        .from(stateDefinitions)
        .where(and(eq(stateDefinitions.domainId, domainId), isNull(stateDefinitions.archivedAt))),
      tx.select().from(stateValues).where(eq(stateValues.householdId, ctx.householdId)),
      tx
        .select()
        .from(questions)
        .where(and(eq(questions.householdId, ctx.householdId), eq(questions.domainId, domainId), eq(questions.state, 'open'))),
      tx.select().from(monitors).where(and(eq(monitors.domainId, domainId), eq(monitors.enabled, true))),
    ])

    const valueOf = (definitionId: string) => values.find((v) => v.stateDefinitionId === definitionId)

    const openStates = defs
      .map((def) => ({ def, value: valueOf(def.id) }))
      .filter(({ value }) => !value || value.valueKind === 'unknown' || value.verifiedAt === null)
      .map(({ def }) => ({
        stateDefinitionId: def.id,
        label: def.label,
        question: `Was gilt aktuell für „${def.label}"?`,
      }))

    const staleStates = defs
      .map((def) => ({ def, value: valueOf(def.id) }))
      .filter(({ value }) => value?.staleAt && value.staleAt.getTime() <= Date.now())
      .map(({ def }) => ({
        stateDefinitionId: def.id,
        label: def.label,
        question: `Stimmt „${def.label}" noch?`,
      }))

    // §19 nennt diese Fragen ausdrücklich – sie decken das ab, was sonst nur im Kopf existiert.
    const knowledgePrompts = [
      'Was muss regelmäßig überprüft werden – und woran merkt man, dass es Zeit ist?',
      'Wo liegen die Sachen, die dazugehören?',
      'Was hat in der Vergangenheit gut funktioniert?',
      'Was sollte man vermeiden?',
      'Gibt es saisonale Wechsel oder feste Termine?',
      'An wen wendet man sich bei Fragen?',
    ]

    return {
      domain: { id: domain.id, name: domain.name },
      openStates,
      staleStates,
      openQuestions: openQuestions.map((q) => ({ id: q.id, body: q.body })),
      knowledgePrompts,
      activeChecks: monitorRows.length,
      note:
        'Diese Liste ist ein Gesprächsleitfaden, keine Pflichtübung. Was du nicht weißt, kannst du ' +
        'als offene Frage festhalten – auch das ist ein gültiges Ergebnis.',
    }
  }

  /* ── Needs (§4) ────────────────────────────────────────────────────
   * Ein Bedürfnis besteht fort, auch wenn das auslösende Signal aufgelöst wurde.
   */

  async listNeeds(tx: Tx, ctx: EffectiveContext) {
    const rows = await tx
      .select()
      .from(needs)
      .where(and(eq(needs.householdId, ctx.householdId), eq(needs.state, 'open')))
      .limit(100)
    return rows.filter((n) => {
      try {
        authorize(ctx, 'attention:read', { type: 'need', id: n.id, householdId: ctx.householdId, domainId: n.domainId })
        return true
      } catch {
        return false
      }
    })
  }

  async createNeed(
    tx: Tx,
    ctx: EffectiveContext,
    input: { domainId: string; description: string; criticality: Criticality; neededBy: Date | null },
  ) {
    authorize(ctx, 'attention:triage', {
      type: 'need',
      id: null,
      householdId: ctx.householdId,
      domainId: input.domainId,
    })
    const [row] = await tx
      .insert(needs)
      .values({
        householdId: ctx.householdId,
        domainId: input.domainId,
        description: input.description,
        criticality: input.criticality,
        neededBy: input.neededBy,
      })
      .returning({ id: needs.id })
    return { id: row!.id }
  }

  async resolveNeed(tx: Tx, ctx: EffectiveContext, needId: string, state: 'met' | 'dropped') {
    const [row] = await tx
      .select()
      .from(needs)
      .where(and(eq(needs.householdId, ctx.householdId), eq(needs.id, needId)))
      .limit(1)
    if (!row) throw notFound('Das Bedürfnis')
    authorize(ctx, 'attention:triage', { type: 'need', id: needId, householdId: ctx.householdId, domainId: row.domainId })
    await tx.update(needs).set({ state, version: sql`version + 1` }).where(eq(needs.id, needId))
  }
}

/** Bänder statt Zahlen. Ohne nennenswerte Streuung ist alles „ausgeglichen". */
function toBand(value: number, mean: number, spread: number): Band {
  if (spread <= 1) return 'ausgeglichen'
  const delta = value - mean
  const scale = Math.max(spread / 2, 1)
  if (delta > scale * 0.75) return 'deutlich mehr'
  if (delta > scale * 0.25) return 'mehr'
  if (delta < -scale * 0.75) return 'deutlich weniger'
  if (delta < -scale * 0.25) return 'weniger'
  return 'ausgeglichen'
}
