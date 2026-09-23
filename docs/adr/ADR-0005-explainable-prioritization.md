# ADR-0005 – Regelbasierte, additive Priorisierung statt Modell

**Status**: Angenommen · **Datum**: 2026-09-07

## Kontext
INV-008 verlangt eine menschenverständliche Begründung. §30 nennt 13 Einflussfaktoren.

## Entscheidung
`rank(item, context) -> { factors: ScoreFactor[] }` mit `score = Σ factor.contribution`.
Jeder Faktor hat `code`, `label`, `explanation` (fertiger deutscher Satz mit konkreten Daten)
und `contribution`. Die API liefert die Faktoren, **nicht** den Score. Kein ML im MVP.

## Begründung
Ein additives Modell ist erklärbar, testbar (Σ Faktoren = Score als Property-Test) und
nachvollziehbar änderbar. Eine Punktzahl in der UI lädt zum Vergleichen ein und widerspricht §42;
Gründe helfen bei der Entscheidung, Zahlen nicht.

## Konsequenzen
+ Jede Priorisierung ist erklärbar und debuggbar.
− Gewichte müssen von Hand justiert werden; kein Lernen aus Nutzerverhalten im MVP.
