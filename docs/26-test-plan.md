# 26 – Test Plan

## 1. Pyramide

| Stufe | Werkzeug | Umfang | Laufzeit |
|---|---|---|---|
| **Unit (Domain)** | Vitest | `packages/domain`: State Machines, `decide()`, Priorisierung, Monitor-Evaluatoren, Konfliktauflösung, Kontextauflösung, Freshness | < 5 s, keine I/O |
| **Property** | Vitest + fast-check | Autorisierungsmatrix, Score = Σ Faktoren, State-Machine-Erreichbarkeit, Idempotenz | < 30 s |
| **Integration (DB)** | Vitest + Testcontainers (Postgres 16) | Repositories, RLS, Constraints, Migrationen, Rollen-Grants | < 3 min |
| **Integration (API)** | Vitest + Fastify `inject` + echte DB | Routen, Auth, Idempotenz, Concurrency, Fehlerformat | < 5 min |
| **Worker** | Vitest + Testcontainers (PG + Redis) | Jeder Job zweimal ausgeführt, DLQ, Backoff | < 5 min |
| **E2E** | Playwright | Akzeptanzszenario §44, Quick Capture offline, Now View, Barrierefreiheit | < 8 min |
| **A11y** | vitest-axe + Playwright-axe | Alle Kernscreens, Tastaturpfade | – |
| **Sicherheit** | ZAP-Baseline, gitleaks, `pnpm audit`, eigene SSRF-Suite | siehe [25](25-threat-model.md#6) | – |
| **Last** | k6 | `GET /now` bei 200 Haushalten × 5 Nutzern, Monitor-Scan bei 10 000 Monitoren | nightly |

## 2. Invarianten-Suite

`packages/domain/test/invariants/` + `apps/api/test/invariants/`: je Invariante mindestens ein Test,
Dateiname = Invarianten-ID. Die CI schlägt fehl, wenn eine Datei `inv-0XX.spec.ts` fehlt
(`test/invariant-coverage.spec.ts` prüft die Vollständigkeit gegen [08](08-invariants.md)).

## 3. Das Akzeptanzszenario aus §44

Implementiert als `apps/api/test/acceptance/shoe-scenario.spec.ts` (API-Ebene, deterministisch mit
kontrollierter Uhr) **und** `apps/web/e2e/shoe-scenario.spec.ts` (Playwright, echte UI).

```
Gegeben  Household "Familie M" (Europe/Berlin), Person A (Anna, admin), Person B (Ben, adult),
         Kind "Kind A"
  und    Domainbaum  Kinder / Kind A / Kleidung / Schuhe
  und    Anna ist primary_owner von "Schuhe"
  und    StateDefinition "shoe_size" (number, freshness 6 Wochen, is_critical=false)
  und    StateValue = 29, verified_at = heute − 49 Tage (7 Wochen)
  und    Monitor "Schuhgröße prüfen" (state_freshness, 6 Wochen)

Wenn     monitor.evaluate läuft
Dann     existiert genau ein Signal (signal_kind='stale_state')
  und    ein AttentionItem "Schuhgröße könnte inzwischen veraltet sein" im Zustand 'open'
  und    why_now nennt Datum der letzten Bestätigung und das Intervall

Wenn     monitor.evaluate ein zweites Mal läuft            [Idempotenz]
Dann     existiert weiterhin genau ein Signal und ein AttentionItem

Wenn     Anna das AttentionItem 'promote' mit Titel "Passform Schuhe überprüfen"
Dann     existiert ein Process 'active' in der Domain "Schuhe"
  und    das AttentionItem ist 'converted'

Wenn     eine Task "Beim nächsten Schuheanziehen Zehenraum prüfen" angelegt wird
         mit Kontext [person:kind-a (required), home (required)],
         estimatedMinutes=2, mentalEnergy='low'
Dann     ist sie die nextAction des Process

Wenn     GET /now mit activeContexts=[office]                       [Kontext passt nicht]
Dann     erscheint die Task NICHT unter "Jetzt relevant"
  aber   sie erscheint unter "Demnächst relevant" mit missing=[person:kind-a, home]

Wenn     GET /now mit activeContexts=[home, person:kind-a]
Dann     erscheint die Task unter "Jetzt relevant"
  und    why enthält 'context_match', 'low_cost' UND 'process_origin'
         (der Schritt erbt die Begründung seines Vorgangs, sodass die Kette bis zum
          auslösenden Hinweis „Schuhgröße zuletzt am … bestätigt" sichtbar bleibt)
  und    owner = Anna, assignee = Ben

Wenn     Ben (nicht der Owner) die Task abschließt
         mit stateUpdate shoe_size unverändert + Notiz "Schuhe werden knapp"
Dann     ist die Task 'done'
  und    StateValue.verified_at = jetzt, stale_at = jetzt + 6 Wochen
  und    das ursprüngliche Signal ist 'resolved'
  und    primary_owner von "Schuhe" ist WEITERHIN Anna              [INV-009 / §44]

Wenn     aus der Notiz ein neuer Process "Neue Schuhe besorgen" erzeugt wird
Dann     schlägt das System das Playbook "Neue Schuhe" vor (playbook.suggested)
  und    nach Instanziierung existieren die 10 Schritte als Tasks
  und    nextActions = ["Füße messen"]

Wenn     einige Tage später nachgemessen wird (außerhalb des Konfliktfensters – innerhalb
         wären zwei abweichende menschliche Angaben ein sichtbarer Widerspruch, §10)
  und    der Process mit outcome='achieved' beendet wird
         inkl. State-Update shoe_size = 30 und KnowledgeItem "Marke X passt gut"
Dann     ist StateValue = 30, verified_at = jetzt, origin='human', confirmed_at gesetzt
  und    existiert ein KnowledgeItem in der Domain "Schuhe"
  und    enthält die History alle Ereignisse in kausaler Kette (gleiche correlationId
         von signal.raised bis process.completed)
  und    primary_owner ist unverändert Anna
```

## 4. Testdaten

- **Fixtures statt Zufall** für fachliche Tests, `fast-check` nur für Property-Tests.
- **Kontrollierte Uhr**: `packages/domain` bekommt eine `Clock`-Abhängigkeit; kein direktes
  `new Date()` (Lint-Regel). Tests springen 7 Wochen vorwärts, ohne zu warten.
- **Seed-Skript** `ops/scripts/seed-demo.ts` erzeugt einen realistischen Haushalt
  (2 Erwachsene, 2 Kinder, 24 Domains, 40 States, 12 Monitore, Kalender mit Serie über DST)
  – Grundlage für Last- und manuelle Tests.

## 5. Qualitätsschwellen (CI-Gates)

| Gate | Schwelle |
|---|---|
| Zeilenabdeckung `packages/domain` | ≥ 95 % |
| Zeilenabdeckung `packages/services` | ≥ 85 % |
| Gesamtabdeckung | ≥ 80 % |
| Invarianten-Tests | 15/15 vorhanden und grün |
| Tenant-Isolation | jede registrierte Route abgedeckt (dynamisch aus der Route-Tabelle) |
| A11y | 0 kritische axe-Verstöße |
| Typprüfung | `tsc --noEmit` strict, 0 Fehler, kein `any` in `domain`/`contracts` |
| Migrationen | vorwärts + Rollback gegen Seed-Datenbestand |
| Lint | ESLint 0 Fehler, dependency-cruiser 0 Verstöße, Shame-Word-Lint 0 Treffer |

## 6. Was bewusst nicht getestet wird

Externe Provider-APIs (Google, Push-Dienste) werden gemockt; ein separater, nicht blockierender
`contract`-Job läuft nächtlich gegen echte Sandbox-Zugänge, sofern konfiguriert.
