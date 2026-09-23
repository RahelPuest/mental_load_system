# ADR-0008 – Autonomiestufen im Typsystem

**Status**: Angenommen · **Datum**: 2026-09-07

## Kontext
§6 unterscheidet, was das System automatisch darf, was nur nach Regel und was nie.
Eine reine Dokumentation dieser Grenze verwässert mit der Zeit.

## Entscheidung
`AutonomyLevel = A0 | A1 | A2 | A3`. Jede Service-Operation ist annotiert. Operationen der Stufe A3
akzeptieren ausschließlich `ActorContext { kind: 'user' }`; ein System-Actor führt zu
`403 requires_human_actor`. A2 erfordert zusätzlich eine aktivierte `AutomationRule` mit
menschlichem `created_by`.

## Begründung
§47 stellt Ownership-Klarheit und Nachvollziehbarkeit über Automatisierung. Diese Priorität ist
nur haltbar, wenn sie im Code erzwungen wird und nicht von Aufmerksamkeit abhängt.

## Konsequenzen
+ „Das System ändert nie still den Owner“ ist eine testbare Eigenschaft (`autonomy.spec.ts`
  enumeriert alle A3-Operationen).
− Etwas mehr Zeremonie bei jedem neuen Service.
