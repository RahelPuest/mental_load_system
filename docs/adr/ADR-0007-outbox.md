# ADR-0007 – Transaktionale Outbox statt direkter Queue-Publikation

**Status**: Angenommen · **Datum**: 2026-09-07

## Kontext
Fachliche Änderung und Folgeverarbeitung müssen gemeinsam gelten. Ein Enqueue nach dem Commit
kann verloren gehen; ein Enqueue vor dem Commit kann auf einen nie committeten Zustand verweisen.

## Entscheidung
`OUTBOX_EVENT` wird in derselben Transaktion geschrieben. Ein Relay-Job liest mit
`FOR UPDATE SKIP LOCKED` und publiziert nach BullMQ. At-least-once; jeder Konsument dedupliziert
über `PROCESSED_EVENT(consumer_name, event_id)`.

## Begründung
Die zentrale Produktzusage lautet „nichts geht still verloren“. Ein Redis-Totalverlust darf
keine fachliche Wirkung haben. Postgres bleibt die einzige Quelle der Wahrheit.

## Konsequenzen
+ Kein Eventverlust; Redis wird zur austauschbaren Transportschicht.
− Zusätzliche Latenz (< 1 s) und eine wachsende Tabelle (partitioniert, mit Retention).
