# ADR-0002 – Drizzle statt Prisma

**Status**: Angenommen · **Datum**: 2026-09-07

## Kontext
Das Datenmodell benötigt Row Level Security, partielle Unique-Indizes
(`WHERE effective_to IS NULL`), `EXCLUDE USING gist` für Vertretungszeiträume, `ltree`-Pfade,
`FOR UPDATE SKIP LOCKED` und Session-Variablen (`SET LOCAL app.household_ids`).

## Entscheidung
Drizzle ORM mit handgeschriebenen SQL-Migrationen.

## Begründung
Prisma abstrahiert genau die Features weg, die hier die Sicherheitsgarantie tragen; RLS-Kontext
per Transaktion ist umständlich, partielle Indizes und Exclusion-Constraints brauchen ohnehin
Raw-SQL-Migrationen. Drizzle liefert Typsicherheit ohne die Abstraktionsschicht und erlaubt
`sql`-Fragmente an genau den Stellen, an denen wir Postgres-Spezifika brauchen.

## Konsequenzen
+ Volle Kontrolle über SQL, RLS und Locking; Migrationen sind lesbares SQL.
− Mehr Handarbeit; kein generiertes Admin-UI.
