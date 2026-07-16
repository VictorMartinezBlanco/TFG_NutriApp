-- NutriApp - anade tags de familia de alimento al catalogo de tags.
-- El seed 0002 solo trae alergenos, culturales, marcadores clinicos y
-- procesado; no habia una taxonomia por familia. red_meat ya se anadio en 0009;
-- estos completan las familias basicas para etiquetar el catalogo ampliado y
-- para futuras restricciones por familia.
--
-- No toca el enum constraint_type, asi que va en una sola transaccion (a
-- diferencia de 0009, que necesitaba ADD VALUE aparte).
--
-- Aplicar: python _apply_0010.py (con la secret key), o pegar en el SQL Editor
-- de Supabase.

INSERT INTO tag (code, name_es, name_en, kind) VALUES
  ('vegetable',      'Verdura',          'Vegetable',       'family'),
  ('fruit',          'Fruta',            'Fruit',           'family'),
  ('cereal',         'Cereal',           'Cereal',          'family'),
  ('legume',         'Legumbre',         'Legume',          'family'),
  ('dairy',          'Lacteo',           'Dairy',           'family'),
  ('protein_source', 'Fuente proteica',  'Protein source',  'family')
ON CONFLICT (code) DO NOTHING;
