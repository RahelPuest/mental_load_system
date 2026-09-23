# ADR-0012 – Keine Prozentzahlen für Mental-Load-Balance

**Status**: Angenommen · **Datum**: 2026-09-07

## Kontext
§32 und INV-015: Das System kann Verteilung sichtbar machen, darf aber keine Scheinpräzision
behaupten. Die zugrunde liegenden Daten (Aufwand, kognitive Last) sind subjektiv und unvollständig.

## Entscheidung
Die Balance-Auswertung liefert **Bänder** je Dimension (`deutlich mehr`, `mehr`, `ausgeglichen`)
plus ein `dataQuality`-Objekt (Abdeckung, geschätzte Felder). Das Antwortschema enthält kein
Feld `percentage`, `score` oder `rank`. Ein Contract-Test erzwingt das.

## Begründung
„Du machst 47 %, ich 53 %“ wirkt objektiv, ist es nicht, und verwandelt ein Gespräch in einen
Streit über Messmethodik. Bänder mit sichtbarer Datenqualität laden zum Gespräch ein statt zum
Rechthaben – genau das ist der Produktzweck (§32).

## Konsequenzen
+ Keine falsche Objektivität, kein Ranking (§42).
− Manche Nutzer werden konkrete Zahlen vermissen; die Erklärung dazu gehört ins UI.
