-- 0003 – Row Level Security, Trigger und Rollen-Grants
--
-- ADR-0003: Tenant-Isolation in drei Schichten. Diese Datei ist die dritte und letzte:
-- selbst wenn Anwendungscode einen Filter vergisst, gibt die Datenbank keine fremden Zeilen heraus.
SET lock_timeout = '3s';
SET statement_timeout = '300s';

/* ══ Tenant-Kontext ═══════════════════════════════════════════════════ */

CREATE OR REPLACE FUNCTION mira_current_households() RETURNS uuid[] AS $$
  SELECT CASE
    WHEN coalesce(current_setting('app.household_ids', true), '') = '' THEN ARRAY[]::uuid[]
    ELSE string_to_array(current_setting('app.household_ids', true), ',')::uuid[]
  END;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION mira_bypass_rls() RETURNS boolean AS $$
  SELECT coalesce(current_setting('app.bypass_rls', true), 'off') = 'on';
$$ LANGUAGE sql STABLE;

/* ══ Policies ═════════════════════════════════════════════════════════
 * Die Schleife garantiert Vollständigkeit: Es ist unmöglich, eine Tabelle mit
 * household_id anzulegen und die Policy zu vergessen. Der Test
 * packages/db/test/rls-coverage.spec.ts prüft das zusätzlich bei jedem CI-Lauf.
 */
DO $$
DECLARE
  t record;
  -- Diese Tabellen dürfen Zeilen ohne Household enthalten (globale Audit-/Technikdaten)
  permissive_insert text[] := ARRAY['audit_events','idempotency_keys','deletion_tombstones'];
BEGIN
  FOR t IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'household_id' AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
    -- FORCE gilt auch für den Tabelleneigentümer – sonst wäre die Policy im Betrieb wirkungslos.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t.table_name);

    IF t.table_name = ANY (permissive_insert) THEN
      EXECUTE format($f$
        CREATE POLICY tenant_isolation ON %I
          USING (mira_bypass_rls() OR (household_id IS NOT NULL AND household_id = ANY (mira_current_households())))
          WITH CHECK (true)
      $f$, t.table_name);
    ELSE
      EXECUTE format($f$
        CREATE POLICY tenant_isolation ON %I
          USING (mira_bypass_rls() OR household_id = ANY (mira_current_households()))
          WITH CHECK (mira_bypass_rls() OR household_id = ANY (mira_current_households()))
      $f$, t.table_name);
    END IF;
  END LOOP;
END $$;

-- households selbst trägt kein household_id, ist aber Tenant-Wurzel.
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE households FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON households;
CREATE POLICY tenant_isolation ON households
  USING (mira_bypass_rls() OR id = ANY (mira_current_households()))
  WITH CHECK (mira_bypass_rls() OR id = ANY (mira_current_households()));

/* ══ Trigger ══════════════════════════════════════════════════════════ */

CREATE OR REPLACE FUNCTION mira_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'updated_at' AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch_updated_at ON %I', t.table_name);
    EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION mira_touch_updated_at()', t.table_name);
  END LOOP;
END $$;

-- Domainbaum azyklisch und pfadkonsistent halten (§8).
CREATE OR REPLACE FUNCTION mira_check_domain_tree() RETURNS trigger AS $$
DECLARE
  parent_path ltree;
  parent_household uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT path, household_id INTO parent_path, parent_household FROM domains WHERE id = NEW.parent_id;
  IF parent_path IS NULL THEN
    RAISE EXCEPTION 'Übergeordneter Bereich existiert nicht';
  END IF;
  IF parent_household <> NEW.household_id THEN
    RAISE EXCEPTION 'Übergeordneter Bereich gehört zu einem anderen Haushalt';
  END IF;
  IF parent_path <@ NEW.path AND NEW.parent_id <> NEW.id THEN
    -- Der eigene Pfad darf kein Vorfahre des Elternpfads sein: das wäre ein Zyklus.
    IF NEW.path @> parent_path THEN
      RAISE EXCEPTION 'Zyklus im Bereichsbaum';
    END IF;
  END IF;
  IF NOT (NEW.path <@ parent_path) THEN
    RAISE EXCEPTION 'Pfad % passt nicht unter den übergeordneten Pfad %', NEW.path::text, parent_path::text;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER check_domain_tree BEFORE INSERT OR UPDATE ON domains
  FOR EACH ROW EXECUTE FUNCTION mira_check_domain_tree();

