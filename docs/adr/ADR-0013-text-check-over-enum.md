# ADR-0013 – `text` + `CHECK` statt Postgres-Enums

**Status**: Angenommen · **Datum**: 2026-09-07

## Kontext
Das Modell enthält viele Aufzählungen (Zustände, Rollen, Regeltypen, Kanäle), die im Lauf der
Produktentwicklung wachsen werden.

## Entscheidung
Alle fachlichen Aufzählungen sind `text` mit einem `CHECK`-Constraint. Die verbindliche Liste
steht in `packages/contracts` und wird an einer Stelle gepflegt.

## Begründung
Postgres-Enums lassen Werte nur anhängen, nicht entfernen oder umbenennen, und Änderungen
erfordern Sperren. `CHECK`-Constraints lassen sich `NOT VALID` anlegen und ohne Downtime
validieren – passend zur Expand/Contract-Pflicht aus ADR-0014.

## Konsequenzen
+ Schmerzfreie Erweiterung, keine Sperren.
− Etwas mehr Speicher; Gültigkeit hängt an CHECK + Zod statt am Typsystem der DB.
