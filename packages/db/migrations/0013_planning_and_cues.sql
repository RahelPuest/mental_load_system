-- 0013 – Planung: situative Anlässe und persönliche Planungsvorgaben
--
-- Zwei Dinge, die zusammengehören, weil beide erst die Todo-Ansicht möglich machen (docs/80).
--
-- ── Anlässe ──────────────────────────────────────────────────────────
-- docs/60 E1: Alle neun Regelarten knüpfen an Zeit oder an Zustand an, keine an eine
-- Situation. Für ereignisgebundene Vorsätze („wenn X, dann Y") liegt die stärkste Evidenz
-- des Feldes vor (Gollwitzer & Sheeran 2006, 94 Studien, d = 0,65). Bis hierher wurde daraus
-- eine Aufgabe mit Datum – also aus einem Vorsatz eine Frist.
--
-- **Das ist nicht die Umstandsauswahl aus Migration 0006.** Die filterte: Wer nicht meldete,
-- wo er ist, bekam falsche Ergebnisse, und niemand meldet das laufend. Ein Anlass filtert
-- nichts. Er gruppiert und formuliert; der Nutzen entsteht beim Fassen des Vorsatzes, nicht
-- daraus, dass die Anwendung die Lage errät. Deshalb gibt es hier auch kein „aktueller
-- Umstand"-Feld, das gepflegt werden müsste.
--
-- Anlässe gehören dem Haushalt, nicht der Person: „beim nächsten Einkauf" ist für alle
-- dasselbe, und wer einkauft, kann die Sachen der anderen mitnehmen. Genau dafür ist das da.
--
-- ── Planungsvorgaben ─────────────────────────────────────────────────
-- Eine Zeile je Betrachter, wie bei den Farben (0007): Eine Reihenfolge, die jemandem hilft,
-- ist keine Aussage über den Haushalt. Keine Zeile heißt „wie voreingestellt".
SET lock_timeout = '3s';

CREATE TABLE situational_cues (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  -- Die Nachhälfte des Satzes „wenn …": „beim nächsten Einkauf", „wenn ich im Auto sitze".
  label        text NOT NULL CHECK (length(btrim(label)) BETWEEN 2 AND 80),
  -- Wann trat der Anlass zuletzt ein? Wird von Hand bestätigt („Ich war einkaufen").
  -- Rein informativ: Er steuert keine Sichtbarkeit, sonst wäre es wieder ein Filter.
  last_occurred_at timestamptz,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Zwei gleich benannte Anlässe im selben Haushalt wären zwei Listen für dieselbe Situation.
CREATE UNIQUE INDEX situational_cues_uk ON situational_cues (household_id, lower(btrim(label)));
CREATE INDEX situational_cues_household_idx ON situational_cues (household_id) WHERE archived_at IS NULL;

CREATE TRIGGER situational_cues_touch
  BEFORE UPDATE ON situational_cues
  FOR EACH ROW EXECUTE FUNCTION thealotta_touch_updated_at();

-- Die Zuordnung Aufgabe → Anlass. Additiv (ADR-0014): eine nullbare Spalte, kein Umbau.
-- ON DELETE SET NULL: Wird ein Anlass entfernt, bleibt die Aufgabe. Ein Anlass ist eine
-- Formulierungshilfe, kein Besitzer.
ALTER TABLE tasks ADD COLUMN cue_id uuid REFERENCES situational_cues(id) ON DELETE SET NULL;
CREATE INDEX tasks_cue_idx ON tasks (cue_id) WHERE cue_id IS NOT NULL;

CREATE TABLE planning_preferences (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  viewer_membership_id uuid NOT NULL REFERENCES household_memberships(id) ON DELETE CASCADE,
  horizon              text NOT NULL DEFAULT 'day'
                         CHECK (horizon IN ('day','week','month')),
  strategy             text NOT NULL DEFAULT 'deadline_first'
                         CHECK (strategy IN ('deadline_first','shortest_first','one_thing',
                                             'capacity_fit','meaning_first','cue_grouped')),
  -- Alterung ist voreingestellt AN: Sie ist die Zusicherung, dass nichts verhungert,
  -- keine Geschmacksfrage. Puffer ebenso – der Planungsfehlschluss ist gut belegt.
  aging                boolean NOT NULL DEFAULT true,
  slack                boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX planning_preferences_uk ON planning_preferences (viewer_membership_id);

CREATE TRIGGER planning_preferences_touch
  BEFORE UPDATE ON planning_preferences
  FOR EACH ROW EXECUTE FUNCTION thealotta_touch_updated_at();

-- Die Policy-Schleife aus 0003 lief, bevor es diese Tabellen gab; ohne die folgenden Zeilen
-- wären sie die einzigen Tabellen mit household_id ohne Mandantentrennung, und
-- packages/db/test/rls-coverage.spec.ts würde das melden.
ALTER TABLE situational_cues ENABLE ROW LEVEL SECURITY;
ALTER TABLE situational_cues FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON situational_cues;
CREATE POLICY tenant_isolation ON situational_cues
  USING (thealotta_bypass_rls() OR household_id = ANY (thealotta_current_households()))
  WITH CHECK (thealotta_bypass_rls() OR household_id = ANY (thealotta_current_households()));

ALTER TABLE planning_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_preferences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON planning_preferences;
CREATE POLICY tenant_isolation ON planning_preferences
  USING (thealotta_bypass_rls() OR household_id = ANY (thealotta_current_households()))
  WITH CHECK (thealotta_bypass_rls() OR household_id = ANY (thealotta_current_households()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thealotta_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON situational_cues, planning_preferences TO thealotta_app';
  END IF;
  -- Der Monitor liest Anlässe, um die zehnte Regelart auswerten zu können; schreiben darf
  -- er sie nicht (INV-006 bleibt unberührt).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thealotta_monitor') THEN
    EXECUTE 'GRANT SELECT ON situational_cues, planning_preferences TO thealotta_monitor';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thealotta_notifier') THEN
    EXECUTE 'GRANT SELECT ON situational_cues, planning_preferences TO thealotta_notifier';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thealotta_sync') THEN
    EXECUTE 'GRANT SELECT ON situational_cues, planning_preferences TO thealotta_sync';
  END IF;
END $$;
