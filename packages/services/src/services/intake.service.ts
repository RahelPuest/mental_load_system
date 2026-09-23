import { and, eq, sql } from 'drizzle-orm'
import { domains, inboxItems, uuidv7, type Tx } from '@thealotta/db'
import { authorize, badRequest, inboxMachine, next as nextState, notFound, type EffectiveContext } from '@thealotta/domain'
import type { InboxTarget } from '@thealotta/contracts'
import { recordEvent } from '@thealotta/db'

export interface Suggestion {
  targetType: InboxTarget
  confidence: 'low' | 'medium' | 'high'
  domainId: string | null
  reason: string
  fields: Record<string, unknown>
}

/**
 * §20/§21: Erfassen muss ohne Nachdenken gehen.
 *
 * Quick Capture speichert erst und strukturiert später. Die Klassifizierung ist ein
 * Vorschlag (Autonomiestufe A1) mit sichtbarer Begründung – niemals eine stille Zuordnung.
 */
export class IntakeService {
  async capture(
    tx: Tx,
    ctx: EffectiveContext,
    input: { text: string; occurredAt?: Date },
  ): Promise<{ id: string; suggestion: Suggestion }> {
    authorize(ctx, 'inbox:capture', { type: 'inbox_item', id: null, householdId: ctx.householdId })

    const domainRows = await tx
      .select({ id: domains.id, name: domains.name, path: domains.path })
      .from(domains)
      .where(eq(domains.householdId, ctx.householdId))

    const suggestion = classify(input.text, domainRows)
    const id = uuidv7()

    await tx.insert(inboxItems).values({
      id,
      householdId: ctx.householdId,
      createdBy: ctx.membershipId,
      rawText: input.text,
      source: 'manual',
      state: 'suggested',
      suggestion: suggestion as never,
      occurredAt: input.occurredAt ?? new Date(),
    })

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'inbox.captured',
      subjectType: 'inbox_item',
      subjectId: id,
      // Der Freitext selbst landet nicht im Ledger – nur seine Länge (docs/05 §1).
      payload: { length: input.text.length, suggestedTarget: suggestion.targetType },
    })
    return { id, suggestion }
  }

  async list(tx: Tx, ctx: EffectiveContext, state?: string) {
    authorize(ctx, 'inbox:capture', { type: 'inbox_item', id: null, householdId: ctx.householdId })
    return tx
      .select()
      .from(inboxItems)
      .where(
        state
          ? and(eq(inboxItems.householdId, ctx.householdId), eq(inboxItems.state, state))
          : and(eq(inboxItems.householdId, ctx.householdId), sql`${inboxItems.state} IN ('captured','suggested')`),
      )
      .orderBy(sql`created_at DESC`)
      .limit(100)
  }

  async markProcessed(
    tx: Tx,
    ctx: EffectiveContext,
    inboxItemId: string,
    result: { targetType: InboxTarget; objectId: string },
    now: Date,
  ): Promise<void> {
    const [row] = await tx
      .select()
      .from(inboxItems)
      .where(and(eq(inboxItems.householdId, ctx.householdId), eq(inboxItems.id, inboxItemId)))
      .limit(1)
    if (!row) throw notFound('Der Eingangseintrag')
    authorize(ctx, 'inbox:process', { type: 'inbox_item', id: row.id, householdId: ctx.householdId })

    const target = nextState(inboxMachine, row.state as never, row.state === 'suggested' ? 'accept' : 'process_manually')
    await tx
      .update(inboxItems)
      .set({
        state: target,
        resultingObjectType: result.targetType,
        resultingObjectId: result.objectId,
        processedAt: now,
        version: sql`version + 1`,
      })
      .where(eq(inboxItems.id, inboxItemId))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'inbox.processed',
      subjectType: 'inbox_item',
      subjectId: inboxItemId,
      payload: { targetType: result.targetType, objectId: result.objectId },
    })
  }

  async discard(tx: Tx, ctx: EffectiveContext, inboxItemId: string, reason: string, now: Date): Promise<void> {
    if (!reason) throw badRequest('validation_failed', 'Bitte kurz angeben, warum der Eintrag wegfällt.')
    const [row] = await tx
      .select()
      .from(inboxItems)
      .where(and(eq(inboxItems.householdId, ctx.householdId), eq(inboxItems.id, inboxItemId)))
      .limit(1)
    if (!row) throw notFound('Der Eingangseintrag')
    authorize(ctx, 'inbox:process', { type: 'inbox_item', id: row.id, householdId: ctx.householdId })

    const target = nextState(inboxMachine, row.state as never, 'discard')
    await tx
      .update(inboxItems)
      .set({ state: target, discardReason: reason, processedAt: now, version: sql`version + 1` })
      .where(eq(inboxItems.id, inboxItemId))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'inbox.discarded',
      subjectType: 'inbox_item',
      subjectId: inboxItemId,
      payload: { reason },
    })
  }
}

/**
 * Regelbasierte Klassifizierung – bewusst einfach und erklärbar.
 *
 * Kein Modell im MVP: INV-008 verlangt eine nachvollziehbare Begründung, und ein
 * durchschaubarer Regelsatz ist hier ehrlicher als eine Blackbox mit 3 Prozent mehr Trefferquote.
 */
const WOCHENTAGE = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag']

