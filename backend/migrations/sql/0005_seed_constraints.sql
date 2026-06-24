-- Restricciones de demostracion para los clientes del nutri de prueba.
-- Sirven para que la ficha del cliente tenga restricciones que mostrar
-- mientras no hay datos reales. No es seed de produccion. Reaplicable:
-- borra las del cliente antes de reinsertar.
--
-- Depende de 0002 (catalogo de tags/nutrientes/unidades) y 0004 (clientes demo).
-- Los ids de tag/nutrient/unit se resuelven por code, no se hardcodean.
--
-- Aplicar en Supabase: SQL Editor -> pegar -> Run. El backend usa la secret
-- key, asi que la RLS no estorba.

DO $$
DECLARE
  v_nutri UUID := '03f06edf-603e-489d-8aed-71bc93f97ef0';
  v_maria   INTEGER;
  v_john    INTEGER;
  v_emma    INTEGER;

  v_tag_vegetarian INTEGER;
  v_tag_peanuts    INTEGER;
  v_tag_lactose    INTEGER;
  v_nut_protein    INTEGER;
  v_nut_sodium     INTEGER;
  v_unit_g         INTEGER;
  v_unit_mg        INTEGER;
BEGIN
  SELECT id INTO v_maria FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'Maria Gonzalez';
  SELECT id INTO v_john  FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'John Smith';
  SELECT id INTO v_emma  FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'Emma Wilson';

  SELECT id INTO v_tag_vegetarian FROM tag WHERE code = 'vegetarian';
  SELECT id INTO v_tag_peanuts    FROM tag WHERE code = 'peanuts';
  SELECT id INTO v_tag_lactose    FROM tag WHERE code = 'lactose';
  SELECT id INTO v_nut_protein    FROM nutrient WHERE code = 'protein_g';
  SELECT id INTO v_nut_sodium     FROM nutrient WHERE code = 'sodium_mg';
  SELECT id INTO v_unit_g         FROM unit WHERE code = 'g';
  -- el catalogo no tiene unidad mg propia; el sodio se expresa en su unit_default.
  -- para la restriccion dejo unit_id NULL y el valor en mg implicito.

  -- arranca de cero para estos clientes
  DELETE FROM diet_constraint
   WHERE scope_type = 'client' AND scope_client_id IN (v_maria, v_john, v_emma);

  -- Maria, perdida de peso: objetivo calorico blando y preferencia vegetariana
  INSERT INTO diet_constraint
    (scope_type, scope_client_id, type, target_tag_id, target_nutrient_id, operator, value, unit_id, priority, weight, source)
  VALUES
    ('client', v_maria, 'kcal_target', NULL,             NULL,          'eq',  1500, NULL,     'soft', 7, 'manual'),
    ('client', v_maria, 'prefer_tag',  v_tag_vegetarian, NULL,          'prefer', NULL, NULL,  'soft', 4, 'manual');

  -- John, ganancia muscular: alergia a cacahuetes (dura) y minimo de proteina
  INSERT INTO diet_constraint
    (scope_type, scope_client_id, type, target_tag_id, target_nutrient_id, operator, value, unit_id, priority, weight, source)
  VALUES
    ('client', v_john, 'forbid_tag',   v_tag_peanuts, NULL,        'forbid', NULL, NULL,     'hard', 10, 'manual'),
    ('client', v_john, 'nutrient_min', NULL,          v_nut_protein,'min',   140,  v_unit_g, 'soft', 6,  'manual');

  -- Emma, diabetes: intolerancia a la lactosa (dura) y tope de sodio (clinico)
  INSERT INTO diet_constraint
    (scope_type, scope_client_id, type, target_tag_id, target_nutrient_id, operator, value, unit_id, priority, weight, source)
  VALUES
    ('client', v_emma, 'forbid_tag',   v_tag_lactose, NULL,       'forbid', NULL, NULL, 'hard', 9, 'manual'),
    ('client', v_emma, 'nutrient_max', NULL,          v_nut_sodium,'max',   2000, NULL, 'soft', 7, 'manual');
END $$;
