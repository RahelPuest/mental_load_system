# 28 – Migration Strategy

## 1. Grundsatz: Expand / Migrate / Contract

Keine Migration darf die vorherige Anwendungsversion brechen. Jede Änderung läuft in drei Releases:

| Phase | Erlaubt | Verboten |
|---|---|---|
| **Expand** (R1) | Spalte hinzufügen (nullable, mit Default), neue Tabelle, neuer Index `CONCURRENTLY`, neuer Constraint `NOT VALID` | – |
| **Migrate** (R1→R2) | Backfill in Batches, Dual-Write in der App, `VALIDATE CONSTRAINT` | Long-running Locks |
| **Contract** (R2+) | Alte Spalte entfernen, Dual-Write beenden | Vor Ausrollung von R2 |

Damit ist ein Rollback jederzeit ohne DB-Eingriff möglich (§27.6).

## 2. Werkzeug

Drizzle Kit (`packages/db/migrations/*.sql`), reine SQL-Dateien, fortlaufend nummeriert,
in einer Transaktion (Ausnahme: `CREATE INDEX CONCURRENTLY`, explizit markiert).
Angewendet mit `thealotta_maintenance`, nie von der Anwendung selbst zur Laufzeit.

## 3. Regeln

1. **Kein destruktives DDL** im selben Release wie der Code, der es überflüssig macht.
2. **Lock-Vermeidung**: `SET lock_timeout = '3s'` und `statement_timeout = '60s'` in jeder Migration.
   Eine Migration, die auf einen Lock wartet, schlägt fehl statt die Produktion zu blockieren.
3. **Backfills batched** (10 000 Zeilen, Pause), als eigener Job, wiederaufnehmbar, nicht in der
   Migrationstransaktion.
4. **Constraints** immer `NOT VALID` anlegen, später validieren.
5. **Enums**: keine Postgres-Enums für fachliche Werte – `text` + `CHECK` (Enums lassen sich nicht
   ohne Sperre ändern). Ausnahme: nichts.
6. **Renames** nie direkt: neue Spalte + Dual-Write + Backfill + Contract.
7. **Jede Migration hat ein Down-Skript**; CI prüft up → down → up gegen den Seed-Datenbestand.
8. **RLS-Policies** werden zusammen mit der Tabelle in derselben Migration angelegt. Ein Test
   (`db/test/rls-coverage.spec.ts`) schlägt fehl, sobald eine Tabelle mit `household_id` ohne
   aktivierte RLS existiert – das schließt die häufigste Leak-Ursache strukturell aus.

## 4. Datenmigrationen mit fachlicher Bedeutung

Bei Migrationen, die fachliche Interpretationen ändern (z. B. „Shared Ownership wird künftig
anders modelliert“), gilt zusätzlich:
- Ein `DOMAIN_EVENT` je betroffenem Objekt mit `actor_kind='system'` und `payload.migration = '<id>'`.
- Ein Bericht in `ops/reports/<migration>.md` mit Zeilenzahlen vorher/nachher.
- Kein automatisches Umschreiben von Ownership ohne Event (INV-013).

## 5. Partitionierung

`DOMAIN_EVENT` ist nach `occurred_at` monatlich range-partitioniert (pg_partman).
Neue Partitionen werden automatisch angelegt; Retention verschiebt alte Partitionen ins Archiv
(`DETACH` + Dump), statt Zeilen zu löschen – schnell und ohne Bloat.

## 6. Erweiterungen

`uuid-ossp`/`pgcrypto` (UUID), `ltree` (Domainpfade), `btree_gist` (Exclusion-Constraint auf
Coverage-Zeiträumen), `citext` (E-Mail). Alle in gängigen Managed-Postgres verfügbar.
Fallbacks für `ltree` (rekursive CTE) und `btree_gist` (Trigger-basierte Prüfung) sind in
`packages/db/fallbacks/` dokumentiert, falls eine Zielplattform sie nicht anbietet (T13).

## 7. Nullkommanull-Downtime-Checkliste je PR

```
[ ] Nur additive DDL?
[ ] Index CONCURRENTLY?
[ ] lock_timeout/statement_timeout gesetzt?
[ ] Down-Skript vorhanden und getestet?
[ ] RLS-Policy für neue Tabelle mit household_id?
[ ] Grants für alle fünf DB-Rollen gesetzt?
[ ] Backfill als separater Job?
[ ] Alte App-Version bleibt lauffähig?
```
