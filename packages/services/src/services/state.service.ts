import { and, eq, sql } from 'drizzle-orm'
import {
  attentionItems,
  stateDefinitions,
  stateObservations,
  stateValues,
  uuidv7,
  type Tx,
} from '@thealotta/db'
import {
  authorize,
  badRequest,
  computeStaleAt,
  conflict,
  defaultConflictWindow,
  notFound,
  resolveStateWrite,
  type EffectiveContext,
  type StateDefinitionLike,
  type StateValueLike,
} from '@thealotta/domain'
import type { Origin, Sensitivity, StateDataType, ValueKind } from '@thealotta/contracts'
import { recordEvent } from '@thealotta/db'
import { DomainService } from './domain.service.js'

export interface StateDefinitionRow {
  id: string
  domainId: string
  key: string
  label: string
  dataType: StateDataType
  freshnessInterval: string | null
  isCritical: boolean
  sensitivity: Sensitivity
  unit: string | null
  version: number
}

export interface StateValueView {
  /** ID des Zustandswerts – wird für die Konfliktauflösung gebraucht. */
  id: string
  definition: StateDefinitionRow
  valueKind: ValueKind
  value: unknown
  verifiedAt: Date | null
  staleAt: Date | null
  isStale: boolean
  origin: Origin
  confirmedAt: Date | null
  conflict: { state: string; observations: { id: string; value: unknown; observedAt: Date; observedBy: string | null }[] } | null
  version: number
}

const domainService = new DomainService()

