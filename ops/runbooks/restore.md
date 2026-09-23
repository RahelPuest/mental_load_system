# Runbook: Wiederherstellung aus dem Backup

**Ziel-RTO 60 Minuten, RPO 5 Minuten** (docs/29).

> **Schritt 4 ist nicht optional.** Ein Restore, der zuvor gelöschte Daten zurückholt, ist selbst
> ein Datenschutzvorfall.

> **Namen im Cluster.** Dieses Runbook nennt Namensraum und Deployments `thealotta*`
> (docs/79). Läuft irgendwo noch ein Cluster mit dem alten Namensraum, dann ist dieses
> Runbook dort falsch – und zwar genau in dem Moment, in dem es gebraucht wird. Entweder
> den Namensraum dort nachziehen oder hier die tatsächlichen Namen eintragen. Ein Runbook,
> das andere Namen nennt als das laufende System, ist kein Runbook.

## 1. Vorfall bestätigen und Schreibzugriff stoppen
```bash
kubectl -n thealotta scale deploy/thealotta-api --replicas=0
kubectl -n thealotta scale deploy/thealotta-worker-default deploy/thealotta-worker-sync deploy/thealotta-worker-notify --replicas=0
```
Zeitpunkt `T` bestimmen: der letzte Moment vor dem Schaden.

## 2. Datenbank auf T-1s wiederherstellen
Managed Postgres: Point-in-Time-Restore in eine **neue** Instanz. Die alte Instanz bleibt
unangetastet – sie ist das Beweismittel.

## 3. Migrationsstand prüfen
```bash
psql "$RESTORED_URL" -c "SELECT version, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 5"
```
Der Stand muss zur ausgerollten Anwendungsversion passen. Ist er älter, zuerst migrieren.

## 4. Löschungen erneut anwenden (verpflichtend)
```bash
DATABASE_URL="$RESTORED_URL" pnpm tsx ops/scripts/reapply-deletions.ts
```
Das Skript liest `deletion_tombstones` und wendet jede Löschung erneut an, die nach `T`
ausgeführt wurde.

## 5. Integrität prüfen
```bash
DATABASE_URL="$RESTORED_URL" pnpm tsx ops/scripts/verify-restore.ts
```
Bricht bei doppelten Primary Ownern, ungültigen Bereichspfaden, `known`-Werten ohne Inhalt
oder unterbrochener Audit-Hash-Kette ab.

## 6. Umschalten und aufarbeiten
```bash
kubectl -n thealotta set env deploy/thealotta-api DATABASE_URL="$RESTORED_APP_URL"
kubectl -n thealotta scale deploy/thealotta-api --replicas=2
kubectl -n thealotta scale deploy/thealotta-worker-default --replicas=2
```
Der Outbox-Relay arbeitet aufgestaute Events selbstständig ab. Danach:
```bash
psql "$RESTORED_URL" -c "UPDATE calendar_connections SET sync_token = NULL, next_sync_at = now()"
```
Die Sync-Tokens sind nach einem Restore wertlos – ein Full-Resync ist der einzige verlässliche Weg.

## 7. Nachbereitung
- Betroffene Haushalte informieren (Zeitraum, betroffene Daten, ergriffene Maßnahmen).
- Post-Mortem in `ops/reports/`.
- Falls Daten zwischen `T` und dem Vorfall verloren gingen: ausdrücklich benennen, nicht beschönigen.
