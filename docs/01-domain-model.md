# 01 – Domain Model

## 1. Leitsatz des Modells

Das Domänenmodell trennt konsequent vier Dimensionen, die in klassischen Task-Managern kollabieren:

| Dimension | Frage | Objekte |
|---|---|---|
| **Verantwortung** | Wer *denkt* daran? | `Domain`, `ResponsibilityAssignment`, `TemporaryCoverage` |
| **Wissen** | Was wissen wir? | `StateDefinition/Value/Observation`, `KnowledgeItem`, `Question`, `Decision` |
| **Aufmerksamkeit** | Was ist gerade relevant? | `Monitor`, `Signal`, `AttentionItem`, `Need` |
| **Arbeit** | Was ist der nächste Schritt? | `Process`, `Task`, `Dependency`, `Playbook` |

Diese vier Dimensionen sind **orthogonal**. Eine Änderung in einer Dimension darf keine andere implizit verändern
(→ INV-002, INV-003, INV-009).

## 2. Ubiquitous Language (DE/EN)

| Begriff | Definition | Abgrenzung |
|---|---|---|
| **Household** | Tenant-Grenze. Alle fachlichen Daten gehören zu genau einem Household. | Ein User kann Mitglied mehrerer Households sein; Daten fließen nie zwischen ihnen. |
| **Person** | Ein Mensch, über den das System Wissen führt (Kind, Elternteil, Oma). | Braucht **keinen** Account. |
| **User** | Ein Authentifizierungssubjekt (Login). | Ist nicht automatisch eine Person und umgekehrt. |
| **Membership** | Verbindung User ↔ Household mit Rolle. | Trägt die Rolle, nicht der User. |
| **Domain** | Verantwortungsbereich, hierarchisch. „Kind A → Kleidung → Schuhe“. | Kein Ordner für Tasks, sondern Träger von Verantwortung, Wissen, Zustand und Monitoring. |
| **Ownership** | Kognitive Gesamtverantwortung für eine Domain. | Nicht Ausführung. Nicht Zuweisung eines Tasks. |
| **State** | Aktuell bekannter, benannter Zustand innerhalb einer Domain. | Kein Task, kein Ereignis. Kann `unknown` sein. |
| **Freshness** | Aussage darüber, wie alt eine Information ist. | Keine Aussage über Richtigkeit. |
| **Monitor** | Regel, die Zustand/Zeit/Kalender beobachtet. | Erzeugt kein Task, sondern (zunächst) ein Signal. |
| **Signal** | Unveränderliche maschinelle Beobachtung: „Etwas könnte Aufmerksamkeit verdienen.“ | Kein Aufruf zum Handeln. Append-only. |
| **AttentionItem** | Menschlich triagierbare Aufmerksamkeitseinheit; bündelt 1..n Signale. | Hat Lifecycle (confirm/snooze/dismiss/promote). |
| **Need** | Ein unerfülltes Bedürfnis, das unabhängig von einzelnen Signalen fortbesteht. | Überlebt das Verschwinden des auslösenden Signals. |
| **Process** | Mehrschrittiger Vorgang mit Ziel und Abschlusskriterium. | Nicht „großer Task“. Hat immer eine erkennbare Next Action. |
| **Task** | Atomar ausführbare Arbeitseinheit. | Kann standalone existieren. |
| **NextAction** | Projektion: die aktuell unblockierte, konkret ausführbare Task eines Process. | Keine eigene Tabelle – berechnete Sicht (→ ADR-0006). |
| **ContextRequirement** | Bedingung, unter der ein Task sinnvoll ausführbar ist. | Nicht Deadline. |
| **CapacityState** | Zeitraumbezogene Angabe verfügbarer Kapazität einer Person. | Keine medizinische Bewertung. Verändert Darstellung, nicht Relevanz. |

