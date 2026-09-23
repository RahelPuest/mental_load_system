# 14 – MVP-Abgrenzung

## In Scope (Release 1)

| Bereich | Umfang |
|---|---|
| **Account & Household** | Registrierung, Login (Argon2id, Session-Rotation), Einladung, mehrere Households je User, Household-Bootstrap mit Vorlage |
| **Personen & Memberships** | Personen mit/ohne Login, `person_kind`, Rollen `admin/adult/caregiver/teen/child/guest` |
| **Rechte** | Vollständige `decide()`-Engine: Household-, Domain-, Object-Level, Sensitivity-Ceiling, Owner-Recht, Grant-Ablauf |
| **Domains** | Baum mit `ltree`, Kritikalität, Sensitivity, Subject-Person, explizite Vererbungsregel |
| **Ownership** | Alle fünf `assignment_kind`, bitemporal, `TemporaryCoverage` inkl. `pending_return`, Unowned-Erkennung |
| **State & Freshness** | Typisierte `StateDefinition`, `StateValue` mit `unknown`, append-only Observations, Konflikterkennung + Auflösung |
| **Monitoring** | Regeltypen `state_freshness`, `state_unknown`, `state_threshold`, `schedule`, `date_field_lead_time`, `lead_time_before_event`; Suppression |
| **Attention** | `Signal` (idempotent), `AttentionItem` mit vollem Lifecycle, Aggregation, `Need` (Basis) |
| **Work** | `Process`, `Task`, Dependencies, Next-Action-Projektion, `WaitingState`, Delegation |
| **Kontext** | `ContextTag`, `TaskContextRequirement` (required/helpful/preferred), Context-Resolver |
| **Now View** | Kategorien, erklärbare Priorisierung mit Faktoren, harte Item-Grenzen |
| **Capacity** | Selbstdeklaration, Low-Capacity-Modus, Pause, kritische Coverage-Prüfung |
| **Quick Capture & Inbox** | Sofort-Erfassung, Inbox-Verarbeitung in alle Zielobjekttypen, regelbasierte Klassifizierungsvorschläge |
| **Wissen** | `KnowledgeItem`, `Question` → Antwort → Wissen, `Decision` mit Verbindlichkeitsgrad |
| **Playbooks** | Vorlagen mit Schritten anlegen, instanziieren (verkettete Tasks), regelbasierter Vorschlag – inklusive Oberfläche |
| **Kalender** | ICS/CalDAV-Provider (lesend, produktiv), Google (Feature-Flag), Selektion je Kalender, Share-Level, robuster Sync inkl. Recurrence/DST, System→Kalender-Block hinter Automation-Regel |
| **Notifications** | In-App, E-Mail, Web Push (VAPID); Prioritäten, Bündelung, Quiet Hours, Delivery-Lifecycle |
| **History & Audit** | Beide Ströme, Objekt-Historie, Ownership-Rekonstruktion, Hash-Chain |
| **Export & Löschung** | Antragsfluss, Zustandsmaschine, Karenzzeit, Tombstones, Audit-Einträge und Runbook vollständig. **Offen:** die Artefakterzeugung selbst (`export.run`, `deletion.execute`) – siehe README, Bekannte Einschränkungen |
| **Betrieb** | RLS, Rollen-Trennung, Outbox, Idempotenz, Metrics, Traces, Health, Backups, Restore-Test, CI/CD |

## Out of Scope (Release 1) – Architektur bereitet vor

| Feature | Vorbereitung im MVP |
|---|---|
| Mental-Load-Balance-Ansicht | Dimensionen sind als Task-/Domain-Attribute bereits erfasst; nur die Auswertung fehlt |
| Knowledge-Transfer-Modus (§19) | `Question`, `KnowledgeItem`, `Playbook` existieren; der geführte Ablauf ist ein Playbook-Typ `knowledge_transfer` – Post-MVP-UI |
| Care Mode (§25.2) | `CapacityState` + `criticalCoverageCheck` liefern die Daten; die zusammenfassende Ansicht fehlt |
| Playbook-Verzweigungen & Bedingungen | `PLAYBOOK_STEP.branch_condition` im Schema, Auswertung linear im MVP |
| Kontextbedingungen an Playbook-Schritten | Im Schema vorgesehen, in der Oberfläche noch nicht editierbar |
| Field-Level Access breit | Mechanismus vorhanden, aktiv für 2 Felder |
| Native Apps | Delivery-Kanäle sind pluggable |
| Microsoft/Exchange-Kalender | Provider-Interface |
| Zwei-Wege-Kalenderschreiben über ICS | `write_enabled` im Schema, Implementierung nur für Google |
| MFA/Passkeys | Auth-Modul ist kapselnd geschrieben, `auth.mfa_*`-Events reserviert |
| Volltextsuche | Postgres `tsvector`-Spalten sind angelegt, aber nicht indiziert ausgeliefert |
| Mehrsprachigkeit | i18n-Struktur vorhanden, ausgeliefert: Deutsch |
| Attachments/Object Storage | Tabelle + Interface vorhanden, Provider `local-fs` im MVP |

## Explizite Nicht-Ziele (dauerhaft)

Gamification, Streaks, Produktivitätsscores, Ranking zwischen Familienmitgliedern,
Standortverfolgung, medizinische Bewertung, freie Push-Nachrichten an andere Personen (§42).

## Stand der Umsetzung

Erledigt und getestet: Account/Household, Personen, Rollen und Rechte (inkl. RLS und
Rollen-Grant-Matrix), Domains mit expliziter Vererbung, Ownership bitemporal, Temporary Coverage,
State mit Freshness und Konfliktauflösung, sechs Monitoring-Regeltypen, Signal/AttentionItem mit
Bündelung und Suppression, Process/Task/Next Action, Kontextbedingungen, Now View mit erklärbarer
Priorisierung, Quick Capture (offline-fähig), Inbox mit Klassifizierungsvorschlag, Wissen/Fragen/
Entscheidungen, Capacity inkl. Low-Capacity-Modus und kritischer Coverage-Prüfung, Kalender-Sync
(ICS) mit Idempotenz und Zeitzonenbehandlung, Benachrichtigungsmodell mit Kanaltrennung,
History und Audit mit Hash-Kette, Outbox, Hintergrundjobs, Observability, CI, Container.

Die Weboberfläche deckt den gesamten MVP-Umfang ab: Jetzt-Ansicht, Quick Capture, Eingang,
Bereichsbaum, Bereichsdetail mit sechs Reitern (Zustand, Aufmerksamkeit, Vorgänge, Wissen,
Beobachtung, Verantwortung), Vorgangsdetail, Playbooks, Wissen/Fragen/Entscheidungen, Kalender,
Familie mit Kapazität und Vertretungen sowie Einstellungen mit sechs Reitern (Haushalt,
Mitglieder, Benachrichtigungen, Geräte, Daten, Sicherheitsprotokoll).

Offen im MVP: Artefakterzeugung für Export und Löschung, Google-Kalender-Schreiben,
Playbook-Verzweigungen, Balance-Ansicht, Care Mode, Knowledge-Transfer-Modus, MFA, Volltextsuche.

## Definition of Done für Release 1

1. Akzeptanzszenario §44 läuft grün als automatisierter E2E-Test.
2. Alle 15 Invarianten haben je mindestens einen grünen Test.
3. Tenant-Isolationstest deckt jede registrierte Route ab.
4. Restore aus Backup ist in CI nachgewiesen.
5. `docs/27-deployment.md` erlaubt einem Dritten das Deployment ohne Rückfragen.
6. Bekannte Einschränkungen sind im README dokumentiert.
