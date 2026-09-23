# 09 – Konflikt- und Konsistenzmodell

## 1. Klassifikation von Feldern

| Klasse | Strategie | Beispiele |
|---|---|---|
| **K1 – unkritisch** | Last-write-wins, kein Konflikt | `position`, `Domain.name`, UI-Präferenzen |
| **K2 – strukturell** | Optimistic Locking über `version` | `Task`, `Process`, `AttentionItem`, `Domain` |
| **K3 – semantisch** | Append-only + kuratierte Projektion + expliziter Konfliktzustand | `StateValue` |
| **K4 – extern gespiegelt** | Source Priority + Divergenzmarkierung | `CalendarEvent` |
| **K5 – Verantwortung** | Serialisierung über Aggregat-Lock, nie automatisch | `ResponsibilityAssignment`, `TemporaryCoverage` |

## 2. K2 – Optimistic Locking

Jeder Mutations-Request auf ein K2-Objekt sendet `If-Match: "<version>"`.

```
UPDATE task SET ..., version = version + 1
WHERE id = $1 AND household_id = $2 AND version = $3
```
0 betroffene Zeilen → `409 version_conflict` mit dem aktuellen Objekt im Body, damit der Client
einen Diff anzeigen kann. Fehlt `If-Match`, antwortet die API `428 Precondition Required` –
ausgenommen sind reine Zustandsübergänge über dedizierte Endpunkte
(`POST /tasks/:id/complete`), die idempotent sind: „schon erledigt“ liefert `200`, nicht `409`.

## 3. K3 – State: das Kernproblem aus §10

**Modell**: `STATE_OBSERVATION` ist die Wahrheit (append-only), `STATE_VALUE` ist die aktuelle,
kuratierte Projektion mit `version`.

Beim Schreiben einer neuen Beobachtung entscheidet `resolveStateWrite()`:

```
                       ┌────────────────────────────────────────────┐
neue Beobachtung  ───► │ 1. Gleicher Wert wie aktuell?              │──ja──► verified_at auffrischen,
                       │                                            │        keine Konfliktprüfung
                       │ 2. Aktueller Wert unbestätigt              │──ja──► übernehmen
                       │    (confirmed_at IS NULL)?                 │
                       │ 3. Neuer Wert von Mensch,                  │──ja──► übernehmen, alten Wert
                       │    alter von System?                       │        als superseded markieren
                       │ 4. Neuer Wert von System,                  │──ja──► NICHT übernehmen (INV-011),
                       │    alter menschlich bestätigt?             │        conflict_state='unresolved'
                       │ 5. Beide menschlich, verschiedene Personen,│──ja──► siehe unten
                       │    innerhalb Konfliktfenster?              │
                       │ 6. sonst                                   │──────► übernehmen (Mensch korrigiert Mensch)
                       └────────────────────────────────────────────┘
```

### Fall 5 – der „Schuhgröße 29 vs. 30“-Fall

Zwei Menschen, unterschiedliche Werte, beide bestätigt, innerhalb des **Konfliktfensters**
(`state_definition.conflict_window`, Default 24 h, bei `is_critical` 7 Tage):

- Es wird **nicht** stumm überschrieben.
- `STATE_VALUE` behält den älteren Wert und bekommt `conflict_state='unresolved'`.
- Beide Beobachtungen bleiben sichtbar mit Person und Zeitpunkt.
- Ein `AttentionItem` `state_conflict` entsteht, adressiert an den Domain-Owner:
  *„Zwei Angaben zur Schuhgröße von Kind A: 29 (du, 12.08.) und 30 (Partner:in, heute). Welche stimmt?“*
- Auflösung ist eine bewusste Handlung: `POST /state-values/:id/resolve-conflict {chosenObservationId, note}`.
- Bis zur Auflösung liefert die API den Wert **mit** `conflict: {...}`; die UI zeigt beide Werte,
  nicht nur einen. Ein veralteter falscher Wert ist schlimmer als ein sichtbarer Widerspruch.

Außerhalb des Konfliktfensters gilt: der neuere menschliche Wert gewinnt (jemand hat später
nachgesehen) – der alte bleibt als Observation erhalten.

