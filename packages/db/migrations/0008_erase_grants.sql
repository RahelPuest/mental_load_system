-- 0008 – Die Anwendung darf Belege löschen, aber weiterhin nicht ändern
--
-- `signals` und `state_observations` sind für die Anwendung anhängend: Migration 0003 nimmt
-- ihr UPDATE **und** DELETE. Der Grund ist gut – niemand soll umschreiben können, was eine
-- Regel gesehen oder eine Person gemeldet hat.
--
-- Nur verhindert dasselbe Recht auch, dass ein Haushalt seine Daten vollständig löscht: Beide
-- Tabellen hängen mit `ON DELETE RESTRICT` an Bereichen und Angaben. Ohne DELETE bleibt jeder
-- Bereich stehen, an dem je eine Regel gelaufen ist – also nach kurzer Zeit jeder.
--
-- Der Unterschied, auf den es ankommt: Einen Beleg **ändern** heißt, die Vergangenheit anders
-- darzustellen. Ihn **löschen** heißt, ihn zu beenden – zusammen mit der Sache, zu der er
-- gehört. Das eine bleibt verboten, das andere wird möglich.
--
-- UPDATE bleibt entzogen; die spalten-genaue Ausnahme aus 0004
-- (`superseded_at`, `resolved_at`) ist davon nicht berührt.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_app') THEN
    EXECUTE 'GRANT DELETE ON state_observations, signals TO mira_app';
  END IF;
END $$;
