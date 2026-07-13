-- NutriApp - anade el tipo no_repeat_tag al vocabulario de restricciones.
-- Es el unico tipo nuevo del catalogo cerrado del solver respecto al enum de
-- 0001. Tambien anade el tag de familia red_meat, que el catalogo no tenia y
-- que los limites de frecuencia y no repeticion por familia necesitan.
--
-- ALTER TYPE ... ADD VALUE no convive con el uso del nuevo valor en la misma
-- transaccion, asi que el script de aplicacion corre este fichero por partes:
-- primero el ADD VALUE en autocommit, luego el resto. Los marcadores --@split
-- delimitan los tramos.
--
-- Aplicar: python _apply_0009.py (con la secret key), o pegar por tramos en
-- el SQL Editor de Supabase.

ALTER TYPE constraint_type ADD VALUE IF NOT EXISTS 'no_repeat_tag';

--@split

INSERT INTO tag (code, name_es, name_en, kind) VALUES
  ('red_meat', 'Carne roja', 'Red meat', 'family')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE diet_constraint DROP CONSTRAINT chk_constraint_target;

ALTER TABLE diet_constraint ADD CONSTRAINT chk_constraint_target CHECK (
  CASE type
    WHEN 'forbid_food'    THEN target_food_id IS NOT NULL
    WHEN 'prefer_food'    THEN target_food_id IS NOT NULL
    WHEN 'no_repeat_food' THEN target_food_id IS NOT NULL
    WHEN 'forbid_tag'     THEN target_tag_id IS NOT NULL
    WHEN 'prefer_tag'     THEN target_tag_id IS NOT NULL
    WHEN 'no_repeat_tag'  THEN target_tag_id IS NOT NULL
    WHEN 'nutrient_min'   THEN target_nutrient_id IS NOT NULL
    WHEN 'nutrient_max'   THEN target_nutrient_id IS NOT NULL
    WHEN 'nutrient_ratio' THEN target_nutrient_id IS NOT NULL
    ELSE TRUE
  END
);
