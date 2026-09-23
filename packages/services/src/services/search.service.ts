import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import {
  decisions,
  domains,
  knowledgeItems,
  persons,
  monitors,
  playbooks,
  processes,
  questions,
  stateDefinitions,
  tasks,
  type Tx,
} from '@thealotta/db'
import { authorize, type EffectiveContext } from '@thealotta/domain'
import type { Sensitivity } from '@thealotta/contracts'

export type SearchKind =
  | 'domain'
  | 'person'
  | 'state'
  | 'knowledge'
  | 'question'
  | 'decision'
  | 'rule'
  | 'process'
  | 'task'
  | 'playbook'

export interface SearchHit {
  kind: SearchKind
  id: string
  title: string
  /** Kurzer Kontext: Bereichspfad, Wert, Zustand. */
  subtitle: string
  domainId: string | null
  /** Zielroute in der Oberfläche. */
  href: string
}

const LIMIT_PER_KIND = 6

/**
 * §48: Globale Suche über alles, was ein Mensch suchen würde.
 *
 * Bewusst unscharf (Teilwort, ohne Groß-/Kleinschreibung) statt exakter Titelsuche – wer
 * „schuh" tippt, meint auch „Schuhgröße". Jede Trefferart wird einzeln begrenzt, damit eine
 * ergiebige Kategorie die anderen nicht verdrängt.
 *
 * Jeder Treffer läuft durch dieselbe Berechtigungsprüfung wie die reguläre Ansicht:
 * Suche darf kein Weg an der Zugriffskontrolle vorbei sein.
 */
