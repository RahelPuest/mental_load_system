import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import {
  attentionItemSignals,
  attentionItems,
  decisions,
  domains,
  householdMemberships,
  knowledgeItems,
  monitors,
  processes,
  questions,
  responsibilityAssignments,
  signals,
  stateDefinitions,
  tasks,
  temporaryCoverages,
  uuidv7,
  type Tx,
} from '@thealotta/db'
import {
  assertAssignmentCompatible,
  assertAutonomy,
  authorize,
  conflict,
  criticalDomainsAtRisk,
  forbidden,
  notFound,
  resolveEffectiveOwner,
  type AssignmentRow,
  type CoverageRecord,
  type DomainNode,
  type EffectiveContext,
  type EffectiveOwner,
} from '@thealotta/domain'
import type { AssignmentKind, Criticality, DomainItemKind, Sensitivity } from '@thealotta/contracts'
import { recordEvent } from '@thealotta/db'
import { uniqueSlug } from '../slug.js'

export interface DomainWithOwner {
  id: string
  parentId: string | null
  path: string
  name: string
  criticality: Criticality
  sensitivity: Sensitivity
  ownershipInheritance: 'inherit' | 'own'
  position: number
  archivedAt: Date | null
  version: number
  effectiveOwner: (EffectiveOwner & { displayName: string; sharedNames: string[] }) | null
}

/** Ein Eintrag, der den Bereich gewechselt hat. `grund` steht nur an dem, was mitmusste. */
export interface MovedItem {
  kind: DomainItemKind
  id: string
  title: string
  grund?: string
}

export interface MoveItemsResult {
  moved: MovedItem[]
  /** Nicht gewählt, aber untrennbar mit etwas Gewähltem verbunden. */
  mitgenommen: MovedItem[]
}

export class DomainService {
  async list(tx: Tx, ctx: EffectiveContext, now: Date): Promise<DomainWithOwner[]> {
    const [rows, assignments, coverages, members] = await Promise.all([
      tx.select().from(domains).where(eq(domains.householdId, ctx.householdId)).orderBy(domains.path),
      tx
        .select()
        .from(responsibilityAssignments)
        .where(
          and(eq(responsibilityAssignments.householdId, ctx.householdId), isNull(responsibilityAssignments.effectiveTo)),
        ),
      tx
        .select()
        .from(temporaryCoverages)
        .where(
          and(eq(temporaryCoverages.householdId, ctx.householdId), sql`${temporaryCoverages.state} IN ('active','pending_return')`),
        ),
      tx
        .select({ id: householdMemberships.id, displayName: householdMemberships.displayName })
        .from(householdMemberships)
        .where(eq(householdMemberships.householdId, ctx.householdId)),
    ])

    const nameById = new Map(members.map((m) => [m.id, m.displayName]))
    const nodes: DomainNode[] = rows.map(toNode)
    const assignmentRows: AssignmentRow[] = assignments.map((a) => ({
      id: a.id,
      domainId: a.domainId,
      membershipId: a.membershipId,
      assignmentKind: a.assignmentKind as AssignmentKind,
      effectiveFrom: a.effectiveFrom,
      effectiveTo: a.effectiveTo,
    }))
    const coverageRows: CoverageRecord[] = coverages.map((c) => ({
      id: c.id,
      domainId: c.domainId,
      coveringMembershipId: c.coveringMembershipId,
      originalMembershipId: c.originalMembershipId,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      state: c.state,
    }))

    const visible = nodes.filter((n) => decideRead(ctx, n))
    const positionById = new Map(rows.map((r) => [r.id, r.position]))
    return orderTree(visible, positionById).map((node) => {
      const ancestors = ancestorsOf(node, nodes)
      const owner = resolveEffectiveOwner(node, ancestors, assignmentRows, coverageRows, now)
      const source = rows.find((r) => r.id === node.id)!
      return {
        id: node.id,
        parentId: node.parentId,
        path: node.path,
        name: node.name,
        criticality: node.criticality,
        sensitivity: node.sensitivity,
        ownershipInheritance: node.ownershipInheritance,
        position: source.position,
        archivedAt: node.archivedAt,
        version: source.version,
        effectiveOwner: owner
          ? {
              ...owner,
              displayName: nameById.get(owner.membershipId) ?? 'unbekannt',
              sharedNames: owner.sharedWith.map((id) => nameById.get(id) ?? 'unbekannt'),
            }
          : null,
      }
    })
  }

  /**
   * Gemeinsame Verantwortung für alle aktiven Mitglieder.
   *
   * Bestehende Zuweisungen für diesen Bereich werden beendet – gleichrangig geteilt und
   * eine Hauptverantwortung schließen einander aus (siehe `ownership.ts`). Die Historie
   * bleibt: beendet heißt `effective_to` gesetzt, nicht gelöscht (INV-004).
   */
  async shareWithAll(
    tx: Tx,
    ctx: EffectiveContext,
    domainId: string,
    now: Date,
  ): Promise<{ members: number }> {
    const members = await tx
      .select({ id: householdMemberships.id })
      .from(householdMemberships)
      .where(and(eq(householdMemberships.householdId, ctx.householdId), eq(householdMemberships.status, 'active')))

    for (const member of members) {
      await this.assign(tx, ctx, domainId, { membershipId: member.id, assignmentKind: 'shared_owner' }, now)
    }
    return { members: members.length }
  }

  async get(tx: Tx, ctx: EffectiveContext, domainId: string): Promise<DomainNode> {
    const [row] = await tx
      .select()
      .from(domains)
      .where(and(eq(domains.householdId, ctx.householdId), eq(domains.id, domainId)))
      .limit(1)
    if (!row) throw notFound('Der Bereich')
    const node = toNode(row)
    authorize(ctx, 'domain:read', {
      type: 'domain',
      id: node.id,
      householdId: ctx.householdId,
      domainId: node.id,
      sensitivity: node.sensitivity,
    })
    return node
  }

