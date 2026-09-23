# 27 – Deployment Architecture & CI/CD

## 1. Umgebungen

| Umgebung | Zweck | Daten |
|---|---|---|
| `local` | Entwicklung, `docker compose up` | Seed |
| `ci` | Tests | Ephemer (Testcontainers) |
| `staging` | Vorabprüfung, Restore-Tests | Anonymisierte Kopie |
| `production` | Betrieb | Echt |

## 2. Laufzeitkomponenten

| Komponente | Skalierung | Ressourcen (Start) |
|---|---|---|
| `api` | horizontal, zustandslos | 2 Replicas, 0.5 vCPU / 512 MiB |
| `worker-default` | horizontal | 2 Replicas, 0.5 vCPU / 512 MiB |
| `worker-sync` | horizontal, eigene Queue + DB-Rolle | 1 Replica |
| `worker-notify` | horizontal, eigene Queue + DB-Rolle | 1 Replica |
| `web` | statisch (CDN/Nginx) | – |
| `postgres` | Managed, PITR aktiviert | 2 vCPU / 8 GiB, 100 GiB |
| `redis` | Managed, `appendonly yes` | 1 GiB |

Worker sind nach DB-Rolle getrennt deployt – das ist die Voraussetzung dafür, dass INV-006 und
INV-012 über Berechtigungen statt über Disziplin durchgesetzt werden.

## 3. Container

- Multi-Stage-Build, `node:24-bookworm-slim`, non-root (`uid 10001`), read-only Root-FS,
  `tini` als PID 1, Healthcheck auf `/health/live`.
- Reproduzierbar: `pnpm install --frozen-lockfile`, `SOURCE_DATE_EPOCH`, Image getaggt mit
  Commit-SHA (nie `latest` in Produktion), SBOM (CycloneDX) und Signatur (cosign) je Release.

## 4. Startreihenfolge / Migrationen

```
1. Migration-Job (Rolle thealotta_maintenance) – Expand-Phase, ausschließlich additiv
2. Rollout api + worker (rolling, maxUnavailable=0)
3. Verifikation (Smoke-Tests gegen /health/ready + kritische Routen)
4. Optional späteres Release: Contract-Phase (Spalten entfernen)
```
Ein Deployment ohne Migration ist immer möglich; alte und neue Version müssen ein Release lang
gleichzeitig lauffähig sein ([28](28-migration-strategy.md)).

## 5. CI-Pipeline (GitHub Actions)

```
lint          eslint · prettier --check · dependency-cruiser · shame-word-lint
typecheck     tsc --noEmit (alle Pakete)
test:unit     vitest packages/*
test:db       vitest apps/api (Testcontainers PG)  + Rollen-Grant-Matrix + RLS
test:worker   vitest apps/worker (PG + Redis)
test:e2e      playwright (docker compose)
security      pnpm audit · gitleaks · ZAP-Baseline · SSRF-Suite
migrate:check up + down gegen Seed-Datenbestand
build         Docker-Images, SBOM, cosign-Signatur
```
Alle Jobs außer `test:e2e` laufen parallel. Merge auf `main` erfordert alle grün.

## 6. CD

- `main` → automatisches Deployment nach `staging` + Smoke-Tests + Restore-Test.
- Produktion → manuelle Freigabe (Environment Protection), Deployment per Commit-SHA.
- Rollback: vorheriges Image-Tag neu ausrollen. Weil Migrationen additiv sind, ist ein
  Rollback ohne DB-Eingriff möglich – das ist der Grund für die Expand/Contract-Pflicht.

## 7. Secrets

| Secret | Quelle | Rotation |
|---|---|---|
| `DATABASE_URL` (je Rolle) | Secret-Store | 90 Tage |
| `SESSION_SECRET` | Secret-Store | 180 Tage, überlappend (Key-Liste) |
| `ENCRYPTION_KEYS` | JSON `{keyId: base64}`, aktiver Key über `ENCRYPTION_ACTIVE_KEY_ID` | 180 Tage, alte Keys für Entschlüsselung behalten |
| `VAPID_*` | Secret-Store | selten (invalidiert Subscriptions) |
| `SMTP_*`, `GOOGLE_OAUTH_*` | Secret-Store | nach Bedarf |

Kein Secret im Repo, im Image oder in Build-Args. `packages/contracts/src/env.ts` validiert beim
Start; fehlende Secrets brechen den Prozess sofort ab.

## 8. Betriebs-Runbooks (`ops/runbooks/`)

`restore.md`, `calendar-connection-broken.md`, `notification-backlog.md`, `dlq-drain.md`,
`rotate-encryption-key.md`, `household-deletion.md`, `incident-data-leak.md`.
