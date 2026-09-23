# ADR-0006 – NextAction als Projektion, nicht als Entität

**Status**: Angenommen · **Datum**: 2026-09-07

## Kontext
§12 verlangt, dass jederzeit erkennbar ist, was der nächste konkrete Schritt ist.

## Entscheidung
`NextAction` ist keine Tabelle. `nextActions(process)` berechnet aus Tasks, Abhängigkeiten,
`WaitingState` und Position die Menge der aktuell ausführbaren Tasks. Hat ein aktiver Process
keine solche Task, erzeugt der Stall-Detector ein `AttentionItem`
„Nächsten Schritt festlegen“ (INV-P04).

## Begründung
Eine eigene Entität wäre eine zweite Wahrheit über denselben Sachverhalt und müsste bei jeder
Task-Änderung synchron gehalten werden – eine klassische Quelle für Inkonsistenz.

## Konsequenzen
+ Keine Divergenz, keine Sync-Jobs.
− Berechnung bei jeder Abfrage (durch Indizes und kleine Prozessgrößen unkritisch).
