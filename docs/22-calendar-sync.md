# 22 – Calendar Sync Model

## 1. Provider-Abstraktion

```ts
interface CalendarProvider {
  readonly kind: 'ics' | 'caldav' | 'google'
  readonly capabilities: { read: boolean; write: boolean; delta: boolean; push: boolean }
  listCalendars(cred: Credentials): Promise<ExternalCalendar[]>
  fetchChanges(cred, calendarId, cursor?: string, window: DateRange): Promise<{
    events: ExternalEvent[]; deleted: ExternalRef[]; nextCursor?: string; fullResync?: boolean
  }>
  createEvent?(cred, calendarId, draft: EventDraft): Promise<ExternalRef>
  deleteEvent?(cred, ref: ExternalRef): Promise<void>
}
```

| Provider | MVP | Delta | Schreiben | Auth |
|---|---|---|---|---|
| `ics` (Read-only URL) | ✔ produktiv | nein (ETag/Last-Modified + Volldiff) | nein | keine / Basic |
| `caldav` | ✔ produktiv | ja (`sync-collection`, RFC 6578) | nein (MVP) | Basic / App-Passwort |
| `google` | Feature-Flag | ja (`syncToken`) | ja | OAuth 2.0 + Refresh Token |

Der ICS-Provider ist bewusst zuerst produktiv: er macht Kalenderintegration ohne externe
Vertragsbeziehung end-to-end testbar (Q-11) und deckt Apple iCloud, Nextcloud, Fastmail und
die meisten Schul-/Kita-Kalender ab.

## 2. Datenmodell-Schlüssel

```
Identität eines Vorkommens = (connection_id, external_calendar_id, external_id, recurrence_id)
```
- `external_id` = UID des Termins.
- `recurrence_id` = `RECURRENCE-ID` bei einer abweichenden Einzelinstanz, sonst `''`.
- Serien werden als **Master** (`recurrence_id=''`, `rrule` gespeichert) plus **Ausnahmen**
  (eigene Zeilen) abgelegt. Die Expansion in konkrete Vorkommen passiert bei der Abfrage
  (`rrule`-Expansion in der Zeitzone des Masters), nicht beim Schreiben – das vermeidet
  Millionen Zeilen für „täglich, unendlich“.
- `sequence` + `etag`: eingehende Änderung mit `sequence < gespeichert` wird verworfen (Out-of-Order-Schutz).

## 3. Sync-Ablauf (inkrementell)

```
1  Connection sperren (FOR UPDATE SKIP LOCKED) – kein paralleler Sync derselben Connection
2  Für jede Selection mit read_enabled:
3    changes = provider.fetchChanges(cred, calId, cursor, window=[-30d, +365d])
4    Für jede Seite:
5      Transaktion:
6        upsert je Event  (ON CONFLICT (connection_id, cal_id, external_id, recurrence_id))
7          → sequence-Gate, dann Feld-Merge nach Source-Priorität (siehe 09-conflict-model §4)
8          → domain_event 'calendar.event_upserted' + outbox
9        Deletions → state='cancelled' (NIEMALS DELETE)
10       cursor speichern
11     commit
12   consecutive_failures = 0, last_sync_at = now()
13 outbox → calendar.derive_context (Domain-Zuordnung, Prep-Vorschläge)
```

Der Cursor wird **nach** dem Commit der Seite gespeichert. Ein Crash mitten im Sync führt zu
Wiederholung derselben Seite – idempotent, kein Verlust.

## 4. Volle Reconciliation

Wöchentlich sowie nach `fullResync=true` (Provider-Token abgelaufen) oder nach Reconnect:
Alle Events im Fenster laden, lokal vorhandene aber extern fehlende Zeilen auf `cancelled` setzen.
Das repariert Lücken, die durch verpasste Deltas entstanden sind.

## 5. Zeitzonen und DST

- Speicherung: `starts_at`/`ends_at` als `timestamptz` (UTC) **plus** `time_zone` (IANA) **plus** `all_day`.
  Ohne `time_zone` ist eine spätere Serienexpansion nicht korrekt möglich.
- Ganztagestermine werden als lokale Datumsgrenzen der `time_zone` interpretiert, nicht als UTC-Mitternacht.
- Serienexpansion mit `rrule` + `luxon`, immer in der Master-Zeitzone.
- Testmatrix (`calendar/tz.spec.ts`): Europe/Berlin DST-Vor- und Rücksprung, nicht existierende
  lokale Zeit (02:30 am Umstellungstag), doppelte lokale Zeit, `all_day` über die Umstellung,
  Termin in fremder Zeitzone bei reisender Person, `EXDATE`, verschobene Einzelinstanz.

## 6. Robustheit gegen die Ereignisse aus §14.4

| Ereignis | Verhalten |
|---|---|
| Termin erstellt | Upsert, `calendar.event_upserted` |
| Termin geändert | Upsert mit `sequence`-Gate; abgeleitete Vorschläge werden neu bewertet, bestehende Prozesse bleiben |
| Termin verschoben | Wie geändert; ein verknüpfter Prozess bekommt ein `AttentionItem` „Termin wurde verschoben“ |
| Termin gelöscht | `state='cancelled'`; verknüpfte offene Arbeit bleibt bestehen (**INV-012**) + `AttentionItem` zur Entscheidung |
| Duplikat | Idempotenter Upsert-Schlüssel – kein Effekt |
| Verbindung unterbrochen | 3 Fehler → `degraded`, Backoff bis 6 h, `AttentionItem` nach 24 h ohne Sync |
| Erneute Verbindung | Full-Resync + Reconciliation |
| Zeitzonenwechsel des Nutzers | Household-TZ ändern erzeugt Neuberechnung lokaler Job-Zeitpunkte; gespeicherte Termine bleiben korrekt (UTC + TZ) |
| Sommer-/Winterzeit | siehe §5 |
| Wiederkehrende Termine | Master + Ausnahmen, Expansion bei Abfrage |

## 7. System → Kalender (§14.2)

Nur mit `write_enabled` **und** aktiver `AutomationRule` (Autonomiestufe A2).
Geschriebene Events tragen `X-THEALOTTA-PROCESS-ID` in `X-`-Properties bzw. `extendedProperties.private`,
damit sie beim Rücksync als eigene erkannt und nicht als externe Änderung interpretiert werden
(Schleifenschutz). Ein vom System erzeugter Block, den der Nutzer extern löscht, wird **nicht**
neu angelegt – stattdessen entsteht ein `AttentionItem`.

Fremde Kalender (Kalender anderer Mitglieder) werden nie geschrieben, auch nicht mit
technischem Zugriff – es fehlt die ausdrückliche Berechtigung (§6, A3).

## 8. Sichtbarkeit im Household

`CALENDAR_SELECTION.share_level`:

| Level | Andere sehen |
|---|---|
| `none` | nichts |
| `busy` | Zeitblöcke ohne Inhalt (Default) |
| `title` | Titel |
| `full` | Titel, Ort, Beschreibung |

Der Kontext-Resolver nutzt intern immer `busy` (Verfügbarkeit), auch bei `none` – ohne den Inhalt
preiszugeben. `CalendarEvent.title` ist ein feldgenau geschütztes Feld (Q-10).

## 9. Anmeldedaten

`credentials_ciphertext` = AES-256-GCM, Schlüssel aus dem Key-Provider (env im Dev, KMS in Prod),
`credentials_key_id` erlaubt Schlüsselrotation ohne Datenverlust. Klartext-Tokens existieren nur
im Speicher des Sync-Workers, nie in Logs, nie in API-Antworten.
