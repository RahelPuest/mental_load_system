import { and, eq, sql } from 'drizzle-orm'
import { decisions, knowledgeItems, questions, uuidv7, type Tx } from '@thealotta/db'
import {
  assertAutonomy,
  authorize,
  next as nextState,
  notFound,
  questionMachine,
  type EffectiveContext,
} from '@thealotta/domain'
import type { Sensitivity } from '@thealotta/contracts'
import { recordEvent } from '@thealotta/db'

/**
 * §16–§18: „Ich weiß es nicht" ist ein regulärer Zustand, und eine einmal geklärte Frage soll
 * nicht noch einmal gestellt werden müssen. Die Pipeline lautet:
 * Problem → Frage → Klärung → Wissen → Wiederverwendung.
 */
export class KnowledgeService {
  async ask(
    tx: Tx,
    ctx: EffectiveContext,
    input: { domainId: string | null; body: string; directedTo: string | null },
  ): Promise<{ id: string }> {
    authorize(ctx, 'knowledge:write', {
      type: 'question',
      id: null,
      householdId: ctx.householdId,
      domainId: input.domainId,
    })
    const id = uuidv7()
    await tx.insert(questions).values({
      id,
      householdId: ctx.householdId,
      domainId: input.domainId,
      body: input.body,
      askedBy: ctx.membershipId,
      directedTo: input.directedTo,
    })
    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'question.asked',
      subjectType: 'question',
      subjectId: id,
      payload: { domainId: input.domainId, directedTo: input.directedTo },
    })
    return { id }
  }

  async answer(
    tx: Tx,
    ctx: EffectiveContext,
    questionId: string,
    input: { body: string; promoteToKnowledge: boolean; knowledgeTitle?: string },
    now: Date,
  ): Promise<{ state: string; knowledgeId: string | null }> {
    const [row] = await tx
      .select()
      .from(questions)
      .where(and(eq(questions.householdId, ctx.householdId), eq(questions.id, questionId)))
      .limit(1)
    if (!row) throw notFound('Die Frage')
    authorize(ctx, 'knowledge:write', {
      type: 'question',
      id: row.id,
      householdId: ctx.householdId,
      domainId: row.domainId,
    })

    let state = nextState(questionMachine, row.state as never, 'answer')
    let knowledgeId: string | null = null

    if (input.promoteToKnowledge) {
      knowledgeId = uuidv7()
      await tx.insert(knowledgeItems).values({
        id: knowledgeId,
        householdId: ctx.householdId,
        domainId: row.domainId,
        scope: row.domainId ? 'domain' : 'household',
        kind: 'how_to',
        title: input.knowledgeTitle ?? row.body.slice(0, 160),
        body: input.body,
        origin: 'human',
        createdBy: ctx.membershipId,
        confirmedBy: ctx.membershipId,
        confirmedAt: now,
      })
      state = nextState(questionMachine, state as never, 'promote_to_knowledge')
    }

    await tx
      .update(questions)
      .set({
        state,
        answerBody: input.body,
        answeredBy: ctx.membershipId,
        answeredAt: now,
        answerKnowledgeId: knowledgeId,
        version: sql`version + 1`,
      })
      .where(eq(questions.id, questionId))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'question.answered',
      subjectType: 'question',
      subjectId: questionId,
      payload: { promotedToKnowledge: input.promoteToKnowledge, knowledgeId },
    })
    return { state, knowledgeId }
  }

  async addKnowledge(
    tx: Tx,
    ctx: EffectiveContext,
    input: { domainId: string | null; scope: string; kind: string; title: string; body: string; sensitivity: Sensitivity },
    now: Date,
  ): Promise<{ id: string }> {
    authorize(ctx, 'knowledge:write', {
      type: 'knowledge_item',
      id: null,
      householdId: ctx.householdId,
      domainId: input.domainId,
      sensitivity: input.sensitivity,
    })
    const id = uuidv7()
    await tx.insert(knowledgeItems).values({
      id,
      householdId: ctx.householdId,
      domainId: input.domainId,
      scope: input.scope,
      kind: input.kind,
      title: input.title,
      body: input.body,
      sensitivity: input.sensitivity,
      origin: ctx.actor.kind === 'user' ? 'human' : 'inference',
      createdBy: ctx.membershipId,
      // INV-004: Automatisch erzeugtes Wissen bleibt unbestätigt und ist als solches erkennbar.
      confirmedBy: ctx.actor.kind === 'user' ? ctx.membershipId : null,
      confirmedAt: ctx.actor.kind === 'user' ? now : null,
    })
    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'knowledge.created',
      subjectType: 'knowledge_item',
      subjectId: id,
      payload: { domainId: input.domainId, kind: input.kind },
      sensitivity: input.sensitivity,
    })
    return { id }
  }

  /**
   * Eine Notiz ändern.
   *
   * Bis hierher konnte man Wissen anlegen und lesen, aber nicht berichtigen. Wer sich
   * vertippt hatte oder wessen Fundort umgezogen war, musste die Notiz neu schreiben – und
   * die alte blieb daneben stehen, weil es auch kein Entfernen gab. Ein Werkzeug gegen
   * mentale Last darf nicht verlangen, dass man seine eigenen Einträge umgeht.
   *
   * Die Sensitivity bleibt, wie sie ist: Sie ändert, wer den Eintrag überhaupt sehen darf.
   * Das ist eine Rechtefrage und gehört nicht in dasselbe Formular wie ein Tippfehler.
   */
  async updateKnowledge(
    tx: Tx,
    ctx: EffectiveContext,
    knowledgeId: string,
    input: { title?: string; body?: string; kind?: string },
    now: Date,
  ): Promise<{ id: string }> {
    const [row] = await tx
      .select()
      .from(knowledgeItems)
      .where(and(eq(knowledgeItems.householdId, ctx.householdId), eq(knowledgeItems.id, knowledgeId)))
      .limit(1)
    if (!row) throw notFound('Die Notiz')
    authorize(ctx, 'knowledge:write', {
      type: 'knowledge_item',
      id: row.id,
      householdId: ctx.householdId,
      domainId: row.domainId,
      sensitivity: row.sensitivity as Sensitivity,
    })

    const aenderung: Record<string, unknown> = { updatedAt: now }
    if (input.title !== undefined) aenderung['title'] = input.title
    if (input.body !== undefined) aenderung['body'] = input.body
    if (input.kind !== undefined) aenderung['kind'] = input.kind

    /*
      Wer ändert, bestätigt.

      INV-004 unterscheidet bestätigtes von abgeleitetem Wissen. Eine Notiz, die ein Mensch
      gerade durchgesehen und angefasst hat, ist bestätigt – sie weiter als „unbestätigt"
      zu führen, wäre schlicht falsch.
    */
    if (ctx.actor.kind === 'user') {
      aenderung['confirmedBy'] = ctx.membershipId
      aenderung['confirmedAt'] = now
    }

    await tx
      .update(knowledgeItems)
      .set(aenderung)
      .where(and(eq(knowledgeItems.householdId, ctx.householdId), eq(knowledgeItems.id, knowledgeId)))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'knowledge.updated',
      subjectType: 'knowledge_item',
      subjectId: knowledgeId,
      payload: { felder: Object.keys(input) },
      sensitivity: row.sensitivity as Sensitivity,
    })
    return { id: knowledgeId }
  }

  /**
   * Den Wortlaut einer Frage ändern.
   *
   * Nur der Text. Zustand und Adressat haben ihre eigenen Wege (`answer`, `ask`); sie hier
   * mitzuändern hieße, zwei verschiedene Vorgänge in ein Formular zu legen.
   */
  async updateQuestion(
    tx: Tx,
    ctx: EffectiveContext,
    questionId: string,
    input: { body: string },
    now: Date,
  ): Promise<{ id: string }> {
    const [row] = await tx
      .select()
      .from(questions)
      .where(and(eq(questions.householdId, ctx.householdId), eq(questions.id, questionId)))
      .limit(1)
    if (!row) throw notFound('Die Frage')
    authorize(ctx, 'knowledge:write', {
      type: 'question',
      id: row.id,
      householdId: ctx.householdId,
      domainId: row.domainId,
    })

    await tx
      .update(questions)
      .set({ body: input.body, updatedAt: now })
      .where(and(eq(questions.householdId, ctx.householdId), eq(questions.id, questionId)))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'question.updated',
      subjectType: 'question',
      subjectId: questionId,
      payload: {},
    })
    return { id: questionId }
  }

  /**
   * Eine Entscheidung ändern.
   *
   * `assertAutonomy` wie beim Festhalten: Eine Entscheidung ist eine Aussage von Menschen
   * über Menschen; ein System-Akteur darf sie nicht umschreiben (ADR-0008).
   */
  async updateDecision(
    tx: Tx,
    ctx: EffectiveContext,
    decisionId: string,
    input: { title?: string; body?: string; decisionKind?: string; bindingLevel?: string },
    now: Date,
  ): Promise<{ id: string }> {
    assertAutonomy('decision.write', ctx.actor)
    const [row] = await tx
      .select()
      .from(decisions)
      .where(and(eq(decisions.householdId, ctx.householdId), eq(decisions.id, decisionId)))
      .limit(1)
    if (!row) throw notFound('Die Entscheidung')
    authorize(ctx, 'decision:write', {
      type: 'decision',
      id: row.id,
      householdId: ctx.householdId,
      domainId: row.domainId,
    })

    const aenderung: Record<string, unknown> = { updatedAt: now }
    if (input.title !== undefined) aenderung['title'] = input.title
    if (input.body !== undefined) aenderung['body'] = input.body
    if (input.decisionKind !== undefined) aenderung['decisionKind'] = input.decisionKind
    if (input.bindingLevel !== undefined) aenderung['bindingLevel'] = input.bindingLevel

    await tx
      .update(decisions)
      .set(aenderung)
      .where(and(eq(decisions.householdId, ctx.householdId), eq(decisions.id, decisionId)))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'decision.updated',
      subjectType: 'decision',
      subjectId: decisionId,
      payload: { felder: Object.keys(input) },
    })
    return { id: decisionId }
  }

  async listKnowledge(tx: Tx, ctx: EffectiveContext, domainId?: string) {
    const rows = await tx
      .select()
      .from(knowledgeItems)
      .where(
        domainId
          ? and(eq(knowledgeItems.householdId, ctx.householdId), eq(knowledgeItems.domainId, domainId))
          : eq(knowledgeItems.householdId, ctx.householdId),
      )
      .limit(200)
    return rows.filter((r) => {
      try {
        authorize(ctx, 'knowledge:read', {
          type: 'knowledge_item',
          id: r.id,
          householdId: ctx.householdId,
          domainId: r.domainId,
          sensitivity: r.sensitivity as Sensitivity,
        })
        return true
      } catch {
        return false
      }
    })
  }

  async listQuestions(tx: Tx, ctx: EffectiveContext, state = 'open') {
    return tx
      .select()
      .from(questions)
      .where(and(eq(questions.householdId, ctx.householdId), eq(questions.state, state)))
      .limit(200)
  }

  /** §17: Entscheidungen sind eigenständiges Wissen – A3, weil sie Verbindlichkeit erzeugen. */
  async recordDecision(
    tx: Tx,
    ctx: EffectiveContext,
    input: { domainId: string | null; title: string; body: string; decisionKind: string; bindingLevel: string; reviewAfter: Date | null },
  ): Promise<{ id: string }> {
    assertAutonomy('decision.write', ctx.actor)
    authorize(ctx, 'decision:write', {
      type: 'decision',
      id: null,
      householdId: ctx.householdId,
      domainId: input.domainId,
    })
    const id = uuidv7()
    await tx.insert(decisions).values({
      id,
      householdId: ctx.householdId,
      domainId: input.domainId,
      title: input.title,
      body: input.body,
      decisionKind: input.decisionKind,
      bindingLevel: input.bindingLevel,
      decidedBy: ctx.membershipId,
      reviewAfter: input.reviewAfter,
    })
    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'decision.recorded',
      subjectType: 'decision',
      subjectId: id,
      payload: { title: input.title, decisionKind: input.decisionKind, bindingLevel: input.bindingLevel },
    })
    return { id }
  }

  async listDecisions(tx: Tx, ctx: EffectiveContext, domainId?: string) {
    return tx
      .select()
      .from(decisions)
      .where(
        domainId
          ? and(eq(decisions.householdId, ctx.householdId), eq(decisions.domainId, domainId))
          : eq(decisions.householdId, ctx.householdId),
      )
      .limit(200)
  }
}