### Nicht-Konflikt: `unknown`
`unknown → known` ist nie ein Konflikt. `known → unknown` schon (jemand behauptet, wir wüssten es
doch nicht) und läuft durch dieselbe Matrix.

## 4. K4 – Kalender: Quelle vs. Mensch

Source-Priorität pro Feld:

| Feld | Priorität |
|---|---|
| Zeit, Ort, Titel, Teilnehmer | **Externer Kalender** gewinnt (er ist die Quelle der Wahrheit) |
| `state = cancelled` durch Nutzer im System | **Mensch gewinnt**, externe Wiederkehr des Termins erzeugt `calendar_divergence`-AttentionItem |
| `linked_domain_id`, Prep-Checklisten, Notizen | **Mensch gewinnt immer** (Systemvorschläge sind A1) |

Ein extern gelöschter Termin setzt `state='cancelled'`, löscht aber **nichts** an abgeleiteter
Arbeit (INV-012). Stattdessen: *„Der Termin ‚Kinderarzt Kind A‘ wurde im Kalender gelöscht.
Der Vorgang ‚Fragen für den Arzttermin sammeln‘ ist noch offen. Weiter, verschieben oder verwerfen?“*

## 5. K5 – Verantwortung

Ownership-Änderungen laufen unter `SELECT ... FROM domain WHERE id = $1 FOR UPDATE`
(Aggregat-Lock) in einer serialisierbaren Transaktion. Der Partial-Unique-Index auf
`primary_owner` ist der letzte Schutz gegen Races: zwei gleichzeitige „Ich übernehme“-Klicks
führen dazu, dass einer `409 already_claimed` bekommt – mit dem Namen der Person, die zuerst war.

## 6. Idempotenz eingehender Requests

Alle mutierenden `POST` akzeptieren `Idempotency-Key`. Ablauf:

1. `INSERT INTO idempotency_key (key, household_id, request_hash, ...) ON CONFLICT DO NOTHING`
2. Konflikt + gleicher `request_hash` + Antwort vorhanden → gespeicherte Antwort zurückgeben (`200`, Header `Idempotent-Replay: true`)
3. Konflikt + gleicher Hash + noch keine Antwort → `409 request_in_flight`
4. Konflikt + **anderer** Hash → `422 idempotency_key_reused`

TTL 24 h. Quick Capture nutzt clientseitig generierte UUIDs als Key – zwei Taps auf „Speichern“
in der U-Bahn erzeugen einen Eintrag.

## 7. Out-of-order und doppelte externe Events

- **Kalender**: `sequence` + `etag`. Ein Event mit kleinerer `sequence` als gespeichert wird verworfen und geloggt.
- **Webhooks**: Signatur + `(provider, external_event_id)` UNIQUE in `PROCESSED_EVENT`, TTL 30 Tage.
- **Interne Outbox-Konsumenten**: `(consumer_name, event_id)` UNIQUE.
- **Push-Provider-Callbacks**: nur Zustandshebungen erlaubt (`queued<sent<delivered<acknowledged`),
  Rückschritte werden ignoriert – schützt gegen verspätete Callbacks.

## 8. Transaktionsgrenzen

| Operation | Grenze |
|---|---|
| Beliebige Aggregat-Mutation + `DomainEvent` + `OutboxEvent` | **eine** Transaktion, `READ COMMITTED` |
| Ownership-Änderung | `REPEATABLE READ` + `FOR UPDATE` auf Domain |
| Signal-Erzeugung im Batch | eine Transaktion je Household (nicht je Signal), Fehler isoliert einen Household |
| Kalender-Sync | eine Transaktion je Seite (Page) des Delta-Feeds, `sync_token` erst am Seitenende committen |
| Export/Löschung | mehrere Transaktionen, fortschrittsprotokolliert, wiederaufnehmbar |

## 9. Was das System bei Unsicherheit tut

Grundregel, abgeleitet aus §47: **Sichtbarer Widerspruch schlägt stille Auflösung.**
Wenn `resolveStateWrite()` unsicher ist, wird kein Wert geraten, sondern ein `AttentionItem` erzeugt.
Der Preis ist gelegentliche Nachfrage; der vermiedene Schaden ist eine falsche Information,
auf die sich jemand verlässt.