export class StateService {
  async defineState(
    tx: Tx,
    ctx: EffectiveContext,
    domainId: string,
    input: {
      key: string
      label: string
      dataType: StateDataType
      options?: string[]
      unit?: string
      freshnessInterval: string | null
      isCritical: boolean
      sensitivity: Sensitivity
      description?: string
    },
  ): Promise<StateDefinitionRow> {
    const domain = await domainService.get(tx, ctx, domainId)
    authorize(ctx, 'state:define', {
      type: 'state_definition',
      id: null,
      householdId: ctx.householdId,
      domainId,
      sensitivity: input.sensitivity,
    })

    const id = uuidv7()
    const [row] = await tx
      .insert(stateDefinitions)
      .values({
        id,
        householdId: ctx.householdId,
        domainId,
        key: input.key,
        label: input.label,
        description: input.description ?? null,
        dataType: input.dataType,
        options: input.options ?? null,
        unit: input.unit ?? null,
        freshnessInterval: input.freshnessInterval ? isoToPgInterval(input.freshnessInterval) : null,
        conflictWindow: input.isCritical ? '7 days' : '24 hours',
        isCritical: input.isCritical,
        sensitivity: input.sensitivity,
      })
      .returning()

    // INV-010: Ein neuer Zustand startet ausdrücklich als "unbekannt" – nicht als leer.
    await tx.insert(stateValues).values({
      householdId: ctx.householdId,
      stateDefinitionId: id,
      valueKind: 'unknown',
      value: null,
      origin: 'human',
      confidence: 'confirmed',
    })

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'state.definition_created',
      subjectType: 'state_definition',
      subjectId: id,
      payload: { domainId, key: input.key, label: input.label, dataType: input.dataType },
      sensitivity: input.sensitivity,
    })
    void domain
    return toDefinitionRow(row!)
  }

  /**
   * Eine bestehende Angabe ändern (docs/77).
   *
   * Bis dahin ließ sich am Bogen „Ändern" nur der **Wert** setzen. Ein Tippfehler im Namen war
   * damit endgültig: Die Angabe hieß für immer „Schugröße", und der einzige Ausweg war, eine
   * neue anzulegen – womit der Verlauf der alten an der falschen Beschriftung hängen bliebe.
   *
   * **Was sich nicht ändern lässt, und warum:**
   *
   * - `key` – der technische Schlüssel. Regeln, Import und Export verweisen darauf; ihn
   *   nachträglich zu ändern hieße, diese Verweise stillschweigend zu lösen. Er wird beim
   *   Anlegen aus dem Namen gebildet und bleibt dann liegen, auch wenn der Name sich ändert.
   * - `dataType`, **sobald ein Wert vorliegt**. „29" als Zahl ist als Datum nichts. Statt den
   *   Wert bei der Gelegenheit wegzuwerfen, lehnt der Dienst ab und sagt, was im Weg steht.
   */
  async updateDefinition(
    tx: Tx,
    ctx: EffectiveContext,
    stateDefinitionId: string,
    input: {
      label?: string
      dataType?: StateDataType
      unit?: string | null
      freshnessInterval?: string | null
      isCritical?: boolean
      description?: string | null
    },
    now: Date,
  ): Promise<StateDefinitionRow> {
    const { definition, value } = await this.load(tx, ctx, stateDefinitionId)
    authorize(ctx, 'state:define', {
      type: 'state_definition',
      id: definition.id,
      householdId: ctx.householdId,
      domainId: definition.domainId,
      sensitivity: definition.sensitivity as Sensitivity,
    })

    if (input.dataType && input.dataType !== definition.dataType) {
      /*
        `unknown` zählt nicht als Wert: Da steht nichts, was seine Bedeutung verlieren könnte.
        Jede neue Angabe startet so (INV-010), und ihre Art gleich danach noch zu ändern ist
        der Normalfall, nicht die Ausnahme.
      */
      if (value && value.valueKind !== 'unknown') {
        throw conflict(
          'has_value',
          `„${definition.label}" hat schon einen Wert. Die Art lässt sich nicht mehr ändern – sonst ` +
            'stünde dort eine Angabe, die zu ihrer eigenen Art nicht passt. Setze den Wert auf ' +
            '„weiß ich nicht", wenn die Art wirklich falsch ist.',
        )
      }
    }

    const aenderung: Record<string, unknown> = { updatedAt: now }
    if (input.label !== undefined) aenderung['label'] = input.label
    if (input.dataType !== undefined) aenderung['dataType'] = input.dataType
    if (input.unit !== undefined) aenderung['unit'] = input.unit
    if (input.description !== undefined) aenderung['description'] = input.description
    if (input.freshnessInterval !== undefined) {
      aenderung['freshnessInterval'] = input.freshnessInterval ? isoToPgInterval(input.freshnessInterval) : null
    }
    if (input.isCritical !== undefined) {
      aenderung['isCritical'] = input.isCritical
      // Dasselbe Verhältnis wie beim Anlegen: Kritisches darf länger widersprüchlich stehen.
      aenderung['conflictWindow'] = input.isCritical ? '7 days' : '24 hours'
    }

    const [row] = await tx
      .update(stateDefinitions)
      .set(aenderung)
      .where(and(eq(stateDefinitions.householdId, ctx.householdId), eq(stateDefinitions.id, stateDefinitionId)))
      .returning()

    /*
      Die Frist steckt im Wert, nicht nur in der Angabe: `stale_at` wurde beim letzten
      Schreiben aus der damaligen Frist gerechnet. Ändert sich die Frist, muss sie neu
      gerechnet werden – sonst altert die Angabe weiter nach der alten Regel, und die
      Oberfläche zeigt eine Frist, nach der niemand rechnet.
    */
    if (input.freshnessInterval !== undefined && value?.verifiedAt) {
      await tx
        .update(stateValues)
        .set({
          staleAt: computeStaleAt(
            { ...definition, freshnessInterval: input.freshnessInterval ?? null },
            value.verifiedAt,
          ),
          updatedAt: now,
        })
        .where(and(eq(stateValues.householdId, ctx.householdId), eq(stateValues.stateDefinitionId, stateDefinitionId)))
    }

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'state.definition_updated',
      subjectType: 'state_definition',
      subjectId: stateDefinitionId,
      payload: { domainId: definition.domainId, ...input },
      before: { label: definition.label, dataType: definition.dataType },
      sensitivity: definition.sensitivity as Sensitivity,
    })

    return toDefinitionRow(row!)
  }

  async listDefinitions(tx: Tx, ctx: EffectiveContext, domainId: string): Promise<StateDefinitionRow[]> {
    await domainService.get(tx, ctx, domainId)
    const rows = await tx
      .select()
      .from(stateDefinitions)
      .where(and(eq(stateDefinitions.householdId, ctx.householdId), eq(stateDefinitions.domainId, domainId)))
    return rows
      .filter((r) => canRead(ctx, domainId, r.sensitivity as Sensitivity))
      .map(toDefinitionRow)
  }

  async readValue(tx: Tx, ctx: EffectiveContext, stateDefinitionId: string, now: Date): Promise<StateValueView> {
    const { definition, value } = await this.load(tx, ctx, stateDefinitionId)
    authorize(ctx, 'state:read', {
      type: 'state_value',
      id: value.id,
      householdId: ctx.householdId,
      domainId: definition.domainId,
      sensitivity: definition.sensitivity as Sensitivity,
    })

    let conflictInfo: StateValueView['conflict'] = null
    if (value.conflictState === 'unresolved') {
      const observations = await tx
        .select()
        .from(stateObservations)
        .where(
          and(
            eq(stateObservations.stateDefinitionId, stateDefinitionId),
            eq(stateObservations.conflictState, 'unresolved'),
          ),
        )
        .orderBy(sql`observed_at DESC`)
        .limit(10)
      conflictInfo = {
        state: value.conflictState,
        observations: observations.map((o) => ({
          id: o.id,
          value: o.value,
          observedAt: o.observedAt,
          observedBy: o.observedBy,
        })),
      }
    }

    return {
      id: value.id,
      definition: toDefinitionRow(definition),
      valueKind: value.valueKind as ValueKind,
      value: value.value,
      verifiedAt: value.verifiedAt,
      staleAt: value.staleAt,
      isStale: value.staleAt !== null && value.staleAt.getTime() <= now.getTime(),
      origin: value.origin as Origin,
      confirmedAt: value.confirmedAt,
      conflict: conflictInfo,
      version: value.version,
    }
  }

  /**
   * Der Kern von §9/§10: jede Wertänderung ist zuerst eine Beobachtung (append-only) und
   * erst danach – vielleicht – eine Änderung des aktuellen Werts.
   */
  async writeValue(
    tx: Tx,
    ctx: EffectiveContext,
    stateDefinitionId: string,
    input: { valueKind: ValueKind; value?: unknown; note?: string; confirm: boolean; origin?: Origin; observedAt?: Date },
    now: Date,
  ): Promise<{ view: StateValueView; conflictCreated: boolean; rule: string }> {
    const { definition, value } = await this.load(tx, ctx, stateDefinitionId)
    authorize(ctx, 'state:write', {
      type: 'state_value',
      id: value.id,
      householdId: ctx.householdId,
      domainId: definition.domainId,
      sensitivity: definition.sensitivity as Sensitivity,
    })

    if (input.valueKind === 'known' && (input.value === undefined || input.value === null)) {
      throw badRequest('validation_failed', 'Ein bekannter Wert braucht einen Inhalt. Für „weiß ich nicht" gibt es „unknown".')
    }
    if (input.valueKind !== 'known' && input.value !== undefined && input.value !== null) {
      throw badRequest('validation_failed', 'Ein unbekannter Wert darf keinen Inhalt tragen.')
    }

    const origin: Origin = input.origin ?? (ctx.actor.kind === 'user' ? 'human' : 'system_rule')
    const observedAt = input.observedAt ?? now

    const current: StateValueLike = {
      stateDefinitionId,
      valueKind: value.valueKind as ValueKind,
      value: value.value,
      verifiedAt: value.verifiedAt,
      staleAt: value.staleAt,
      confirmedAt: value.confirmedAt,
      origin: value.origin,
    }

    const decision = resolveStateWrite(
      value.valueKind === 'unknown' && value.verifiedAt === null && value.confirmedAt === null ? null : current,
      { valueKind: input.valueKind, value: input.value ?? null, origin, observedAt, observedBy: ctx.membershipId, confirm: input.confirm },
      { conflictWindowMs: defaultConflictWindow(definition.isCritical), isCritical: definition.isCritical },
    )

    await tx.insert(stateObservations).values({
      householdId: ctx.householdId,
      stateDefinitionId,
      valueKind: input.valueKind,
      value: (input.value ?? null) as never,
      observedAt,
      origin,
      originRef: ctx.actor.ref ?? null,
      observedBy: ctx.membershipId,
      applied: decision.applyValue,
      resolutionRule: decision.rule,
      conflictState: decision.conflictState,
      note: input.note ?? null,
    })

    const definitionLike: StateDefinitionLike = {
      id: definition.id,
      key: definition.key,
      label: definition.label,
      freshnessInterval: definition.freshnessInterval ? pgIntervalToIso(definition.freshnessInterval) : null,
      isCritical: definition.isCritical,
    }

    if (decision.applyValue) {
      const verifiedAt = decision.refreshVerified ? observedAt : value.verifiedAt
      await tx
        .update(stateValues)
        .set({
          valueKind: input.valueKind,
          value: (input.value ?? null) as never,
          verifiedAt,
          staleAt: computeStaleAt(definitionLike, verifiedAt),
          origin,
          originRef: ctx.actor.ref ?? null,
          observedBy: ctx.membershipId,
          confirmedBy: decision.refreshVerified && origin === 'human' ? ctx.membershipId : value.confirmedBy,
          confirmedAt: decision.refreshVerified && origin === 'human' ? observedAt : value.confirmedAt,
          conflictState: decision.conflictState,
          version: sql`version + 1`,
        })
        .where(eq(stateValues.id, value.id))
    } else {
      await tx
        .update(stateValues)
        .set({ conflictState: decision.conflictState, version: sql`version + 1` })
        .where(eq(stateValues.id, value.id))
    }

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: decision.applyValue ? 'state.value_updated' : 'state.conflict_detected',
      subjectType: 'state_value',
      subjectId: value.id,
      payload: { stateDefinitionId, rule: decision.rule, applied: decision.applyValue, valueKind: input.valueKind },
      sensitivity: definition.sensitivity as Sensitivity,
    })

    let conflictCreated = false
    if (decision.conflictState === 'unresolved') {
      // Beide Angaben stehen im Widerspruch – also wird auch die bisher gültige Beobachtung
      // als ungeklärt markiert. Sonst zeigte die UI nur eine Seite des Konflikts.
      await tx
        .update(stateObservations)
        .set({ conflictState: 'unresolved' })
        .where(
          and(
            eq(stateObservations.stateDefinitionId, stateDefinitionId),
            eq(stateObservations.applied, true),
            eq(stateObservations.conflictState, 'none'),
          ),
        )

      conflictCreated = await this.ensureConflictAttention(tx, ctx, definition.domainId, definition.label, decision.conflictExplanation ?? '')
    }

    return { view: await this.readValue(tx, ctx, stateDefinitionId, now), conflictCreated, rule: decision.rule }
  }

  /**
   * §10: Ein Widerspruch wird sichtbar gemacht, nicht aufgelöst. Die Entscheidung trifft ein Mensch.
   */
  private async ensureConflictAttention(
    tx: Tx,
    ctx: EffectiveContext,
    domainId: string,
    label: string,
    explanation: string,
  ): Promise<boolean> {
    const whyNow = `Für „${label}" liegen zwei unterschiedliche Angaben vor. ${explanation}`.trim()
    const inserted = await tx
      .insert(attentionItems)
      .values({
        householdId: ctx.householdId,
        domainId,
        signalKind: 'state_conflict',
        title: `${label}: zwei unterschiedliche Angaben`,
        whyNow,
        ifItWaits: 'Solange nicht geklärt ist, welche Angabe stimmt, verlässt sich vielleicht jemand auf die falsche.',
        severity: 'important',
        origin: 'system_rule',
        originRef: 'state_conflict',
      })
      .onConflictDoNothing()
      .returning({ id: attentionItems.id })
    return inserted.length > 0
  }

  async resolveConflict(
    tx: Tx,
    ctx: EffectiveContext,
    stateValueId: string,
    input: { chosenObservationId: string; note?: string },
    now: Date,
  ): Promise<StateValueView> {
    const [value] = await tx
      .select()
      .from(stateValues)
      .where(and(eq(stateValues.householdId, ctx.householdId), eq(stateValues.id, stateValueId)))
      .limit(1)
    if (!value) throw notFound('Der Zustandswert')

    const [definition] = await tx
      .select()
      .from(stateDefinitions)
      .where(eq(stateDefinitions.id, value.stateDefinitionId))
      .limit(1)
    if (!definition) throw notFound('Die Zustandsdefinition')

    authorize(ctx, 'state:write', {
      type: 'state_value',
      id: value.id,
      householdId: ctx.householdId,
      domainId: definition.domainId,
      sensitivity: definition.sensitivity as Sensitivity,
    })

    const [chosen] = await tx
      .select()
      .from(stateObservations)
      .where(
        and(
          eq(stateObservations.householdId, ctx.householdId),
          eq(stateObservations.id, input.chosenObservationId),
          eq(stateObservations.stateDefinitionId, value.stateDefinitionId),
        ),
      )
      .limit(1)
    if (!chosen) throw notFound('Die gewählte Beobachtung')

    const definitionLike: StateDefinitionLike = {
      id: definition.id,
      key: definition.key,
      label: definition.label,
      freshnessInterval: definition.freshnessInterval ? pgIntervalToIso(definition.freshnessInterval) : null,
      isCritical: definition.isCritical,
    }

    await tx
      .update(stateValues)
      .set({
        valueKind: chosen.valueKind,
        value: chosen.value as never,
        verifiedAt: now,
        staleAt: computeStaleAt(definitionLike, now),
        origin: 'human',
        confirmedBy: ctx.membershipId,
        confirmedAt: now,
        conflictState: 'resolved_manual',
        version: sql`version + 1`,
      })
      .where(eq(stateValues.id, value.id))

    await tx
      .update(stateObservations)
      .set({ conflictState: 'resolved_manual' })
      .where(
        and(
          eq(stateObservations.stateDefinitionId, value.stateDefinitionId),
          eq(stateObservations.conflictState, 'unresolved'),
        ),
      )

    await tx
      .update(attentionItems)
      .set({ state: 'dismissed', resolvedBy: ctx.membershipId, resolvedAt: now, resolutionNote: input.note ?? 'Konflikt geklärt' })
      .where(
        and(
          eq(attentionItems.householdId, ctx.householdId),
          eq(attentionItems.domainId, definition.domainId),
          eq(attentionItems.signalKind, 'state_conflict'),
          sql`${attentionItems.state} IN ('open','acknowledged','snoozed')`,
        ),
      )

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'state.conflict_resolved',
      subjectType: 'state_value',
      subjectId: value.id,
      payload: { chosenObservationId: input.chosenObservationId },
      sensitivity: definition.sensitivity as Sensitivity,
    })

    return this.readValue(tx, ctx, value.stateDefinitionId, now)
  }

  async load(
    tx: Tx,
    ctx: EffectiveContext,
    stateDefinitionId: string,
  ): Promise<{ definition: typeof stateDefinitions.$inferSelect; value: typeof stateValues.$inferSelect }> {
    const [definition] = await tx
      .select()
      .from(stateDefinitions)
      .where(and(eq(stateDefinitions.householdId, ctx.householdId), eq(stateDefinitions.id, stateDefinitionId)))
      .limit(1)
    if (!definition) throw notFound('Die Zustandsdefinition')

    const [value] = await tx
      .select()
      .from(stateValues)
      .where(eq(stateValues.stateDefinitionId, stateDefinitionId))
      .limit(1)
    if (!value) throw notFound('Der Zustandswert')
    return { definition, value }
  }
}

