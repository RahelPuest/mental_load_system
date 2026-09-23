# ADR-0003 – Tenant-Isolation in drei Schichten

**Status**: Angenommen · **Datum**: 2026-09-07

## Kontext
INV-005 ist die wichtigste Sicherheitsgarantie des Produkts. Der häufigste reale Fehler in
Multi-Tenant-Systemen ist ein vergessener Filter in einer einzelnen Query.

## Entscheidung
Drei unabhängige Schichten, jede allein ausreichend:
1. `decide()` prüft `resource.householdId ∈ actor.householdIds` (Anwendungsebene).
2. `withTenant()` setzt `SET LOCAL app.household_ids` für jede Transaktion.
3. **Postgres RLS**-Policy auf jeder Tabelle mit `household_id`; die App-Rolle hat kein `BYPASSRLS`.

Zusätzlich: ein Test, der jede registrierte Route mit einem fremden Household aufruft, und ein
Test, der fehlschlägt, sobald eine Tabelle mit `household_id` ohne RLS existiert.

## Begründung
Ein einzelner Fehler in einer Query darf nicht zu einem Leak führen. Der Aufwand für RLS ist
einmalig, die Absicherung dauerhaft und unabhängig von Entwicklerdisziplin.

## Konsequenzen
+ Ein vergessener Filter ist folgenlos.
− Jede Tabelle braucht Policy + Grants; jeder Worker braucht eine eigene Rolle.
− Verbindungen müssen pro Transaktion konfiguriert werden (Pooling im Transaktionsmodus).