/**
 * Ein Datum, das im Text steht, muss niemand noch einmal eintippen (Audit 2, M7).
 *
 * „Donnerstag Müll rausbringen" wurde bisher eine Aufgabe ohne Datum – die Zeitangabe stand
 * da und wurde weggeworfen. Erkannt wird nur, was eindeutig ist: heute, morgen,
 * übermorgen, ein Wochentag (der nächste dieses Namens) und ein geschriebenes Datum.
 * Alles andere bleibt leer; eine falsch geratene Frist wäre schlimmer als keine.
 */
export function readDate(text: string, now: Date): { date: Date; reason: string } | null {
  const lower = text.toLowerCase()
  const tag = (offset: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() + offset)
    d.setHours(12, 0, 0, 0)
    return d
  }

  // `\b` taugt hier nicht: Für JavaScript ist „ü" kein Wortzeichen, `\bübermorgen` findet
  // deshalb nichts. Wortgrenzen werden mit Leerraum und Zeilenrand geprüft.
  const wort = (w: string) => new RegExp(`(^|\\s)${w}(\\s|$|[.,!?])`).test(lower)

  if (wort('übermorgen')) return { date: tag(2), reason: 'übermorgen' }
  if (wort('heute')) return { date: tag(0), reason: 'heute' }
  if (wort('morgen')) return { date: tag(1), reason: 'morgen' }

  const wochentag = WOCHENTAGE.findIndex((name) => wort(`${name}s?`))
  if (wochentag >= 0) {
    // Der nächste Tag dieses Namens; heute zählt nicht mit – „Donnerstag" am Donnerstag
    // meint umgangssprachlich den kommenden.
    const diff = (wochentag - now.getDay() + 7) % 7 || 7
    return { date: tag(diff), reason: `am ${WOCHENTAGE[wochentag]!.replace(/^./, (c) => c.toUpperCase())}` }
  }

  const geschrieben = lower.match(/\b(\d{1,2})\.\s?(\d{1,2})\.(\d{4})?/)
  if (geschrieben) {
    const [, t, m, j] = geschrieben
    const jahr = j ? Number(j) : now.getFullYear()
    const d = new Date(jahr, Number(m) - 1, Number(t), 12, 0, 0, 0)
    if (!Number.isNaN(d.getTime()) && Number(m) >= 1 && Number(m) <= 12) {
      // Ein Datum ohne Jahr, das schon vorbei ist, meint das nächste Jahr.
      if (!j && d.getTime() < now.getTime()) d.setFullYear(jahr + 1)
      return { date: d, reason: `am ${d.getDate()}.${d.getMonth() + 1}.` }
    }
  }
  return null
}

export function classify(text: string, domains: { id: string; name: string; path: string }[], now = new Date()): Suggestion {
  const lower = text.toLowerCase()
  const datum = readDate(text, now)
  const datumsGrund = datum ? ` Der Zeitpunkt „${datum.reason}" stammt aus dem Text.` : ''

  const domainMatch = domains
    .map((d) => ({ d, hit: lower.includes(d.name.toLowerCase()) && d.name.length > 3 }))
    .filter((x) => x.hit)
    .sort((a, b) => b.d.path.length - a.d.path.length)[0]?.d

  const domainId = domainMatch?.id ?? null
  const domainReason = domainMatch ? ` Der Bereich „${domainMatch.name}" wurde im Text erkannt.` : ''

  if (/\?$/.test(text.trim()) || /^(wie|was|wo|wann|warum|wer|welche)/.test(lower)) {
    return {
      targetType: 'question',
      confidence: 'high',
      domainId,
      reason: `Der Text ist als Frage formuliert.${domainReason}`,
      fields: { body: text },
    }
  }

  if (/\b(alle|jede[nsr]?)\s+\d*\s*(tage?|wochen?|monate?|jahre?)\b/.test(lower) || /regelmäßig/.test(lower)) {
    return {
      targetType: 'monitor',
      confidence: 'medium',
      domainId,
      reason: `Der Text beschreibt etwas Wiederkehrendes.${domainReason}`,
      fields: { name: text.slice(0, 120) },
    }
  }

  if (/\b(entschieden|wir machen|ab jetzt|grundsätzlich|budget|maximal)\b/.test(lower)) {
    return {
      targetType: 'decision',
      confidence: 'medium',
      domainId,
      reason: `Der Text klingt nach einer Festlegung.${domainReason}`,
      fields: { title: text.slice(0, 120), body: text },
    }
  }

  if (/\b(ist|sind|hat|liegt|befindet|passt|größe|nummer)\b/.test(lower) && !/\b(muss|brauche|besorgen|kaufen)\b/.test(lower)) {
    return {
      targetType: 'knowledge',
      confidence: 'low',
      domainId,
      reason: `Der Text beschreibt einen Sachverhalt statt einer Handlung.${domainReason}`,
      fields: { title: text.slice(0, 120), body: text },
    }
  }

  return {
    targetType: 'task',
    confidence: /\b(muss|brauche|besorgen|kaufen|anrufen|termin)\b/.test(lower) ? 'high' : 'low',
    domainId,
    reason: `Der Text beschreibt etwas zu Erledigendes.${domainReason}${datumsGrund}`,
    fields: datum
      ? { title: text.slice(0, 200), dueAt: datum.date.toISOString() }
      : { title: text.slice(0, 200) },
  }
}
