-- 0001 – Erweiterungen und Datenbankrollen
-- Rollen sind der technische Träger von INV-006 und INV-012: ein Worker kann nicht schreiben,
-- was er nicht schreiben darf. Siehe docs/20-architecture.md §5.
SET lock_timeout = '3s';
SET statement_timeout = '120s';

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS ltree;      -- Domainpfade
CREATE EXTENSION IF NOT EXISTS btree_gist; -- Exclusion-Constraint auf Vertretungszeiträumen
CREATE EXTENSION IF NOT EXISTS citext;     -- E-Mail-Adressen

-- Rollen werden nur angelegt, wenn die Verbindung die Rechte dazu hat. In verwalteten
-- Umgebungen ohne CREATEROLE übernimmt das ein Betreiberskript (ops/scripts/create-roles.sql).
DO $$
BEGIN
  IF (SELECT rolcreaterole OR rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_app') THEN
      CREATE ROLE mira_app NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_monitor') THEN
      CREATE ROLE mira_monitor NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_notifier') THEN
      CREATE ROLE mira_notifier NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_sync') THEN
      CREATE ROLE mira_sync NOLOGIN;
    END IF;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Rollen konnten nicht angelegt werden – bitte ops/scripts/create-roles.sql als Superuser ausführen.';
END $$;
