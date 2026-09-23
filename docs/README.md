# Dokumentationsindex

Das System heißt **Thealotta** (Arbeitstitel) – *Mental Load Infrastructure for Responsible Attention*.

## Phase 1 – Produkt- und Domänenmodell
| # | Dokument | Inhalt |
|---|---|---|
| 01 | [Domain Model](01-domain-model.md) | Bounded Contexts, Aggregate, Ubiquitous Language |
| 02 | [ER-Modell](02-er-model.md) | Entitäten, Relationen, Schlüssel |
| 03 | [Lebenszyklen & State Machines](03-lifecycles.md) | Zustände und erlaubte Übergänge |
| 04 | [Permission Model](04-permission-model.md) | Rollen, Grants, Permission-Matrix, Sensitivity |
| 05 | [Privacy Model](05-privacy-model.md) | Datenklassen, Sichtbarkeit, Export, Löschung |
| 06 | [Event Catalog](06-event-catalog.md) | Domain Events, Payloads, Konsumenten |
| 07 | [Trigger- & Automation Model](07-automation-model.md) | Autonomiegrade, Monitoring, Trigger |
| 08 | [System-Invarianten](08-invariants.md) | INV-001..INV-015 + Durchsetzungspunkte |
| 09 | [Konflikt- & Konsistenzmodell](09-conflict-model.md) | Concurrency, Merge, Source Priority |
| 10 | [Background Jobs](10-background-jobs.md) | Job-Katalog, Idempotenz, Retry |
| 11 | [Audit & History](11-audit-history.md) | Trennung History / Audit |
| 12 | [Offene & widersprüchliche Anforderungen](12-open-questions.md) | Interpretationen, Entscheidungen |
| 13 | [Technische Risiken](13-risks.md) | Risiken + Gegenmaßnahmen |
| 14 | [MVP-Abgrenzung](14-mvp-scope.md) | In/Out of Scope |

## Phase 2 – Technische Architektur
| # | Dokument | Inhalt |
|---|---|---|
| 20 | [Systemarchitektur](20-architecture.md) | Komponenten, Datenflüsse, Laufzeitmodell |
| 21 | [API-Contract](21-api-contract.md) | REST-Ressourcen, Fehler, Idempotenz |
| 22 | [Calendar Sync Model](22-calendar-sync.md) | Zwei-Wege-Sync, Recurrence, Zeitzonen |
| 23 | [Notification Model](23-notification-model.md) | Kanäle, Bündelung, Delivery-Lifecycle |
| 24 | [Reliability Strategy](24-reliability.md) | Idempotenz, Outbox, Retry, Degradation |
| 25 | [Threat Model](25-threat-model.md) | STRIDE, Tenant Isolation, Secrets |
| 26 | [Test Plan](26-test-plan.md) | Teststufen, Akzeptanzszenario §44 |
| 27 | [Deployment](27-deployment.md) | Umgebungen, CI/CD, Betrieb |
| 28 | [Migration Strategy](28-migration-strategy.md) | Schema-Evolution, Expand/Contract |
| 29 | [Backup & Recovery](29-backup-recovery.md) | RPO/RTO, Restore-Tests |
| 30 | [Observability](30-observability.md) | Logs, Metrics, Traces, Alerts |

