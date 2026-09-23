# ADR-0004 – Signal, AttentionItem und Need als getrennte Konzepte

**Status**: Angenommen · **Datum**: 2026-09-07

## Kontext
§4 fordert eine Schicht zwischen Beobachtung und Handlung, damit nicht jedes beobachtete Risiko
sofort eine Aufgabe erzeugt.

## Entscheidung
Drei Objekte mit unterschiedlicher Natur:
- **Signal** – unveränderliche maschinelle Beobachtung mit `dedupe_key`. Append-only, keine
  Nutzeraktionen.
- **AttentionItem** – menschlich triagierbare Einheit, bündelt 1..n Signale je `(domain, kind)`,
  besitzt den vollen Lifecycle.
- **Need** – ein fortbestehendes unerfülltes Bedürfnis, das unabhängig vom auslösenden Signal
  weiterlebt („Kind A braucht passende Schuhe“).

## Begründung
Die Trennung von Evidenz (unveränderlich, dedupliziert) und Triage (veränderlich, menschlich) ist
die Voraussetzung sowohl für Idempotenz als auch dafür, dass zehn stale States eine Zeile statt
zehn erzeugen. `Need` verhindert, dass ein Bedürfnis verschwindet, nur weil sein Signal
aufgelöst wurde.

## Konsequenzen
+ Idempotentes Monitoring, aggregierte Darstellung, INV-001 strukturell erfüllt.
− Drei Tabellen statt einer; die UI muss die Begriffe verbergen (Risiko P6).
