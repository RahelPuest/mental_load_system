-- 0012 – Umbenennung der Datenbankobjekte: mira_* → thealotta_*
--
-- docs/64 hatte diese Namen bewusst behalten und dafür zwei Gründe genannt: Rollen umzubenennen
-- sei ein eigenes Wartungsfenster, und Funktionen umzubenennen hieße, sämtliche
-- Zeilensicherheitsregeln neu zu schreiben. Der zweite Grund trifft nicht zu, und der erste
-- ist kleiner als angenommen – nachgeprüft an einer Wegwerf-Datenbank auf PostgreSQL 16:
--
--   * Eine Regel speichert die **OID** der Funktion, nicht ihren Namen. Nach
--     ALTER FUNCTION ... RENAME steht der neue Name in USING und WITH CHECK, ohne dass
--     eine Policy angefasst wird. Für Trigger gilt dasselbe.
--   * ALTER ROLE ... RENAME nimmt Rechte und Gruppenmitgliedschaften mit.
--   * Das Passwort bleibt gültig, weil SCRAM-SHA-256 den Rollennamen nicht einbindet.
--     (Bei MD5 wäre es gelöscht worden – PostgreSQL 16 verwendet SCRAM als Vorgabe.)
--
-- Diese Migration ist additiv und mehrfach ausführbar. Der schwierige Fall ist die **zweite**
-- Datenbank im selben Cluster (Testdatenbank, CI, ein zweiter Mandant): Rollen sind
-- clusterweit, Rechte gelten pro Datenbank. Nachdem die erste Datenbank `mira_app`
-- umbenannt hat, existiert der Name nicht mehr – 0001 legt ihn beim nächsten Lauf also
-- erneut an, und 0003 vergibt die Rechte dieser Datenbank an ihn. Dann stehen beide Namen
-- da, und ein bloßes Umbenennen fiele aus: Die Rechte hingen weiter am alten Namen, während
-- die Anmelderolle im neuen Mitglied ist. Ein Rollen-Grant-Test fällt darüber, und zwar
-- zu Recht.
--
-- Deshalb werden in diesem Fall die Rechteeinträge übertragen und die alte Rolle entfernt.
-- Übertragen wird der **tatsächliche ACL-Eintrag**, nicht die Grant-Liste aus 0003 – damit
-- bleibt auch erhalten, was 0003 hinterher wieder entzogen hat (UPDATE und DELETE auf
-- domain_events, audit_events, state_observations, signals) und was nur spaltenweise
-- vergeben ist.
SET lock_timeout = '3s';
SET statement_timeout = '120s';

-- ── Rollen ────────────────────────────────────────────────────────────
DO $$
DECLARE
  paar        text[];
  gruppen     text[][] := ARRAY[
    ['mira_app',         'thealotta_app'],
    ['mira_monitor',     'thealotta_monitor'],
    ['mira_notifier',    'thealotta_notifier'],
    ['mira_sync',        'thealotta_sync'],
    ['mira_maintenance', 'thealotta_maintenance']
  ];
  anmelde     text[][] := ARRAY[
    ['mira_app_user',      'thealotta_app_user'],
    ['mira_monitor_user',  'thealotta_monitor_user'],
    ['mira_notifier_user', 'thealotta_notifier_user'],
    ['mira_sync_user',     'thealotta_sync_user']
  ];
  alt_da      boolean;
  neu_da      boolean;
  eintrag     record;