  async create(
    tx: Tx,
    ctx: EffectiveContext,
    input: {
      name: string
      parentId: string | null
      subjectPersonId: string | null
      criticality: Criticality
      sensitivity: Sensitivity
      ownershipInheritance: 'inherit' | 'own'
      description?: string
    },
  ): Promise<DomainNode> {
    authorize(ctx, 'domain:create', {
      type: 'domain',
      id: null,
      householdId: ctx.householdId,
      domainId: input.parentId,
      sensitivity: input.sensitivity,
    })

    let parentPath = ''
    if (input.parentId) {
      const [parent] = await tx
        .select()
        .from(domains)
        .where(and(eq(domains.householdId, ctx.householdId), eq(domains.id, input.parentId)))
        .limit(1)
      if (!parent) throw notFound('Der übergeordnete Bereich')
      parentPath = parent.path
    }

    const siblings = await tx
      .select({ slug: domains.slug })
      .from(domains)
      .where(
        input.parentId
          ? and(eq(domains.householdId, ctx.householdId), eq(domains.parentId, input.parentId))
          : and(eq(domains.householdId, ctx.householdId), isNull(domains.parentId)),
      )
    const slug = uniqueSlug(input.name, new Set(siblings.map((s) => s.slug)))
    const path = parentPath ? `${parentPath}.${slug}` : slug

    const id = uuidv7()
    const [created] = await tx
      .insert(domains)
      .values({
        id,
        householdId: ctx.householdId,
        parentId: input.parentId,
        path,
        name: input.name,
        slug,
        description: input.description ?? null,
        subjectPersonId: input.subjectPersonId,
        criticality: input.criticality,
        sensitivity: input.sensitivity,
        ownershipInheritance: input.ownershipInheritance,
      })
      .returning()

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'domain.created',
      subjectType: 'domain',
      subjectId: id,
      payload: { name: input.name, path, criticality: input.criticality },
    })
    return toNode(created!)
  }

  /* ── Ändern, archivieren, löschen ──────────────────────────────────── */

  /**
   * Namen, Wichtigkeit, Beschreibung oder den übergeordneten Bereich ändern.
   *
   * Ein neuer Name ergibt einen neuen Slug und damit einen neuen Pfad – und der Pfad steckt
   * auch in jedem Nachkommen. Deshalb wird der Teilbaum mitgezogen. Das ist gefahrlos, weil
   * Pfade ausschließlich in dieser Tabelle stehen: Berechtigungen und Vererbung arbeiten mit
   * Bereichs-IDs und lesen die Pfade bei jeder Anfrage neu.
   */
  async update(
    tx: Tx,
    ctx: EffectiveContext,
    domainId: string,
    input: {
      name?: string
      description?: string | null
      criticality?: Criticality
      sensitivity?: Sensitivity
      parentId?: string | null
    },
    now: Date,
  ): Promise<DomainNode> {
    const node = await this.get(tx, ctx, domainId)
    authorize(ctx, 'domain:manage', {
      type: 'domain',
      id: domainId,
      householdId: ctx.householdId,
      domainId,
      sensitivity: input.sensitivity ?? node.sensitivity,
    })

    // `DomainNode` führt die Beschreibung nicht – für „unverändert lassen" braucht es die Zeile.
    const [row] = await tx
      .select()
      .from(domains)
      .where(and(eq(domains.householdId, ctx.householdId), eq(domains.id, domainId)))
      .limit(1)
    if (!row) throw notFound('Der Bereich')

    const nextParentId = input.parentId === undefined ? node.parentId : input.parentId
    const nextName = input.name?.trim() || node.name

    let parentPath = ''
    if (nextParentId) {
      if (nextParentId === domainId) throw conflict('invalid_parent', 'Ein Bereich kann nicht in sich selbst liegen.')
      const [parent] = await tx
        .select()
        .from(domains)
        .where(and(eq(domains.householdId, ctx.householdId), eq(domains.id, nextParentId)))
        .limit(1)
      if (!parent) throw notFound('Der übergeordnete Bereich')
      // Ein Bereich darf nicht unter einen seiner eigenen Nachkommen wandern – der Teilbaum
      // hinge sonst an sich selbst und wäre von der Wurzel aus nicht mehr erreichbar.
      if (parent.path === node.path || parent.path.startsWith(`${node.path}.`)) {
        throw conflict('invalid_parent', 'Ein Bereich kann nicht unter einen seiner eigenen Unterbereiche wandern.')
      }
      parentPath = parent.path
    }

    const siblings = await tx
      .select({ id: domains.id, slug: domains.slug })
      .from(domains)
      .where(
        nextParentId
          ? and(eq(domains.householdId, ctx.householdId), eq(domains.parentId, nextParentId))
          : and(eq(domains.householdId, ctx.householdId), isNull(domains.parentId)),
      )
    const taken = new Set(siblings.filter((sib) => sib.id !== domainId).map((sib) => sib.slug))
    const slug = uniqueSlug(nextName, taken)
    const newPath = parentPath ? `${parentPath}.${slug}` : slug

    const [updated] = await tx
      .update(domains)
      .set({
        name: nextName,
        slug,
        path: newPath,
        parentId: nextParentId,
        description: input.description === undefined ? row.description : input.description,
        criticality: input.criticality ?? node.criticality,
        sensitivity: input.sensitivity ?? node.sensitivity,
        updatedAt: now,
      })
      .where(and(eq(domains.householdId, ctx.householdId), eq(domains.id, domainId)))
      .returning()

    if (newPath !== node.path) {
      // Die Nachkommen behalten ihre eigene Struktur und bekommen nur ein neues Präfix.
      /*
         `updated_at` setzt der Trigger `touch_updated_at` – hier würde ein JS-`Date` als
         Bindeparameter landen, den der Treiber an dieser Stelle nicht serialisieren kann.

         Die Reihenfolge ist wichtig: Erst der Bereich selbst, dann seine Nachkommen. Der
         Trigger `check_domain_tree` prüft bei jeder Zeile, dass ihr Pfad unter dem ihres
         übergeordneten Bereichs liegt – andersherum stünde ein Kind kurzzeitig unter einem
         Pfad, den es noch nicht gibt.
      */
      await tx.execute(sql`
        UPDATE domains
           SET path = ${newPath}::ltree || subpath(path, nlevel(${node.path}::ltree))
         WHERE household_id = ${ctx.householdId}
           AND path <@ ${node.path}::ltree
           AND id <> ${domainId}
      `)
    }

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'domain.updated',
      subjectType: 'domain',
      subjectId: domainId,
      payload: { from: { name: node.name, path: node.path }, to: { name: nextName, path: newPath } },
    })
    return toNode(updated!)
  }

  /**
   * Einen Bereich im Baum bewegen: hoch, runter, eine Ebene hinein oder hinaus.
   *
   * Vier Richtungen, ein Aufruf. Der Server rechnet aus, was das bedeutet – der Client müsste
   * sonst Positionen und Elternschaft selbst bestimmen und dabei dieselben Regeln kennen.
   *
   * `position` lag bisher bei allen Bereichen auf 0: Die Liste war nach Pfad sortiert, also
   * alphabetisch. Beim ersten Verschieben bekommen die Geschwister deshalb Positionen in
   * genau der Reihenfolge, in der sie ohnehin schon standen – nichts springt.
   */
  async move(
    tx: Tx,
    ctx: EffectiveContext,
    domainId: string,
    direction: 'up' | 'down' | 'in' | 'out',
    now: Date,
  ): Promise<void> {
    const node = await this.get(tx, ctx, domainId)
    authorize(ctx, 'domain:manage', {
      type: 'domain',
      id: domainId,
      householdId: ctx.householdId,
      domainId,
      sensitivity: node.sensitivity,
    })

    const all = await tx.select().from(domains).where(eq(domains.householdId, ctx.householdId))
    const siblings = sortSiblings(all.filter((d) => d.parentId === node.parentId && !d.archivedAt))
    const index = siblings.findIndex((d) => d.id === domainId)

    if (direction === 'up' || direction === 'down') {
      const target = siblings[direction === 'up' ? index - 1 : index + 1]
      if (!target) {
        throw conflict(
          'no_room',
          direction === 'up'
            ? `„${node.name}" steht schon ganz oben.`
            : `„${node.name}" steht schon ganz unten.`,
        )
      }
      // Erst allen Geschwistern eine Position geben, dann die beiden tauschen.
      const order = siblings.map((d) => d.id)
      order[index] = target.id
      order[direction === 'up' ? index - 1 : index + 1] = domainId
      for (const [i, id] of order.entries()) {
        await tx
          .update(domains)
          .set({ position: i })
          .where(and(eq(domains.householdId, ctx.householdId), eq(domains.id, id)))
      }
      await recordEvent(tx, ctx.householdId, ctx.actor, {
        eventType: 'domain.reordered',
        subjectType: 'domain',
        subjectId: domainId,
        payload: { direction, name: node.name },
      })
      return
    }

    if (direction === 'in') {
      const previous = siblings[index - 1]
      if (!previous) {
        throw conflict(
          'no_room',
          `Über „${node.name}" steht nichts, worunter er rutschen könnte. Verschiebe ihn erst nach unten.`,
        )
      }
      await this.update(tx, ctx, domainId, { parentId: previous.id }, now)
      return
    }

    if (!node.parentId) throw conflict('no_room', `„${node.name}" liegt schon ganz oben im Baum.`)
    const [parent] = await tx
      .select()
      .from(domains)
      .where(and(eq(domains.householdId, ctx.householdId), eq(domains.id, node.parentId)))
      .limit(1)
    await this.update(tx, ctx, domainId, { parentId: parent?.parentId ?? null }, now)
  }

  /**
   * Einen Bereich an eine bestimmte Stelle setzen: unter `parentId`, vor `beforeId`.
   *
   * Das Gegenstück zu `move()`. Beim Ziehen kennt der Client das Ziel als Ganzes – „hierhin,
   * auf diese Ebene" – und nicht als Folge von Schritten. Eine Reihe von `move`-Aufrufen
   * daraus zu bauen wäre nicht nur umständlich, sondern falsch: Zwischen den Schritten
   * stünde der Baum jeweils in einem Zustand, den niemand haben wollte.
   *
   * `beforeId === null` heißt „ans Ende dieser Ebene".
   */
  async reposition(
    tx: Tx,
    ctx: EffectiveContext,
    domainId: string,
    target: { parentId: string | null; beforeId: string | null },
    now: Date,
  ): Promise<void> {
    const node = await this.get(tx, ctx, domainId)
    authorize(ctx, 'domain:manage', {
      type: 'domain',
      id: domainId,
      householdId: ctx.householdId,
      domainId,
      sensitivity: node.sensitivity,
    })

    if (target.beforeId === domainId) throw conflict('invalid_target', 'Ein Bereich kann nicht vor sich selbst stehen.')

    // Die Elternschaft geht über `update`: Dort steckt die Prüfung auf Zyklen und das
    // Umschreiben der Pfade des ganzen Teilbaums.
    if (target.parentId !== node.parentId) {
      await this.update(tx, ctx, domainId, { parentId: target.parentId }, now)
    }

    const all = await tx.select().from(domains).where(eq(domains.householdId, ctx.householdId))
    const siblings = sortSiblings(all.filter((d) => d.parentId === target.parentId && !d.archivedAt))

    if (target.beforeId && !siblings.some((d) => d.id === target.beforeId)) {
      throw conflict('invalid_target', 'Der Bereich, vor den verschoben werden soll, liegt auf einer anderen Ebene.')
    }

    const rest = siblings.filter((d) => d.id !== domainId).map((d) => d.id)
    const at = target.beforeId ? rest.indexOf(target.beforeId) : rest.length
    const order = [...rest.slice(0, at), domainId, ...rest.slice(at)]

    for (const [i, id] of order.entries()) {
      await tx
        .update(domains)
        .set({ position: i })
        .where(and(eq(domains.householdId, ctx.householdId), eq(domains.id, id)))
    }

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'domain.repositioned',
      subjectType: 'domain',
      subjectId: domainId,
      payload: { name: node.name, parentId: target.parentId, beforeId: target.beforeId },
    })
  }

  /**
   * Aus dem Weg räumen, ohne etwas wegzuwerfen.
   *
   * Ein archivierter Bereich verschwindet aus den Listen, behält aber alles: Aufgaben,
   * Wissen, Verlauf. Das ist der übliche Weg – „löschen" im Sinne von „ich brauche das nicht
   * mehr" heißt hier archivieren (INV-001).
   */
  async archive(tx: Tx, ctx: EffectiveContext, domainId: string, now: Date): Promise<void> {
    const node = await this.get(tx, ctx, domainId)
    authorize(ctx, 'domain:archive', {
      type: 'domain',
      id: domainId,
      householdId: ctx.householdId,
      domainId,
      sensitivity: node.sensitivity,
    })
    if (node.archivedAt) return

    const children = await this.childCount(tx, ctx, node.path, domainId)
    if (children > 0) {
      throw conflict(
        'has_children',
        `„${node.name}" enthält ${children} ${children === 1 ? 'Unterbereich' : 'Unterbereiche'}. ` +
          'Archiviere oder verschiebe die zuerst – sonst wären sie über den Baum nicht mehr erreichbar.',
      )
    }

    await tx
      .update(domains)
      .set({ archivedAt: now, updatedAt: now })
      .where(and(eq(domains.householdId, ctx.householdId), eq(domains.id, domainId)))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'domain.archived',
      subjectType: 'domain',
      subjectId: domainId,
      payload: { name: node.name, path: node.path },
    })
  }

  /** Zurückholen. Archivieren ist eine Entscheidung, keine Einbahnstraße. */
  async unarchive(tx: Tx, ctx: EffectiveContext, domainId: string, now: Date): Promise<void> {
    const node = await this.get(tx, ctx, domainId)
    authorize(ctx, 'domain:archive', {
      type: 'domain',
      id: domainId,
      householdId: ctx.householdId,
      domainId,
      sensitivity: node.sensitivity,
    })
    await tx
      .update(domains)
      .set({ archivedAt: null, updatedAt: now })
      .where(and(eq(domains.householdId, ctx.householdId), eq(domains.id, domainId)))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'domain.unarchived',
      subjectType: 'domain',
      subjectId: domainId,
      payload: { name: node.name },
    })
  }

  /**
   * Inhalte eines Bereichs in einen anderen umhängen.
   *
   * Der Anlass ist das Aufteilen: Aus „Jacken und Schuhe" werden „Jacken" und „Schuhe", und was
   * schon festgehalten ist, soll mitkommen. Alles neu zu tippen wäre nicht nur Arbeit – die
   * Angaben verlören ihren Verlauf, die Regeln ihre letzte Prüfung, die Vorgänge ihre
   * Vergangenheit. Also genau das Gedächtnis, wegen dem es dieses System gibt.
   *
   * **Zwei Paare bleiben zusammen, auch wenn nur eine Hälfte gewählt wurde:**
   *
   * 1. Eine Regel und die Angabe, die sie beobachtet. Getrennt schaut die Regel über eine
   *    Bereichsgrenze: Man sieht die Angabe im einen Bereich und findet nicht, was sie prüft.
   * 2. Ein Vorgang und seine Aufgaben. Eine Aufgabe, die woanders liegt als ihr Vorgang, taucht
   *    in zwei Bereichen auf und gehört zu keinem.
   *
   * Eine Aufgabe, die zu einem Vorgang gehört, lässt sich deshalb **nicht einzeln** verschieben.
   * Der Versuch endet nicht stillschweigend, sondern mit dem Satz, was stattdessen zu tun ist.
   *
   * Berechtigung: `domain:manage` auf **beiden** Bereichen. Verschieben ist eine Einordnung,
   * keine Bearbeitung – und ohne Prüfung am Ziel wäre es ein Weg, etwas in einen Bereich zu
   * legen, den man selbst nicht verwalten darf.
   */
  async moveItems(
    tx: Tx,
    ctx: EffectiveContext,
    sourceDomainId: string,
    input: { targetDomainId: string; items: { kind: DomainItemKind; id: string }[] },
    now: Date,
  ): Promise<MoveItemsResult> {
    const source = await this.get(tx, ctx, sourceDomainId)
    const target = await this.get(tx, ctx, input.targetDomainId)

    if (source.id === target.id) {
      throw conflict('invalid_target', `„${source.name}" ist schon der Bereich, in dem die Einträge stehen.`)
    }
    if (target.archivedAt) {
      throw conflict(
        'target_archived',
        `„${target.name}" ist archiviert. Hol ihn zurück, bevor du etwas hineinlegst – sonst wäre das ` +
          'Verschobene nur noch über das Archiv erreichbar.',
      )
    }
    for (const node of [source, target]) {
      authorize(ctx, 'domain:manage', {
        type: 'domain',
        id: node.id,
        householdId: ctx.householdId,
        domainId: node.id,
        sensitivity: node.sensitivity,
      })
    }

    const gewaehlt = (kind: DomainItemKind): string[] => [
      ...new Set(input.items.filter((i) => i.kind === kind).map((i) => i.id)),
    ]
    const idsState = gewaehlt('state')
    const idsKnowledge = gewaehlt('knowledge')
    const idsQuestion = gewaehlt('question')
    const idsDecision = gewaehlt('decision')
    const idsMonitor = gewaehlt('monitor')
    const idsProcess = gewaehlt('process')
    const idsTask = gewaehlt('task')

    /*
      Nur, was wirklich in diesem Bereich steht. Sonst verschöbe eine fremde Kennung
      stillschweigend nichts, und der Aufrufer läse trotzdem „verschoben".
    */
    const [rowsState, rowsKnowledge, rowsQuestion, rowsDecision, rowsMonitor, rowsProcess, rowsTask] =
      await Promise.all([
        idsState.length === 0
          ? []
          : tx
              .select()
              .from(stateDefinitions)
              .where(
                and(
                  eq(stateDefinitions.householdId, ctx.householdId),
                  eq(stateDefinitions.domainId, sourceDomainId),
                  inArray(stateDefinitions.id, idsState),
                ),
              ),
        idsKnowledge.length === 0
          ? []
          : tx
              .select()
              .from(knowledgeItems)
              .where(
                and(
                  eq(knowledgeItems.householdId, ctx.householdId),
                  eq(knowledgeItems.domainId, sourceDomainId),
                  inArray(knowledgeItems.id, idsKnowledge),
                ),
              ),
        idsQuestion.length === 0
          ? []
          : tx
              .select()
              .from(questions)
              .where(
                and(
                  eq(questions.householdId, ctx.householdId),
                  eq(questions.domainId, sourceDomainId),
                  inArray(questions.id, idsQuestion),
                ),
              ),
        idsDecision.length === 0
          ? []
          : tx
              .select()
              .from(decisions)
              .where(
                and(
                  eq(decisions.householdId, ctx.householdId),
                  eq(decisions.domainId, sourceDomainId),
                  inArray(decisions.id, idsDecision),
                ),
              ),
        idsMonitor.length === 0
          ? []
          : tx
              .select()
              .from(monitors)
              .where(
                and(
                  eq(monitors.householdId, ctx.householdId),
                  eq(monitors.domainId, sourceDomainId),
                  inArray(monitors.id, idsMonitor),
                ),
              ),
        idsProcess.length === 0
          ? []
          : tx
              .select()
              .from(processes)
              .where(
                and(
                  eq(processes.householdId, ctx.householdId),
                  eq(processes.domainId, sourceDomainId),
                  inArray(processes.id, idsProcess),
                ),
              ),
        idsTask.length === 0
          ? []
          : tx
              .select()
              .from(tasks)
              .where(
                and(
                  eq(tasks.householdId, ctx.householdId),
                  eq(tasks.domainId, sourceDomainId),
                  inArray(tasks.id, idsTask),
                ),
              ),
      ])

    const fehlt =
      idsState.length - rowsState.length +
      (idsKnowledge.length - rowsKnowledge.length) +
      (idsQuestion.length - rowsQuestion.length) +
      (idsDecision.length - rowsDecision.length) +
      (idsMonitor.length - rowsMonitor.length) +
      (idsProcess.length - rowsProcess.length) +
      (idsTask.length - rowsTask.length)
    if (fehlt > 0) {
      throw notFound(fehlt === 1 ? 'Einer der gewählten Einträge' : `${fehlt} der gewählten Einträge`)
    }

    const amVorgang = rowsTask.find((t) => t.processId !== null)
    if (amVorgang) {
      throw conflict(
        'task_belongs_to_process',
        `„${amVorgang.title}" gehört zu einem Vorgang. Verschiebe den Vorgang – seine Aufgaben kommen mit.`,
      )
    }

    /*
      Untrennbares dazunehmen, bis sich nichts mehr ändert: Eine Regel zieht ihre Angabe nach,
      eine Angabe ihre Regeln – und die können an einer weiteren Angabe hängen.
    */
    const alleStates = new Map(rowsState.map((r) => [r.id, r]))
    const alleMonitors = new Map(rowsMonitor.map((r) => [r.id, r]))
    const mitgenommen: MovedItem[] = []

    for (;;) {
      const vorher = alleStates.size + alleMonitors.size

      const fehlendeAngaben = [...alleMonitors.values()]
        .map((m) => m.stateDefinitionId)
        .filter((id): id is string => id !== null && !alleStates.has(id))
      if (fehlendeAngaben.length > 0) {
        const rows = await tx
          .select()
          .from(stateDefinitions)
          .where(
            and(
              eq(stateDefinitions.householdId, ctx.householdId),
              eq(stateDefinitions.domainId, sourceDomainId),
              inArray(stateDefinitions.id, fehlendeAngaben),
            ),
          )
        for (const row of rows) {
          alleStates.set(row.id, row)
          const regel = [...alleMonitors.values()].find((m) => m.stateDefinitionId === row.id)
          mitgenommen.push({
            kind: 'state',
            id: row.id,
            title: row.label,
            grund: `wird von „${regel?.name ?? 'einer Regel'}" beobachtet`,
          })
        }
      }

      const angabenIds = [...alleStates.keys()]
      if (angabenIds.length > 0) {
        const rows = await tx
          .select()
          .from(monitors)
          .where(
            and(
              eq(monitors.householdId, ctx.householdId),
              eq(monitors.domainId, sourceDomainId),
              inArray(monitors.stateDefinitionId, angabenIds),
            ),
          )
        for (const row of rows) {
          if (alleMonitors.has(row.id)) continue
          alleMonitors.set(row.id, row)
          mitgenommen.push({
            kind: 'monitor',
            id: row.id,
            title: row.name,
            grund: `beobachtet „${alleStates.get(row.stateDefinitionId!)?.label ?? 'eine Angabe'}"`,
          })
        }
      }

      if (alleStates.size + alleMonitors.size === vorher) break
    }

    /* Aufgaben eines verschobenen Vorgangs – gleich, in welchem Bereich sie gerade hängen. */
    const vorgangsIds = rowsProcess.map((p) => p.id)
    const vorgangsAufgaben =
      vorgangsIds.length === 0
        ? []
        : await tx
            .select()
            .from(tasks)
            .where(and(eq(tasks.householdId, ctx.householdId), inArray(tasks.processId, vorgangsIds)))
    for (const t of vorgangsAufgaben) {
      if (t.domainId === input.targetDomainId) continue
      mitgenommen.push({ kind: 'task', id: t.id, title: t.title, grund: 'gehört zu einem verschobenen Vorgang' })
    }

    const ziel = { domainId: input.targetDomainId, updatedAt: now }
    const stateIds = [...alleStates.keys()]
    const monitorIds = [...alleMonitors.keys()]
    const taskIds = [...rowsTask.map((r) => r.id), ...vorgangsAufgaben.map((r) => r.id)]

    if (stateIds.length > 0) {
      await tx
        .update(stateDefinitions)
        .set(ziel)
        .where(and(eq(stateDefinitions.householdId, ctx.householdId), inArray(stateDefinitions.id, stateIds)))
    }
    if (rowsKnowledge.length > 0) {
      await tx
        .update(knowledgeItems)
        .set(ziel)
        .where(
          and(eq(knowledgeItems.householdId, ctx.householdId), inArray(knowledgeItems.id, rowsKnowledge.map((r) => r.id))),
        )
    }
    if (rowsQuestion.length > 0) {
      await tx
        .update(questions)
        .set(ziel)
        .where(and(eq(questions.householdId, ctx.householdId), inArray(questions.id, rowsQuestion.map((r) => r.id))))
    }
    if (rowsDecision.length > 0) {
      await tx
        .update(decisions)
        .set(ziel)
        .where(and(eq(decisions.householdId, ctx.householdId), inArray(decisions.id, rowsDecision.map((r) => r.id))))
    }
    if (monitorIds.length > 0) {
      await tx
        .update(monitors)
        .set(ziel)
        .where(and(eq(monitors.householdId, ctx.householdId), inArray(monitors.id, monitorIds)))
    }
    if (vorgangsIds.length > 0) {
      await tx
        .update(processes)
        .set(ziel)
        .where(and(eq(processes.householdId, ctx.householdId), inArray(processes.id, vorgangsIds)))
    }
    if (taskIds.length > 0) {
      await tx
        .update(tasks)
        .set(ziel)
        .where(and(eq(tasks.householdId, ctx.householdId), inArray(tasks.id, taskIds)))
    }

    /*
      Ein offener Hinweis gehört seiner Regel. Bliebe er stehen, meldete der alte Bereich
      weiter Aufmerksamkeitsbedarf für etwas, das er nicht mehr hat – und der neue schwiege.
      Hinweise hängen nicht direkt an der Regel, sondern über ihre Signale.

      **Die Signale selbst bleiben, wo sie sind.** Sie sind kein Zustand, sondern Protokoll:
      „zu diesem Zeitpunkt, in diesem Bereich, ist das aufgefallen." Die Datenbank ist da
      derselben Meinung und lässt der Anwendungsrolle gar keine Wahl – `0003_rls_and_grants`
      entzieht ihr UPDATE auf `signals`, zusammen mit `domain_events`, `audit_events` und
      `state_observations` (docs/20 §5). Was aufgeschrieben ist, wird nicht umgeschrieben.

      Aus demselben Grund ziehen nur **offene** Hinweise um. Ein erledigter Hinweis ist eine
      Aussage über die Vergangenheit des alten Bereichs.
    */
    if (monitorIds.length > 0) {
      const betroffene = await tx
        .select({ id: attentionItemSignals.attentionItemId })
        .from(attentionItemSignals)
        .innerJoin(signals, eq(signals.id, attentionItemSignals.signalId))
        .where(and(eq(attentionItemSignals.householdId, ctx.householdId), inArray(signals.monitorId, monitorIds)))
      const hinweisIds = [...new Set(betroffene.map((r) => r.id))]
      if (hinweisIds.length > 0) {
        await tx
          .update(attentionItems)
          .set({ domainId: input.targetDomainId, updatedAt: now })
          .where(
            and(
              eq(attentionItems.householdId, ctx.householdId),
              inArray(attentionItems.id, hinweisIds),
              inArray(attentionItems.state, ['open', 'acknowledged', 'snoozed']),
            ),
          )
      }
    }

    const bewegt: MovedItem[] = [
      ...rowsState.map((r) => ({ kind: 'state' as const, id: r.id, title: r.label })),
      ...rowsKnowledge.map((r) => ({ kind: 'knowledge' as const, id: r.id, title: r.title })),
      ...rowsQuestion.map((r) => ({ kind: 'question' as const, id: r.id, title: r.body })),
      ...rowsDecision.map((r) => ({ kind: 'decision' as const, id: r.id, title: r.title })),
      ...rowsMonitor.map((r) => ({ kind: 'monitor' as const, id: r.id, title: r.name })),
      ...rowsProcess.map((r) => ({ kind: 'process' as const, id: r.id, title: r.title })),
      ...rowsTask.map((r) => ({ kind: 'task' as const, id: r.id, title: r.title })),
    ]

    /*
      Zwei Sorten Ereignis, mit Absicht: Der Verlauf eines Bereichs wird über
      `payload.domainId` gefiltert (History-Route). Stünde dort nur das Ziel, wäre im alten
      Bereich nicht nachvollziehbar, dass etwas gegangen ist – „nichts geht still verloren"
      (INV-001) hieße dann nur „nichts geht verloren, wo man ohnehin hinsieht".
    */
    for (const item of [...bewegt, ...mitgenommen]) {
      await recordEvent(tx, ctx.householdId, ctx.actor, {
        eventType: 'domain.item_moved',
        subjectType: item.kind,
        subjectId: item.id,
        payload: {
          domainId: input.targetDomainId,
          fromDomainId: sourceDomainId,
          fromName: source.name,
          toName: target.name,
          title: item.title,
          ...(item.grund ? { mitgenommen: true, grund: item.grund } : {}),
        },
      })
    }
    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'domain.items_left',
      subjectType: 'domain',
      subjectId: sourceDomainId,
      payload: {
        domainId: sourceDomainId,
        toDomainId: input.targetDomainId,
        toName: target.name,
        count: bewegt.length + mitgenommen.length,
        items: [...bewegt, ...mitgenommen].map((i) => ({ kind: i.kind, title: i.title })),
      },
    })

    return { moved: bewegt, mitgenommen }
  }

  /**
   * Endgültig löschen – nur, wenn dabei nichts verloren gehen kann.
   *
   * Jeder Fremdschlüssel auf `domains` steht auf RESTRICT: Die Datenbank selbst verweigert
   * das Löschen eines Bereichs mit Inhalt. Diese Methode fragt vorher, damit statt eines
   * Datenbankfehlers ein Satz herauskommt, der sagt, was im Weg steht.
   *
   * Zuständigkeiten und Vertretungen werden mitgelöscht: Sie sind Aussagen *über* den
   * Bereich und ohne ihn gegenstandslos. Was jemand angelegt hat, ist damit nicht betroffen –
   * gäbe es davon etwas, käme man hier gar nicht vorbei.
   */
  async remove(tx: Tx, ctx: EffectiveContext, domainId: string, now: Date): Promise<void> {
    const node = await this.get(tx, ctx, domainId)
    authorize(ctx, 'domain:archive', {
      type: 'domain',
      id: domainId,
      householdId: ctx.householdId,
      domainId,
      sensitivity: node.sensitivity,
    })

    const children = await this.childCount(tx, ctx, node.path, domainId)
    if (children > 0) {
      throw conflict(
        'has_children',
        `„${node.name}" enthält ${children} ${children === 1 ? 'Unterbereich' : 'Unterbereiche'}. ` +
          'Die müssten zuerst weg.',
      )
    }

    const contents = await this.contentSummary(tx, ctx, domainId)
    if (contents.length > 0) {
      throw conflict(
        'not_empty',
        `In „${node.name}" steht schon etwas: ${contents.join(', ')}. ` +
          'Löschen würde das mitnehmen – archiviere den Bereich stattdessen, dann bleibt alles erhalten.',
      )
    }

    await tx
      .delete(temporaryCoverages)
      .where(and(eq(temporaryCoverages.householdId, ctx.householdId), eq(temporaryCoverages.domainId, domainId)))
    await tx
      .delete(responsibilityAssignments)
      .where(
        and(eq(responsibilityAssignments.householdId, ctx.householdId), eq(responsibilityAssignments.domainId, domainId)),
      )

    // Der Eintrag im Protokoll bleibt, auch wenn die Zeile geht – sonst wäre nicht
    // nachvollziehbar, dass es diesen Bereich je gab.
    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'domain.deleted',
      subjectType: 'domain',
      subjectId: domainId,
      payload: { name: node.name, path: node.path, deletedAt: now.toISOString() },
    })

    await tx.delete(domains).where(and(eq(domains.householdId, ctx.householdId), eq(domains.id, domainId)))
  }

  private async childCount(tx: Tx, ctx: EffectiveContext, path: string, domainId: string): Promise<number> {
    const rows = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM domains
       WHERE household_id = ${ctx.householdId} AND path <@ ${path}::ltree AND id <> ${domainId}
    `)
    return Number((rows as unknown as { n: number }[])[0]?.n ?? 0)
  }

  /**
   * Was in einem Bereich steht, in Worten statt in Zahlenkolonnen.
   *
   * Die Liste kommt aus einer Abfrage über alle Tabellen, die auf einen Bereich zeigen. Wer
   * eine Tabelle ergänzt, ohne sie hier einzutragen, bekommt beim Löschen wieder einen
   * Datenbankfehler statt eines Satzes – deshalb steht der Test daneben.
   */
  private async contentSummary(tx: Tx, ctx: EffectiveContext, domainId: string): Promise<string[]> {
    const rows = await tx.execute<{ kind: string; n: number }>(sql`
      SELECT 'task' AS kind, count(*)::int AS n FROM tasks WHERE household_id = ${ctx.householdId} AND domain_id = ${domainId}
      UNION ALL SELECT 'knowledge', count(*)::int FROM knowledge_items WHERE household_id = ${ctx.householdId} AND domain_id = ${domainId}
      UNION ALL SELECT 'state', count(*)::int FROM state_definitions WHERE household_id = ${ctx.householdId} AND domain_id = ${domainId}
      UNION ALL SELECT 'question', count(*)::int FROM questions WHERE household_id = ${ctx.householdId} AND domain_id = ${domainId}
      UNION ALL SELECT 'decision', count(*)::int FROM decisions WHERE household_id = ${ctx.householdId} AND domain_id = ${domainId}
      UNION ALL SELECT 'monitor', count(*)::int FROM monitors WHERE household_id = ${ctx.householdId} AND domain_id = ${domainId}
      UNION ALL SELECT 'process', count(*)::int FROM processes WHERE household_id = ${ctx.householdId} AND domain_id = ${domainId}
      UNION ALL SELECT 'playbook', count(*)::int FROM playbooks WHERE household_id = ${ctx.householdId} AND domain_id = ${domainId}
      UNION ALL SELECT 'attention', count(*)::int FROM attention_items WHERE household_id = ${ctx.householdId} AND domain_id = ${domainId}
      UNION ALL SELECT 'need', count(*)::int FROM needs WHERE household_id = ${ctx.householdId} AND domain_id = ${domainId}
      UNION ALL SELECT 'signal', count(*)::int FROM signals WHERE household_id = ${ctx.householdId} AND domain_id = ${domainId}
      UNION ALL SELECT 'attachment', count(*)::int FROM attachments WHERE household_id = ${ctx.householdId} AND domain_id = ${domainId}
    `)
    return (rows as unknown as { kind: string; n: number }[])
      .filter((r) => Number(r.n) > 0)
      .map((r) => {
        const [one, many] = CONTENT_WORDS[r.kind] ?? [r.kind, r.kind]
        return `${r.n} ${Number(r.n) === 1 ? one : many}`
      })
  }

  /* ── Ownership ─────────────────────────────────────────────────────── */

  async assign(
    tx: Tx,
    ctx: EffectiveContext,
    domainId: string,
    input: { membershipId: string; assignmentKind: AssignmentKind; note?: string },
    now: Date,
  ): Promise<{ id: string }> {
    // ADR-0008: Verantwortung zuweisen ist A3 – das System tut das nie von selbst.
    assertAutonomy('ownership.assign', ctx.actor)

    const node = await this.get(tx, ctx, domainId)
    const capability = input.membershipId === ctx.membershipId ? 'ownership:claim' : 'ownership:assign'
    authorize(ctx, capability, {
      type: 'domain',
      id: domainId,
      householdId: ctx.householdId,
      domainId,
      sensitivity: node.sensitivity,
    })

    // Aggregat-Lock: zwei gleichzeitige „Ich übernehme"-Klicks werden serialisiert (docs/09 §5).
    await tx.execute(sql`SELECT id FROM domains WHERE id = ${domainId} FOR UPDATE`)

    const existing = await tx
      .select()
      .from(responsibilityAssignments)
      .where(and(eq(responsibilityAssignments.domainId, domainId), isNull(responsibilityAssignments.effectiveTo)))

    assertAssignmentCompatible(
      existing.map((a) => ({
        id: a.id,
        domainId: a.domainId,
        membershipId: a.membershipId,
        assignmentKind: a.assignmentKind as AssignmentKind,
        effectiveFrom: a.effectiveFrom,
        effectiveTo: a.effectiveTo,
      })),
      input.assignmentKind,
      domainId,
      now,
    )

    const id = uuidv7()
    await tx.insert(responsibilityAssignments).values({
      id,
      householdId: ctx.householdId,
      domainId,
      membershipId: input.membershipId,
      assignmentKind: input.assignmentKind,
      // Zeit kommt immer aus der injizierten Uhr, nie aus einem DB-Default: sonst wäre
      // zeitabhängige Logik nicht deterministisch testbar (docs/26 §4).
      effectiveFrom: now,
      assignedBy: ctx.membershipId,
      note: input.note ?? null,
    })

    // Q-04: Die erste eigene Zuweisung beendet die Vererbung – sichtbar und protokolliert.
    if (node.ownershipInheritance === 'inherit') {
      await tx
        .update(domains)
        .set({ ownershipInheritance: 'own', version: sql`version + 1` })
        .where(eq(domains.id, domainId))
    }

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'ownership.assigned',
      subjectType: 'responsibility_assignment',
      subjectId: id,
      payload: { domainId, membershipId: input.membershipId, assignmentKind: input.assignmentKind },
    })
    return { id }
  }

  async release(tx: Tx, ctx: EffectiveContext, assignmentId: string, reason: string): Promise<void> {
    assertAutonomy('ownership.release', ctx.actor)
    const [row] = await tx
      .select()
      .from(responsibilityAssignments)
      .where(
        and(
          eq(responsibilityAssignments.householdId, ctx.householdId),
          eq(responsibilityAssignments.id, assignmentId),
          isNull(responsibilityAssignments.effectiveTo),
        ),
      )
      .limit(1)
    if (!row) throw notFound('Die Zuweisung')

    const node = await this.get(tx, ctx, row.domainId)
    authorize(ctx, row.membershipId === ctx.membershipId ? 'ownership:claim' : 'ownership:assign', {
      type: 'domain',
      id: row.domainId,
      householdId: ctx.householdId,
      domainId: row.domainId,
      sensitivity: node.sensitivity,
    })

    // INV-013: Zeilen werden nie gelöscht, nur beendet – die Historie bleibt rekonstruierbar.
    await tx
      .update(responsibilityAssignments)
      .set({ effectiveTo: new Date(), endReason: reason })
      .where(eq(responsibilityAssignments.id, assignmentId))

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'ownership.released',
      subjectType: 'responsibility_assignment',
      subjectId: assignmentId,
      payload: { domainId: row.domainId, membershipId: row.membershipId, reason },
    })
  }

  async transfer(
    tx: Tx,
    ctx: EffectiveContext,
    domainId: string,
    input: { toMembershipId: string; reason: string },
    now: Date,
  ): Promise<{ id: string }> {
    assertAutonomy('ownership.transfer', ctx.actor)
    const node = await this.get(tx, ctx, domainId)

    // INV-003: `decide` liefert hier für Vertretungen ausdrücklich ein Verbot.
    authorize(ctx, 'ownership:transfer', {
      type: 'domain',
      id: domainId,
      householdId: ctx.householdId,
      domainId,
      sensitivity: node.sensitivity,
    })

    await tx.execute(sql`SELECT id FROM domains WHERE id = ${domainId} FOR UPDATE`)

    const [current] = await tx
      .select()
      .from(responsibilityAssignments)
      .where(
        and(
          eq(responsibilityAssignments.domainId, domainId),
          eq(responsibilityAssignments.assignmentKind, 'primary_owner'),
          isNull(responsibilityAssignments.effectiveTo),
        ),
      )
      .limit(1)

    if (current) {
      await tx
        .update(responsibilityAssignments)
        .set({ effectiveTo: now, endReason: `transferred: ${input.reason}` })
        .where(eq(responsibilityAssignments.id, current.id))
    }

    const id = uuidv7()
    await tx.insert(responsibilityAssignments).values({
      id,
      householdId: ctx.householdId,
      domainId,
      membershipId: input.toMembershipId,
      assignmentKind: 'primary_owner',
      effectiveFrom: now,
      assignedBy: ctx.membershipId,
      note: input.reason,
    })

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'ownership.transferred',
      subjectType: 'responsibility_assignment',
      subjectId: id,
      payload: { domainId, from: current?.membershipId ?? null, to: input.toMembershipId, reason: input.reason },
    })
    return { id }
  }

  /**
   * INV-013 / ADR-0009: bitemporale Rekonstruktion.
   *
   * „Wer war am 12.08.2026 verantwortlich?" ist eine simple Abfrage über die Zuweisungstabelle
   * und hängt nicht davon ab, dass der Event-Strom lückenlos ist.
   */
  async ownershipHistory(
    tx: Tx,
    ctx: EffectiveContext,
    domainId: string,
    at?: Date,
  ): Promise<{ at: string | null; owners: { membershipId: string; assignmentKind: string; from: string; to: string | null; endReason: string | null }[] }> {
    const node = await this.get(tx, ctx, domainId)
    authorize(ctx, 'history:read', {
      type: 'domain',
      id: domainId,
      householdId: ctx.householdId,
      domainId,
      sensitivity: node.sensitivity,
    })

    const rows = await tx
      .select()
      .from(responsibilityAssignments)
      .where(and(eq(responsibilityAssignments.householdId, ctx.householdId), eq(responsibilityAssignments.domainId, domainId)))
      .orderBy(responsibilityAssignments.effectiveFrom)

    const relevant = at
      ? rows.filter(
          (r) => r.effectiveFrom.getTime() <= at.getTime() && (r.effectiveTo === null || r.effectiveTo.getTime() > at.getTime()),
        )
      : rows

    return {
      at: at?.toISOString() ?? null,
      owners: relevant.map((r) => ({
        membershipId: r.membershipId,
        assignmentKind: r.assignmentKind,
        from: r.effectiveFrom.toISOString(),
        to: r.effectiveTo?.toISOString() ?? null,
        endReason: r.endReason,
      })),
    }
  }

  /** §31: Bereiche ohne eindeutige Verantwortung sichtbar machen – ein Produktsignal, kein Fehler. */
  async unowned(tx: Tx, ctx: EffectiveContext, now: Date): Promise<DomainWithOwner[]> {
    const all = await this.list(tx, ctx, now)
    return all.filter((d) => d.effectiveOwner === null && d.archivedAt === null)
  }

  /** INV-014: Welche kritischen Bereiche stünden ohne Verantwortung da, wenn diese Person pausiert? */
  async criticalAtRisk(tx: Tx, ctx: EffectiveContext, membershipId: string, now: Date): Promise<DomainWithOwner[]> {
    const all = await this.list(tx, ctx, now)
    const nodes: DomainNode[] = all.map((d) => ({
      id: d.id,
      parentId: d.parentId,
      path: d.path,
      name: d.name,
      criticality: d.criticality,
      sensitivity: d.sensitivity,
      ownershipInheritance: d.ownershipInheritance,
      archivedAt: d.archivedAt,
    }))
    const owners = new Map(all.map((d) => [d.id, d.effectiveOwner as EffectiveOwner | null]))
    const risky = new Set(criticalDomainsAtRisk(nodes, owners, membershipId).map((d) => d.id))
    return all.filter((d) => risky.has(d.id))
  }
}

/**
 * Einzahl und Mehrzahl für die Inhaltsliste beim Löschen.
 *
 * „1 Vorgänge" ist kein Deutsch. Die Meldung erscheint in einem Moment, in dem jemand etwas
 * Zerstörerisches vorhat – gerade da soll der Satz nicht holpern.
 */
const CONTENT_WORDS: Record<string, [string, string]> = {
  task: ['Aufgabe', 'Aufgaben'],
  knowledge: ['Wissenseintrag', 'Wissenseinträge'],
  state: ['Angabe', 'Angaben'],
  question: ['offene Frage', 'offene Fragen'],
  decision: ['Entscheidung', 'Entscheidungen'],
  monitor: ['Beobachtungsregel', 'Beobachtungsregeln'],
  process: ['Vorgang', 'Vorgänge'],
  playbook: ['Ablauf', 'Abläufe'],
  attention: ['Hinweis', 'Hinweise'],
  need: ['Bedarf', 'Bedarfe'],
  signal: ['Signal', 'Signale'],
  attachment: ['Anhang', 'Anhänge'],
}

/**
 * Geschwister in Anzeigereihenfolge: nach `position`, bei Gleichstand nach Namen.
 *
 * Der Namensvergleich ist der Anker für alles, was noch nie verschoben wurde – ohne ihn
 * hinge die Reihenfolge von der Zufälligkeit der Datenbankausgabe ab und könnte zwischen
 * zwei Aufrufen wechseln.
 */
function sortSiblings<T extends { position: number; name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'))
}

/**
 * Den Baum in Anzeigereihenfolge auffalten: jeder Bereich, direkt gefolgt von seinen
 * Unterbereichen. Vorher sortierte die Datenbank nach Pfad – das ergibt zwar eine gültige
 * Baumreihenfolge, aber eine alphabetische, die sich nicht ändern lässt.
 */
function orderTree<T extends { id: string; parentId: string | null; name: string }>(
  nodes: T[],
  positionById: ReadonlyMap<string, number>,
): T[] {
  const byParent = new Map<string | null, T[]>()
  for (const node of nodes) {
    const list = byParent.get(node.parentId) ?? []
    list.push(node)
    byParent.set(node.parentId, list)
  }

  const out: T[] = []
  const walk = (parentId: string | null) => {
    const children = byParent.get(parentId) ?? []
    for (const child of sortSiblings(children.map((c) => ({ ...c, position: positionById.get(c.id) ?? 0 })))) {
      const original = nodes.find((n) => n.id === child.id)!
      out.push(original)
      walk(child.id)
    }
  }
  walk(null)

  // Wer keinen erreichbaren Elternteil hat (etwa weil dessen Lesezugriff fehlt), fiele sonst
  // aus der Liste – sichtbar bleiben muss er trotzdem.
  for (const node of nodes) if (!out.includes(node)) out.push(node)
  return out
}

function toNode(row: typeof domains.$inferSelect): DomainNode {
  return {
    id: row.id,
    parentId: row.parentId,
    path: row.path,
    name: row.name,
    criticality: row.criticality as Criticality,
    sensitivity: row.sensitivity as Sensitivity,
    ownershipInheritance: row.ownershipInheritance as 'inherit' | 'own',
    archivedAt: row.archivedAt,
  }
}

function ancestorsOf(node: DomainNode, all: readonly DomainNode[]): DomainNode[] {
  const parts = node.path.split('.')
  const out: DomainNode[] = []
  for (let i = 1; i < parts.length; i += 1) {
    const prefix = parts.slice(0, i).join('.')
    const found = all.find((n) => n.path === prefix)
    if (found) out.push(found)
  }
  return out
}

/** Sichtfilter für Listen: unzugängliche Bereiche werden ausgelassen, nicht als Fehler gemeldet. */
function decideRead(ctx: EffectiveContext, node: DomainNode): boolean {
  try {
    authorize(ctx, 'domain:read', {
      type: 'domain',
      id: node.id,
      householdId: ctx.householdId,
      domainId: node.id,
      sensitivity: node.sensitivity,
    })
    return true
  } catch {
    return false
  }
}

void conflict
void forbidden
