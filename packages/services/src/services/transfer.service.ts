import { and, eq, inArray, isNull } from 'drizzle-orm'
import {
  attachments,
  attentionItemSignals,
  attentionItems,
  decisions,
  domains,
  householdMemberships,
  households,
  inboxItems,
  knowledgeItems,
  monitorSuppressions,
  monitors,
  needs,
  notifications,
  persons,
  playbookSteps,
  playbooks,
  processes,
  questions,
  recordAudit,
  recordEvent,
  responsibilityAssignments,
  signals,
  stateDefinitions,
  stateObservations,
  stateValues,
  taskDependencies,
  tasks,
  temporaryCoverages,
  waitingStates,
  uuidv7,
  type Tx,
} from '@thealotta/db'
import { authorize, badRequest, type EffectiveContext } from '@thealotta/domain'
import { slugify, uniqueSlug } from '../slug.js'

/**
 * Daten mitnehmen und zurückbringen.
 *
 * Vorher gab es einen „Export anfordern"-Knopf, der eine Zeile mit `state: 'queued'` anlegte –
 * und keinen Job, der sie je verarbeitet hätte. Die Oberfläche versprach „Du bekommst
 * Bescheid, sobald er bereitsteht"; es passierte nie etwas.
 *
 * Ein Haushalt ist klein – Dutzende bis wenige hundert Zeilen. Es braucht dafür keine
 * Warteschlange und keinen Ablageort: Die Daten gehen direkt als JSON über die Leitung.
 *
 * **Was mitgeht:** die Struktur (Bereiche), das Wissen (Angaben, Notizen, Fragen,
 * Entscheidungen), die Regeln, die laufende Arbeit (Vorgänge, Aufgaben) und die
 * Zuständigkeiten. **Was nicht mitgeht:** Zugänge, Passwörter, Sitzungen, Geräte,
 * Benachrichtigungen und der Ereignisverlauf. Eine Sicherungsdatei ist kein Konto.
 */

/** Die Fassung des Formats. Ändert sich die Bedeutung eines Feldes, steigt sie. */
export const TRANSFER_VERSION = 1

/**
 * Die Kennung im Kopf einer Sicherungsdatei.
 *
 * Sie hieß `mira.household`. Beim Lesen gilt **beides**: Wer eine Datei von vor der
 * Umbenennung einliest, soll sie einlesen können – eine Sicherung, die nach einem
 * Namenswechsel nicht mehr zurückzuspielen ist, ist keine Sicherung. Geschrieben wird nur
 * noch die neue Kennung.
 */
export const TRANSFER_FORMAT = 'thealotta.household'
const TRANSFER_FORMAT_ALT = 'mira.household'

export interface TransferDocument {
  format: typeof TRANSFER_FORMAT | typeof TRANSFER_FORMAT_ALT
  version: number
  exportedAt: string
  household: { name: string; timezone: string }
  personen: unknown[]
  mitglieder: { id: string; displayName: string }[]
  bereiche: unknown[]
  angaben: unknown[]
  werte: unknown[]
  wissen: unknown[]
  fragen: unknown[]
  entscheidungen: unknown[]
  regeln: unknown[]
  vorgaenge: unknown[]
  aufgaben: unknown[]
  abhaengigkeiten: unknown[]
  zustaendigkeiten: unknown[]
}

/** Das Wort, das beim Leeren getippt werden muss. */
export const LEEREN_BESTAETIGUNG = 'ALLES LÖSCHEN'

export interface ImportSummary {
  angelegt: Record<string, number>
  uebersprungen: string[]
}

/**
 * Was nicht in die Datei gehört.
 *
 * Zum einen Zeitstempel und Zählerstände: Sie gehören zum alten Leben einer Zeile, nicht zur
 * Sache selbst. Zum anderen `physicalEnergy`, `focusRequired` und `socialLoad` – drei Felder,
 * die im Audit aus dem Produkt entfernt wurden, weil sie niemand las; in der Datenbank stehen
 * die Spalten noch. Sie zu exportieren hieße, eine zurückgenommene Entscheidung wieder
 * mitzuschleppen.
 */
