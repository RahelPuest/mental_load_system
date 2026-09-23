import { and, eq, sql } from 'drizzle-orm'
import { bringConnections, recordAudit, recordEvent, tasks, uuidv7, type Tx } from '@thealotta/db'
import { decrypt, encrypt, type KeyProvider } from '@thealotta/crypto'
import { authorize, badRequest, notFound, type EffectiveContext } from '@thealotta/domain'
import { BringClient, BringError, type BringListe } from '../bring/client.js'

/**
 * Die Anbindung an Bring! – Einkäufe dorthin bringen, wo eingekauft wird.
 *
 * **Einbahnstraße.** Thealotta schickt Artikel nach Bring, liest aber nichts zurück. Ein
 * Rückweg hieße, zwei Wahrheiten über denselben Einkauf zu führen und sie abgleichen zu
 * müssen – das ist ein eigenes Vorhaben und für den Zweck hier nicht nötig: Die Verantwortung
 * bleibt in Thealotta sichtbar, der Einkauf landet in Bring.
 *
 * **Was gespeichert wird.** Der Refresh-Token, verschlüsselt. Das Passwort wird einmal
 * entgegengenommen, gegen Tokens getauscht und nie abgelegt – auch nicht im Ereignisverlauf.
 * Wer den Zugang widerrufen will, ändert sein Bring-Passwort; dann verfällt der Token, und
 * die Verbindung geht sichtbar auf `needs_reauth`.
 *
 * **Die Schnittstelle ist nicht offiziell** (siehe `../bring/client.ts`). Deshalb führt die
 * Verbindung ihren Zustand mit: Was nicht durchkommt, wird an der Verbindung sichtbar und
 * nicht dadurch, dass Einkäufe stumm verschwinden.
 */
export class BringService {
  constructor(
    private readonly keys: KeyProvider,
    private readonly client: BringClient,
  ) {}

