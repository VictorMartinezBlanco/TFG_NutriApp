-- Amplia el juego de datos de demostracion: seis clientes mas para el nutri de
-- prueba y dos para el segundo, con sus restricciones y su disponibilidad.
-- Aqui va solo lo que no lleva fecha; lo fechado esta en el refresh (0017).
--
-- No es seed de produccion. Los cuatro clientes originales (0004) NO se tocan:
-- son los casos anclados de los bancos de pruebas, asi que se anade alrededor.
--
-- Idempotente y NO destructivo con los planes: los clientes se insertan solo si
-- no existen ya (no hay DELETE de client, que arrastraria en cascada los planes
-- generados por el pipeline). Las restricciones de estos clientes si se borran
-- antes de reinsertar, porque no las referencia nada.
--
-- Los ids de tag, nutriente, unidad y alimento se resuelven por code o por
-- name_en. Los alimentos se buscan en ingles para no depender de las tildes.
--
-- El objetivo de cada cliente no es una columna: client no tiene campo de
-- objetivo, asi que el objetivo existe solo a traves de sus restricciones, que
-- es lo que la ficha ensena en lenguaje llano.

DO $$
DECLARE
  v_nutri1 UUID := '03f06edf-603e-489d-8aed-71bc93f97ef0';
  v_nutri2 UUID;

  v_lucia   INTEGER;
  v_david   INTEGER;
  v_sofia   INTEGER;
  v_carlos  INTEGER;
  v_nadia   INTEGER;
  v_tomas   INTEGER;
  v_tester  INTEGER;
  v_alba    INTEGER;
  v_hugo    INTEGER;

  v_tag_vegan     INTEGER;
  v_tag_milk      INTEGER;
  v_tag_eggs      INTEGER;
  v_tag_gluten    INTEGER;
  v_tag_high_gi   INTEGER;
  v_tag_high_na   INTEGER;
  v_tag_halal     INTEGER;
  v_tag_nova4     INTEGER;
  v_tag_fruit     INTEGER;
  v_tag_nuts      INTEGER;

  v_nut_iron    INTEGER;
  v_nut_sodium  INTEGER;
  v_nut_fiber   INTEGER;
  v_nut_protein INTEGER;
  v_nut_satfat  INTEGER;

  v_unit_g INTEGER;

  v_food_pork INTEGER;
  v_food_ham  INTEGER;
