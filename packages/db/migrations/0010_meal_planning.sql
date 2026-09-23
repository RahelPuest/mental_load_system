-- 0010 – Essensplanung (docs/63)
--
-- Ein fachliches Objekt, nicht zwei: **Gericht**. Es gibt kein „Rezept" daneben. Ein Rezept
-- ist nichts anderes als ein Gericht, über das man mehr weiß – Zutaten, Zeiten, Schritte.
-- Zwei Objekte hießen: Beim Anlegen entscheiden müssen, welches von beidem man gerade meint,
-- und später zwei Orte pflegen. Deshalb ist alles außer dem Namen NULL-bar.
--
-- Die Nutzungsgeschichte ist kein eigener Zähler. Wann ein Gericht zuletzt dran war und wie
-- oft, steht in `meal_plan_entries` – abgefragt, nicht gepflegt. Ein Zähler daneben wäre eine
-- zweite Wahrheit, die irgendwann von der ersten abweicht, und §48 verbietet ausdrücklich,
-- dass Nutzungsdaten von Hand gepflegt werden müssen.
--
-- Wochentage werden wie überall sonst in diesem Produkt gezählt: 0 = Sonntag bis 6 = Samstag,
-- dieselbe Zählung wie in den Wiederholungsregeln (`packages/contracts/src/recurrence.ts`).
SET lock_timeout = '3s';

-- ══ Das Gericht ═════════════════════════════════════════════════════
CREATE TABLE dishes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  -- Das Einzige, was ein Gericht braucht (§50).
  name                text NOT NULL CHECK (length(btrim(name)) > 0),
  description         text,
  -- Rezeptangaben. Alle optional, alle Teil desselben Gerichts (§2, §51).
  servings            integer CHECK (servings IS NULL OR servings > 0),
  prep_minutes        integer CHECK (prep_minutes IS NULL OR prep_minutes >= 0),
  cook_minutes        integer CHECK (cook_minutes IS NULL OR cook_minutes >= 0),
  steps               text,
  notes               text,
  source_url          text,
  image_url           text,
  -- §29: bleibt in der Sammlung, taucht nur in Vorschlägen nicht mehr auf.
  excluded_from_suggestions boolean NOT NULL DEFAULT false,
  -- Weggeräumt, nicht gelöscht: Die Vergangenheit im Plan bleibt erklärbar.
  archived_at         timestamptz,
  created_by          uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  version             integer NOT NULL DEFAULT 1
);

-- Ein Name je Haushalt, ohne Rücksicht auf Groß- und Kleinschreibung.
--
-- „Haben wir das schon?" ist eine der Fragen, die dieser Bereich abnehmen soll (§42). Eine
-- Sammlung mit „Chili", „chili" und „Chili sin Carne" beantwortet sie schlechter als eine
-- Fehlermeldung beim zweiten Anlegen.
CREATE UNIQUE INDEX dishes_name_uk ON dishes (household_id, lower(btrim(name)));
CREATE INDEX dishes_household_idx ON dishes (household_id) WHERE archived_at IS NULL;

CREATE TRIGGER dishes_touch
  BEFORE UPDATE ON dishes
  FOR EACH ROW EXECUTE FUNCTION mira_touch_updated_at();