function canRead(ctx: EffectiveContext, domainId: string, sensitivity: Sensitivity): boolean {
  try {
    authorize(ctx, 'state:read', { type: 'state_definition', id: null, householdId: ctx.householdId, domainId, sensitivity })
    return true
  } catch {
    return false
  }
}

function toDefinitionRow(row: typeof stateDefinitions.$inferSelect): StateDefinitionRow {
  return {
    id: row.id,
    domainId: row.domainId,
    key: row.key,
    label: row.label,
    dataType: row.dataType as StateDataType,
    freshnessInterval: row.freshnessInterval ? pgIntervalToIso(row.freshnessInterval) : null,
    isCritical: row.isCritical,
    sensitivity: row.sensitivity as Sensitivity,
    unit: row.unit,
    version: row.version,
  }
}

/**
 * Postgres speichert Intervalle in eigener Notation. Die API spricht ISO-8601 (P6W),
 * damit Clients und Monitoring-Konfigurationen ein einziges Format kennen.
 */
export function isoToPgInterval(iso: string): string {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso)
  if (!m) throw badRequest('validation_failed', `Ungültige Dauer: ${iso}`)
  const [, y, mo, w, d, h, mi, s] = m
  const parts: string[] = []
  if (y) parts.push(`${y} years`)
  if (mo) parts.push(`${mo} months`)
  if (w) parts.push(`${w} weeks`)
  if (d) parts.push(`${d} days`)
  if (h) parts.push(`${h} hours`)
  if (mi) parts.push(`${mi} minutes`)
  if (s) parts.push(`${s} seconds`)
  return parts.length > 0 ? parts.join(' ') : '0 seconds'
}

