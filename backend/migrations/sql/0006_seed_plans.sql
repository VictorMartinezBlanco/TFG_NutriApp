-- Planes de demostracion para los clientes del nutri de prueba, con sus comidas.
-- El 0004 ya creaba los tres planes pero vacios; aqui se reemplazan por planes
-- con plan_meal_item, para que la lista y la ficha tengan algo que mostrar.
-- No es seed de produccion. Reaplicable: borra los planes del nutri (el cascade
-- se lleva sus items) antes de reinsertar.
--
-- Depende de 0002 (catalogos: meal_type), 0004 (clientes demo) y de los
-- alimentos del catalogo global (cargados aparte por el seed de Python).
-- meal_type por code, food por name_es, cliente por nombre; sin ids hardcodeados.
--
-- Se siembran los 7 dias completos de cada plan para ver la semana entera.

DO $$
DECLARE
  v_nutri UUID := '03f06edf-603e-489d-8aed-71bc93f97ef0';
  v_maria   INTEGER;
  v_john    INTEGER;
  v_emma    INTEGER;

  -- meal_types
  v_breakfast   INTEGER;
  v_mid_morning INTEGER;
  v_lunch       INTEGER;
  v_snack       INTEGER;
  v_dinner      INTEGER;

  -- alimentos del catalogo (por name_es)
  v_pollo     INTEGER;
  v_salmon    INTEGER;
  v_huevo     INTEGER;
  v_yogur     INTEGER;
  v_arroz     INTEGER;
  v_pan       INTEGER;
  v_avena     INTEGER;
  v_pasta     INTEGER;
  v_lentejas  INTEGER;
  v_garbanzos INTEGER;
  v_aceite    INTEGER;
  v_almendras INTEGER;
  v_tomate    INTEGER;
  v_brocoli   INTEGER;
  v_espinacas INTEGER;
  v_patata    INTEGER;
  v_manzana   INTEGER;
  v_platano   INTEGER;
  v_atun      INTEGER;
  v_tofu      INTEGER;

  v_plan INTEGER;
