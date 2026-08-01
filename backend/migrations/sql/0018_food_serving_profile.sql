-- Perfil de racion por alimento y vocabulario de plausibilidad (Bloque 8e).
--
-- La auditoria de la fase 0 midio que el 66% de los items de los planes
-- generados esta pegado a los limites globales del solver (10 g / 300 g):
-- el modelo no sabe que una racion razonable depende del alimento. Este
-- fichero anade la infraestructura de la capa de sentido comun:
--
--   1. tres columnas de perfil en food: minimo y maximo de gramos por
--      aparicion, y gramos por unidad para los alimentos que se sirven por
--      piezas (NULL si van por gramos). Sustituyen a los globales, que quedan
--      como fallback para alimentos sin perfil. Son datos intrinsecos del
--      alimento, como density_g_ml, por eso son columnas y no tabla aparte.
--   2. tags de rol (kind functional): condiment (exige acompanamiento y tope
--      diario) y sweet (maximo uno por comida, junto con la familia fruit).
--   3. tags de momento del dia (kind nuevo meal_moment), uno por franja de
--      meal_type con el codigo moment_<code>. Semantica de lista blanca: un
--      alimento con tags de momento solo puede aparecer en esas franjas; sin
--      tags de momento, en todas.
--
-- Las cantidades del perfil se refieren al estado en que el catalogo describe
-- el alimento (crudo/seco), igual que sus nutrientes por 100 g.
--
-- ADD VALUE no puede convivir con el uso del valor en la misma transaccion:
-- el marcador de corte separa las dos partes, como en la 0009. Ojo: escribir
-- el marcador literal en un comentario rompe el split (corta por la mencion).

ALTER TYPE tag_kind ADD VALUE IF NOT EXISTS 'meal_moment';

--@split

ALTER TABLE food
  ADD COLUMN IF NOT EXISTS min_serving_g  NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS max_serving_g  NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS grams_per_unit NUMERIC(7,2);

ALTER TABLE food DROP CONSTRAINT IF EXISTS chk_food_serving_profile;
ALTER TABLE food ADD CONSTRAINT chk_food_serving_profile CHECK (
  (min_serving_g IS NULL OR min_serving_g > 0)
  AND (max_serving_g IS NULL OR max_serving_g > 0)
  AND (grams_per_unit IS NULL OR grams_per_unit > 0)
  AND (min_serving_g IS NULL OR max_serving_g IS NULL
       OR min_serving_g <= max_serving_g)
);

INSERT INTO tag (code, name_es, name_en, kind) VALUES
  ('condiment', 'Condimento', 'Condiment', 'functional'),
  ('sweet', 'Dulce', 'Sweet', 'functional'),
  ('moment_breakfast',   'Franja de desayuno',     'Breakfast slot',       'meal_moment'),
  ('moment_mid_morning', 'Franja de media manana', 'Mid-morning slot',     'meal_moment'),
  ('moment_lunch',       'Franja de comida',       'Lunch slot',           'meal_moment'),
  ('moment_snack',       'Franja de merienda',     'Afternoon snack slot', 'meal_moment'),
  ('moment_dinner',      'Franja de cena',         'Dinner slot',          'meal_moment'),
  ('moment_late_snack',  'Franja de recena',       'Late snack slot',      'meal_moment')
ON CONFLICT (code) DO NOTHING;