## Phase 4 – Produkt- und Interfacegestaltung
| # | Dokument | Inhalt |
|---|---|---|
| 40 | [UX- und UI-Audit](40-ux-audit.md) | Bestandsaufnahme, Heuristiken, priorisierte Befundliste |
| 41 | [Informationsarchitektur](41-information-architecture.md) | Navigationsmodell, Responsive-Strategie, Suche |
| 42 | [Designsystem](42-design-system.md) | Prinzipien, Tokens, Komponenten, Zustandsmuster, UX-Writing, Barrierefreiheit |
| 43 | [Zweiter Durchgang](43-ux-audit-2.md) | Gegenprobe zu §64: welche Funktionen die Oberfläche nicht erreichte, und wie sie nachgezogen wurden |
| 44 | [Dritter Durchgang](44-ux-audit-3.md) | §59/§60/§67 als Test: was die Oberflächentests an falschen Behauptungen gefunden haben |
| 45 | [Navigationsmodell](45-navigation-model.md) | Informationsarchitektur, die neuen Übersichtsseiten, Layoutregeln und der Erreichbarkeitstest |
| 46 | [Prüfung im Browser](46-browser-verification.md) | Playwright und axe: Layout, Breakpoints, Trefferflächen – und was das gefunden hat |
| 47 | [Farbschemata](47-color-schemes.md) | Dracula, Catppuccin, Nord, Solarized – und warum die offiziellen Werte angepasst werden mussten |
| 48 | [Kognitive Last](48-cognitive-load.md) | Wahrgenommene Komplexität messen und senken, ohne eine einzige Funktion zu verlieren |
| 49 | [Farbcodierung](49-color-coding.md) | Zwölf geprüfte Töne, wählbar pro Betrachter – und warum die Wahl niemandem etwas wegnimmt |
| 50 | [Bereiche verwalten](50-domain-lifecycle.md) | Ändern, archivieren, löschen – warum die Erklärung des Servers vorher nie ankam, und wie aus „geerbt" ein Knopf wurde |
| 51 | [Regelmäßige Aufgaben](51-recurring-tasks.md) | Rhythmen, Folgeaufgaben, nachträglich ändern – und drei Bausteine, die im Modell lagen und nie verdrahtet waren |
| 52 | [Vollständiger Audit](52-audit.md) | Befunde über die ganze Anwendung, priorisiert, mit Akzeptanzkriterien |
| 53 | [Zweiter Audit](53-audit-2.md) | Logikprüfung: Machbarkeit, Auszeit, Verantwortung – was die Anwendung zeigt und ob es stimmt |
| 54 | [Informationsarchitektur der Bereichsseite](54-bereichsseite-ia.md) | Master-Detail geprüft und verworfen – warum Deckeln die bessere Antwort ist |
| 55 | [Bereichsseite, zweiter Review](55-bereichsseite-review-2.md) | Die gebaute Zwei-Spalten-Ansicht auf dem Prüfstand – Zähler, Zusammenfassung, Musterregel |
| 56 | [Visuelle Geometrie](56-visuelle-geometrie.md) | Abstände, Größen, Kanten und Rundungen über 31 Seiten gemessen – und das System dahinter |
| 57 | [Visuelle Geometrie, zweiter Durchgang](57-visuelle-geometrie-2.md) | In die Bauteile hinein: Mikroabstände, Overlays, Punkte – zwei neue Tokens statt vier Zufallswerte |
| 58 | [Daten mitnehmen](58-import-export.md) | Export und Import als eine JSON-Datei – und was ausdrücklich nicht mitgeht |
| 59 | [Anbindung an Bring!](59-bring.md) | Einkäufe an die Einkaufsliste – gegen eine Schnittstelle ohne Zusage, mit Passwort das nicht gespeichert wird |
| 60 | [Evidenz-Audit](60-evidenz-audit.md) | Das Produkt gegen die Forschung gespiegelt – was gut belegt ist, was eine Wette ist, was fehlt |
| 61 | [Der Kopf gehört dem Bereich](61-bereichskopf.md) | Die Übersicht entfällt, ihr Kopf steht über jedem Abschnitt – und die Brotkrumen sehen endlich aus wie Links |
| 62 | [Eine Aufgabe wieder loswerden](62-aufgabe-loswerden.md) | Abhaken und Entfernen dort, wo die Aufgabe steht – und die Grenze zwischen löschen und verwerfen |
| 63 | [Essensplanung](63-essensplanung.md) | Gerichte sammeln, Woche füllen, Einkaufsliste erzeugen – ein Objekt, gewichtete Vorschläge, Gründe in Worten |
| 64 | [Umbenennung](64-umbenennung.md) | Mira wird Thealotta – was umgezogen wurde, was bewusst stehen blieb und warum |
| 65 | [Visuelle Geometrie, dritter Durchgang](65-visuelle-geometrie-3.md) | Fünf Bedienhöhen wurden zwei, ein Titel fand seine Achse – gemessen an der gerenderten Anwendung |
| 66 | [Visuelle Neuausrichtung](66-visuelle-neuausrichtung.md) | Fünf Art Directions an denselben Bauteilen durchgespielt – und warum die Empfehlung ein Hybrid ist |
| 67 | [Familienhandbuch](67-familienhandbuch.md) | Richtung C umgesetzt: Papier und Tinte, zwei Schriften mit strenger Arbeitsteilung, Dunkelmodus inklusive |
| 68 | [Evidenzaudit II](68-evidenz-audit-2.md) | Was nach docs/60 dazukam, gegen Forschung gespiegelt – Essensplanung ohne Evidenzgrundlage, neun geprüfte Quellen |
| 69 | [Papier & Stempel](69-papier-und-stempel.md) | Richtung A ersetzt C: Tintenrand, versetzter Schatten, Schraffur – eine Schrift in zwei Ausprägungen |
| 70 | [Markdown in Textfeldern](70-markdown-in-textfeldern.md) | Fließtext mit Auszeichnungen – als React-Knoten geparst, ohne HTML und ohne Abhängigkeit |
| 71 | [Zeitbomben in Tests](71-zeitbomben-in-tests.md) | Zwei Tests hängten an der Wanduhr statt an der festen Uhr des Harness – und wovon die Browsersuite still abhängt |
| 72 | [Inhalte umhängen](72-umhaengen.md) | Einen Bereich aufteilen, ohne neu zu tippen – Mehrfachauswahl, untrennbare Paare, und warum Signale stehen bleiben |
| 73 | [Der Wert gehört ins Anlegen](73-wert-beim-anlegen.md) | Angaben bekommen ihren Wert sofort – und warum „weiß ich nicht" nicht dasselbe ist wie nichts |
| 74 | [Textfelder vergrößern](74-textfeld-vergroessern.md) | „Größer" neben „Vorschau" – warum der Zug am unteren Rand am Finger nicht reicht |
| 75 | [Umbenennen, wo man den Bereich sieht](75-umbenennen-im-baum.md) | „Lässt sich nicht umbenennen" – die Funktion gab es, nur nicht dort, wo man sie sucht |
| 76 | [Unterbereich per Ziehen](76-unterbereich-ziehen.md) | Auf eine Zeile ziehen heißt jetzt „wird sein Unterbereich" – drei Bänder statt eines Mittelpunkts |
| 77 | [Angabe ändern](77-angabe-aendern.md) | Name, Art, Frist – bisher gab es dafür nicht einmal eine Route |
| 78 | [Selbstbetrieb auf einem Raspberry Pi 5](78-selbstbetrieb-rpi5.md) | Ein Gerät, eine öffentliche Adresse, kein offener Port – Cloudflare Tunnel, Sicherung auf die Synology, Update mit automatischem Rückweg |
| 79 | [Umbenennung zu Ende gebracht](79-umbenennung-zu-ende.md) | Rollen, SQL-Funktionen, Datenbank und Projektname – und der Kollisionsfall, den erst die zweite Datenbank im Cluster zeigt |
| 80 | [Planung für Tag, Woche und Monat](80-planung-tag-woche-monat.md) | Sechs Reihenfolgen aus Ablaufplanung und Klinik – mit ehrlicher Angabe, wie gut jede belegt ist |
| 81 | [Bestehende Einträge ändern](81-eintraege-aendern.md) | Anlegen ging überall, Berichtigen nirgends – fünf fehlende Routen und ein Knopf, der seinen Eintrag nennt |
| 82 | [UX-Audit, vierter Durchgang](82-ux-audit-4.md) | Getönte Karten ohne eigene Textfarbe, zwei Primäraktionen, ein Bauteil für zwei Aufgaben – und ein Name, der zuletzt kam |
| 84 | [Rollentrennung und Restore-Skripte](84-rollentrennung-und-restore.md) | WORKER_QUEUES wirkt endlich – und zwei Zusagen, die das Produkt bisher nicht einlöst |

