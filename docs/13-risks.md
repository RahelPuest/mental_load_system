# 13 – Technische und produktbezogene Risiken

Bewertung: **W** Wahrscheinlichkeit, **A** Auswirkung (je 1–5).

## Produktrisiken

| # | Risiko | W | A | Gegenmaßnahme |
|---|---|:-:|:-:|---|
| P1 | **Das Produkt degeneriert zur Todo-Liste.** Der Attention-Layer wird umgangen, Nutzer legen nur noch Tasks an. | 4 | 5 | Harte Grenzen (Q-14): max. 3 „Jetzt“-Einträge, `why_now` Pflicht, Aggregation von Signalen je Domain. Metrik `attention_to_task_ratio` als Produkt-Health-Signal. |
| P2 | **Monitoring erzeugt Rauschen**, Nutzer schalten alles ab. | 4 | 5 | Aggregation, `mark_irrelevant` mit echter Suppression, konservative Defaults (nur `is_critical`-States bekommen automatisch Monitore), Snooze ohne Schuldgefühl. |
| P3 | **Einrichtungsaufwand ist zu hoch** – Domains, States, Monitore anlegen ist selbst Mental Load. | 5 | 5 | Vorlagen-Bootstrap beim Household-Anlegen (Domainbaum + typische States + Kontext-Tags). Quick Capture funktioniert ohne jede Einrichtung. Progressive Vertiefung: das System funktioniert mit 3 Domains. |
| P4 | **Das System wird zum Kontrollwerkzeug** zwischen Partner:innen. | 3 | 5 | §34/§42 technisch durchgesetzt: keine Freitext-Pushes an andere, keine Aktivitätsprofile, keine Scores, Balance nur als Band + opt-in. |
| P5 | Nutzer vertraut dem System und **das System vergisst etwas**. | 2 | 5 | INV-001 mit Test; „Nichts geht verloren“ als Architekturprinzip: kein automatischer Terminalzustand, Outbox statt Fire-and-Forget, Restore-Tests. |
| P6 | Der Attention-Layer ist konzeptuell **zu abstrakt** für Nutzer. | 3 | 4 | Sprache im UI vermeidet die Modellbegriffe („Braucht Aufmerksamkeit“ statt „Signal“). Onboarding zeigt genau den §44-Ablauf an einem echten Beispiel. |

## Technische Risiken

| # | Risiko | W | A | Gegenmaßnahme |
|---|---|:-:|:-:|---|
| T1 | **Cross-Tenant-Leak** durch vergessenen `household_id`-Filter. | 3 | 5 | Drei Schichten: `decide()`-Gate, `withTenant()`, **Postgres RLS**. Generischer Test über alle Routen. Lint-Regel: kein direkter `db.select` außerhalb des Repository-Layers. |
| T2 | **Berechtigungslogik driftet** zwischen API, Export und UI. | 4 | 5 | Genau eine `decide()`-Implementierung, von API, Export und Notification-Filter genutzt. Property-Tests über die Matrix. |
| T3 | **Kalender-Sync-Duplikate/Verlust** bei Recurrence + DST + Reconnect. | 4 | 4 | Idempotenter Upsert-Schlüssel inkl. `recurrence_id`, `sequence`-Gate, Full-Sync-Reconciliation, Zeitzonen-Testsuite mit realen ICS-Fixtures (DST-Übergänge, `EXDATE`, verschobene Instanzen). |
| T4 | **Notification-Sturm** nach Ausfall (aufgestaute Jobs feuern gleichzeitig). | 3 | 4 | Zeitfenster-Gate: Notifications älter als `max_staleness` (Default 6 h) werden zu einer Zusammenfassung gebündelt statt einzeln zugestellt. Rate-Limit je Empfänger. |
| T5 | **Doppelte Job-Ausführung** nach Worker-Crash. | 4 | 3 | Alle Handler idempotent über Fachschlüssel, nicht über Job-ID. `PROCESSED_EVENT`-Tabelle. Tests führen jeden Handler zweimal aus und vergleichen Zustände. |
| T6 | **Schema-Wachstum** – 40+ Tabellen im MVP, Migrationen werden riskant. | 4 | 3 | Expand/Contract-Pflicht ([28](28-migration-strategy.md)), keine destruktiven Migrationen in einem Release, Migrationstest gegen produktionsnahen Datenbestand in CI. |
| T7 | **Priorisierung wird intransparent**, sobald Faktoren wachsen. | 3 | 4 | Score = Summe benannter Faktoren, jeder mit Erklärungstext; Property-Test Σ Faktoren = Score; kein ML im MVP. |
| T8 | **Verschlüsselte Felder verhindern Suche/Migration.** | 3 | 3 | Anwendungsverschlüsselung nur für Klasse E und Tokens. Bewusst kein E2E-Encryption-Design im MVP (würde serverseitiges Monitoring unmöglich machen) – dokumentierte Einschränkung. |
| T9 | **RLS-Fehlkonfiguration** blockiert legitime Worker-Zugriffe oder öffnet zu viel. | 3 | 5 | Separate DB-Rollen je Worker-Typ mit minimalen Grants; SQL-Tests, die jede Rolle gegen jede Tabelle prüfen (erwartete Allow/Deny-Matrix als Fixture). |
| T10 | **Redis-Verlust** → Jobs weg. | 3 | 4 | Quelle der Wahrheit ist die DB (`outbox_event`, `next_evaluation_at`). Redis ist nur Transport; nach Totalverlust rekonstruiert der Scanner die Arbeit. |
| T11 | **Zeitzonen-/DST-Fehler** in Erinnerungen. | 4 | 3 | Nur `timestamptz` speichern, `luxon` für lokale Berechnung, Testmatrix über 3 Zeitzonen × DST-Grenzen. |
| T12 | **Push-Zustellung unzuverlässig** (iOS-Einschränkungen, abgelaufene Subscriptions). | 4 | 3 | Mehrkanalstrategie mit Fallback (Push → E-Mail für `critical`), Subscription-Health-Metrik, ehrliche Kommunikation im UI. |
| T13 | **Migration von `ltree`/`EXCLUDE`-Constraints** bindet an Postgres-Extensions. | 2 | 2 | `ltree` und `btree_gist` sind in allen gängigen Managed-Postgres verfügbar; Fallback (rekursive CTE) dokumentiert. |
| T14 | **Export-/Löschjobs** laufen auf großen Haushalten in Timeouts. | 2 | 3 | Phasenweise, wiederaufnehmbar, Fortschritt in der DB. |

## Bewusst akzeptierte Risiken

| Risiko | Begründung |
|---|---|
| Keine Ende-zu-Ende-Verschlüsselung | Serverseitiges Monitoring und Antizipation sind der Produktkern; E2EE würde sie unmöglich machen. Stattdessen: Feldverschlüsselung für Klasse E, strikte Autorisierung, minimales Logging. Dokumentiert. |
| Kein ML/LLM in der Priorisierung im MVP | Erklärbarkeit (INV-008) hat Vorrang. Regelbasiert, dann evaluieren. |
| Web Push statt nativer App | Reichweite reicht für MVP; iOS-Einschränkung dokumentiert. |
| Single-Region-Deployment | RPO/RTO-Ziele ([29](29-backup-recovery.md)) sind ohne Multi-Region erreichbar. |