  /** Anmelden und die Verbindung anlegen. Gibt die Listen zur Auswahl zurück. */
  async connect(
    tx: Tx,
    ctx: EffectiveContext,
    input: { email: string; passwort: string },
  ): Promise<{ listen: BringListe[]; email: string }> {
    authorize(ctx, 'household:manage', { type: 'household', id: ctx.householdId, householdId: ctx.householdId })
    if (!input.email.includes('@') || input.passwort.length === 0) {
      throw badRequest('validation_failed', 'Bitte E-Mail und Passwort des Bring-Kontos angeben.')
    }

    const tokens = await this.uebersetze(() => this.client.anmelden(input.email, input.passwort))
    const listen = await this.uebersetze(() => this.client.listen(tokens.benutzerUuid, tokens.zugang))

    const id = uuidv7()
    const ciphertext = encrypt(this.keys, tokens.erneuerung, `bring_connection:${ctx.householdId}`)

    /*
     * Eine Verbindung je Haushalt: Erneutes Verbinden ersetzt die alte, statt eine zweite
     * anzulegen. Zwei wären zwei Wahrheiten darüber, wohin ein Einkauf geht.
     */
    await tx.delete(bringConnections).where(eq(bringConnections.householdId, ctx.householdId))
    await tx.insert(bringConnections).values({
      id,
      householdId: ctx.householdId,
      membershipId: ctx.membershipId,
      bringEmail: input.email,
      bringUserUuid: tokens.benutzerUuid,
      credentialsCiphertext: ciphertext.data,
      credentialsKeyId: ciphertext.keyId,
      state: 'connected',
    })

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'integration.bring_connected',
      subjectType: 'bring_connection',
      subjectId: id,
      // Ausdrücklich ohne Zugangsdaten – auch die E-Mail bleibt draußen.
      payload: { listen: listen.length },
    })
    await recordAudit(tx, {
      action: 'integration.bring_connected',
      householdId: ctx.householdId,
      userId: ctx.actor.userId,
      membershipId: ctx.membershipId,
      subjectType: 'bring_connection',
      subjectId: id,
    })

    return { listen, email: input.email }
  }

  /** Die Zielliste festlegen. Ohne sie ist die Verbindung angelegt, aber nicht benutzbar. */
  async chooseList(tx: Tx, ctx: EffectiveContext, listUuid: string, listName: string): Promise<void> {
    authorize(ctx, 'household:manage', { type: 'household', id: ctx.householdId, householdId: ctx.householdId })
    const [row] = await tx
      .update(bringConnections)
      .set({ listUuid, listName, state: 'connected', lastErrorCode: null, version: sql`version + 1` })
      .where(eq(bringConnections.householdId, ctx.householdId))
      .returning({ id: bringConnections.id })
    if (!row) throw notFound('Die Bring-Verbindung')
  }

  async status(tx: Tx, ctx: EffectiveContext) {
    const [row] = await tx
      .select({
        email: bringConnections.bringEmail,
        listUuid: bringConnections.listUuid,
        listName: bringConnections.listName,
        state: bringConnections.state,
        lastPushAt: bringConnections.lastPushAt,
        lastErrorCode: bringConnections.lastErrorCode,
      })
      .from(bringConnections)
      .where(eq(bringConnections.householdId, ctx.householdId))
      .limit(1)
    return row ?? null
  }

  async disconnect(tx: Tx, ctx: EffectiveContext): Promise<void> {
    authorize(ctx, 'household:manage', { type: 'household', id: ctx.householdId, householdId: ctx.householdId })
    await tx.delete(bringConnections).where(eq(bringConnections.householdId, ctx.householdId))
    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'integration.bring_disconnected',
      subjectType: 'bring_connection',
      subjectId: ctx.householdId,
      payload: {},
    })
  }

  /**
   * Eine Aufgabe auf die Einkaufsliste setzen.
   *
   * Die Aufgabe bleibt, wo sie ist: Thealotta gibt die Verantwortung nicht ab, nur den Einkauf
   * weiter. Wer „Brot kaufen" nach Bring schickt, hat es dort auf der Liste **und** hier
   * weiterhin als offene Aufgabe – erledigt wird sie in Thealotta.
   */
  async pushTask(tx: Tx, ctx: EffectiveContext, taskId: string, now: Date): Promise<{ artikel: string }> {
    const [aufgabe] = await tx
      .select({ id: tasks.id, title: tasks.title, domainId: tasks.domainId })
      .from(tasks)
      .where(and(eq(tasks.householdId, ctx.householdId), eq(tasks.id, taskId)))
      .limit(1)
    if (!aufgabe) throw notFound('Die Aufgabe')

    await this.sende(tx, ctx, { name: aufgabe.title, zusatz: 'aus Thealotta' }, now)

    await recordEvent(tx, ctx.householdId, ctx.actor, {
      eventType: 'integration.bring_item_pushed',
      subjectType: 'task',
      subjectId: aufgabe.id,
      payload: { domainId: aufgabe.domainId },
    })

    return { artikel: aufgabe.title }
  }

  /**
   * Einen einzelnen Artikel senden – ohne Aufgabe dahinter.
   *
   * Den Weg gibt es, seit die Essensplanung eine Einkaufsliste erzeugt (docs/63 §37). Deren
   * Zeilen sind keine Aufgaben: „500 g Hackfleisch" ist ein Posten auf einem Zettel, und
   * daraus in Thealotta eine Aufgabe anzulegen, um sie sofort weiterzureichen, wäre ein Objekt für
   * den Weg statt für die Sache.
   */
  async pushItem(
    tx: Tx,
    ctx: EffectiveContext,
    artikel: { name: string; zusatz?: string | null },
    now: Date,
  ): Promise<void> {
    await this.sende(tx, ctx, { name: artikel.name, zusatz: artikel.zusatz ?? 'aus Thealotta' }, now)
  }

  /** Der gemeinsame Weg nach draußen: senden, Zustand fortschreiben, Fehler übersetzen. */
  private async sende(
    tx: Tx,
    ctx: EffectiveContext,
    artikel: { name: string; zusatz: string },
    now: Date,
  ): Promise<void> {
    const { zugang, listUuid } = await this.zugangHolen(tx, ctx)
    try {
      await this.client.hinzufuegen(listUuid, zugang, artikel)
    } catch (err) {
      await this.merkeFehlschlag(tx, ctx, err)
      throw this.uebersetzeFehler(err)
    }

    await tx
      .update(bringConnections)
      .set({ lastPushAt: now, lastErrorCode: null, consecutiveFailures: 0, version: sql`version + 1` })
      .where(eq(bringConnections.householdId, ctx.householdId))
  }

  /**
   * Einen gültigen Zugang beschaffen.
   *
   * Zugangs-Tokens leben kurz; gespeichert ist nur der Refresh-Token. Deshalb wird bei jedem
   * Senden erneuert – das ist ein Aufruf mehr und dafür kein Zustand, der ablaufen kann.
   */
  private async zugangHolen(tx: Tx, ctx: EffectiveContext): Promise<{ zugang: string; listUuid: string }> {
    const [row] = await tx
      .select()
      .from(bringConnections)
      .where(eq(bringConnections.householdId, ctx.householdId))
      .limit(1)
    if (!row) throw badRequest('not_connected', 'Es ist keine Bring-Liste verbunden.')
    if (!row.listUuid) {
      throw badRequest('no_list', 'Für diesen Haushalt ist noch keine Bring-Liste ausgewählt.')
    }
    if (!row.credentialsCiphertext || !row.credentialsKeyId) {
      throw badRequest('not_connected', 'Die Bring-Verbindung ist unvollständig. Bitte neu verbinden.')
    }

    const erneuerung = decrypt(
      this.keys,
      { keyId: row.credentialsKeyId, data: row.credentialsCiphertext },
      `bring_connection:${ctx.householdId}`,
    ).toString('utf8')

    let tokens
    try {
      tokens = await this.client.erneuern(erneuerung)
    } catch (err) {
      await this.merkeFehlschlag(tx, ctx, err)
      throw this.uebersetzeFehler(err)
    }

    // Schickt Bring einen neuen Refresh-Token, wird er übernommen – sonst bleibt der alte.
    if (tokens.erneuerung !== erneuerung) {
      const ciphertext = encrypt(this.keys, tokens.erneuerung, `bring_connection:${ctx.householdId}`)
      await tx
        .update(bringConnections)
        .set({
          credentialsCiphertext: ciphertext.data,
          credentialsKeyId: ciphertext.keyId,
          version: sql`version + 1`,
        })
        .where(eq(bringConnections.householdId, ctx.householdId))
    }

    return { zugang: tokens.zugang, listUuid: row.listUuid }
  }

  /** Fehlschläge stehen an der Verbindung – sonst merkt sie niemand, bis jemand nachsieht. */
  private async merkeFehlschlag(tx: Tx, ctx: EffectiveContext, err: unknown): Promise<void> {
    const grund = err instanceof BringError ? err.grund : 'unerwartete_antwort'
    await tx
      .update(bringConnections)
      .set({
        state: grund === 'token_abgelaufen' || grund === 'anmeldung_abgelehnt' ? 'needs_reauth' : 'error',
        lastErrorCode: grund,
        consecutiveFailures: sql`consecutive_failures + 1`,
        version: sql`version + 1`,
      })
      .where(eq(bringConnections.householdId, ctx.householdId))
  }

  private async uebersetze<T>(tun: () => Promise<T>): Promise<T> {
    try {
      return await tun()
    } catch (err) {
      throw this.uebersetzeFehler(err)
    }
  }

  /**
   * Aus einem Bring-Fehler einen Satz machen, der weiterhilft.
   *
   * Wichtig ist der Unterschied zwischen „nochmal versuchen hilft" und „hier hilft kein
   * Versuchen": Ein abgelaufener Zugang will neu verbunden werden, eine geänderte
   * Schnittstelle will gemeldet werden.
   */
  private uebersetzeFehler(err: unknown): Error {
    if (!(err instanceof BringError)) return err instanceof Error ? err : new Error(String(err))
    const texte: Record<string, string> = {
      anmeldung_abgelehnt: 'E-Mail oder Passwort stimmen nicht.',
      token_abgelaufen: 'Der Zugang zu Bring gilt nicht mehr. Bitte neu verbinden.',
      liste_unbekannt: 'Diese Bring-Liste gibt es nicht mehr. Bitte eine andere auswählen.',
      nicht_erreichbar: 'Bring war gerade nicht erreichbar. Nichts ist verloren – später noch einmal.',
      unerwartete_antwort:
        'Bring hat anders geantwortet als erwartet. Die Schnittstelle ist nicht offiziell und kann sich ändern.',
    }
    return badRequest(`bring_${err.grund}`, texte[err.grund] ?? err.klartext)
  }
}
