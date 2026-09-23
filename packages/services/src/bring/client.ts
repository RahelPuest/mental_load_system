/**
 * Der einzige Ort, an dem Thealotta etwas über Bring! weiß.
 *
 * **Diese Schnittstelle ist nicht offiziell.** Bring bietet keine öffentliche API für
 * Einkaufslisten an; die hier benutzten Adressen und Feldnamen stammen aus den
 * Gemeinschaftsimplementierungen (`miaucl/bring-api`, `foxriver76/node-bring-api`) und sind
 * gegen keine Herstellerdokumentation belegt. Sie können sich ohne Ankündigung ändern.
 *
 * Daraus folgt der Zuschnitt dieser Datei:
 *
 *   – Alles, was Bring betrifft, steht **hier**. Ändert sich etwas, ist das die eine Stelle.
 *   – `fetch` wird hereingereicht statt importiert: So lässt sich die Logik prüfen, ohne
 *     Bring anzurufen – und niemand ruft im Test versehentlich einen fremden Dienst.
 *   – Jeder Fehlschlag wird zu einem `BringError` mit einem Grund, den man einem Menschen
 *     zeigen kann. Eine Schnittstelle ohne Zusage muss laut scheitern, nicht still.
 */

const BASIS = 'https://api.getbring.com/rest'

/**
 * Der Schlüssel, den die Web-App von Bring mitschickt. Er ist kein Geheimnis – er steht in
 * jedem der genannten Projekte und im Netzwerkverkehr der Web-App.
 */
const KOPFZEILEN = {
  'X-BRING-API-KEY': 'cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp',
  'X-BRING-CLIENT': 'webApp',
  'X-BRING-CLIENT-SOURCE': 'webApp',
  'X-BRING-COUNTRY': 'DE',
}

export type BringGrund =
  | 'anmeldung_abgelehnt'
  | 'token_abgelaufen'
  | 'liste_unbekannt'
  | 'nicht_erreichbar'
  | 'unerwartete_antwort'

export class BringError extends Error {
  constructor(
    readonly grund: BringGrund,
    readonly klartext: string,
    readonly status?: number,
  ) {
    super(klartext)
    this.name = 'BringError'
  }
}

export interface BringTokens {
  zugang: string
  erneuerung: string
  benutzerUuid: string
  /** Sekunden, nicht Zeitpunkt: Der Aufrufer entscheidet, gegen welche Uhr er rechnet. */
  gueltigFuer: number
}

export interface BringListe {
  uuid: string
  name: string
}

/** Nur das, was gebraucht wird – kein `Response`-Nachbau im Test. */
export type FetchLike = (url: string, init?: {
  method?: string
  headers?: Record<string, string>
  body?: string
}) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>

export class BringClient {
  constructor(private readonly hole: FetchLike) {}

  private async ruf(
    pfad: string,
    init: { method?: string; headers?: Record<string, string>; body?: string },
    token?: string,
  ): Promise<unknown> {
    const headers: Record<string, string> = { ...KOPFZEILEN, ...(init.headers ?? {}) }
    if (token) headers['Authorization'] = `Bearer ${token}`

    let antwort: Awaited<ReturnType<FetchLike>>
    try {
      antwort = await this.hole(`${BASIS}/${pfad}`, { ...init, headers })
    } catch (err) {
      throw new BringError('nicht_erreichbar', `Bring war nicht erreichbar: ${String(err)}`)
    }

    if (antwort.status === 401 || antwort.status === 403) {
      throw new BringError('token_abgelaufen', 'Bring hat den Zugang abgelehnt.', antwort.status)
    }
    if (antwort.status === 404) {
      throw new BringError('liste_unbekannt', 'Bring kennt diese Liste nicht.', antwort.status)
    }
    if (!antwort.ok) {
      throw new BringError('unerwartete_antwort', `Bring antwortete mit ${antwort.status}.`, antwort.status)
    }

    const roh = await antwort.text()
    if (!roh) return {}
    try {
      return JSON.parse(roh) as unknown
    } catch {
      throw new BringError('unerwartete_antwort', 'Bring hat etwas geantwortet, das kein JSON ist.')
    }
  }