## 3. Bounded Contexts

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Identity &      │  │  Responsibility  │  │  Knowledge       │
│  Tenancy         │  │                  │  │                  │
│ User, Session,   │  │ Domain,          │  │ StateDefinition, │
│ Household,       │→ │ Assignment,      │→ │ StateValue,      │
│ Membership,      │  │ TemporaryCoverage│  │ Observation,     │
│ Person, Grant    │  │ CapacityState    │  │ Knowledge,       │
└──────────────────┘  └──────────────────┘  │ Question,        │
         │                     │            │ Decision         │
         │                     ▼            └──────────────────┘
         │            ┌──────────────────┐           │
         │            │  Attention       │◄──────────┘
         │            │ Monitor, Signal, │
         │            │ AttentionItem,   │
         │            │ Need             │
         │            └──────────────────┘
         │                     │
         │                     ▼
         │            ┌──────────────────┐  ┌──────────────────┐
         │            │  Work            │  │  Intake          │
         │            │ Process, Task,   │◄─│ InboxItem,       │
         │            │ Dependency,      │  │ QuickCapture     │
         │            │ Playbook         │  └──────────────────┘
         │            └──────────────────┘
         ▼                     │
┌──────────────────┐           ▼
│  Integration     │  ┌──────────────────┐  ┌──────────────────┐
│ CalendarConn.,   │→ │  Delivery        │  │  Ledger          │
│ CalendarEvent,   │  │ Notification,    │  │ DomainEvent,     │
│ IntegrationConn. │  │ Delivery, Prefs  │  │ AuditEvent,      │
└──────────────────┘  └──────────────────┘  │ ChangeHistory    │
                                            └──────────────────┘
```

**Ledger** ist Senke aller Contexts: jeder Context schreibt Events, keiner liest fachlich aus dem Ledger zurück
(Ausnahme: History-Ansichten, read-only).

## 4. Aggregate & Konsistenzgrenzen

Ein Aggregat = eine Transaktionsgrenze = ein Optimistic-Lock-Zähler.

| Aggregat | Root | Enthaltene Entitäten | Invarianten innerhalb |
|---|---|---|---|
| **Household** | `Household` | `HouseholdMembership`, `Person`, `Role` | Mindestens ein aktiver `admin`; Person gehört genau einem Household |
| **Domain** | `Domain` | `ResponsibilityAssignment`, `TemporaryCoverage`, `DomainGrant` | Max. 1 aktiver `primary_owner`; Parent im selben Household; azyklisch |
| **StateSlot** | `StateDefinition` | `StateValue` (1:1 aktuell), `StateObservation` (n, append-only) | `StateValue.version` monoton; `value_kind` konsistent zum `data_type` |
| **Monitor** | `Monitor` | `MonitoringRule` | Regelparameter passen zum `rule_kind`; Ziel-Domain/State existiert |
| **AttentionItem** | `AttentionItem` | `AttentionItemSignal` (n:m zu `Signal`) | Signale desselben Households; Lifecycle-Übergänge legal |
| **Process** | `Process` | `Task`, `TaskDependency`, `TaskContextRequirement`, `WaitingState` | Tasks gehören zum Process-Household; Dependency-Graph azyklisch |
| **Playbook** | `Playbook` | `PlaybookStep` | Schrittreihenfolge lückenlos; Verzweigungsziele existieren |
| **CalendarConnection** | `CalendarConnection` | `CalendarSelection`, `CalendarEvent` | Externe ID eindeutig je Connection |
| **Notification** | `Notification` | `NotificationDelivery` | Delivery-Zustand ändert nie das Quellobjekt (INV-006) |
| **Signal** | `Signal` | – | **Immutable.** Wird nie geändert, nur superseded. |

**Cross-Aggregat-Konsistenz** ist immer *eventual* und läuft über den Outbox-Mechanismus
(z. B. `Signal` erzeugt → Job erzeugt/aktualisiert `AttentionItem`).

## 5. Die Produkt-Pipeline im Modell

```
OWN        Domain + ResponsibilityAssignment
  ↓        (wer trägt die kognitive Verantwortung?)
KNOW       StateDefinition/StateValue + KnowledgeItem + Decision + Question
  ↓        (was wissen wir – inkl. "unknown"?)
MONITOR    Monitor + MonitoringRule
  ↓        (was muss beobachtet werden?)
ANTICIPATE Signal  → AttentionItem → (optional) Need
  ↓        (was könnte nötig werden?)
TRIGGER    ContextRequirement + WaitingState + CalendarEvent
  ↓        (wann ist der richtige Moment?)