BEGIN
  SELECT id INTO v_maria FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'Maria Gonzalez';
  SELECT id INTO v_john  FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'John Smith';
  SELECT id INTO v_emma  FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'Emma Wilson';

  SELECT id INTO v_breakfast   FROM meal_type WHERE code = 'breakfast';
  SELECT id INTO v_mid_morning FROM meal_type WHERE code = 'mid_morning';
  SELECT id INTO v_lunch       FROM meal_type WHERE code = 'lunch';
  SELECT id INTO v_snack       FROM meal_type WHERE code = 'snack';
  SELECT id INTO v_dinner      FROM meal_type WHERE code = 'dinner';

  SELECT id INTO v_pollo     FROM food WHERE name_es = 'Pechuga de pollo, cruda'        AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_salmon    FROM food WHERE name_es = 'Salmón, crudo'                  AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_huevo     FROM food WHERE name_es = 'Huevo de gallina, entero'       AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_yogur     FROM food WHERE name_es = 'Yogur natural'                  AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_arroz     FROM food WHERE name_es = 'Arroz blanco, crudo'            AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_pan       FROM food WHERE name_es = 'Pan blanco de trigo'            AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_avena     FROM food WHERE name_es = 'Copos de avena'                 AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_pasta     FROM food WHERE name_es = 'Pasta de trigo, cruda'          AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_lentejas  FROM food WHERE name_es = 'Lentejas, secas'                AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_garbanzos FROM food WHERE name_es = 'Garbanzos, secos'              AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_aceite    FROM food WHERE name_es = 'Aceite de oliva virgen extra'   AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_almendras FROM food WHERE name_es = 'Almendras, crudas'              AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_tomate    FROM food WHERE name_es = 'Tomate, crudo'                  AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_brocoli   FROM food WHERE name_es = 'Brócoli, crudo'                 AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_espinacas FROM food WHERE name_es = 'Espinacas, crudas'              AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_patata    FROM food WHERE name_es = 'Patata, cruda'                  AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_manzana   FROM food WHERE name_es = 'Manzana, cruda'                 AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_platano   FROM food WHERE name_es = 'Plátano, crudo'                 AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_atun      FROM food WHERE name_es = 'Atún en conserva al natural'    AND nutritionist_id IS NULL AND deleted_at IS NULL;
  SELECT id INTO v_tofu      FROM food WHERE name_es = 'Tofu firme'                     AND nutritionist_id IS NULL AND deleted_at IS NULL;

  -- arranca de cero para este nutri (el cascade borra los plan_meal_item)
  DELETE FROM plan WHERE nutritionist_id = v_nutri;

  -- ===== Maria: vegetariano ~1500 kcal, firmado =====
  INSERT INTO plan (nutritionist_id, client_id, start_date, duration_days, approved_at, signed_by)
  VALUES (v_nutri, v_maria, CURRENT_DATE - 14, 7, now() - INTERVAL '13 days', v_nutri)
  RETURNING id INTO v_plan;

  INSERT INTO plan_meal_item (plan_id, day_num, meal_type_id, item_order, food_id, quantity_g) VALUES
    -- dia 1
    (v_plan, 1, v_breakfast,   1, v_avena,    40),
    (v_plan, 1, v_breakfast,   2, v_yogur,    125),
    (v_plan, 1, v_mid_morning, 1, v_manzana,  150),
    (v_plan, 1, v_lunch,       1, v_lentejas, 80),
    (v_plan, 1, v_lunch,       2, v_arroz,    60),
    (v_plan, 1, v_lunch,       3, v_aceite,   10),
    (v_plan, 1, v_snack,       1, v_almendras,30),
    (v_plan, 1, v_dinner,      1, v_tofu,     120),
    (v_plan, 1, v_dinner,      2, v_brocoli,  150),
    -- dia 2
    (v_plan, 2, v_breakfast,   1, v_avena,    40),
    (v_plan, 2, v_breakfast,   2, v_platano,  120),
    (v_plan, 2, v_mid_morning, 1, v_yogur,    125),
    (v_plan, 2, v_lunch,       1, v_garbanzos,80),
    (v_plan, 2, v_lunch,       2, v_espinacas,100),
    (v_plan, 2, v_lunch,       3, v_aceite,   10),
    (v_plan, 2, v_snack,       1, v_manzana,  150),
    (v_plan, 2, v_dinner,      1, v_huevo,    120),
    (v_plan, 2, v_dinner,      2, v_tomate,   120),
    -- dia 3
    (v_plan, 3, v_breakfast,   1, v_pan,      50),
    (v_plan, 3, v_breakfast,   2, v_yogur,    125),
    (v_plan, 3, v_mid_morning, 1, v_almendras,30),
    (v_plan, 3, v_lunch,       1, v_pasta,    75),
    (v_plan, 3, v_lunch,       2, v_tomate,   120),
    (v_plan, 3, v_lunch,       3, v_aceite,   10),
    (v_plan, 3, v_snack,       1, v_platano,  120),
    (v_plan, 3, v_dinner,      1, v_tofu,     120),
    (v_plan, 3, v_dinner,      2, v_espinacas,100),
    -- dia 4
    (v_plan, 4, v_breakfast,   1, v_avena,    40),
    (v_plan, 4, v_breakfast,   2, v_yogur,    125),
    (v_plan, 4, v_mid_morning, 1, v_platano,  120),
    (v_plan, 4, v_lunch,       1, v_lentejas, 80),
    (v_plan, 4, v_lunch,       2, v_patata,   180),
    (v_plan, 4, v_lunch,       3, v_aceite,   10),
    (v_plan, 4, v_snack,       1, v_almendras,30),
    (v_plan, 4, v_dinner,      1, v_huevo,    120),
    (v_plan, 4, v_dinner,      2, v_brocoli,  150),
    -- dia 5
    (v_plan, 5, v_breakfast,   1, v_pan,      50),
    (v_plan, 5, v_breakfast,   2, v_manzana,  150),
    (v_plan, 5, v_mid_morning, 1, v_yogur,    125),
    (v_plan, 5, v_lunch,       1, v_garbanzos,80),
    (v_plan, 5, v_lunch,       2, v_arroz,    60),
    (v_plan, 5, v_lunch,       3, v_tomate,   120),
    (v_plan, 5, v_snack,       1, v_manzana,  150),
    (v_plan, 5, v_dinner,      1, v_tofu,     120),
    (v_plan, 5, v_dinner,      2, v_espinacas,100),
    -- dia 6
    (v_plan, 6, v_breakfast,   1, v_avena,    40),
    (v_plan, 6, v_breakfast,   2, v_platano,  120),
    (v_plan, 6, v_mid_morning, 1, v_almendras,30),
    (v_plan, 6, v_lunch,       1, v_pasta,    75),
    (v_plan, 6, v_lunch,       2, v_espinacas,100),
    (v_plan, 6, v_lunch,       3, v_aceite,   10),
    (v_plan, 6, v_snack,       1, v_yogur,    125),
    (v_plan, 6, v_dinner,      1, v_huevo,    120),
    (v_plan, 6, v_dinner,      2, v_tomate,   120),
    -- dia 7
    (v_plan, 7, v_breakfast,   1, v_pan,      50),
    (v_plan, 7, v_breakfast,   2, v_yogur,    125),
    (v_plan, 7, v_mid_morning, 1, v_manzana,  150),
    (v_plan, 7, v_lunch,       1, v_lentejas, 80),
    (v_plan, 7, v_lunch,       2, v_arroz,    60),
    (v_plan, 7, v_lunch,       3, v_brocoli,  150),
    (v_plan, 7, v_snack,       1, v_almendras,30),
    (v_plan, 7, v_dinner,      1, v_tofu,     120),
    (v_plan, 7, v_dinner,      2, v_tomate,   120);

  -- ===== John: alto en proteina, sin cacahuetes, firmado =====
  INSERT INTO plan (nutritionist_id, client_id, start_date, duration_days, approved_at, signed_by)
  VALUES (v_nutri, v_john, CURRENT_DATE - 3, 7, now() - INTERVAL '2 days', v_nutri)
  RETURNING id INTO v_plan;

  INSERT INTO plan_meal_item (plan_id, day_num, meal_type_id, item_order, food_id, quantity_g) VALUES
    -- dia 1
    (v_plan, 1, v_breakfast,   1, v_huevo,    180),
    (v_plan, 1, v_breakfast,   2, v_pan,      50),
    (v_plan, 1, v_mid_morning, 1, v_yogur,    125),
    (v_plan, 1, v_lunch,       1, v_pollo,    180),
    (v_plan, 1, v_lunch,       2, v_arroz,    80),
    (v_plan, 1, v_lunch,       3, v_brocoli,  150),
    (v_plan, 1, v_snack,       1, v_almendras,30),
    (v_plan, 1, v_dinner,      1, v_salmon,   150),
    (v_plan, 1, v_dinner,      2, v_patata,   180),
    -- dia 2
    (v_plan, 2, v_breakfast,   1, v_avena,    60),
    (v_plan, 2, v_breakfast,   2, v_platano,  120),
    (v_plan, 2, v_mid_morning, 1, v_atun,     80),
    (v_plan, 2, v_lunch,       1, v_pollo,    180),
    (v_plan, 2, v_lunch,       2, v_pasta,    80),
    (v_plan, 2, v_lunch,       3, v_espinacas,100),
    (v_plan, 2, v_snack,       1, v_yogur,    125),
    (v_plan, 2, v_dinner,      1, v_tofu,     150),
    (v_plan, 2, v_dinner,      2, v_tomate,   120),
    -- dia 3
    (v_plan, 3, v_breakfast,   1, v_huevo,    120),
    (v_plan, 3, v_breakfast,   2, v_avena,    40),
    (v_plan, 3, v_mid_morning, 1, v_almendras,30),
    (v_plan, 3, v_lunch,       1, v_salmon,   150),
    (v_plan, 3, v_lunch,       2, v_arroz,    80),
    (v_plan, 3, v_lunch,       3, v_brocoli,  150),
    (v_plan, 3, v_snack,       1, v_manzana,  150),
    (v_plan, 3, v_dinner,      1, v_pollo,    150),
    (v_plan, 3, v_dinner,      2, v_patata,   180),
    -- dia 4
    (v_plan, 4, v_breakfast,   1, v_huevo,    180),
    (v_plan, 4, v_breakfast,   2, v_avena,    40),
    (v_plan, 4, v_mid_morning, 1, v_yogur,    125),
    (v_plan, 4, v_lunch,       1, v_pollo,    180),
    (v_plan, 4, v_lunch,       2, v_pasta,    80),
    (v_plan, 4, v_lunch,       3, v_brocoli,  150),
    (v_plan, 4, v_snack,       1, v_atun,     80),
    (v_plan, 4, v_dinner,      1, v_tofu,     150),
    (v_plan, 4, v_dinner,      2, v_patata,   180),
    -- dia 5
    (v_plan, 5, v_breakfast,   1, v_huevo,    120),
    (v_plan, 5, v_breakfast,   2, v_pan,      50),
    (v_plan, 5, v_mid_morning, 1, v_almendras,30),
    (v_plan, 5, v_lunch,       1, v_salmon,   150),
    (v_plan, 5, v_lunch,       2, v_arroz,    80),
    (v_plan, 5, v_lunch,       3, v_espinacas,100),
    (v_plan, 5, v_snack,       1, v_yogur,    125),
    (v_plan, 5, v_dinner,      1, v_pollo,    150),
    (v_plan, 5, v_dinner,      2, v_tomate,   120),
    -- dia 6
    (v_plan, 6, v_breakfast,   1, v_avena,    60),
    (v_plan, 6, v_breakfast,   2, v_platano,  120),
    (v_plan, 6, v_mid_morning, 1, v_atun,     80),
    (v_plan, 6, v_lunch,       1, v_pollo,    180),
    (v_plan, 6, v_lunch,       2, v_patata,   180),
    (v_plan, 6, v_lunch,       3, v_brocoli,  150),
    (v_plan, 6, v_snack,       1, v_almendras,30),
    (v_plan, 6, v_dinner,      1, v_salmon,   150),
    (v_plan, 6, v_dinner,      2, v_espinacas,100),
    -- dia 7
    (v_plan, 7, v_breakfast,   1, v_huevo,    180),
    (v_plan, 7, v_breakfast,   2, v_pan,      50),
    (v_plan, 7, v_mid_morning, 1, v_yogur,    125),
    (v_plan, 7, v_lunch,       1, v_pollo,    180),
    (v_plan, 7, v_lunch,       2, v_arroz,    80),
    (v_plan, 7, v_lunch,       3, v_tomate,   120),
    (v_plan, 7, v_snack,       1, v_manzana,  150),
    (v_plan, 7, v_dinner,      1, v_tofu,     150),
    (v_plan, 7, v_dinner,      2, v_patata,   180);

  -- ===== Emma: sin lactosa, sodio bajo, borrador (sin firmar) =====
  -- se evitan queso, atun y pan (high_sodium) y los lacteos.
  INSERT INTO plan (nutritionist_id, client_id, start_date, duration_days, approved_at, signed_by)
  VALUES (v_nutri, v_emma, CURRENT_DATE, 7, NULL, NULL)
  RETURNING id INTO v_plan;

  INSERT INTO plan_meal_item (plan_id, day_num, meal_type_id, item_order, food_id, quantity_g) VALUES
    -- dia 1
    (v_plan, 1, v_breakfast,   1, v_avena,    40),
    (v_plan, 1, v_breakfast,   2, v_manzana,  150),
    (v_plan, 1, v_mid_morning, 1, v_almendras,30),
    (v_plan, 1, v_lunch,       1, v_pollo,    150),
    (v_plan, 1, v_lunch,       2, v_arroz,    70),
    (v_plan, 1, v_lunch,       3, v_espinacas,100),
    (v_plan, 1, v_snack,       1, v_platano,  120),
    (v_plan, 1, v_dinner,      1, v_salmon,   125),
    (v_plan, 1, v_dinner,      2, v_brocoli,  150),
    -- dia 2
    (v_plan, 2, v_breakfast,   1, v_avena,    40),
    (v_plan, 2, v_breakfast,   2, v_platano,  120),
    (v_plan, 2, v_mid_morning, 1, v_manzana,  150),
    (v_plan, 2, v_lunch,       1, v_lentejas, 80),
    (v_plan, 2, v_lunch,       2, v_tomate,   120),
    (v_plan, 2, v_lunch,       3, v_aceite,   10),
    (v_plan, 2, v_snack,       1, v_almendras,30),
    (v_plan, 2, v_dinner,      1, v_huevo,    120),
    (v_plan, 2, v_dinner,      2, v_patata,   180),
    -- dia 3
    (v_plan, 3, v_breakfast,   1, v_avena,    40),
    (v_plan, 3, v_breakfast,   2, v_manzana,  150),
    (v_plan, 3, v_mid_morning, 1, v_platano,  120),
    (v_plan, 3, v_lunch,       1, v_tofu,     150),
    (v_plan, 3, v_lunch,       2, v_garbanzos,80),
    (v_plan, 3, v_lunch,       3, v_espinacas,100),
    (v_plan, 3, v_snack,       1, v_almendras,30),
    (v_plan, 3, v_dinner,      1, v_pollo,    150),
    (v_plan, 3, v_dinner,      2, v_brocoli,  150),
    -- dia 4
    (v_plan, 4, v_breakfast,   1, v_avena,    40),
    (v_plan, 4, v_breakfast,   2, v_platano,  120),
    (v_plan, 4, v_mid_morning, 1, v_almendras,30),
    (v_plan, 4, v_lunch,       1, v_salmon,   125),
    (v_plan, 4, v_lunch,       2, v_arroz,    70),
    (v_plan, 4, v_lunch,       3, v_tomate,   120),
    (v_plan, 4, v_snack,       1, v_manzana,  150),
    (v_plan, 4, v_dinner,      1, v_pollo,    150),
    (v_plan, 4, v_dinner,      2, v_espinacas,100),
    -- dia 5
    (v_plan, 5, v_breakfast,   1, v_avena,    40),
    (v_plan, 5, v_breakfast,   2, v_manzana,  150),
    (v_plan, 5, v_mid_morning, 1, v_platano,  120),
    (v_plan, 5, v_lunch,       1, v_garbanzos,80),
    (v_plan, 5, v_lunch,       2, v_patata,   180),
    (v_plan, 5, v_lunch,       3, v_aceite,   10),
    (v_plan, 5, v_snack,       1, v_almendras,30),
    (v_plan, 5, v_dinner,      1, v_huevo,    120),
    (v_plan, 5, v_dinner,      2, v_brocoli,  150),
    -- dia 6
    (v_plan, 6, v_breakfast,   1, v_avena,    40),
    (v_plan, 6, v_breakfast,   2, v_platano,  120),
    (v_plan, 6, v_mid_morning, 1, v_manzana,  150),
    (v_plan, 6, v_lunch,       1, v_tofu,     150),
    (v_plan, 6, v_lunch,       2, v_arroz,    70),
    (v_plan, 6, v_lunch,       3, v_espinacas,100),
    (v_plan, 6, v_snack,       1, v_almendras,30),
    (v_plan, 6, v_dinner,      1, v_salmon,   125),
    (v_plan, 6, v_dinner,      2, v_tomate,   120),
    -- dia 7
    (v_plan, 7, v_breakfast,   1, v_avena,    40),
    (v_plan, 7, v_breakfast,   2, v_manzana,  150),
    (v_plan, 7, v_mid_morning, 1, v_platano,  120),
    (v_plan, 7, v_lunch,       1, v_lentejas, 80),
    (v_plan, 7, v_lunch,       2, v_patata,   180),
    (v_plan, 7, v_lunch,       3, v_aceite,   10),
    (v_plan, 7, v_snack,       1, v_almendras,30),
    (v_plan, 7, v_dinner,      1, v_pollo,    150),
    (v_plan, 7, v_dinner,      2, v_brocoli,  150);
END $$;
