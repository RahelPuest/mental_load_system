# 20 – Systemarchitektur

## 1. Überblick

```
                    ┌──────────────────────────────────────────┐
   Browser / PWA    │  apps/web  (React 19, Vite, Workbox SW)   │
   (installierbar)  │  Now View · Quick Capture · Domains ·     │
                    │  Attention · Prozesse · Wissen            │
                    └───────────────┬──────────────────────────┘
                                    │ HTTPS, Cookie-Session (SameSite=Lax, HttpOnly)
                                    │ + CSRF-Token, JSON, OpenAPI 3.1
                    ┌───────────────▼──────────────────────────┐
                    │  apps/api  (Fastify 5, Node 24)           │
                    │  ├ routes/      dünn, Zod-validiert       │
                    │  ├ services/    Domänenlogik-Orchestrierung│
                    │  ├ repositories/ einzige DB-Zugriffsstelle │
                    │  └ plugins/     auth, tenant, audit, rate  │
                    └───┬───────────────────────┬──────────────┘
                        │                       │ Outbox (in Tx)
        ┌───────────────▼──────┐   ┌────────────▼──────────────┐
        │  PostgreSQL 16       │   │  Redis 7 (BullMQ)          │
        │  RLS je Household    │   │  nur Transport, kein State │
        │  ltree, btree_gist   │   └────────────┬──────────────┘
        │  pg_partman (Events) │                │
        └───────────▲──────────┘   ┌────────────▼──────────────┐
                    │              │  apps/worker               │
                    └──────────────┤  monitor · attention ·     │
                       eigene      │  calendar · notification · │
                       DB-Rollen   │  outbox-relay · export ·   │
                                   │  deletion                  │
                                   └────┬───────────┬───────────┘
                                        │           │
                              ┌─────────▼──┐  ┌─────▼─────────┐
                              │ CalDAV/ICS │  │ Web Push /    │
                              │ Google Cal │  │ SMTP          │
                              └────────────┘  └───────────────┘
```

## 2. Monorepo

```
apps/
  api/          Fastify HTTP-API
  worker/       BullMQ-Prozessoren
  web/          React-PWA
packages/
  domain/       Reine Logik: State Machines, authz, Priorisierung, Monitor-Evaluatoren,
                Konfliktauflösung, Kontextauflösung. Keine I/O-Abhängigkeit.
  services/     Anwendungsdienste (Transaktionsgrenze, decide()-Aufruf, Event-Schreibung).
                Eigenes Paket, weil API und Worker dieselben fachlichen Operationen ausführen –
                ein Monitor wird sowohl manuell als auch zeitgesteuert ausgewertet.
  contracts/    Zod-Schemas + abgeleitete Typen + OpenAPI-Generierung. Von API und Web geteilt.
  db/           Drizzle-Schema, Migrationen, RLS-Policies, Seeds, Testhelfer
  observability/ Logger (Redaction-Allowlist), Metrics, Tracing, Correlation-Kontext
  crypto/       AES-256-GCM Envelope, Argon2id, Token-Hashing, Key-Provider (env | KMS)
ops/
  docker/       Dockerfiles, compose
  k8s/          Manifeste
  scripts/      Restore-Test, reapply-deletions, seed-demo
  ci/           GitHub-Actions-Workflows
```

**Abhängigkeitsregel** (per `dependency-cruiser` in CI erzwungen):
`domain` importiert nichts aus `db`, `services`, `api` oder `worker` und liest nie die Systemuhr
(beides per ESLint erzwungen). `contracts` importiert nur `zod`. `services` importiert `domain`,
`contracts`, `db`, `crypto`. `api`/`worker` importieren zusätzlich `observability`.
`web` importiert nur `contracts`.

Damit ist die gesamte Fachlogik ohne Datenbank testbar – die Voraussetzung dafür, dass die
15 Invarianten schnelle, deterministische Tests bekommen.

## 3. Schichten in `apps/api`

| Schicht | Verantwortung | Verbot |
|---|---|---|
| `routes/` | HTTP, Zod-Validierung, Statuscodes, `If-Match`, `Idempotency-Key` | keine Geschäftsregel |
| `@thealotta/services` | Transaktionsgrenze, `decide()`-Aufruf, State-Machine-Prüfung, Event-Schreibung | kein HTTP, kein direkter Bezug auf Fastify |
| `repositories/` | SQL via Drizzle, immer innerhalb `withTenant()` | keine Autorisierungsentscheidung |
| `plugins/` | Auth-Session, Tenant-Kontext, Rate-Limit, Audit, Fehler-Mapping, Request-ID | keine Fachlogik |

Jeder Service-Aufruf folgt demselben Muster:

```ts
return withTenant(ctx.householdId, async (tx) => {
  const resource = await repo.load(tx, id)                    // 1. laden
  authorize(ctx, 'task:complete', resource)                   // 2. entscheiden (wirft 404/403)
  const next = applyTransition(taskMachine, resource, 'complete') // 3. Übergang prüfen
  const saved = await repo.update(tx, next, expectedVersion)  // 4. schreiben (optimistic lock)
  await events.record(tx, taskCompleted(saved, ctx))          // 5. Event + Outbox in derselben Tx
  return saved
})
```