  /**
   * Anmelden – einmal, mit E-Mail und Passwort.
   *
   * Das Passwort verlässt diese Methode nicht: Zurück kommen nur Tokens. Alles Weitere läuft
   * über den Refresh-Token, und der lässt sich durch ein neues Bring-Passwort entwerten.
   */
  async anmelden(email: string, passwort: string): Promise<BringTokens> {
    const antwort = (await this.ruf('v2/bringauth', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email, password: passwort }).toString(),
    }).catch((err: unknown) => {
      if (err instanceof BringError && err.grund === 'token_abgelaufen') {
        throw new BringError('anmeldung_abgelehnt', 'E-Mail oder Passwort stimmen nicht.', err.status)
      }
      throw err
    })) as Record<string, unknown>

    return this.leseTokens(antwort)
  }

  /** Zugang erneuern. Der Refresh-Token bleibt derselbe, wenn Bring keinen neuen schickt. */
  async erneuern(erneuerung: string): Promise<BringTokens> {
    const antwort = (await this.ruf('v2/bringauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refresh_token: erneuerung, grant_type: 'refresh_token' }).toString(),
    })) as Record<string, unknown>

    const tokens = this.leseTokens({ ...antwort, refresh_token: antwort['refresh_token'] ?? erneuerung })
    return tokens
  }

  async listen(benutzerUuid: string, zugang: string): Promise<BringListe[]> {
    const antwort = (await this.ruf(`bringusers/${benutzerUuid}/lists`, {}, zugang)) as {
      lists?: { listUuid?: string; name?: string }[]
    }
    const roh = Array.isArray(antwort.lists) ? antwort.lists : []
    return roh
      .filter((l): l is { listUuid: string; name: string } => typeof l.listUuid === 'string')
      .map((l) => ({ uuid: l.listUuid, name: l.name ?? 'Liste' }))
  }

  /**
   * Einen Artikel auf die Liste setzen.
   *
   * `specification` ist bei Bring der Zusatz hinter dem Namen („2 Stück", „vom Bäcker"). Thealotta
   * schickt dort die Herkunft mit, damit in Bring erkennbar bleibt, woher der Eintrag kommt.
   */
  async hinzufuegen(
    listUuid: string,
    zugang: string,
    artikel: { name: string; zusatz?: string },
  ): Promise<void> {
    await this.ruf(
      `bringlists/${listUuid}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          purchase: artikel.name,
          recipe: '',
          specification: artikel.zusatz ?? '',
          remove: '',
          sender: 'null',
        }).toString(),
      },
      zugang,
    )
  }

  private leseTokens(antwort: Record<string, unknown>): BringTokens {
    const zugang = antwort['access_token']
    const erneuerung = antwort['refresh_token']
    const benutzerUuid = antwort['uuid']
    if (typeof zugang !== 'string' || typeof erneuerung !== 'string' || typeof benutzerUuid !== 'string') {
      /*
       * Hier bricht es, wenn Bring die Antwort umbaut. Deshalb der ausdrückliche Text: Der
       * Unterschied zwischen „falsches Passwort" und „die Schnittstelle ist eine andere
       * geworden" ist für den Nutzer der zwischen „nochmal versuchen" und „hier hilft kein
       * Versuchen".
       */
      throw new BringError(
        'unerwartete_antwort',
        'Bring hat geantwortet, aber nicht wie erwartet. Möglicherweise hat sich die Schnittstelle geändert.',
      )
    }
    const gueltig = antwort['expires_in']
    return {
      zugang,
      erneuerung,
      benutzerUuid,
      gueltigFuer: typeof gueltig === 'number' ? gueltig : 3600,
    }
  }
}
