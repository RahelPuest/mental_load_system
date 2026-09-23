-- 0007 – Farben für Personen und Bereiche, pro Betrachter
--
-- Bisher war die Farbe einer Person aus ihrer Mitglieds-ID gehasht: kein Zustand, keine
-- Migration, überall dieselbe Farbe. Das bleibt die Voreinstellung – diese Tabelle enthält
-- nur die Abweichungen davon.
--
-- Eine Farbe gilt für den Betrachter, nicht für den Haushalt: `viewer_membership_id` ist die
-- Person, die diese Ansicht eingestellt hat. Niemand verändert damit das Bild anderer.
--
-- Eine Tabelle für beide Arten von Zielen. Zwei fast gleiche Tabellen wären zwei Stellen,
-- an denen dieselbe Regel gepflegt werden müsste.
SET lock_timeout = '3s';

CREATE TABLE color_preferences (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  viewer_membership_id uuid NOT NULL REFERENCES household_memberships(id) ON DELETE CASCADE,
  subject_kind         text NOT NULL CHECK (subject_kind IN ('member','domain')),
  subject_id           uuid NOT NULL,
  tone                 text NOT NULL CHECK (tone IN (
                         'gruen','blau','violett','braun','beere','tuerkis',
                         'ocker','magenta','rost','indigo','oliv','pflaume')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Ein Betrachter hat je Ziel höchstens eine Farbe. Das Zurücksetzen auf die Voreinstellung
-- ist ein DELETE, kein Sonderwert – „keine Zeile" heißt „wie voreingestellt".
CREATE UNIQUE INDEX color_preferences_uk
  ON color_preferences (viewer_membership_id, subject_kind, subject_id);

-- Alle Farben eines Betrachters in einem Zugriff: genau die Abfrage, die jede Seite macht.
CREATE INDEX color_preferences_viewer_idx
  ON color_preferences (household_id, viewer_membership_id);

CREATE TRIGGER color_preferences_touch
  BEFORE UPDATE ON color_preferences
  FOR EACH ROW EXECUTE FUNCTION mira_touch_updated_at();

-- Die Policy-Schleife aus 0003 lief, bevor es diese Tabelle gab. Ohne die folgenden Zeilen
-- wäre sie die einzige Tabelle mit household_id ohne Mandantentrennung; der Test
-- packages/db/test/rls-coverage.spec.ts würde das melden.
ALTER TABLE color_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE color_preferences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON color_preferences;
CREATE POLICY tenant_isolation ON color_preferences
  USING (mira_bypass_rls() OR household_id = ANY (mira_current_households()))
  WITH CHECK (mira_bypass_rls() OR household_id = ANY (mira_current_households()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON color_preferences TO mira_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_monitor') THEN
    EXECUTE 'GRANT SELECT ON color_preferences TO mira_monitor';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_notifier') THEN
    EXECUTE 'GRANT SELECT ON color_preferences TO mira_notifier';
  END IF;
END $$;