const NICHT_UEBERTRAGEN = new Set([
  'householdId',
  'createdAt',
  'updatedAt',
  'version',
  'lastEvaluatedAt',
  'nextEvaluationAt',
  'consecutiveFailures',
  'lastError',
  'overdueSince',
  'lastReassessedAt',
  'physicalEnergy',
  'focusRequired',
  'socialLoad',
])

/**
 * Eine Zeile für die Datei aufbereiten.
 *
 * Leere Felder fallen weg. Eine Sicherungsdatei, in der jede zweite Angabe `"note": null`
 * lautet, ist nicht vollständiger als eine ohne – nur länger und schlechter zu lesen. Beim
 * Einlesen ist ein fehlendes Feld ohnehin dasselbe wie ein leeres.
 *
 * Die Reihenfolge der Felder bleibt die der Tabelle: `id` zuerst, dann die Bezüge, dann der
 * Inhalt. Wer die Datei überfliegt, findet dadurch an jeder Zeile dieselbe Gestalt.
 */
function saubere(zeile: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(zeile)) {
    if (NICHT_UEBERTRAGEN.has(k)) continue
    if (v === null || v === undefined) continue
    out[k] = v instanceof Date ? v.toISOString() : v
  }
  return out
}

/**
 * Leere Felder aus einem Datensatz entfernen, bevor er geschrieben wird.
 *
 * Eine Spalte, die NOT NULL ist und einen Vorgabewert hat, nimmt keinen ausdrücklichen
 * `null`-Wert an – der Vorgabewert greift nur, wenn die Spalte gar nicht genannt wird.
 * `conflict_window` brachte den ganzen Import deshalb mit einem 500er zu Fall, obwohl in der
 * Datei schlicht nichts dazu stand. Weglassen heißt: Die Datenbank entscheidet, wie sie es
 * immer täte.
 */
function ohneLeere<T extends Record<string, unknown>>(zeile: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(zeile)) if (v !== null && v !== undefined) out[k] = v
  return out as T
}

export class TransferService {
  async exportHousehold(tx: Tx, ctx: EffectiveContext, now: Date): Promise<TransferDocument> {
    authorize(ctx, 'export:request', { type: 'export_job', id: null, householdId: ctx.householdId })

    const hh = ctx.householdId
    const wo = <T extends { householdId: unknown }>(t: T) => eq(t.householdId as never, hh)

    const [haushalt] = await tx.select().from(households).where(eq(households.id, hh)).limit(1)
    const [
      personenRows,
      mitgliedRows,
      bereichRows,
      angabenRows,
      wissenRows,
      fragenRows,
      entscheidungRows,
      regelRows,
      vorgangRows,
      aufgabenRows,
      zustaendigRows,
    ] = await Promise.all([
      tx.select().from(persons).where(and(wo(persons), isNull(persons.deletedAt))),
      tx
        .select({ id: householdMemberships.id, displayName: householdMemberships.displayName })
        .from(householdMemberships)
        .where(wo(householdMemberships)),
      tx.select().from(domains).where(wo(domains)),
      tx.select().from(stateDefinitions).where(wo(stateDefinitions)),
      tx.select().from(knowledgeItems).where(and(wo(knowledgeItems), isNull(knowledgeItems.deletedAt))),
      tx.select().from(questions).where(wo(questions)),
      tx.select().from(decisions).where(wo(decisions)),
      tx.select().from(monitors).where(wo(monitors)),
      tx.select().from(processes).where(wo(processes)),
      tx.select().from(tasks).where(wo(tasks)),
      tx.select().from(responsibilityAssignments).where(wo(responsibilityAssignments)),
    ])

    // Werte und Abhängigkeiten hängen an ihren Eltern – sie werden über deren IDs geholt.
    const werteRows = angabenRows.length
      ? await tx
          .select()
          .from(stateValues)
          .where(inArray(stateValues.stateDefinitionId, angabenRows.map((a) => a.id)))
      : []
    const abhaengigRows = aufgabenRows.length
      ? await tx
          .select()
          .from(taskDependencies)
          .where(inArray(taskDependencies.taskId, aufgabenRows.map((t) => t.id)))
      : []

    await recordAudit(tx, {
      action: 'export.completed',
      householdId: hh,
      userId: ctx.actor.userId,
      membershipId: ctx.membershipId,
      subjectType: 'household',
      subjectId: hh,
      metadata: { bereiche: bereichRows.length, aufgaben: aufgabenRows.length },
    })

    return {
      format: TRANSFER_FORMAT,
      version: TRANSFER_VERSION,
      exportedAt: now.toISOString(),
      household: { name: haushalt?.name ?? 'Haushalt', timezone: haushalt?.timezone ?? 'Europe/Berlin' },
      personen: personenRows.map(saubere),
      mitglieder: mitgliedRows,
      bereiche: bereichRows.map(saubere),
      angaben: angabenRows.map(saubere),
      werte: werteRows.map(saubere),
      wissen: wissenRows.map(saubere),
      fragen: fragenRows.map(saubere),
      entscheidungen: entscheidungRows.map(saubere),
      regeln: regelRows.map(saubere),
      vorgaenge: vorgangRows.map(saubere),
      aufgaben: aufgabenRows.map(saubere),
      abhaengigkeiten: abhaengigRows.map(saubere),
      zustaendigkeiten: zustaendigRows.map(saubere),
    }
  }