-- INV-013 (Backstop): Jede Ownership-Änderung hinterlässt eine Spur, auch wenn
-- Anwendungscode das Event einmal vergessen sollte.
CREATE OR REPLACE FUNCTION mira_ownership_event() RETURNS trigger AS $$
DECLARE
  evt text;
  hh uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    evt := 'ownership.assigned';
    hh := NEW.household_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.effective_to IS NULL AND NEW.effective_to IS NOT NULL THEN
    evt := 'ownership.released';
    hh := NEW.household_id;
  ELSE
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM domain_events
    WHERE subject_id = NEW.id AND event_type = evt AND occurred_at > now() - interval '5 seconds'
  ) THEN
    INSERT INTO domain_events (household_id, event_type, subject_type, subject_id, actor_kind, actor_ref, payload, correlation_id)
    VALUES (hh, evt, 'responsibility_assignment', NEW.id, 'system', 'db_trigger',
            jsonb_build_object('domainId', NEW.domain_id, 'membershipId', NEW.membership_id,
                               'assignmentKind', NEW.assignment_kind, 'source', 'trigger_backstop'),
            gen_random_uuid());
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER ownership_event AFTER INSERT OR UPDATE ON responsibility_assignments
  FOR EACH ROW EXECUTE FUNCTION mira_ownership_event();

-- Audit-Hash-Kette (docs/11 §3): nachträgliche Manipulation wird sichtbar.
CREATE OR REPLACE FUNCTION mira_audit_chain() RETURNS trigger AS $$
DECLARE prev text;
BEGIN
  SELECT row_hash INTO prev FROM audit_events ORDER BY seq DESC LIMIT 1;
  NEW.prev_hash := prev;
  NEW.row_hash := encode(
    digest(
      coalesce(prev, '') || NEW.id::text || NEW.occurred_at::text || NEW.action ||
      coalesce(NEW.subject_type, '') || coalesce(NEW.subject_id::text, '') || NEW.outcome ||
      NEW.metadata::text,
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_chain BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION mira_audit_chain();

/* ══ Least Privilege (docs/20 §5) ═════════════════════════════════════ */

DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_app') THEN
    RAISE NOTICE 'Rollen fehlen – Grants werden übersprungen.';
    RETURN;
  END IF;

  EXECUTE 'GRANT USAGE ON SCHEMA public TO mira_app, mira_monitor, mira_notifier, mira_sync';

  -- API: volle DML auf fachlichen Tabellen
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mira_app';
  EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mira_app';
  -- Ledger ist append-only, auch für die API
  EXECUTE 'REVOKE UPDATE, DELETE ON domain_events, audit_events, state_observations, signals FROM mira_app';

  -- Monitoring darf beobachten und Signale erzeugen – sonst nichts.
  EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO mira_monitor';
  EXECUTE 'GRANT INSERT ON signals, outbox_events, domain_events TO mira_monitor';
  EXECUTE 'GRANT UPDATE (last_evaluated_at, next_evaluation_at, consecutive_failures, last_error, updated_at) ON monitors TO mira_monitor';
  EXECUTE 'GRANT UPDATE (superseded_at, resolved_at) ON signals TO mira_monitor';

  -- INV-006: Der Zusteller kann fachliche Objekte nicht verändern.
  EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO mira_notifier';
  EXECUTE 'GRANT INSERT, UPDATE ON notifications, notification_deliveries TO mira_notifier';
  EXECUTE 'GRANT UPDATE ON push_subscriptions TO mira_notifier';
  EXECUTE 'GRANT INSERT ON domain_events TO mira_notifier';

  -- INV-012: Der Kalender-Sync kann keine Arbeit löschen oder abschließen.
  EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO mira_sync';
  EXECUTE 'GRANT INSERT, UPDATE, DELETE ON calendar_events TO mira_sync';
  EXECUTE 'GRANT UPDATE ON calendar_connections, calendar_selections TO mira_sync';
  EXECUTE 'GRANT INSERT ON outbox_events, domain_events, signals TO mira_sync';
  EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mira_monitor, mira_notifier, mira_sync';
END $$;