-- ══ Tags ════════════════════════════════════════════════════════════
-- Freier Text, kein geschlossenes Vokabular (§5). Vorschläge stehen in den Contracts und
-- sind ein Angebot; eine Liste zum Abarbeiten wäre die Verwaltungsbelastung aus §6.
CREATE TABLE dish_tags (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  dish_id      uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  tag          text NOT NULL CHECK (length(btrim(tag)) > 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dish_tags_uk ON dish_tags (dish_id, lower(btrim(tag)));
CREATE INDEX dish_tags_lookup_idx ON dish_tags (household_id, lower(btrim(tag)));

-- ══ Zutaten ═════════════════════════════════════════════════════════
-- Gehören dauerhaft zum Gericht (§33) und sind die Grundlage der Einkaufsliste (§3).
-- Menge und Einheit dürfen fehlen: „Parmesan" ist eine gültige Zutat.
CREATE TABLE dish_ingredients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  dish_id      uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  position     integer NOT NULL DEFAULT 0,
  name         text NOT NULL CHECK (length(btrim(name)) > 0),
  quantity     numeric(10,3) CHECK (quantity IS NULL OR quantity > 0),
  unit         text,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dish_ingredients_dish_idx ON dish_ingredients (dish_id, position);

-- ══ Wer mag was ═════════════════════════════════════════════════════
-- Je Person, nicht je Haushalt (§10). „Die Familie mag das" ist eine Ableitung aus diesen
-- Zeilen und keine eigene Angabe – sonst gäbe es zwei Wahrheiten, die auseinanderlaufen.
CREATE TABLE dish_preferences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  dish_id       uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES household_memberships(id) ON DELETE CASCADE,
  rating        text NOT NULL CHECK (rating IN ('love','like','neutral','rather_not')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dish_preferences_uk ON dish_preferences (dish_id, membership_id);

CREATE TRIGGER dish_preferences_touch
  BEFORE UPDATE ON dish_preferences
  FOR EACH ROW EXECUTE FUNCTION mira_touch_updated_at();

-- ══ Der Plan ════════════════════════════════════════════════════════
-- Ein Gericht je Tag und Mahlzeit. Zwei wären ein Menü, und ein Menü ist keine Entscheidung
-- mehr, sondern eine zweite.
--
-- Diese Tabelle ist zugleich die Historie (§47): Vergangene Zeilen bleiben stehen. Daraus
-- beantwortet das System „wann gab es das zuletzt?" und „wie oft essen wir das?", ohne dass
-- irgendwer etwas nachpflegt (§48).
CREATE TABLE meal_plan_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  on_date           date NOT NULL,
  slot              text NOT NULL CHECK (slot IN ('lunch','dinner')),
  dish_id           uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  -- Abweichende Personenzahl für diese eine Mahlzeit (§34).
  servings          integer CHECK (servings IS NULL OR servings > 0),
  note              text,
  -- §43: Ein gesperrter Slot wird auch von „ganze Woche neu planen" nicht angefasst.
  locked            boolean NOT NULL DEFAULT false,
  source            text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','suggested')),
  -- §25: Warum das hier steht – in Worten, nicht als Punktzahl.
  suggestion_reason text,
  created_by        uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX meal_plan_entries_slot_uk ON meal_plan_entries (household_id, on_date, slot);
-- Die Abfrage, die jede Empfehlung braucht: Wann war dieses Gericht zuletzt dran?
CREATE INDEX meal_plan_entries_dish_idx ON meal_plan_entries (household_id, dish_id, on_date DESC);
CREATE INDEX meal_plan_entries_date_idx ON meal_plan_entries (household_id, on_date);

CREATE TRIGGER meal_plan_entries_touch
  BEFORE UPDATE ON meal_plan_entries
  FOR EACH ROW EXECUTE FUNCTION mira_touch_updated_at();

-- ══ Einstellungen des Haushalts ═════════════════════════════════════
-- An welchen Tagen es überhaupt ein Mittagessen zu planen gibt (§12). Voreinstellung:
-- Samstag und Sonntag – unter der Woche essen die meisten auswärts. Ein leerer Slot an fünf
-- Tagen wäre die häufigste Zeile des Plans und immer leer.
CREATE TABLE meal_settings (
  household_id     uuid PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
  lunch_weekdays   integer[] NOT NULL DEFAULT '{0,6}',
  default_servings integer NOT NULL DEFAULT 4 CHECK (default_servings > 0),
  suggestion_mode  text NOT NULL DEFAULT 'balanced'
                     CHECK (suggestion_mode IN ('balanced','variety','favourites','quick','surprise')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  version          integer NOT NULL DEFAULT 1
);

CREATE TRIGGER meal_settings_touch
  BEFORE UPDATE ON meal_settings
  FOR EACH ROW EXECUTE FUNCTION mira_touch_updated_at();

-- Regeln je Wochentag (§21). Optional, und ausdrücklich nicht verpflichtend: Sie verschieben
-- Vorschläge, sie verbieten nichts von Hand Gesetztes.
CREATE TABLE meal_day_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  weekday       integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  slot          text CHECK (slot IS NULL OR slot IN ('lunch','dinner')),
  max_minutes   integer CHECK (max_minutes IS NULL OR max_minutes > 0),
  require_tags  text[] NOT NULL DEFAULT '{}',
  exclude_tags  text[] NOT NULL DEFAULT '{}',
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- `slot IS NULL` heißt „beide Mahlzeiten". Zwei Regeln für denselben Tag und Slot wären zwei
-- Antworten auf dieselbe Frage.
CREATE UNIQUE INDEX meal_day_rules_uk ON meal_day_rules (household_id, weekday, COALESCE(slot, '*'));

CREATE TRIGGER meal_day_rules_touch
  BEFORE UPDATE ON meal_day_rules
  FOR EACH ROW EXECUTE FUNCTION mira_touch_updated_at();

-- ══ Einkaufsliste ═══════════════════════════════════════════════════
-- Eine Liste je Woche. Erneutes Erzeugen ergänzt dieselbe Liste, statt eine zweite anzulegen –
-- zwei Listen für eine Woche wären zwei Wahrheiten darüber, was noch fehlt.
CREATE TABLE shopping_lists (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  week_start   date NOT NULL,
  created_by   uuid REFERENCES household_memberships(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX shopping_lists_week_uk ON shopping_lists (household_id, week_start);

CREATE TRIGGER shopping_lists_touch
  BEFORE UPDATE ON shopping_lists
  FOR EACH ROW EXECUTE FUNCTION mira_touch_updated_at();

CREATE TABLE shopping_list_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  list_id       uuid NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  position      integer NOT NULL DEFAULT 0,
  name          text NOT NULL CHECK (length(btrim(name)) > 0),
  quantity      numeric(10,3) CHECK (quantity IS NULL OR quantity > 0),
  unit          text,
  note          text,
  -- Abgehakt und „haben wir schon" sind zweierlei: Das eine ist gekauft, das andere war da.
  checked_at    timestamptz,
  have_at_home  boolean NOT NULL DEFAULT false,
  origin        text NOT NULL DEFAULT 'dish' CHECK (origin IN ('dish','manual')),
  -- Von Hand angefasst. Ab dann rührt das Neuerzeugen die Zeile nicht mehr an (§36).
  edited_at     timestamptz,
  pushed_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       integer NOT NULL DEFAULT 1
);
CREATE INDEX shopping_list_items_list_idx ON shopping_list_items (list_id, position);

CREATE TRIGGER shopping_list_items_touch
  BEFORE UPDATE ON shopping_list_items
  FOR EACH ROW EXECUTE FUNCTION mira_touch_updated_at();

-- ══ Mandantentrennung ═══════════════════════════════════════════════
-- Die Policy-Schleife aus 0003 lief, bevor es diese Tabellen gab.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dishes','dish_tags','dish_ingredients','dish_preferences',
    'meal_plan_entries','meal_settings','meal_day_rules',
    'shopping_lists','shopping_list_items'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (mira_bypass_rls() OR household_id = ANY (mira_current_households())) '
      || 'WITH CHECK (mira_bypass_rls() OR household_id = ANY (mira_current_households()))',
      t
    );
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO mira_app', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_monitor') THEN
      EXECUTE format('GRANT SELECT ON %I TO mira_monitor', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_notifier') THEN
      EXECUTE format('GRANT SELECT ON %I TO mira_notifier', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mira_sync') THEN
      EXECUTE format('GRANT SELECT ON %I TO mira_sync', t);
    END IF;
  END LOOP;
END $$;