BEGIN
  IF NOT (SELECT rolcreaterole OR rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE NOTICE 'Keine Rechte zum Umbenennen von Rollen – bitte als Superuser nachziehen.';
    RETURN;
  END IF;

  -- Gruppenrollen: tragen die Tabellenrechte.
  FOREACH paar SLICE 1 IN ARRAY gruppen LOOP
    alt_da := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = paar[1]);
    neu_da := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = paar[2]);

    IF alt_da AND NOT neu_da THEN
      EXECUTE format('ALTER ROLE %I RENAME TO %I', paar[1], paar[2]);
      RAISE NOTICE 'Rolle % → % (Rechte und Mitgliedschaften wandern mit)', paar[1], paar[2];

    ELSIF alt_da AND neu_da THEN
      -- Tabellen und Sequenzen
      FOR eintrag IN
        SELECT c.relname, c.relkind, a.privilege_type
        FROM pg_class c, aclexplode(c.relacl) a
        WHERE c.relnamespace = 'public'::regnamespace
          AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = paar[1])
      LOOP
        EXECUTE format('GRANT %s ON %s public.%I TO %I',
                       eintrag.privilege_type,
                       CASE WHEN eintrag.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END,
                       eintrag.relname, paar[2]);
      END LOOP;

      -- Spaltenweise vergebene Rechte (0003 vergibt UPDATE nur auf einzelne Spalten)
      FOR eintrag IN
        SELECT c.relname, att.attname, a.privilege_type
        FROM pg_attribute att
        JOIN pg_class c ON c.oid = att.attrelid, aclexplode(att.attacl) a
        WHERE c.relnamespace = 'public'::regnamespace
          AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = paar[1])
      LOOP
        EXECUTE format('GRANT %s (%I) ON TABLE public.%I TO %I',
                       eintrag.privilege_type, eintrag.attname, eintrag.relname, paar[2]);
      END LOOP;

      -- Schemarechte
      FOR eintrag IN
        SELECT a.privilege_type
        FROM pg_namespace n, aclexplode(n.nspacl) a
        WHERE n.nspname = 'public'
          AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = paar[1])
      LOOP
        EXECUTE format('GRANT %s ON SCHEMA public TO %I', eintrag.privilege_type, paar[2]);
      END LOOP;

      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', paar[1]);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', paar[1]);
      EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %I', paar[1]);
      EXECUTE format('DROP ROLE %I', paar[1]);
      RAISE NOTICE 'Rechte von % nach % übertragen, alte Rolle entfernt', paar[1], paar[2];

    ELSIF NOT alt_da AND NOT neu_da AND paar[2] <> 'thealotta_maintenance' THEN
      -- Frische Datenbank ohne CREATEROLE in 0001: die Gruppenrolle fehlt ganz.
      EXECUTE format('CREATE ROLE %I NOLOGIN', paar[2]);
      RAISE NOTICE 'Gruppenrolle % angelegt', paar[2];
    END IF;
  END LOOP;

  -- Anmelderollen: tragen keine Tabellenrechte, nur Mitgliedschaft und CONNECT.
  FOREACH paar SLICE 1 IN ARRAY anmelde LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = paar[1])
       AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = paar[2]) THEN
      EXECUTE format('ALTER ROLE %I RENAME TO %I', paar[1], paar[2]);
      RAISE NOTICE 'Anmelderolle % → % (Passwort bleibt gültig, SCRAM bindet den Namen nicht ein)', paar[1], paar[2];
    END IF;
  END LOOP;

  -- Mitgliedschaft sicherstellen: Die Anmelderollen legt das initdb-Skript an, bevor es die
  -- Gruppenrollen gibt – ohne IN ROLE. Hier bekommen sie ihre Gruppe.
  FOREACH paar SLICE 1 IN ARRAY ARRAY[
    ['thealotta_app_user',      'thealotta_app'],
    ['thealotta_monitor_user',  'thealotta_monitor'],
    ['thealotta_notifier_user', 'thealotta_notifier'],
    ['thealotta_sync_user',     'thealotta_sync']
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = paar[1])
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = paar[2]) THEN
      EXECUTE format('GRANT %I TO %I', paar[2], paar[1]);
    END IF;
  END LOOP;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Rollen konnten nicht umbenannt werden – bitte als Superuser nachziehen.';
END $$;

-- ── Funktionen ────────────────────────────────────────────────────────
-- Regeln und Trigger folgen über die OID; es wird keine Policy angefasst.
DO $$
DECLARE
  paar   text[];
  paare  text[][] := ARRAY[
    ['mira_bypass_rls',         'thealotta_bypass_rls'],
    ['mira_current_households', 'thealotta_current_households'],
    ['mira_touch_updated_at',   'thealotta_touch_updated_at'],
    ['mira_check_domain_tree',  'thealotta_check_domain_tree'],
    ['mira_ownership_event',    'thealotta_ownership_event'],
    ['mira_audit_chain',        'thealotta_audit_chain']
  ];
BEGIN
  FOREACH paar SLICE 1 IN ARRAY paare LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = paar[1] AND n.nspname = 'public' AND p.pronargs = 0
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = paar[2] AND n.nspname = 'public' AND p.pronargs = 0
    ) THEN
      EXECUTE format('ALTER FUNCTION public.%I() RENAME TO %I', paar[1], paar[2]);
      RAISE NOTICE 'Funktion %() → %()', paar[1], paar[2];
    END IF;
  END LOOP;
END $$;

-- Nachweis in derselben Transaktion: Wenn eine Regel noch den alten Namen nennt, ist die
-- Umbenennung unvollständig und die Migration soll scheitern, nicht stillschweigend gelten.
DO $$
DECLARE
  rest int;
BEGIN
  SELECT count(*) INTO rest
  FROM pg_policy
  WHERE pg_get_expr(polqual, polrelid) LIKE '%mira_%'
     OR coalesce(pg_get_expr(polwithcheck, polrelid), '') LIKE '%mira_%';
  IF rest > 0 THEN
    RAISE EXCEPTION 'Nach der Umbenennung nennen noch % Regeln einen mira_-Namen', rest;
  END IF;

  SELECT count(*) INTO rest
  FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE NOT t.tgisinternal AND p.proname LIKE 'mira_%';
  IF rest > 0 THEN
    RAISE EXCEPTION 'Nach der Umbenennung hängen noch % Trigger an einer mira_-Funktion', rest;
  END IF;

  -- Und der Nachweis, dass die Rechte mitgekommen sind. Ohne diese Prüfung wäre der
  -- Kollisionsfall (beide Namen vorhanden) stillschweigend durchgegangen: umbenannt ja,
  -- aber die Rechte am alten Namen – die Anwendung hätte auf keine Tabelle mehr gedurft.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thealotta_app')
     AND NOT has_table_privilege('thealotta_app', 'tasks', 'SELECT') THEN
    RAISE EXCEPTION 'thealotta_app hat kein SELECT auf tasks – die Rechteübertragung ist fehlgeschlagen';
  END IF;
END $$;
