# ADR-0009 – History aus dem Event-Ledger, Ownership zusätzlich bitemporal

**Status**: Angenommen · **Datum**: 2026-09-07

## Kontext
§33 verlangt Nachvollziehbarkeit, INV-013 speziell für Ownership. Eine separate
`ChangeHistory`-Tabelle neben Events würde zweimal dasselbe schreiben.

## Entscheidung
History ist eine Leseprojektion über `DOMAIN_EVENT`. Für Ownership kommt zusätzlich ein
bitemporales Tabellenmodell (`effective_from`/`effective_to`, nie hart gelöscht) hinzu.

## Begründung
Die Frage „Wer war am 12.08.2026 verantwortlich?“ darf nicht davon abhängen, dass der Event-Strom
lückenlos ist. Die Tabelle ist die Wahrheit, der Event-Strom die Erzählung.
Für alle anderen Objekte genügt der Event-Strom.

## Konsequenzen
+ Kein doppeltes Schreiben, keine Divergenz; Ownership-Rekonstruktion ist eine simple Abfrage.
− Ownership-Änderungen schreiben an zwei Stellen (in einer Transaktion, per DB-Trigger abgesichert).
