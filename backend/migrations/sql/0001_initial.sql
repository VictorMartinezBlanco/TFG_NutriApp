-- NutriApp - esquema inicial (v0)
-- 16 tablas. Motor de planes = CP-SAT (OR-Tools), el LLM solo traduce
-- el texto del nutri a filas de diet_constraint. Por eso no hay pgvector.
--
-- Aplicar en Supabase: SQL Editor -> pegar entero -> Run.
-- Para reaplicar desde cero, descomentar el bloque DROP del final.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===== Tipos enum =====

CREATE TYPE tag_kind AS ENUM (
  'family', 'allergen', 'intolerance', 'cultural', 'clinical_marker',
  'processing', 'functional', 'cooking_method', 'seasonal_sustain'
);

CREATE TYPE food_source AS ENUM ('usda', 'bedca', 'off', 'custom');

CREATE TYPE constraint_scope AS ENUM ('client', 'nutritionist');

-- Los 15 tipos de restricción que soporta v0.
CREATE TYPE constraint_type AS ENUM (
  'kcal_target', 'macro_target', 'nutrient_min', 'nutrient_max',
  'forbid_food', 'prefer_food', 'forbid_tag', 'prefer_tag',
  'meals_per_day', 'plan_duration_days', 'meal_kcal_ratio',
  'max_servings_per_period', 'no_repeat_food', 'nutrient_ratio',
  'forbid_combination'
);

CREATE TYPE constraint_operator AS ENUM (
  'eq', 'min', 'max', 'in_range', 'forbid', 'prefer', 'approx'
);

-- hard = restricción del modelo; soft = penalización con peso en el objetivo.
CREATE TYPE constraint_priority AS ENUM ('hard', 'soft');

CREATE TYPE constraint_source AS ENUM ('manual', 'llm', 'derived');

-- ===== Catálogos =====