## Architecture Decision Records
Siehe [adr/](adr/) – ADR-0001 ff.

## Betriebshandbücher
`ops/runbooks/`: [Restore](../ops/runbooks/restore.md) ·
[Kalenderverbindung gestört](../ops/runbooks/calendar-connection-broken.md) ·
[Fehlgeschlagene Jobs](../ops/runbooks/dlq-drain.md) ·
[Schlüsselrotation](../ops/runbooks/rotate-encryption-key.md) ·
[Haushalt löschen](../ops/runbooks/household-deletion.md)

## Wo die Dokumentation im Code verankert ist
| Dokument | Durchsetzung im Code |
|---|---|
| [08 – Invarianten](08-invariants.md) | je ein Test in `packages/domain/test/invariants/` bzw. `apps/api/test/invariants/`; `invariant-coverage.spec.ts` prüft die Vollständigkeit |
| [04 – Berechtigungen](04-permission-model.md) | `packages/domain/src/authz/decide.ts` – eine reine Funktion, von API, Export und Notification-Filter gemeinsam genutzt |
| [ADR-0003 – Tenant-Isolation](adr/ADR-0003-tenant-isolation.md) | `packages/db/migrations/0003_rls_and_grants.sql`, `packages/db/test/rls-coverage.spec.ts`, `apps/api/test/tenant-isolation.spec.ts` |
| [ADR-0008 – Autonomiestufen](adr/ADR-0008-autonomy-levels.md) | `packages/domain/src/autonomy.ts`, `packages/domain/test/autonomy.spec.ts` |
| [20 §5 – Rollentrennung](20-architecture.md) | `packages/db/test/role-grants.spec.ts` |
| [02 – ER-Modell](02-er-model.md) | `packages/db/test/schema-parity.spec.ts` vergleicht Drizzle gegen die laufende Datenbank |