BEGIN
  SELECT id INTO v_nutri2 FROM nutritionist WHERE full_name = 'Dr. Second Tester';

  SELECT id INTO v_tag_vegan   FROM tag WHERE code = 'vegan';
  SELECT id INTO v_tag_milk    FROM tag WHERE code = 'milk_allergen';
  SELECT id INTO v_tag_eggs    FROM tag WHERE code = 'eggs_allergen';
  SELECT id INTO v_tag_gluten  FROM tag WHERE code = 'gluten';
  SELECT id INTO v_tag_high_gi FROM tag WHERE code = 'high_gi';
  SELECT id INTO v_tag_high_na FROM tag WHERE code = 'high_sodium';
  SELECT id INTO v_tag_halal   FROM tag WHERE code = 'halal';
  SELECT id INTO v_tag_nova4   FROM tag WHERE code = 'nova_4';
  SELECT id INTO v_tag_fruit   FROM tag WHERE code = 'fruit';
  SELECT id INTO v_tag_nuts    FROM tag WHERE code = 'tree_nuts';

  SELECT id INTO v_nut_iron    FROM nutrient WHERE code = 'iron_mg';
  SELECT id INTO v_nut_sodium  FROM nutrient WHERE code = 'sodium_mg';
  SELECT id INTO v_nut_fiber   FROM nutrient WHERE code = 'fiber_g';
  SELECT id INTO v_nut_protein FROM nutrient WHERE code = 'protein_g';
  SELECT id INTO v_nut_satfat  FROM nutrient WHERE code = 'sat_fat_g';

  SELECT id INTO v_unit_g FROM unit WHERE code = 'g';

  SELECT id INTO v_food_pork FROM food
   WHERE name_en = 'Pork loin, raw' AND deleted_at IS NULL AND nutritionist_id IS NULL;
  SELECT id INTO v_food_ham FROM food
   WHERE name_en = 'Cooked ham' AND deleted_at IS NULL AND nutritionist_id IS NULL;

  -- ===== Clientes del nutri de prueba =====
  -- Edades de 22 a 58, los cinco niveles de actividad representados y objetivos
  -- distintos. Nadia se queda a proposito sin plan (recien dada de alta).
  INSERT INTO client (nutritionist_id, full_name_pseudonym, sex, birth_date,
                      height_cm, weight_kg, activity_level)
  SELECT v_nutri1, d.name, d.sex, d.born, d.height, d.weight, d.activity
    FROM (VALUES
      ('Lucia Fernandez', 'F', DATE '1998-03-19', 162, 57, 'light'),
      ('David Romero',    'M', DATE '1979-11-04', 176, 95, 'sedentary'),
      ('Sofia Marin',     'F', DATE '1993-06-27', 168, 61, 'moderate'),
      ('Carlos Ruiz',     'M', DATE '1968-02-15', 172, 89, 'light'),
      ('Nadia Haddad',    'F', DATE '1996-09-08', 158, 54, 'active'),
      ('Tomas Alvarez',   'M', DATE '2004-05-21', 183, 72, 'very_active')
    ) AS d(name, sex, born, height, weight, activity)
   WHERE NOT EXISTS (
     SELECT 1 FROM client c
      WHERE c.nutritionist_id = v_nutri1 AND c.full_name_pseudonym = d.name
   );

  SELECT id INTO v_lucia  FROM client WHERE nutritionist_id = v_nutri1 AND full_name_pseudonym = 'Lucia Fernandez';
  SELECT id INTO v_david  FROM client WHERE nutritionist_id = v_nutri1 AND full_name_pseudonym = 'David Romero';
  SELECT id INTO v_sofia  FROM client WHERE nutritionist_id = v_nutri1 AND full_name_pseudonym = 'Sofia Marin';
  SELECT id INTO v_carlos FROM client WHERE nutritionist_id = v_nutri1 AND full_name_pseudonym = 'Carlos Ruiz';
  SELECT id INTO v_nadia  FROM client WHERE nutritionist_id = v_nutri1 AND full_name_pseudonym = 'Nadia Haddad';
  SELECT id INTO v_tomas  FROM client WHERE nutritionist_id = v_nutri1 AND full_name_pseudonym = 'Tomas Alvarez';

  -- ===== Clientes del segundo nutri =====
  -- El que ya existia se creo para probar el aislamiento y tiene el perfil a
  -- NULL, con lo que el solver cae al suelo calorico por sexo y avisa. Se le
  -- rellena para que su cartera se vea como una cartera de verdad.
  IF v_nutri2 IS NOT NULL THEN
    UPDATE client
       SET sex = 'M', birth_date = DATE '1987-01-30',
           height_cm = 178, weight_kg = 82, activity_level = 'moderate'
     WHERE nutritionist_id = v_nutri2 AND full_name_pseudonym = 'Second Tester Client';

    INSERT INTO client (nutritionist_id, full_name_pseudonym, sex, birth_date,
                        height_cm, weight_kg, activity_level)
    SELECT v_nutri2, d.name, d.sex, d.born, d.height, d.weight, d.activity
      FROM (VALUES
        ('Alba Nieto',  'F', DATE '1991-07-12', 167, 64, 'active'),
        ('Hugo Ferrer', 'M', DATE '1975-04-03', 181, 91, 'sedentary')
      ) AS d(name, sex, born, height, weight, activity)
     WHERE NOT EXISTS (
       SELECT 1 FROM client c
        WHERE c.nutritionist_id = v_nutri2 AND c.full_name_pseudonym = d.name
     );

    SELECT id INTO v_tester FROM client WHERE nutritionist_id = v_nutri2 AND full_name_pseudonym = 'Second Tester Client';
    SELECT id INTO v_alba   FROM client WHERE nutritionist_id = v_nutri2 AND full_name_pseudonym = 'Alba Nieto';
    SELECT id INTO v_hugo   FROM client WHERE nutritionist_id = v_nutri2 AND full_name_pseudonym = 'Hugo Ferrer';
  END IF;

  -- ===== Restricciones =====
  -- Arranca de cero solo para los clientes nuevos.
  DELETE FROM diet_constraint
   WHERE scope_type = 'client'
     AND scope_client_id IN (v_lucia, v_david, v_sofia, v_carlos, v_nadia, v_tomas,
                             v_tester, v_alba, v_hugo);

  -- Lucia, dieta vegana: las dos duras son la dieta misma, no una alergia, y el
  -- hierro es el nutriente que hay que vigilar cuando se quitan lacteos y huevo.
  INSERT INTO diet_constraint
    (scope_type, scope_client_id, type, target_tag_id, target_nutrient_id,
     operator, value, unit_id, priority, weight, source)
  VALUES
    ('client', v_lucia, 'forbid_tag',   v_tag_milk,  NULL,        'forbid', NULL, NULL, 'hard', 10, 'manual'),
    ('client', v_lucia, 'forbid_tag',   v_tag_eggs,  NULL,        'forbid', NULL, NULL, 'hard', 10, 'manual'),
    ('client', v_lucia, 'prefer_tag',   v_tag_vegan, NULL,        'prefer', NULL, NULL, 'soft', 6,  'manual'),
    ('client', v_lucia, 'nutrient_min', NULL,        v_nut_iron,  'min',    18,   NULL, 'soft', 6,  'manual');

  -- David, hipertension: el tope de sodio es duro porque es la indicacion
  -- clinica, y la familia de alimentos salados se desaconseja sin prohibirla.
  INSERT INTO diet_constraint
    (scope_type, scope_client_id, type, target_tag_id, target_nutrient_id,
     operator, value, unit_id, priority, weight, source)
  VALUES
    ('client', v_david, 'nutrient_max', NULL,           v_nut_sodium, 'max',    1500, NULL, 'hard', 10, 'manual'),
    ('client', v_david, 'forbid_tag',   v_tag_high_na,  NULL,         'forbid', NULL, NULL, 'soft', 5,  'manual'),
    ('client', v_david, 'kcal_target',  NULL,           NULL,         'eq',     1900, NULL, 'soft', 7,  'manual');

  -- Sofia, celiaquia: el gluten es dura sin discusion. La fibra sube porque
  -- quitar cereales con gluten la baja de rebote.
  INSERT INTO diet_constraint
    (scope_type, scope_client_id, type, target_tag_id, target_nutrient_id,
     operator, value, unit_id, priority, weight, source)
  VALUES
    ('client', v_sofia, 'forbid_tag',   v_tag_gluten, NULL,        'forbid', NULL, NULL,     'hard', 10, 'manual'),
    ('client', v_sofia, 'nutrient_min', NULL,         v_nut_fiber, 'min',    25,   v_unit_g, 'soft', 5,  'manual');

  -- Carlos, diabetes tipo 2: fuera los de indice glucemico alto y tope de una
  -- racion semanal de ultraprocesado.
  INSERT INTO diet_constraint
    (scope_type, scope_client_id, type, target_tag_id, target_nutrient_id,
     operator, value, unit_id, priority, weight, source, context)
  VALUES
    ('client', v_carlos, 'forbid_tag',  v_tag_high_gi, NULL, 'forbid', NULL, NULL, 'hard', 9, 'manual', '{}'),
    ('client', v_carlos, 'kcal_target', NULL,          NULL, 'eq',     1800, NULL, 'soft', 7, 'manual', '{}'),
    ('client', v_carlos, 'max_servings_per_period', v_tag_nova4, NULL, 'max', 1, NULL, 'hard', 6, 'manual',
     '{"window_days": 7}');

  -- Nadia, halal y sin cerdo. No va con forbid_tag: no_pork y halal son tags
  -- POSITIVOS (los lleva el alimento apto), asi que prohibirlos prohibiria
  -- precisamente lo permitido. Se prohiben los dos alimentos de cerdo del
  -- catalogo y se premia lo halal.
  INSERT INTO diet_constraint
    (scope_type, scope_client_id, type, target_food_id, target_tag_id,
     operator, value, unit_id, priority, weight, source)
  VALUES
    ('client', v_nadia, 'forbid_food', v_food_pork, NULL,        'forbid', NULL, NULL, 'hard', 10, 'manual'),
    ('client', v_nadia, 'forbid_food', v_food_ham,  NULL,        'forbid', NULL, NULL, 'hard', 10, 'manual'),
    ('client', v_nadia, 'prefer_tag',  NULL,        v_tag_halal, 'prefer', NULL, NULL, 'soft', 6,  'manual');

  -- Tomas, ganancia de masa. El objetivo de proteina se queda en 150 g: el
  -- modelo tiene un techo estructural de 2,2 g por kilo, que para sus 72 kg son
  -- 158 g, y pedir mas dejaria una desviacion imposible de cerrar.
  INSERT INTO diet_constraint
    (scope_type, scope_client_id, type, target_nutrient_id, operator, value,
     unit_id, priority, weight, source, context)
  VALUES
    ('client', v_tomas, 'macro_target', v_nut_protein, 'eq', 150, v_unit_g, 'soft', 7, 'manual', '{}'),
    ('client', v_tomas, 'kcal_target',  NULL,          'eq', 3000, NULL,    'soft', 8, 'manual', '{}'),
    ('client', v_tomas, 'meal_kcal_ratio', NULL, 'approx', NULL, NULL, 'soft', 5, 'manual',
     '{"split": {"breakfast": 20, "mid_morning": 10, "lunch": 30, "snack": 15, "dinner": 25}}');

  IF v_nutri2 IS NOT NULL THEN
    INSERT INTO diet_constraint
      (scope_type, scope_client_id, type, target_tag_id, target_nutrient_id,
       operator, value, unit_id, priority, weight, source)
    VALUES
      ('client', v_tester, 'forbid_tag',   v_tag_nuts,  NULL,         'forbid', NULL, NULL,     'hard', 10, 'manual'),
      ('client', v_alba,   'kcal_target',  NULL,        NULL,         'eq',     1700, NULL,     'soft', 7,  'manual'),
      ('client', v_alba,   'prefer_tag',   v_tag_fruit, NULL,         'prefer', NULL, NULL,     'soft', 4,  'manual'),
      ('client', v_hugo,   'nutrient_max', NULL,        v_nut_satfat, 'max',    20,   v_unit_g, 'soft', 6,  'manual');
  END IF;

  -- ===== Disponibilidad del segundo nutri =====
  -- No tenia ninguna, asi que su agenda salia vacia y un cliente suyo no habria
  -- podido pedir hora. Tres dias, de manana y de tarde. 0 = lunes.
  IF v_nutri2 IS NOT NULL THEN
    DELETE FROM availability WHERE nutritionist_id = v_nutri2;
    INSERT INTO availability (nutritionist_id, day_of_week, start_time, end_time) VALUES
      (v_nutri2, 0, '10:00', '14:00'),
      (v_nutri2, 1, '10:00', '14:00'),
      (v_nutri2, 1, '16:00', '19:00'),
      (v_nutri2, 2, '10:00', '14:00'),
      (v_nutri2, 3, '16:00', '19:00'),
      (v_nutri2, 4, '10:00', '14:00');
  END IF;

  -- Las citas y los mensajes NO se siembran aqui: llevan fecha y caducan, asi
  -- que viven enteros en 0017_seed_demo_refresh.sql, que es el unico comando
  -- previo a una demostracion. Repartirlos entre dos ficheros obligaria a
  -- mantener la misma lista dos veces.
END $$;
