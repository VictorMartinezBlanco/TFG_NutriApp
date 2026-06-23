-- Datos de demostracion para el nutri de prueba, para que el dashboard tenga
-- algo que mostrar mientras no hay datos reales. No es seed de produccion:
-- son clientes y planes ficticios. Se puede reaplicar (borra los suyos antes).
--
-- Aplicar en Supabase: SQL Editor -> pegar -> Run. El backend usa la secret
-- key, asi que la RLS no estorba.

DO $$
DECLARE
  v_nutri UUID := '03f06edf-603e-489d-8aed-71bc93f97ef0';
  v_maria  INTEGER;
  v_john   INTEGER;
  v_emma   INTEGER;
  v_michael INTEGER;
BEGIN
  -- arranca de cero para este nutri: planes primero por las FKs
  DELETE FROM plan   WHERE nutritionist_id = v_nutri;
  DELETE FROM client WHERE nutritionist_id = v_nutri;

  INSERT INTO client (nutritionist_id, full_name_pseudonym, sex, birth_date, height_cm, weight_kg, activity_level)
  VALUES
    (v_nutri, 'Maria Gonzalez', 'F', '1990-04-12', 165, 68, 'active'),
    (v_nutri, 'John Smith',     'M', '1985-09-30', 180, 88, 'moderate'),
    (v_nutri, 'Emma Wilson',    'F', '1978-01-22', 170, 74, 'light'),
    (v_nutri, 'Michael Chen',   'M', '1995-07-08', 175, 70, 'very_active');

  SELECT id INTO v_maria   FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'Maria Gonzalez';
  SELECT id INTO v_john    FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'John Smith';
  SELECT id INTO v_emma    FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'Emma Wilson';
  SELECT id INTO v_michael FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'Michael Chen';

  -- dos planes firmados y uno pendiente, para el kpi de borradores sin firmar
  INSERT INTO plan (nutritionist_id, client_id, start_date, duration_days, approved_at, signed_by)
  VALUES
    (v_nutri, v_maria, CURRENT_DATE - 14, 7, now() - INTERVAL '13 days', v_nutri),
    (v_nutri, v_john,  CURRENT_DATE - 3,  7, now() - INTERVAL '2 days',  v_nutri),
    (v_nutri, v_emma,  CURRENT_DATE,      7, NULL, NULL);
END $$;