Dieses Muster ist als `withAggregate()`-Helfer implementiert, damit kein Service es „vergessen“ kann.

## 4. Tenant-Kontext

```ts
withTenant(householdIds, fn) => db.transaction(async tx => {
  await tx.execute(sql`SELECT set_config('app.household_ids', ${ids.join(',')}, true)`)
  return fn(tx)
})
```
`set_config(..., true)` = `LOCAL`, gilt nur für die Transaktion. Die RLS-Policy jeder Tabelle:

```sql
CREATE POLICY tenant_isolation ON <table>
  USING (household_id::text = ANY (string_to_array(current_setting('app.household_ids', true), ',')));
```

**Ledger und Belege sind zweierlei.** Der Ledger (`domain_events`, `audit_events`) ist für
niemanden änderbar oder löschbar – was geschehen ist, bleibt. Belege (`signals`,
`state_observations`) sind an fachliche Objekte gebunden und dürfen seit Migration 0008
gelöscht, aber weiterhin nicht geändert werden: Einen Beleg umzuschreiben hieße, die
Vergangenheit anders darzustellen; ihn zu löschen heißt, ihn zu beenden – zusammen mit der
Sache, zu der er gehört. Ohne dieses Recht könnte ein Haushalt seine Daten nicht vollständig
entfernen, weil beide Tabellen mit `ON DELETE RESTRICT` an Bereichen und Angaben hängen.

Die Anwendungsrolle `thealotta_app` besitzt **kein** `BYPASSRLS`. Wartungsaufgaben laufen unter
`thealotta_maintenance`.

## 5. Worker-Rollen (Least Privilege)

| Rolle | Rechte | Grund |
|---|---|---|
| `thealotta_app` | volle DML auf fachlichen Tabellen, INSERT/SELECT auf Ledger, INSERT/SELECT/DELETE auf Belegen | API |
| `thealotta_monitor` | SELECT auf State/Domain/Monitor/Kalender, INSERT auf `signal`, `outbox_event` | Monitoring darf nichts anderes verändern |
| `thealotta_notifier` | SELECT fachlich, DML nur auf `notification*`, `push_subscription` | **INV-006** technisch erzwungen |
| `thealotta_sync` | DML nur auf `calendar_*`, INSERT auf `outbox_event`/`signal` | **INV-012** technisch erzwungen |
| `thealotta_maintenance` | Migrationen, Retention, Restore | getrennt, nur aus Ops-Kontext |

Ein SQL-Test (`db/test/role-grants.spec.ts`) prüft die Allow/Deny-Matrix jeder Rolle gegen jede Tabelle.

## 6. Outbox

```sql
BEGIN;
  UPDATE task SET state='done', version=version+1 WHERE ...;
  INSERT INTO domain_event (...);
  INSERT INTO outbox_event (topic, payload, available_at) VALUES ('task.state_changed', ..., now());
COMMIT;
```
`outbox.relay` liest mit `FOR UPDATE SKIP LOCKED`, publiziert nach BullMQ, markiert `published`.
At-least-once; jeder Konsument dedupliziert über `PROCESSED_EVENT(consumer, event_id)`.
Redis-Verlust kostet keine Events (ADR-0007).

## 7. Frontend

- React 19 + TanStack Query (Server-State) + Zustand (UI-State), Vite, TypeScript strict.
- **Offline-fähiges Quick Capture**: Service Worker mit Background Sync; Einträge landen in
  IndexedDB und werden mit clientseitig erzeugtem `Idempotency-Key` nachgesendet.
- Routen: `/now`, `/capture`, `/inbox`, `/domains/*`, `/attention`, `/processes/*`, `/knowledge`,
  `/family`, `/settings`.
- Barrierefreiheit (§41): semantisches HTML, sichtbarer Fokus, Tastaturpfade für alle Kernaktionen,
  Zustand nie nur über Farbe (immer Icon + Text), `prefers-reduced-motion`, Zieltrefferfläche ≥ 44 px,
  Kontrast ≥ 4.5:1. `vitest-axe` in CI auf allen Kernscreens.
- Zwei Dichtestufen: `calm` (Default, wenig Information) und `detailed`.

## 8. Konfiguration

Alle Umgebungsvariablen werden beim Start durch ein Zod-Schema validiert (`packages/contracts/src/env.ts`);
ein fehlendes Secret führt zum sofortigen Abbruch, nicht zu Laufzeitfehlern. Keine Defaults für Secrets.

## 9. Warum diese Architektur zu diesem Produkt passt

| Produktanforderung | Architekturantwort |
|---|---|
| „Nichts geht still verloren“ | Outbox + append-only Ledger + keine automatischen Terminalzustände + `ON DELETE RESTRICT` |
| „Nachvollziehbarkeit“ | `domain`-Paket ohne I/O → jede Entscheidung ist eine testbare reine Funktion mit Begründung |
| „Sicherheit vor Automatisierung“ (§47) | Autonomiestufen im Typsystem + getrennte DB-Rollen |
| „Niedrige Interaktionskosten“ | Offline Quick Capture, Idempotenz, optimistische UI |
| „Schwankende Kapazität“ | Priorisierung ist eine reine Funktion mit Kapazität als Parameter – kein serverseitiger Zustand nötig |
