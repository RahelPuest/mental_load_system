-- 0004 – Lebenszyklusmarker auf Signalen
--
-- Signale sind inhaltlich unveränderlich (ADR-0004): Evidenz, Zeitpunkt und Begründung werden
-- nie überschrieben. `superseded_at` und `resolved_at` sind aber Lebenszyklusmarker und müssen
-- gesetzt werden können – sonst könnte ein aufgelöstes Signal nie als erledigt gelten.
-- Spaltenweise Rechte halten die Unveränderlichkeit des Inhalts technisch aufrecht.
SET lock_timeout = '3s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_app') THEN
    EXECUTE 'GRANT UPDATE (superseded_at, resolved_at) ON signals TO mira_app';
  END IF;
END $$;