  /**
   * Zurückbringen – immer als Ergänzung, nie als Ersatz.
   *
   * Ein Import legt neue Objekte an und lässt Bestehendes unberührt. Das ist die einzige
   * Variante, die nichts zerstören kann: Wer sich vertut, hat danach zu viel und kann es
   * löschen – nicht zu wenig und muss es neu erfinden.
   *
   * Alle IDs werden neu vergeben. Beziehungen bleiben, weil die alte ID auf die neue
   * abgebildet wird; zeigt ein Verweis auf etwas, das nicht mitkam, wird er zu `null`
   * statt die Zeile scheitern zu lassen.
   */
  async importHousehold(
    tx: Tx,
    ctx: EffectiveContext,
    doc: unknown,
    now: Date,
  ): Promise<ImportSummary> {
    authorize(ctx, 'household:manage', { type: 'household', id: ctx.householdId, householdId: ctx.householdId })

    const d = doc as Partial<TransferDocument>
    if (!d || (d.format !== TRANSFER_FORMAT && d.format !== TRANSFER_FORMAT_ALT)) {
      throw badRequest('validation_failed', 'Das ist keine Thealotta-Sicherungsdatei.')
    }
    if (d.version !== TRANSFER_VERSION) {
      throw badRequest(
        'validation_failed',
        `Diese Datei ist in Fassung ${d.version ?? '?'} geschrieben, gelesen wird Fassung ${TRANSFER_VERSION}.`,
      )
    }

    const hh = ctx.householdId
    const karte = new Map<string, string>()
    const neu = (alt: unknown): string => {
      const a = String(alt)
      const vorhanden = karte.get(a)
      if (vorhanden) return vorhanden
      const n = uuidv7()
      karte.set(a, n)
      return n
    }
    /** Ein Verweis auf etwas, das nicht mitkam, wird zu `null` – nicht zu einem Fehler. */
    const bezug = (alt: unknown): string | null => (alt == null ? null : (karte.get(String(alt)) ?? null))
    const angelegt: Record<string, number> = {}
    const uebersprungen: string[] = []
    const zaehle = (k: string, n: number) => { if (n) angelegt[k] = (angelegt[k] ?? 0) + n }

    const liste = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])

    /*
     * Personen zuerst, dann Bereiche: Ein Bereich kann auf eine Person zeigen.
     * Mitgliedschaften werden NICHT angelegt – ein Zugang entsteht durch eine Einladung,
     * nicht durch eine Datei. Verweise auf Mitglieder fallen deshalb auf `null`.
     */
    for (const p of liste(d.personen)) {
      await tx.insert(persons).values(ohneLeere({
        id: neu(p['id']),
        householdId: hh,
        displayName: String(p['displayName'] ?? 'Person'),
        personKind: String(p['personKind'] ?? 'other'),
        birthDate: (p['birthDate'] as string) ?? null,
        sensitivityDefault: String(p['sensitivityDefault'] ?? 'normal'),
        note: (p['note'] as string) ?? null,
      }) as never)
    }
    zaehle('Personen', liste(d.personen).length)

    /*
     * Bereiche in Baumreihenfolge: Ein Kind darf erst nach seinem Elternteil entstehen,
     * sonst zeigt sein `parentId` ins Leere. Der `path` wird neu gebaut – die alten Pfade
     * gehören zu einem anderen Haushalt.
     */
    const bereiche = [...liste(d.bereiche)].sort(
      (a, b) => String(a['path'] ?? '').split('.').length - String(b['path'] ?? '').split('.').length,
    )
    const pfade = new Map<string, string>()
    /*
     * Der Slug wird nicht aus der Datei übernommen, sondern neu gebildet.
     *
     * Ein Pfad ist ein `ltree`, und `ltree` erlaubt nur [a-z0-9_]. Ein „me-time" aus einer
     * von Hand geschriebenen Datei brachte den ganzen Import mit einem 500er zu Fall –
     * einem Fehler, den niemand lesen kann und der nichts darüber sagt, welche Zeile schuld
     * war. Und selbst ein gültiger Slug kann im Zielhaushalt schon vergeben sein: Der Import
     * ergänzt, er ersetzt nicht.
     */
    const belegt = new Map<string, Set<string>>()
    /*
     * Was im Zielhaushalt schon steht, zählt mit.
     *
     * Ohne das scheiterte der zweite Import derselben Datei am eindeutigen Pfad – und ein
     * zweiter Import ist nichts Ungewöhnliches: Man probiert eine Datei aus, löscht das
     * Ergebnis nicht vollständig und liest sie erneut ein.
     */
    const vorhandene = await tx
      .select({ parentId: domains.parentId, slug: domains.slug })
      .from(domains)
      .where(eq(domains.householdId, hh))
    for (const v of vorhandene) {
      const k = v.parentId ?? ''
      belegt.set(k, (belegt.get(k) ?? new Set<string>()).add(v.slug))
    }

    for (const b of bereiche) {
      const id = neu(b['id'])
      const elternId = bezug(b['parentId'])
      const geschwister = (belegt.get(elternId ?? '') ?? new Set<string>())
      const slug = uniqueSlug(slugify(String(b['slug'] ?? b['name'] ?? 'bereich')), geschwister)
      geschwister.add(slug)
      belegt.set(elternId ?? '', geschwister)
      const elternPfad = elternId ? pfade.get(elternId) : null
      const pfad = elternPfad ? `${elternPfad}.${slug}` : slug
      pfade.set(id, pfad)
      await tx.insert(domains).values(ohneLeere({
        id,
        householdId: hh,
        parentId: elternId,
        path: pfad,
        name: String(b['name'] ?? 'Bereich'),
        slug,
        description: (b['description'] as string) ?? null,
        subjectPersonId: bezug(b['subjectPersonId']),
        ownershipInheritance: String(b['ownershipInheritance'] ?? 'inherit'),
        criticality: String(b['criticality'] ?? 'normal'),
        sensitivity: String(b['sensitivity'] ?? 'normal'),
        position: Number(b['position'] ?? 0),
        archivedAt: b['archivedAt'] ? new Date(String(b['archivedAt'])) : null,
      }) as never)
    }
    zaehle('Bereiche', bereiche.length)

    const angabenIds = new Set<string>()
    for (const a of liste(d.angaben)) {
      const domainId = bezug(a['domainId'])
      if (!domainId) { uebersprungen.push(`Angabe „${a['label']}" – Bereich fehlt`); continue }
      await tx.insert(stateDefinitions).values(ohneLeere({
        id: neu(a['id']), householdId: hh, domainId,
        key: String(a['key'] ?? 'wert'), label: String(a['label'] ?? 'Angabe'),
        description: (a['description'] as string) ?? null,
        dataType: String(a['dataType'] ?? 'text'),
        options: a['options'] ?? null, unit: (a['unit'] as string) ?? null,
        freshnessInterval: (a['freshnessInterval'] as string) ?? null,
        conflictWindow: (a['conflictWindow'] as string) ?? null,
        isCritical: Boolean(a['isCritical']), sensitivity: String(a['sensitivity'] ?? 'normal'),
        archivedAt: a['archivedAt'] ? new Date(String(a['archivedAt'])) : null,
      }) as never)
      angabenIds.add(String(a['id']))
      zaehle('Angaben', 1)
    }

    /*
     * Zu jeder Angabe gehört ein Wert – notfalls „unbekannt" (INV-010).
     *
     * Ohne diesen Schritt legte der Import Angaben ohne Wertzeile an, und die Bereichsseite
     * lief in ein 404: „Dieser Bereich konnte nicht geladen werden." Betroffen war genau,
     * wer Angaben hatte – fünf von einundzwanzig Bereichen, also gerade so viele, dass es
     * nach Zufall aussah.
     *
     * `unknown` ist kein leerer Wert, sondern eine Aussage: Wir wissen es nicht. Genau
     * deshalb legt auch das Anlegen einer Angabe in der Oberfläche diese Zeile an.
     */
    const mitWert = new Set<string>()
    for (const w of liste(d.werte)) {
      const ziel = bezug(w['stateDefinitionId'])
      if (ziel) mitWert.add(ziel)
    }

    for (const w of liste(d.werte)) {
      const defId = bezug(w['stateDefinitionId'])
      if (!defId) continue
      await tx.insert(stateValues).values(ohneLeere({
        id: neu(w['id']), householdId: hh, stateDefinitionId: defId,
        valueKind: String(w['valueKind'] ?? 'unknown'), value: w['value'] ?? null,
        verifiedAt: w['verifiedAt'] ? new Date(String(w['verifiedAt'])) : null,
        staleAt: w['staleAt'] ? new Date(String(w['staleAt'])) : null,
        origin: String(w['origin'] ?? 'human'), confidence: (w['confidence'] as string) ?? null,
        conflictState: String(w['conflictState'] ?? 'none'),
      }) as never)
      zaehle('Werte', 1)
    }

    for (const [alteId, neueId] of karte) {
      // Nur Angaben betrachten – die Karte enthält alle übertragenen Kennungen.
      if (!angabenIds.has(alteId)) continue
      if (mitWert.has(neueId)) continue
      await tx.insert(stateValues).values(
        ohneLeere({
          id: uuidv7(),
          householdId: hh,
          stateDefinitionId: neueId,
          valueKind: 'unknown',
          origin: 'human',
          conflictState: 'none',
        }) as never,
      )
      zaehle('Werte', 1)
    }

    for (const k of liste(d.wissen)) {
      await tx.insert(knowledgeItems).values(ohneLeere({
        id: neu(k['id']), householdId: hh, domainId: bezug(k['domainId']),
        personId: bezug(k['personId']), processId: null,
        scope: String(k['scope'] ?? 'domain'), kind: String(k['kind'] ?? 'fact'),
        title: String(k['title'] ?? 'Notiz'), body: String(k['body'] ?? ''),
        sensitivity: String(k['sensitivity'] ?? 'normal'), origin: String(k['origin'] ?? 'human'),
        confirmedAt: k['confirmedAt'] ? new Date(String(k['confirmedAt'])) : null,
      }) as never)
      zaehle('Notizen', 1)
    }

    for (const f of liste(d.fragen)) {
      await tx.insert(questions).values(ohneLeere({
        id: neu(f['id']), householdId: hh, domainId: bezug(f['domainId']),
        body: String(f['body'] ?? ''), state: String(f['state'] ?? 'open'),
        answerBody: (f['answerBody'] as string) ?? null,
        answeredAt: f['answeredAt'] ? new Date(String(f['answeredAt'])) : null,
      }) as never)
      zaehle('Fragen', 1)
    }

    for (const e of liste(d.entscheidungen)) {
      await tx.insert(decisions).values(ohneLeere({
        id: neu(e['id']), householdId: hh, domainId: bezug(e['domainId']),
        title: String(e['title'] ?? 'Entscheidung'), body: String(e['body'] ?? ''),
        decisionKind: String(e['decisionKind'] ?? 'family_decision'),
        bindingLevel: String(e['bindingLevel'] ?? 'orientation'),
        decidedAt: e['decidedAt'] ? new Date(String(e['decidedAt'])) : null,
      }) as never)
      zaehle('Entscheidungen', 1)
    }

    for (const r of liste(d.regeln)) {
      const domainId = bezug(r['domainId'])
      if (!domainId) { uebersprungen.push(`Regel „${r['name']}" – Bereich fehlt`); continue }
      await tx.insert(monitors).values(ohneLeere({
        id: neu(r['id']), householdId: hh, domainId,
        stateDefinitionId: bezug(r['stateDefinitionId']),
        name: String(r['name'] ?? 'Regel'), ruleKind: String(r['ruleKind'] ?? 'state_freshness'),
        config: r['config'] ?? {}, defaultResponse: String(r['defaultResponse'] ?? 'attention_item'),
        enabled: r['enabled'] !== false, origin: String(r['origin'] ?? 'human'),
      }) as never)
      zaehle('Regeln', 1)
    }

    for (const v of liste(d.vorgaenge)) {
      await tx.insert(processes).values(ohneLeere({
        id: neu(v['id']), householdId: hh, domainId: bezug(v['domainId']),
        playbookId: null, attentionItemId: null,
        title: String(v['title'] ?? 'Vorgang'), goal: (v['goal'] as string) ?? null,
        state: String(v['state'] ?? 'active'), outcome: (v['outcome'] as string) ?? null,
        ownerMembershipId: null,
        dueAt: v['dueAt'] ? new Date(String(v['dueAt'])) : null,
        completedAt: v['completedAt'] ? new Date(String(v['completedAt'])) : null,
        origin: String(v['origin'] ?? 'human'),
      }) as never)
      zaehle('Vorgänge', 1)
    }

    for (const t of liste(d.aufgaben)) {
      await tx.insert(tasks).values(ohneLeere({
        id: neu(t['id']), householdId: hh, domainId: bezug(t['domainId']),
        processId: bezug(t['processId']),
        title: String(t['title'] ?? 'Aufgabe'), description: (t['description'] as string) ?? null,
        state: String(t['state'] ?? 'ready'), position: Number(t['position'] ?? 0),
        // Zuweisungen kommen nicht mit: Ein Mitglied dieser Datei ist niemand in diesem Haushalt.
        assigneeMembershipId: null,
        dueAt: t['dueAt'] ? new Date(String(t['dueAt'])) : null,
        deferUntil: t['deferUntil'] ? new Date(String(t['deferUntil'])) : null,
        estimatedMinutes: (t['estimatedMinutes'] as number) ?? null,
        mentalEnergy: String(t['mentalEnergy'] ?? 'medium'),
        origin: String(t['origin'] ?? 'human'),
        completedAt: t['completedAt'] ? new Date(String(t['completedAt'])) : null,
      }) as never)
      zaehle('Aufgaben', 1)
    }

    for (const a of liste(d.abhaengigkeiten)) {
      const taskId = bezug(a['taskId'])
      const dependsOnTaskId = bezug(a['dependsOnTaskId'])
      if (!taskId || !dependsOnTaskId) continue
      await tx.insert(taskDependencies).values(ohneLeere({
        id: uuidv7(), householdId: hh, taskId, dependsOnTaskId,
        dependencyKind: String(a['dependencyKind'] ?? 'finish_to_start'),
      }) as never)
      zaehle('Abhängigkeiten', 1)
    }

    /*
     * Zuständigkeiten kommen bewusst NICHT mit: Sie zeigen auf Mitglieder, und Mitglieder
     * dieser Datei sind in diesem Haushalt niemand. Wer die Bereiche übernimmt, entscheidet
     * der Haushalt – nicht die Datei.
     */
    if (liste(d.zustaendigkeiten).length > 0) {
      uebersprungen.push(
        `${liste(d.zustaendigkeiten).length} Zuständigkeiten – wer welchen Bereich trägt, entscheidet ihr, nicht die Datei`,
      )
    }

    await recordEvent(tx, hh, ctx.actor, {
      eventType: 'household.imported',
      subjectType: 'household',
      subjectId: hh,
      payload: { angelegt, exportedAt: d.exportedAt ?? null },
    })
    await recordAudit(tx, {
      action: 'household.imported',
      householdId: hh,
      userId: ctx.actor.userId,
      membershipId: ctx.membershipId,
      subjectType: 'household',
      subjectId: hh,
      metadata: { angelegt },
    })
    void now

    return { angelegt, uebersprungen }
  }

  /**
   * Alles leeren – die Inhalte, nicht den Haushalt.
   *
   * Gelöscht wird genau das, was ein Export mitnimmt: Bereiche, Angaben, Wissen, Regeln,
   * Vorgänge, Aufgaben, Zuständigkeiten und Personen ohne Zugang. Dazu, was daran hängt und
   * sonst ins Leere zeigen würde – Hinweise, Signale, Meldungen, der Eingang.
   *
   * **Nicht gelöscht:** der Haushalt selbst, die Mitglieder mit Zugang, deren Einstellungen
   * und Geräte, sowie der Ereignisverlauf. Wer den ganzen Haushalt loswerden will, nimmt die
   * Löschung mit Karenzzeit – dieser Weg hier ist zum Neuanfangen, nicht zum Verschwinden.
   *
   * Die Bestätigung wird **hier** geprüft, nicht nur in der Oberfläche: Ein Schutz, den nur
   * der Client kennt, ist keiner.
   */
  async clearHousehold(
    tx: Tx,
    ctx: EffectiveContext,
    bestaetigung: string,
    now: Date,
  ): Promise<{ geloescht: Record<string, number> }> {
    authorize(ctx, 'household:manage', { type: 'household', id: ctx.householdId, householdId: ctx.householdId })

    if (bestaetigung !== LEEREN_BESTAETIGUNG) {
      throw badRequest(
        'confirmation_required',
        `Zum Bestätigen bitte „${LEEREN_BESTAETIGUNG}" eingeben – genau so.`,
      )
    }

    const hh = ctx.householdId
    const geloescht: Record<string, number> = {}

    /*
     * Die Reihenfolge folgt den Fremdschlüsseln: Was auf etwas zeigt, geht zuerst.
     * Zwei Kanten sind streng (`RESTRICT`) und bestimmen deshalb die Reihenfolge –
     * Aufgaben vor Vorgängen, Werte vor Angaben. Der Rest räumt sich über `CASCADE` mit auf,
     * wird hier aber trotzdem genannt: Eine Liste, die man lesen kann, ist mehr wert als
     * eine, die man sich aus dem Schema erschließen muss.
     */
    const weg = async (wort: string, treffer: Promise<{ id: string }[]>) => {
      const n = (await treffer).length
      if (n > 0) geloescht[wort] = n
    }

    await weg('Abhängigkeiten', tx.delete(taskDependencies).where(eq(taskDependencies.householdId, hh)).returning({ id: taskDependencies.id }))
    await weg('Wartezustände', tx.delete(waitingStates).where(eq(waitingStates.householdId, hh)).returning({ id: waitingStates.id }))
    await weg('Aufgaben', tx.delete(tasks).where(eq(tasks.householdId, hh)).returning({ id: tasks.id }))
    await weg(
      'Belege',
      tx
        .delete(attentionItemSignals)
        .where(eq(attentionItemSignals.householdId, hh))
        // Reine Verbindungstabelle ohne eigenen Schlüssel – gezählt wird über einen Bezug.
        .returning({ id: attentionItemSignals.attentionItemId }),
    )
    /*
      Belege dürfen seit 0008 gelöscht, aber weiterhin nicht geändert werden: Umschreiben
      hieße, die Vergangenheit anders darzustellen; löschen heißt, sie zu beenden. Ohne das
      Recht bliebe jeder Bereich stehen, an dem je eine Regel gelaufen ist – beide Tabellen
      hängen mit `RESTRICT` an Bereichen und Angaben.
    */
    await weg('Signale', tx.delete(signals).where(eq(signals.householdId, hh)).returning({ id: signals.id }))
    await weg('Bedürfnisse', tx.delete(needs).where(eq(needs.householdId, hh)).returning({ id: needs.id }))
    await weg('Hinweise', tx.delete(attentionItems).where(eq(attentionItems.householdId, hh)).returning({ id: attentionItems.id }))
    await weg('Ausnahmen', tx.delete(monitorSuppressions).where(eq(monitorSuppressions.householdId, hh)).returning({ id: monitorSuppressions.id }))
    await weg('Regeln', tx.delete(monitors).where(eq(monitors.householdId, hh)).returning({ id: monitors.id }))
    await weg('Beobachtungen', tx.delete(stateObservations).where(eq(stateObservations.householdId, hh)).returning({ id: stateObservations.id }))
    await weg('Werte', tx.delete(stateValues).where(eq(stateValues.householdId, hh)).returning({ id: stateValues.id }))
    await weg('Angaben', tx.delete(stateDefinitions).where(eq(stateDefinitions.householdId, hh)).returning({ id: stateDefinitions.id }))
    await weg('Notizen', tx.delete(knowledgeItems).where(eq(knowledgeItems.householdId, hh)).returning({ id: knowledgeItems.id }))
    await weg('Fragen', tx.delete(questions).where(eq(questions.householdId, hh)).returning({ id: questions.id }))
    await weg('Entscheidungen', tx.delete(decisions).where(eq(decisions.householdId, hh)).returning({ id: decisions.id }))
    await weg('Ablaufschritte', tx.delete(playbookSteps).where(eq(playbookSteps.householdId, hh)).returning({ id: playbookSteps.id }))
    await weg('Abläufe', tx.delete(playbooks).where(eq(playbooks.householdId, hh)).returning({ id: playbooks.id }))
    await weg('Vorgänge', tx.delete(processes).where(eq(processes.householdId, hh)).returning({ id: processes.id }))
    await weg('Zuständigkeiten', tx.delete(responsibilityAssignments).where(eq(responsibilityAssignments.householdId, hh)).returning({ id: responsibilityAssignments.id }))
    await weg('Vertretungen', tx.delete(temporaryCoverages).where(eq(temporaryCoverages.householdId, hh)).returning({ id: temporaryCoverages.id }))
    await weg('Anhänge', tx.delete(attachments).where(eq(attachments.householdId, hh)).returning({ id: attachments.id }))
    await weg('Eingang', tx.delete(inboxItems).where(eq(inboxItems.householdId, hh)).returning({ id: inboxItems.id }))
    await weg('Meldungen', tx.delete(notifications).where(eq(notifications.householdId, hh)).returning({ id: notifications.id }))
    /*
     * Bereiche von unten nach oben: Ein Bereich verweist auf seinen Elternteil, und diese
     * Kante ist streng. Ein einzelnes `DELETE` über die ganze Tabelle scheitert deshalb an
     * der ersten Zeile, deren Kind noch steht.
     */
    const bereiche = await tx
      .select({ id: domains.id, path: domains.path })
      .from(domains)
      .where(eq(domains.householdId, hh))
    for (const b of [...bereiche].sort((a, b2) => b2.path.split('.').length - a.path.split('.').length)) {
      await tx.delete(domains).where(eq(domains.id, b.id))
    }
    if (bereiche.length > 0) geloescht['Bereiche'] = bereiche.length

    const personenRows = await tx.delete(persons).where(eq(persons.householdId, hh)).returning({ id: persons.id })
    if (personenRows.length > 0) geloescht['Personen'] = personenRows.length

    await recordEvent(tx, hh, ctx.actor, {
      eventType: 'household.cleared',
      subjectType: 'household',
      subjectId: hh,
      payload: { geloescht },
    })
    await recordAudit(tx, {
      action: 'household.cleared',
      householdId: hh,
      userId: ctx.actor.userId,
      membershipId: ctx.membershipId,
      subjectType: 'household',
      subjectId: hh,
      metadata: { geloescht },
    })
    void now

    return { geloescht }
  }

}
