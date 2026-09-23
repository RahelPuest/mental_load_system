# 29 – Backup & Recovery

## 1. Ziele

| Kennzahl | Ziel |
|---|---|
| RPO | ≤ 5 Minuten |
| RTO | ≤ 60 Minuten |
| Aufbewahrung Vollbackup | 35 Tage |
| PITR-Fenster | 7 Tage |
| Aufbewahrung Monatsbackup | 12 Monate (verschlüsselt, getrennter Speicherort) |

## 2. Verfahren

| Was | Wie | Frequenz |
|---|---|---|
| Postgres | Managed-Snapshot + WAL-Archivierung (PITR) | kontinuierlich |
| Postgres logisch | `pg_dump -Fc` je Datenbank, AES-256 verschlüsselt, Objektspeicher | täglich 02:30 UTC |
| Attachments (Object Storage) | Versionierung + Cross-Region-Replikation | kontinuierlich |
| Secrets | Im Secret-Store, separat gesichert | – |
| Redis | **nicht gesichert** – bewusst; rekonstruierbar aus der DB | – |

Backups liegen in einem separaten Konto/Bucket mit eigenen Zugangsdaten und
Object-Lock (WORM) für die Monatsbackups – Schutz gegen versehentliche wie böswillige Löschung.

## 3. Restore-Verfahren (Kurzform, Details in `ops/runbooks/restore.md`)

```
1. Vorfall bestätigen, Zeitpunkt T bestimmen, Schreibzugriff stoppen (API auf read-only)
2. Neue DB-Instanz aus PITR auf T-1s erzeugen
3. Migrationsstand prüfen (schema_migrations vs. Deployment-Version)
4. ops/scripts/reapply-deletions.ts ausführen  ← wendet Löschanträge erneut an (siehe 05-privacy §5)
5. Integritätsprüfung: ops/scripts/verify-restore.ts
6. Connection-String umschalten, Worker starten, Outbox aufarbeiten lassen
7. Kalender-Full-Resync anstoßen (Cursor können veraltet sein)
8. Post-Mortem, Kommunikation an betroffene Haushalte
```

**Schritt 4 ist verpflichtend.** Ein Restore, der gelöschte Daten wiederherstellt, wäre ein
Datenschutzvorfall. Die Tombstone-Tabelle macht die Wiederanwendung deterministisch.

## 4. Integritätsprüfung nach Restore (`verify-restore.ts`)

- Zeilenzahlen je Tabelle gegen Erwartungsband.
- Audit-Hash-Chain durchgehend.
- Keine Domain ohne gültigen `path`; keine Zyklen.
- Kein `primary_owner`-Duplikat.
- Keine `outbox_event` im Zustand `published` ohne `published_at`.
- Alle `state_value` mit `value_kind='known'` haben `value IS NOT NULL`.
- Referenzielle Integrität aller FKs (`NOT VALID`-Constraints erneut validiert).

## 5. Getestete Wiederherstellbarkeit (§37)

Ein Backup ohne getesteten Restore zählt nicht als Backup. Deshalb:

- **Wöchentlich, automatisiert** (`restore.verify`-Job in CI/Staging): jüngstes Backup in eine
  Wegwerf-Instanz einspielen, `verify-restore.ts` ausführen, Ergebnis als Metrik
  `backup_restore_verified_timestamp` exportieren. Ein Alert feuert, wenn dieser Wert älter als
  10 Tage ist.
- **Quartalsweise, manuell**: vollständige Katastrophenübung inklusive Umschalten der Anwendung
  in Staging, gemessene RTO, Protokoll in `ops/reports/dr-drill-<datum>.md`.
- **Bei jeder Migration mit Contract-Phase**: Restore-Test des Vorgängerstands.

## 6. Schutz gegen versehentliche Löschung

- `ON DELETE RESTRICT` statt `CASCADE` für alles unterhalb von `DOMAIN`.
- Soft Delete mit 30 Tagen Karenzzeit für Personen, Households und Nutzerkonten.
- Löschungen laufen ausschließlich über `DELETION_REQUEST` (protokolliert, abbrechbar),
  nie über direkte `DELETE`-Endpunkte.
- Die App-Rolle besitzt kein `TRUNCATE`, kein `DROP`.
