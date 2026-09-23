-- 0009 – Anbindung an Bring! (Einkaufsliste)
--
-- Bring hat keine offizielle Schnittstelle für Einkaufslisten. Was es gibt, ist eine
-- zurückentwickelte API, die mehrere Gemeinschaftsprojekte benutzen. Zwei Folgen davon
-- stehen im Entwurf dieser Tabelle:
--
--   1. Gespeichert wird **nicht das Passwort**, sondern der Refresh-Token. Das Passwort wird
--      einmal eingegeben, gegen Tokens getauscht und nie abgelegt. Wer den Zugang widerrufen
--      will, ändert sein Bring-Passwort – dann verfällt der Token.
--   2. Die Verbindung führt ihren Zustand mit (`state`, `last_error_code`). Eine Schnittstelle
--      ohne Zusage kann sich ändern; dann muss das an der Verbindung sichtbar werden und
--      nicht erst daran, dass Einkäufe stumm verschwinden.
--
-- Eine Verbindung je Haushalt. Zwei wären zwei Wahrheiten darüber, wohin ein Einkauf geht.
SET lock_timeout = '3s';

CREATE TABLE bring_connections (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id           uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  -- Wer verbunden hat. Der Zugang gehört dieser Person, nicht dem Haushalt.
  membership_id          uuid NOT NULL REFERENCES household_memberships(id) ON DELETE CASCADE,
  bring_email            text NOT NULL,
  bring_user_uuid        text NOT NULL,
  -- Refresh-Token, verschlüsselt wie die Kalender-Zugangsdaten (Umschlagverfahren).
  credentials_ciphertext bytea,
  credentials_key_id     text,
  -- Ziel-Liste in Bring. Ohne sie ist die Verbindung angelegt, aber noch nicht benutzbar.
  list_uuid              text,
  list_name              text,
  state                  text NOT NULL DEFAULT 'connected'
                           CHECK (state IN ('connected','needs_reauth','error')),
  last_push_at           timestamptz,
  last_error_code        text,
  consecutive_failures   integer NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  version                integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX bring_connections_household_uk ON bring_connections (household_id);

CREATE TRIGGER bring_connections_touch
  BEFORE UPDATE ON bring_connections
  FOR EACH ROW EXECUTE FUNCTION mira_touch_updated_at();

-- Die Policy-Schleife aus 0003 lief, bevor es diese Tabelle gab.
ALTER TABLE bring_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bring_connections FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON bring_connections;
CREATE POLICY tenant_isolation ON bring_connections
  USING (mira_bypass_rls() OR household_id = ANY (mira_current_households()))
  WITH CHECK (mira_bypass_rls() OR household_id = ANY (mira_current_households()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON bring_connections TO mira_app';
  END IF;
  -- Der Zusteller darf den Zustand fortschreiben, aber keine Verbindung anlegen oder löschen.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_sync') THEN
    EXECUTE 'GRANT SELECT ON bring_connections TO mira_sync';
    EXECUTE 'GRANT UPDATE (last_push_at, last_error_code, consecutive_failures, state, updated_at) ON bring_connections TO mira_sync';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_monitor') THEN
    EXECUTE 'GRANT SELECT ON bring_connections TO mira_monitor';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_notifier') THEN
    EXECUTE 'GRANT SELECT ON bring_connections TO mira_notifier';
  END IF;
END $$;
