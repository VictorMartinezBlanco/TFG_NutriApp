-- NutriApp - datos iniciales de los catálogos.
-- 12 nutrientes, 20 tags, 6 tipos de comida, 7 unidades.
-- Los alimentos se cargan aparte más adelante.
-- ON CONFLICT para poder relanzarlo sin duplicar.

INSERT INTO nutrient (code, name_es, name_en, unit_default, kind, tier, is_computed) VALUES
  ('energy_kcal',  'Energía',              'Energy',        'kcal', 'energy',     1, FALSE),
  ('protein_g',    'Proteínas',            'Protein',       'g',    'macro',      1, FALSE),
  ('carb_g',       'Hidratos de carbono',  'Carbohydrates', 'g',    'macro',      1, FALSE),
  ('fat_g',        'Grasas',               'Fat',           'g',    'macro',      1, FALSE),
  ('sat_fat_g',    'Grasas saturadas',     'Saturated fat', 'g',    'fatty_acid', 1, FALSE),
  ('fiber_g',      'Fibra',                'Fiber',         'g',    'macro',      1, FALSE),
  ('sodium_mg',    'Sodio',                'Sodium',        'mg',   'mineral',    1, FALSE),
  ('sugar_added_g','Azúcares añadidos',    'Added sugars',  'g',    'macro',      1, FALSE),
  ('iron_mg',      'Hierro',               'Iron',          'mg',   'mineral',    1, FALSE),
  ('calcium_mg',   'Calcio',               'Calcium',       'mg',   'mineral',    1, FALSE),
  ('vit_d_ug',     'Vitamina D',           'Vitamin D',     'ug',   'vitamin',    1, FALSE),
  ('vit_b12_ug',   'Vitamina B12',         'Vitamin B12',   'ug',   'vitamin',    1, FALSE)
ON CONFLICT (code) DO NOTHING;

-- 10 alérgenos/intolerancias + 4 culturales + 6 marcadores clínicos.
INSERT INTO tag (code, name_es, name_en, kind) VALUES
  ('gluten',            'Gluten',                  'Gluten',            'allergen'),
  ('milk_allergen',     'Leche',                   'Milk',              'allergen'),
  ('lactose',           'Lactosa',                 'Lactose',           'intolerance'),
  ('eggs_allergen',     'Huevo',                   'Eggs',              'allergen'),
  ('fish_allergen',     'Pescado',                 'Fish',              'allergen'),
  ('crustaceans',       'Crustáceos',              'Crustaceans',       'allergen'),
  ('mollusks_allergen', 'Moluscos',                'Mollusks',          'allergen'),
  ('tree_nuts',         'Frutos de cáscara',       'Tree nuts',         'allergen'),
  ('peanuts',           'Cacahuetes',              'Peanuts',           'allergen'),
  ('soy',               'Soja',                    'Soy',               'allergen'),
  ('vegetarian',        'Vegetariano',             'Vegetarian',        'cultural'),
  ('vegan',             'Vegano',                  'Vegan',             'cultural'),
  ('halal',             'Halal',                   'Halal',             'cultural'),
  ('no_pork',           'Sin cerdo',               'No pork',           'cultural'),
  ('high_sodium',       'Alto en sodio',           'High sodium',       'clinical_marker'),
  ('high_potassium',    'Alto en potasio',         'High potassium',    'clinical_marker'),
  ('high_phosphorus',   'Alto en fósforo',         'High phosphorus',   'clinical_marker'),
  ('high_gi',           'Índice glucémico alto',   'High glycemic index','clinical_marker'),
  ('nova_4',            'Ultraprocesado (NOVA 4)', 'Ultra-processed (NOVA 4)', 'processing'),
  ('fodmap_high',       'Alto en FODMAP',          'High FODMAP',       'intolerance')
ON CONFLICT (code) DO NOTHING;

INSERT INTO meal_type (code, name_es, name_en, default_order) VALUES
  ('breakfast',    'Desayuno',     'Breakfast',      1),
  ('mid_morning',  'Media mañana', 'Mid-morning',    2),
  ('lunch',        'Comida',       'Lunch',          3),
  ('snack',        'Merienda',     'Afternoon snack',4),
  ('dinner',       'Cena',         'Dinner',         5),
  ('late_snack',   'Recena',       'Late snack',     6)
ON CONFLICT (code) DO NOTHING;

INSERT INTO unit (code, name_es, name_en, system) VALUES
  ('g',           'Gramo',       'Gram',        'metric'),
  ('ml',          'Mililitro',   'Milliliter',  'metric'),
  ('serving',     'Ración',      'Serving',     'household'),
  ('piece',       'Pieza',       'Piece',       'household'),
  ('tablespoon',  'Cucharada',   'Tablespoon',  'household'),
  ('glass',       'Vaso',        'Glass',       'household'),
  ('teaspoon',    'Cucharadita', 'Teaspoon',    'household')
ON CONFLICT (code) DO NOTHING;
