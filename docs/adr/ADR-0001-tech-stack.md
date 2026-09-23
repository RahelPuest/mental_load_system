# ADR-0001 – TypeScript-Monorepo als Technologiebasis

**Status**: Angenommen · **Datum**: 2026-09-07

## Kontext
Das System braucht eine API, Hintergrundverarbeitung, eine installierbare mobile Oberfläche mit Push
und ein reichhaltiges, invariantenbehaftetes Domänenmodell. Die Fachlogik (Autorisierung,
Priorisierung, Zustandsautomaten) muss zwischen Server und Client konsistent sein.

## Entscheidung
pnpm-Monorepo, TypeScript strict überall. Fastify 5 (API), BullMQ/Redis (Jobs), PostgreSQL 16 +
Drizzle ORM, React 19 + Vite (PWA), Zod als einzige Quelle für Validierung und Typen.

## Begründung
- Eine Sprache über API, Worker und Client vermeidet doppelte Typ- und Validierungsdefinitionen –
  bei ~40 Entitäten der größte Konsistenzhebel.
- Zod-Schemas erzeugen zugleich Laufzeitvalidierung, TypeScript-Typen und OpenAPI.
- Drizzle bleibt nah an SQL. Das ist bei RLS, partiellen Unique-Indizes, `ltree` und
  Exclusion-Constraints entscheidend – ein abstrahierendes ORM würde hier im Weg stehen.
- PWA mit Web Push deckt die Anforderung „Push auf Mobilgeräten“ ohne App-Store-Zyklus.

## Konsequenzen
+ Geteilte Contracts, schnelle Iteration, ein Toolchain-Satz.
− iOS-Push nur als installierte PWA (dokumentiert, Q-12).
− Node ist bei CPU-lastiger Auswertung schwächer als JVM/Go; die Monitoring-Auswertung ist
  I/O-dominiert, daher unkritisch.

## Verworfene Alternativen
**Django + HTMX** – stark bei Admin/Permissions, schwach bei Offline-Capture und Push.
**FastAPI + React** – zwei Sprachen, doppelte Schemadefinition.
