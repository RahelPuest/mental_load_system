-- 0005 – Konfliktmarker auf Beobachtungen
--
-- `state_observations` ist inhaltlich append-only: Wert, Zeitpunkt, Herkunft und die Person
-- dahinter werden nie überschrieben. `conflict_state` ist dagegen ein Lebenszyklusmarker –
-- ohne ihn könnte ein geklärter Widerspruch nie als geklärt gelten (§10).
SET lock_timeout = '3s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_app') THEN
    EXECUTE 'GRANT UPDATE (conflict_state) ON state_observations TO mira_app';
  END IF;
END $$;