export class SearchService {
  async search(tx: Tx, ctx: EffectiveContext, rawQuery: string): Promise<SearchHit[]> {
    const query = rawQuery.trim()
    if (query.length < 2) return []
    const pattern = `%${query.replace(/[%_]/g, (c) => `\\${c}`)}%`

    const domainRows = await tx
      .select()
      .from(domains)
      .where(and(eq(domains.householdId, ctx.householdId), isNull(domains.archivedAt)))
    const pathOf = (id: string | null): string => {
      if (!id) return 'Haushalt'
      const domain = domainRows.find((d) => d.id === id)
      if (!domain) return ''
      return domain.path
        .split('.')
        .map((_, index, parts) => domainRows.find((d) => d.path === parts.slice(0, index + 1).join('.'))?.name ?? '')
        .filter(Boolean)
        .join(' / ')
    }
    const visible = (domainId: string | null, capability: 'domain:read' | 'knowledge:read' | 'state:read' | 'task:read' | 'process:read' | 'monitor:read', sensitivity?: Sensitivity): boolean => {
      try {
        authorize(ctx, capability, { type: 'search', id: null, householdId: ctx.householdId, domainId, sensitivity })
        return true
      } catch {
        return false
      }
    }

    const [personRows, stateRows, knowledgeRows, questionRows, decisionRows, processRows, taskRows, playbookRows, ruleRows] =
      await Promise.all([
        tx
          .select()
          .from(persons)
          .where(and(eq(persons.householdId, ctx.householdId), isNull(persons.deletedAt), ilike(persons.displayName, pattern)))
          .limit(LIMIT_PER_KIND),
        tx
          .select()
          .from(stateDefinitions)
          .where(
            and(
              eq(stateDefinitions.householdId, ctx.householdId),
              isNull(stateDefinitions.archivedAt),
              ilike(stateDefinitions.label, pattern),
            ),
          )
          .limit(LIMIT_PER_KIND),
        tx
          .select()
          .from(knowledgeItems)
          .where(
            and(
              eq(knowledgeItems.householdId, ctx.householdId),
              isNull(knowledgeItems.deletedAt),
              or(ilike(knowledgeItems.title, pattern), ilike(knowledgeItems.body, pattern)),
            ),
          )
          .limit(LIMIT_PER_KIND),
        tx
          .select()
          .from(questions)
          .where(and(eq(questions.householdId, ctx.householdId), ilike(questions.body, pattern)))
          .limit(LIMIT_PER_KIND),
        tx
          .select()
          .from(decisions)
          .where(
            and(
              eq(decisions.householdId, ctx.householdId),
              isNull(decisions.supersededAt),
              or(ilike(decisions.title, pattern), ilike(decisions.body, pattern)),
            ),
          )
          .limit(LIMIT_PER_KIND),
        tx
          .select()
          .from(processes)
          .where(and(eq(processes.householdId, ctx.householdId), ilike(processes.title, pattern)))
          .limit(LIMIT_PER_KIND),
        tx
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.householdId, ctx.householdId),
              ilike(tasks.title, pattern),
              sql`${tasks.state} IN ('ready','in_progress','blocked','waiting','deferred')`,
            ),
          )
          .limit(LIMIT_PER_KIND),
        tx
          .select()
          .from(playbooks)
          .where(
            and(
              eq(playbooks.householdId, ctx.householdId),
              isNull(playbooks.archivedAt),
              or(ilike(playbooks.title, pattern), ilike(playbooks.triggerDescription, pattern)),
            ),
          )
          .limit(LIMIT_PER_KIND),
        /*
         * Regeln tragen einen selbstgewählten Namen und erzeugen seit Kurzem Aufgaben.
         * „Wo war noch die Regel für den Müll?" ist damit eine realistische Frage – die
         * Suche kannte sie bisher nicht (Audit M2).
         */
        tx
          .select()
          .from(monitors)
          .where(and(eq(monitors.householdId, ctx.householdId), ilike(monitors.name, pattern)))
          .limit(LIMIT_PER_KIND),
      ])

    const hits: SearchHit[] = []

    for (const domain of domainRows) {
      if (hits.filter((h) => h.kind === 'domain').length >= LIMIT_PER_KIND) break
      if (!domain.name.toLowerCase().includes(query.toLowerCase())) continue
      if (!visible(domain.id, 'domain:read', domain.sensitivity as Sensitivity)) continue
      hits.push({
        kind: 'domain',
        id: domain.id,
        title: domain.name,
        subtitle: pathOf(domain.parentId),
        domainId: domain.id,
        href: `/bereiche/${domain.id}`,
      })
    }

    for (const person of personRows) {
      hits.push({
        kind: 'person',
        id: person.id,
        title: person.displayName,
        subtitle: 'Person',
        domainId: null,
        href: `/familie`,
      })
    }

    for (const state of stateRows) {
      if (!visible(state.domainId, 'state:read', state.sensitivity as Sensitivity)) continue
      hits.push({
        kind: 'state',
        id: state.id,
        title: state.label,
        subtitle: pathOf(state.domainId),
        domainId: state.domainId,
        href: `/bereiche/${state.domainId}`,
      })
    }

    for (const item of knowledgeRows) {
      if (!visible(item.domainId, 'knowledge:read', item.sensitivity as Sensitivity)) continue
      hits.push({
        kind: 'knowledge',
        id: item.id,
        title: item.title,
        subtitle: pathOf(item.domainId),
        domainId: item.domainId,
        href: item.domainId ? `/bereiche/${item.domainId}` : '/familie',
      })
    }

    for (const question of questionRows) {
      if (!visible(question.domainId, 'knowledge:read')) continue
      hits.push({
        kind: 'question',
        id: question.id,
        title: question.body,
        subtitle: question.state === 'open' ? `Offene Frage · ${pathOf(question.domainId)}` : pathOf(question.domainId),
        domainId: question.domainId,
        href: question.domainId ? `/bereiche/${question.domainId}` : '/familie',
      })
    }

    for (const decision of decisionRows) {
      if (!visible(decision.domainId, 'knowledge:read')) continue
      hits.push({
        kind: 'decision',
        id: decision.id,
        title: decision.title,
        subtitle: `Entscheidung · ${pathOf(decision.domainId)}`,
        domainId: decision.domainId,
        href: decision.domainId ? `/bereiche/${decision.domainId}` : '/familie',
      })
    }

    for (const process of processRows) {
      if (!visible(process.domainId, 'process:read')) continue
      hits.push({
        kind: 'process',
        id: process.id,
        title: process.title,
        subtitle: `${process.state === 'active' ? 'Laufender Vorgang' : 'Vorgang'} · ${pathOf(process.domainId)}`,
        domainId: process.domainId,
        href: `/vorgang/${process.id}`,
      })
    }

    for (const task of taskRows) {
      if (!visible(task.domainId, 'task:read')) continue
      hits.push({
        kind: 'task',
        id: task.id,
        title: task.title,
        subtitle: `Offene Aufgabe · ${pathOf(task.domainId)}`,
        domainId: task.domainId,
        href: task.processId ? `/vorgang/${task.processId}` : `/bereiche/${task.domainId}`,
      })
    }

    for (const playbook of playbookRows) {
      hits.push({
        kind: 'playbook',
        id: playbook.id,
        title: playbook.title,
        subtitle: `Ablauf · ${pathOf(playbook.domainId)}`,
        domainId: playbook.domainId,
        href: `/familie/ablaeufe`,
      })
    }

    for (const rule of ruleRows) {
      if (!visible(rule.domainId, 'monitor:read', 'normal')) continue
      hits.push({
        kind: 'rule',
        id: rule.id,
        title: rule.name,
        subtitle: `Regel · ${pathOf(rule.domainId)}${rule.enabled ? '' : ' · ausgesetzt'}`,
        domainId: rule.domainId,
        href: `/bereiche/${rule.domainId}`,
      })
    }

    // Exakte Treffer zuerst, dann Treffer am Wortanfang, dann der Rest.
    const lower = query.toLowerCase()
    return hits
      .map((hit) => {
        const title = hit.title.toLowerCase()
        const rank = title === lower ? 0 : title.startsWith(lower) ? 1 : 2
        return { hit, rank }
      })
      .sort((a, b) => a.rank - b.rank || a.hit.title.length - b.hit.title.length)
      .slice(0, 25)
      .map((x) => x.hit)
  }
}