export function pgIntervalToIso(value: string | Record<string, number>): string {
  if (typeof value === 'object') {
    const o = value as { years?: number; months?: number; days?: number; hours?: number; minutes?: number; seconds?: number }
    let out = 'P'
    if (o.years) out += `${o.years}Y`
    if (o.months) out += `${o.months}M`
    if (o.days) out += `${o.days}D`
    const time = [o.hours ? `${o.hours}H` : '', o.minutes ? `${o.minutes}M` : '', o.seconds ? `${o.seconds}S` : ''].join('')
    if (time) out += `T${time}`
    return out === 'P' ? 'PT0S' : out
  }
  const text = String(value)
  const years = /(\d+)\s+year/.exec(text)?.[1]
  const months = /(\d+)\s+mon/.exec(text)?.[1]
  const days = /(\d+)\s+day/.exec(text)?.[1]
  const time = /(\d{2}):(\d{2}):(\d{2})/.exec(text)
  let out = 'P'
  if (years) out += `${years}Y`
  if (months) out += `${months}M`
  if (days) {
    // Postgres normalisiert '6 weeks' zu '42 days'. Für die Anzeige ist „6 Wochen"
    // verständlicher als „42 Tage" – deshalb wird zurückgerechnet, wo es aufgeht.
    const d = Number(days)
    if (!years && !months && d % 7 === 0 && d > 0) out += `${d / 7}W`
    else out += `${d}D`
  }
  if (time && (time[1] !== '00' || time[2] !== '00' || time[3] !== '00')) {
    out += `T${Number(time[1])}H${Number(time[2])}M${Number(time[3])}S`
  }
  return out === 'P' ? 'PT0S' : out
}