CREATE TABLE nutrient (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name_es       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  unit_default  TEXT NOT NULL,
  kind          TEXT NOT NULL
                  CHECK (kind IN ('energy','macro','mineral','vitamin','fatty_acid','other')),
  tier          SMALLINT NOT NULL DEFAULT 1 CHECK (tier IN (1, 2, 3)),
  is_computed   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE tag (
  id             SERIAL PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  name_es        TEXT NOT NULL,
  name_en        TEXT NOT NULL,
  kind           tag_kind NOT NULL,
  parent_tag_id  INTEGER REFERENCES tag(id)
);
CREATE INDEX idx_tag_parent ON tag(parent_tag_id);
CREATE INDEX idx_tag_kind   ON tag(kind);

CREATE TABLE meal_type (
  id             SERIAL PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  name_es        TEXT NOT NULL,
  name_en        TEXT NOT NULL,
  default_order  SMALLINT NOT NULL
);

CREATE TABLE unit (
  id       SERIAL PRIMARY KEY,
  code     TEXT NOT NULL UNIQUE,
  name_es  TEXT NOT NULL,
  name_en  TEXT NOT NULL,
  system   TEXT NOT NULL CHECK (system IN ('metric', 'household'))
);

-- ===== Personas =====

-- El id del nutricionista es el mismo que el de Supabase Auth.
CREATE TABLE nutritionist (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  license_number  TEXT,
  locale_default  TEXT NOT NULL DEFAULT 'es' CHECK (locale_default IN ('es', 'en')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE client (
  id                  SERIAL PRIMARY KEY,
  nutritionist_id     UUID NOT NULL REFERENCES nutritionist(id) ON DELETE CASCADE,
  full_name_pseudonym TEXT NOT NULL,
  sex                 CHAR(1) CHECK (sex IN ('M', 'F', 'X')),
  birth_date          DATE,
  height_cm           NUMERIC(5,2) CHECK (height_cm IS NULL OR height_cm > 0),
  weight_kg           NUMERIC(5,2) CHECK (weight_kg IS NULL OR weight_kg > 0),
  activity_level      TEXT CHECK (activity_level IS NULL OR activity_level IN
                        ('sedentary','light','moderate','active','very_active')),
  locale_preferred    TEXT DEFAULT 'es' CHECK (locale_preferred IN ('es','en')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX idx_client_nutri ON client(nutritionist_id) WHERE deleted_at IS NULL;

-- ===== Alimentos y recetas =====

-- nutritionist_id NULL = alimento del catálogo global; con valor = custom del nutri.
CREATE TABLE food (
  id                SERIAL PRIMARY KEY,
  name_es           TEXT NOT NULL,
  name_en           TEXT NOT NULL,
  source            food_source NOT NULL DEFAULT 'custom',
  source_id         TEXT,
  typical_serving_g NUMERIC(7,2) CHECK (typical_serving_g IS NULL OR typical_serving_g > 0),
  density_g_ml      NUMERIC(6,3) CHECK (density_g_ml IS NULL OR density_g_ml > 0),
  nutritionist_id   UUID REFERENCES nutritionist(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX idx_food_nutri  ON food(nutritionist_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_food_source ON food(source, source_id);

-- Composición nutricional, valores siempre por 100 g.
CREATE TABLE food_nutrient (
  food_id        INTEGER NOT NULL REFERENCES food(id) ON DELETE CASCADE,
  nutrient_id    INTEGER NOT NULL REFERENCES nutrient(id) ON DELETE RESTRICT,
  value_per_100g NUMERIC(12,4) NOT NULL CHECK (value_per_100g >= 0),
  PRIMARY KEY (food_id, nutrient_id)
);
CREATE INDEX idx_fn_nutrient ON food_nutrient(nutrient_id);

CREATE TABLE food_tag (
  food_id INTEGER NOT NULL REFERENCES food(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (food_id, tag_id)
);
CREATE INDEX idx_ft_tag ON food_tag(tag_id);

CREATE TABLE recipe (
  id              SERIAL PRIMARY KEY,
  name_es         TEXT NOT NULL,
  name_en         TEXT NOT NULL,
  yield_g         NUMERIC(8,2) CHECK (yield_g IS NULL OR yield_g > 0),
  servings        SMALLINT CHECK (servings IS NULL OR servings > 0),
  nutritionist_id UUID NOT NULL REFERENCES nutritionist(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_recipe_nutri ON recipe(nutritionist_id) WHERE deleted_at IS NULL;

CREATE TABLE recipe_ingredient (
  recipe_id      INTEGER NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
  food_id        INTEGER NOT NULL REFERENCES food(id) ON DELETE RESTRICT,
  quantity_g     NUMERIC(8,2) NOT NULL CHECK (quantity_g > 0),
  cooking_method TEXT,
  PRIMARY KEY (recipe_id, food_id)
);

-- Mapea ids de fuentes externas (BEDCA/USDA/OFF) a nuestro food.
CREATE TABLE external_food_mapping (
  id                SERIAL PRIMARY KEY,
  source            food_source NOT NULL,
  external_id       TEXT NOT NULL,
  food_id_canonical INTEGER NOT NULL REFERENCES food(id) ON DELETE CASCADE,
  confidence        NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  UNIQUE (source, external_id)
);
CREATE INDEX idx_efm_food ON external_food_mapping(food_id_canonical);

-- ===== Restricciones (el núcleo) =====

-- "constraint" es palabra reservada, así que la tabla se llama diet_constraint.
-- El dueño puede ser un cliente (int) o un nutri (uuid), por eso hay dos
-- columnas de scope y un CHECK que obliga a rellenar la que corresponde.
CREATE TABLE diet_constraint (
  id                    SERIAL PRIMARY KEY,
  scope_type            constraint_scope NOT NULL,
  scope_client_id       INTEGER REFERENCES client(id) ON DELETE CASCADE,
  scope_nutritionist_id UUID    REFERENCES nutritionist(id) ON DELETE CASCADE,
  type                  constraint_type NOT NULL,
  target_food_id        INTEGER REFERENCES food(id) ON DELETE CASCADE,
  target_tag_id         INTEGER REFERENCES tag(id) ON DELETE CASCADE,
  target_nutrient_id    INTEGER REFERENCES nutrient(id) ON DELETE CASCADE,
  operator              constraint_operator,
  value                 NUMERIC,
  value2                NUMERIC,
  unit_id               INTEGER REFERENCES unit(id),
  context               JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority              constraint_priority NOT NULL,
  weight                SMALLINT NOT NULL DEFAULT 5 CHECK (weight BETWEEN 1 AND 10),
  source                constraint_source NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ,

  CONSTRAINT chk_constraint_scope CHECK (
    (scope_type = 'client'       AND scope_client_id IS NOT NULL AND scope_nutritionist_id IS NULL)
    OR
    (scope_type = 'nutritionist' AND scope_nutritionist_id IS NOT NULL AND scope_client_id IS NULL)
  ),

  -- Cada familia de tipos usa su target correspondiente.
  CONSTRAINT chk_constraint_target CHECK (
    CASE type
      WHEN 'forbid_food'    THEN target_food_id IS NOT NULL
      WHEN 'prefer_food'    THEN target_food_id IS NOT NULL
      WHEN 'no_repeat_food' THEN target_food_id IS NOT NULL
      WHEN 'forbid_tag'     THEN target_tag_id IS NOT NULL
      WHEN 'prefer_tag'     THEN target_tag_id IS NOT NULL
      WHEN 'nutrient_min'   THEN target_nutrient_id IS NOT NULL
      WHEN 'nutrient_max'   THEN target_nutrient_id IS NOT NULL
      WHEN 'nutrient_ratio' THEN target_nutrient_id IS NOT NULL
      ELSE TRUE
    END
  ),
  CONSTRAINT chk_constraint_range CHECK (
    (operator = 'in_range' AND value IS NOT NULL AND value2 IS NOT NULL)
    OR operator IS DISTINCT FROM 'in_range'
  )
);
CREATE INDEX idx_constraint_scope_client ON diet_constraint(scope_client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_constraint_scope_nutri  ON diet_constraint(scope_nutritionist_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_constraint_type         ON diet_constraint(type) WHERE deleted_at IS NULL;

-- Evita meter dos veces la misma restricción activa.
-- Uso md5(context) porque un jsonb no entra bien en un índice único normal.
CREATE UNIQUE INDEX uq_constraint_dedup ON diet_constraint (
  scope_type,
  COALESCE(scope_client_id, 0),
  COALESCE(scope_nutritionist_id, '00000000-0000-0000-0000-000000000000'::uuid),
  type,
  COALESCE(target_food_id, 0),
  COALESCE(target_tag_id, 0),
  COALESCE(target_nutrient_id, 0),
  md5(context::text)
) WHERE deleted_at IS NULL;

-- ===== Plan =====

CREATE TABLE plan (
  id              SERIAL PRIMARY KEY,
  nutritionist_id UUID NOT NULL REFERENCES nutritionist(id) ON DELETE CASCADE,
  client_id       INTEGER NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  start_date      DATE NOT NULL,
  duration_days   SMALLINT NOT NULL CHECK (duration_days BETWEEN 1 AND 90),
  approved_at     TIMESTAMPTZ,
  signed_by       UUID REFERENCES nutritionist(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_plan_nutri  ON plan(nutritionist_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_plan_client ON plan(client_id) WHERE deleted_at IS NULL;

CREATE TABLE plan_meal_item (
  id               SERIAL PRIMARY KEY,
  plan_id          INTEGER NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  day_num          SMALLINT NOT NULL CHECK (day_num >= 1),
  meal_type_id     INTEGER NOT NULL REFERENCES meal_type(id) ON DELETE RESTRICT,
  item_order       SMALLINT NOT NULL DEFAULT 1,
  food_id          INTEGER REFERENCES food(id) ON DELETE RESTRICT,
  recipe_id        INTEGER REFERENCES recipe(id) ON DELETE RESTRICT,
  quantity_g       NUMERIC(8,2) CHECK (quantity_g IS NULL OR quantity_g > 0),
  description_free TEXT,

  -- Un item es o un food, o una recipe, o texto libre (plan flexible). Solo uno.
  CONSTRAINT chk_item_exclusive CHECK (
    (food_id IS NOT NULL)::int
    + (recipe_id IS NOT NULL)::int
    + (description_free IS NOT NULL)::int = 1
  ),
  CONSTRAINT chk_item_quantity CHECK (
    (description_free IS NOT NULL AND quantity_g IS NULL)
    OR (description_free IS NULL AND quantity_g IS NOT NULL)
  )
);
CREATE INDEX idx_pmi_plan ON plan_meal_item(plan_id);

-- ===== Traza de las traducciones del LLM =====
-- Guardo coste, tokens y latencia para las métricas de la evaluación.
CREATE TABLE llm_translation (
  id                 SERIAL PRIMARY KEY,
  plan_id            INTEGER REFERENCES plan(id) ON DELETE SET NULL,
  input_text         TEXT NOT NULL,
  output_constraints JSONB NOT NULL DEFAULT '[]'::jsonb,
  model              TEXT NOT NULL,
  tokens_input       INTEGER CHECK (tokens_input IS NULL OR tokens_input >= 0),
  tokens_output      INTEGER CHECK (tokens_output IS NULL OR tokens_output >= 0),
  cost_eur           NUMERIC(10,5) CHECK (cost_eur IS NULL OR cost_eur >= 0),
  latency_ms         INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  created_by         UUID REFERENCES nutritionist(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_llmt_plan ON llm_translation(plan_id);

-- ===== updated_at automático =====

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_nutritionist_updated BEFORE UPDATE ON nutritionist
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_client_updated BEFORE UPDATE ON client
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_food_updated BEFORE UPDATE ON food
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_recipe_updated BEFORE UPDATE ON recipe
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_constraint_updated BEFORE UPDATE ON diet_constraint
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_plan_updated BEFORE UPDATE ON plan
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===== Row Level Security =====
-- Cada nutri solo ve lo suyo (filtrado por auth.uid()). Los catálogos son
-- de lectura para cualquier usuario logueado. El backend usa la service key,
-- que se salta la RLS.

ALTER TABLE nutrient  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag       ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit      ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_nutrient_read  ON nutrient  FOR SELECT TO authenticated USING (true);
CREATE POLICY p_tag_read       ON tag       FOR SELECT TO authenticated USING (true);
CREATE POLICY p_mealtype_read  ON meal_type FOR SELECT TO authenticated USING (true);
CREATE POLICY p_unit_read      ON unit      FOR SELECT TO authenticated USING (true);

ALTER TABLE nutritionist ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_nutri_self ON nutritionist
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

ALTER TABLE client ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_client_owner ON client
  FOR ALL TO authenticated
  USING (nutritionist_id = auth.uid())
  WITH CHECK (nutritionist_id = auth.uid());

ALTER TABLE food ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_food_read ON food
  FOR SELECT TO authenticated
  USING (nutritionist_id IS NULL OR nutritionist_id = auth.uid());
CREATE POLICY p_food_write ON food
  FOR INSERT TO authenticated
  WITH CHECK (nutritionist_id = auth.uid());
CREATE POLICY p_food_update ON food
  FOR UPDATE TO authenticated
  USING (nutritionist_id = auth.uid())
  WITH CHECK (nutritionist_id = auth.uid());
CREATE POLICY p_food_delete ON food
  FOR DELETE TO authenticated
  USING (nutritionist_id = auth.uid());

ALTER TABLE food_nutrient ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_fn_read ON food_nutrient
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM food f WHERE f.id = food_nutrient.food_id
      AND (f.nutritionist_id IS NULL OR f.nutritionist_id = auth.uid())
  ));
CREATE POLICY p_fn_write ON food_nutrient
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM food f WHERE f.id = food_nutrient.food_id AND f.nutritionist_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM food f WHERE f.id = food_nutrient.food_id AND f.nutritionist_id = auth.uid()
  ));

ALTER TABLE food_tag ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_ftag_read ON food_tag
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM food f WHERE f.id = food_tag.food_id
      AND (f.nutritionist_id IS NULL OR f.nutritionist_id = auth.uid())
  ));
CREATE POLICY p_ftag_write ON food_tag
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM food f WHERE f.id = food_tag.food_id AND f.nutritionist_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM food f WHERE f.id = food_tag.food_id AND f.nutritionist_id = auth.uid()
  ));

ALTER TABLE recipe ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_recipe_owner ON recipe
  FOR ALL TO authenticated
  USING (nutritionist_id = auth.uid())
  WITH CHECK (nutritionist_id = auth.uid());

ALTER TABLE recipe_ingredient ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_ri_owner ON recipe_ingredient
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM recipe r WHERE r.id = recipe_ingredient.recipe_id AND r.nutritionist_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM recipe r WHERE r.id = recipe_ingredient.recipe_id AND r.nutritionist_id = auth.uid()
  ));

ALTER TABLE external_food_mapping ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_efm_read ON external_food_mapping
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM food f WHERE f.id = external_food_mapping.food_id_canonical
      AND (f.nutritionist_id IS NULL OR f.nutritionist_id = auth.uid())
  ));

ALTER TABLE diet_constraint ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_constraint_owner ON diet_constraint
  FOR ALL TO authenticated
  USING (
    (scope_type = 'client' AND EXISTS (
      SELECT 1 FROM client c
      WHERE c.id = diet_constraint.scope_client_id AND c.nutritionist_id = auth.uid()
    ))
    OR
    (scope_type = 'nutritionist' AND scope_nutritionist_id = auth.uid())
  )
  WITH CHECK (
    (scope_type = 'client' AND EXISTS (
      SELECT 1 FROM client c
      WHERE c.id = diet_constraint.scope_client_id AND c.nutritionist_id = auth.uid()
    ))
    OR
    (scope_type = 'nutritionist' AND scope_nutritionist_id = auth.uid())
  );

ALTER TABLE plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_plan_owner ON plan
  FOR ALL TO authenticated
  USING (nutritionist_id = auth.uid())
  WITH CHECK (nutritionist_id = auth.uid());

ALTER TABLE plan_meal_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_pmi_owner ON plan_meal_item
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM plan p WHERE p.id = plan_meal_item.plan_id AND p.nutritionist_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM plan p WHERE p.id = plan_meal_item.plan_id AND p.nutritionist_id = auth.uid()
  ));

ALTER TABLE llm_translation ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_llmt_owner ON llm_translation
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Para reaplicar desde cero, descomentar:
-- DROP TABLE IF EXISTS llm_translation, plan_meal_item, plan, diet_constraint,
--   external_food_mapping, recipe_ingredient, recipe, food_tag, food_nutrient,
--   food, client, nutritionist, unit, meal_type, tag, nutrient CASCADE;
-- DROP FUNCTION IF EXISTS set_updated_at CASCADE;
-- DROP TYPE IF EXISTS constraint_source, constraint_priority, constraint_operator,
--   constraint_type, constraint_scope, food_source, tag_kind CASCADE;
