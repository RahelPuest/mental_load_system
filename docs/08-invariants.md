# 08 – System-Invarianten und ihre Durchsetzung

Jede Invariante hat mindestens einen **technischen** Durchsetzungspunkt und einen **automatisierten Test**.
Dokumentation allein zählt nicht als Durchsetzung.

| ID | Invariante | Durchsetzung | Test |
|---|---|---|---|
| **INV-001** | Kein offener relevanter Vorgang verschwindet allein durch Zeitablauf. | Keine State-Machine-Transition mit Auslöser „Datum überschritten“ nach `done/dropped`. Overdue-Job schreibt nur `task.overdue_reassessed`. FKs unter `DOMAIN` sind `ON DELETE RESTRICT`. | `invariants/inv-001.spec.ts`: Task mit `due_at` in der Vergangenheit über 90 simulierte Tage → bleibt `ready`, taucht in Now View auf. |
| **INV-002** | Delegation ändert nie Ownership. | `taskService.assign()` berührt ausschließlich `TASK.assignee_membership_id/delegation_kind`; Repository für `RESPONSIBILITY_ASSIGNMENT` ist im Work-Context nicht injiziert (Architekturgrenze). | `inv-002.spec.ts` + Dependency-Cruiser-Regel gegen Import. |
| **INV-003** | Temporäre Vertretung ändert nicht den permanenten Owner. | `TEMPORARY_COVERAGE` ist eine separate Tabelle; `coverageService` hat keine Schreibrechte auf Assignments. Effektiver Owner wird zur **Lesezeit** überlagert. `ownership:transfer` ist für Coverage-Inhaber blockiert. | `inv-003.spec.ts`: Coverage anlegen/ablaufen lassen → Assignment-Zeile byte-identisch. |
| **INV-004** | Automatisch erzeugte Info ist von bestätigter unterscheidbar. | `origin`, `origin_ref`, `confirmed_by`, `confirmed_at` auf allen erzeugbaren Objekten; `NOT NULL` auf `origin`. API-Serializer geben `origin` immer aus. UI markiert nicht nur farblich. | Schema-Test: jede Tabelle mit `origin` hat `NOT NULL` + Default-Check; Snapshot-Test der Serializer. |
| **INV-005** | Kein Zugriff auf fremde Household-Daten. | (1) `decide()`-Tenant-Gate, (2) `withTenant()` + `SET LOCAL app.household_ids`, (3) Postgres RLS auf **jeder** Tabelle mit `household_id`, (4) Antwort `404` statt `403`. | `tenant-isolation.spec.ts` iteriert über alle registrierten Routen; zusätzlich SQL-Test, der RLS mit direkter DB-Session prüft. |
| **INV-006** | Fehlgeschlagene Notification ändert nicht das Quellobjekt. | Delivery-Worker nutzt DB-Rolle `thealotta_notifier` mit `SELECT`-Only auf fachlichen Tabellen und `INSERT/UPDATE` nur auf `notification*`. | `inv-006.spec.ts`: Delivery-Fehler injizieren → Task-Zeile inkl. `version` unverändert; DB-Grant-Test. |
| **INV-007** | Kapazität ändert Sichtbarkeit/Priorisierung, nicht Relevanz/Ownership. | `CapacityState` fließt ausschließlich in `rankAttention()` und den Notification-Filter ein. Kein Schreibpfad von Capacity zu Assignment/Task-State. | `inv-007.spec.ts`: Capacity `paused` setzen → Menge der relevanten Items identisch, nur Reihenfolge/Gruppierung ändert sich. |
| **INV-008** | Automatische Priorisierung ist erklärbar. | `rankAttention()` liefert `ScoreFactor[]` mit `code`, `label`, `contribution`, `explanation`. API gibt `why` immer mit aus. `why_now` ist `NOT NULL`. | Property-Test: für 1000 zufällige Eingaben ist `why.length > 0` und Σ Faktoren = Score. |
| **INV-009** | Ownership und Execution sind unabhängig. | Getrennte Tabellen, getrennte Capabilities (`ownership:*` vs. `task:*`), getrennte Services. | `inv-009.spec.ts`: Person B erledigt alle Tasks einer Domain → Owner bleibt Person A (Akzeptanzszenario §44). |
| **INV-010** | `unknown` ≠ false/null/irrelevant. | `STATE_VALUE.value_kind ∈ {known, unknown, not_applicable}` NOT NULL; `CHECK (value_kind <> 'known' OR value IS NOT NULL)`. API unterscheidet `null` (Feld fehlt) von `{"kind":"unknown"}`. Monitor `state_unknown` behandelt Unknown als aktiven Zustand. | `inv-010.spec.ts` + Contract-Test der Serialisierung. |
| **INV-011** | Automatisches Wissen überschreibt bestätigtes nicht still. | `stateService.write()` prüft: `incoming.origin != 'human' && current.confirmed_at != null && werteUnterschiedlich` → kein Update, stattdessen `StateObservation(conflict_state='unresolved')` + `AttentionItem`. | `inv-011.spec.ts`: Integration schreibt gegen bestätigten Wert → Wert unverändert, Konflikt sichtbar. |
| **INV-012** | Integrationsausfälle löschen/schließen nichts. | Sync-Worker darf `TASK`, `PROCESS`, `ATTENTION_ITEM`, `DOMAIN` nicht schreiben (DB-Rolle `thealotta_sync`). Gelöschter Kalendertermin setzt `CALENDAR_EVENT.state='cancelled'` und erzeugt ein `AttentionItem`, statt abgeleitete Arbeit zu entfernen. | `inv-012.spec.ts`: Connection auf Fehler zwingen, Termine löschen → Prozesse/Tasks unverändert. |
| **INV-013** | Ownership-Änderungen sind historisch nachvollziehbar. | `RESPONSIBILITY_ASSIGNMENT` wird nie hart gelöscht, nur `effective_to` gesetzt. Jede Änderung schreibt `ownership.*`-Event in derselben Transaktion (DB-Trigger als Backstop). | `inv-013.spec.ts`: Kette aus 5 Ownership-Änderungen → vollständige Rekonstruktion zu beliebigem Zeitpunkt. |
| **INV-014** | Pause hinterlässt keine ownerlosen kritischen Verantwortungen. | Übergang nach `minimal`/`paused` triggert `criticalCoverageCheck` → `AttentionItem coverage_gap` je betroffener Domain mit `criticality='critical'`, adressiert an Admins. Coverage-Ende ohne Bestätigung bleibt in `pending_return`. | `inv-014.spec.ts`: Owner pausiert → für jede kritische Domain existiert ein offenes `coverage_gap`. |
| **INV-015** | Keine scheinpräzise Fairness-Behauptung. | Balance-API liefert **keine** Prozentzahlen, sondern Verteilungsbänder (`deutlich mehr / mehr / ausgeglichen`), immer mit `dataQuality`-Feld (`estimated_fields`, `coverage`) und dem Hinweistext. Kein Feld `percentage` im Schema. | Contract-Test: Response-Schema verbietet `percentage`/`score`; Snapshot der Formulierungen. |

## Zusätzliche produktinvariante Regeln

| ID | Regel | Grund |
|---|---|---|
| **INV-P01** | Jedes sichtbare Element der Now View liefert `why`, `context`, `owner`, `nextStep`. | §22 |
| **INV-P02** | Kein Schema-Feld für Streaks, Scores, Completion-Rates oder Rankings zwischen Personen. | §42 |
| **INV-P03** | Kein Freitext in Push-Nachrichten an andere Personen. | §42 (kein Kontrollwerkzeug) |
| **INV-P04** | Jeder `Process` beantwortet jederzeit „was ist der nächste Schritt“ – notfalls mit dem Schritt „nächsten Schritt festlegen“. | §12 |
| **INV-P05** | Keine Systemmeldung enthält wertende Sprache über Personen (Lint-Regel gegen eine Wortliste in i18n-Dateien). | §1.10 |
