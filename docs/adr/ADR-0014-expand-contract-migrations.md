# ADR-0014 – Expand/Contract-Pflicht für alle Migrationen

**Status**: Angenommen · **Datum**: 2026-09-07

## Kontext
Ein Rollback muss ohne Datenbankeingriff möglich sein; §36 verlangt Robustheit, §46
sichere Migrationen.

## Entscheidung
Keine Migration darf die vorherige Anwendungsversion brechen. Destruktives DDL erst ein Release
nach dem Code, der es überflüssig macht. `lock_timeout` und `statement_timeout` sind in jeder
Migration gesetzt; Backfills laufen als separate, batched Jobs. Jede Migration hat ein
getestetes Down-Skript.

## Begründung
Der teuerste Ausfall ist der, bei dem ein Rollback unmöglich ist, weil die Migration Daten
entfernt hat. Die Regel kostet ein zusätzliches Release, macht Deployments aber jederzeit
umkehrbar.

## Konsequenzen
+ Rollback ohne DB-Eingriff; keine Migration blockiert die Produktion (Lock-Timeout).
− Zwei Releases für jede Umbenennung; temporär doppelte Spalten.