ACT        Process → Task (Next Action)
  ↓        (was ist der nächste Schritt?)
LEARN      StateObservation + KnowledgeItem + Answer(Question) + Freshness-Reset
  ↓
KNOW       (Rückfluss)
```

Jeder Pfeil ist im Code ein benanntes Domain-Event (siehe [Event Catalog](06-event-catalog.md)),
nicht ein impliziter Seiteneffekt.

## 6. Ownership-Modell im Detail

`ResponsibilityAssignment` ist **eine** Tabelle mit einem `assignment_kind`, statt vier Tabellen:

| `assignment_kind` | Bedeutung | Kardinalität je Domain |
|---|---|---|
| `primary_owner` | Trägt die kognitive Gesamtverantwortung. | 0..1 aktiv |
| `secondary_owner` | Vollwertige Mitverantwortung, aber nachrangig für Eskalation. | 0..n |
| `shared_owner` | Explizit geteilte Verantwortung ohne Rangfolge. | 0..n, **nur wenn kein `primary_owner` existiert** |
| `support` | Hilft auf Anfrage, denkt nicht mit. | 0..n |
| `observer` | Will informiert sein. | 0..n |

**Regeln**
- `shared_owner` und `primary_owner` schließen sich je Domain aus (sonst wäre unklar, wer eskaliert wird). Interpretation dokumentiert in [12-open-questions](12-open-questions.md#q-03).
- **Vererbung ist explizit**: `Domain.ownership_inheritance ∈ { inherit, own }`. Bei `inherit` gibt es keine eigene Assignment-Zeile; der effektive Owner wird zur Laufzeit vom nächsten Vorfahren mit `own` gelesen und in der UI als *„geerbt von X“* markiert. Beim ersten eigenen Assignment schaltet die Domain automatisch auf `own` (ein sichtbarer, geloggter Vorgang).
- **Unowned-Erkennung**: Eine Domain gilt als `unowned`, wenn weder eigene noch geerbte Assignments mit `primary_owner|secondary_owner|shared_owner` existieren. Das ist ein *Produktsignal*, kein Fehler (§31).
- `TemporaryCoverage` überlagert die Ownership zeitlich, ohne die Assignment-Zeile zu verändern (INV-003, INV-013).

## 7. Was bewusst **kein** eigenes Aggregat ist

| Konzept | Umsetzung | Begründung |
|---|---|---|
| `NextAction` | Projektion über `Task` | Ein eigenes Objekt würde doppelte Wahrheit erzeugen (ADR-0006). |
| `Trigger` | Diskriminator `rule_kind` auf `MonitoringRule` + `TaskContextRequirement` | „Trigger“ ist im Spec-Text zwei verschiedene Dinge (Zeit/Zustand vs. Ausführungskontext). Getrennt modelliert, nicht vereinheitlicht. |
| `Role` | Konstanten-Enum + `RoleGrant`-Zeilen | Frei definierbare Rollen sind Post-MVP; das Grant-Modell erlaubt sie ohne Schemaänderung. |
| `HouseholdMember` | = `Person` mit `person_kind` | Spec listet `Person`, `HouseholdMember`, `ExternalPerson` – gleiche Struktur, unterschiedliche Reichweite. |
| `Link` / `Document` | `Attachment` mit `attachment_kind` | Identisches Berechtigungs- und Lebenszyklusverhalten. |
| `ChangeHistory` | Projektion über `DomainEvent` | Vermeidet doppeltes Schreiben und Divergenz (ADR-0009). |

## 8. Person vs. User

```
User (Login)  ──HouseholdMembership──►  Household
  │                                        ▲
  └──(optional 1:1 linked_person_id)──►  Person ──┘

Person.person_kind ∈ { adult_member, child, dependent, caregiver, external }
```

- Eine `Person` ohne `User` kann Subjekt von Wissen und Zustand sein, aber nie Akteur.
- Ein `User` ohne `Person` kann handeln, aber ist kein Gegenstand von Fürsorge.
- Assignments referenzieren **`HouseholdMembership`**, nicht `User` – Verantwortung existiert nur im Household-Kontext.
- `Person` ist Träger von Sensitivity: „Gesundheit Kind A“ hängt an der Person, nicht am User.
