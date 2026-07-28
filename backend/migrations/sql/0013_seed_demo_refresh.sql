-- Reancla las fechas del juego de datos de demostracion al dia de hoy.
--
-- Los planes (0006) y las citas (0008) se sembraron con fechas relativas al dia
-- en que se cargaron, asi que con el tiempo el plan deja de cubrir hoy y todas
-- las citas quedan en el pasado. El panel del cliente ensena "el plan de hoy",
-- de modo que necesita datos vigentes para verse.
--
-- No toca el esquema ni el contenido nutricional: solo mueve fechas. Idempotente
-- y re-ejecutable cuando la demo vuelva a quedarse atras.

DO $$
DECLARE
  v_nutri UUID := '03f06edf-603e-489d-8aed-71bc93f97ef0';
  v_maria   INTEGER;
  v_john    INTEGER;
  v_emma    INTEGER;
  v_michael INTEGER;
BEGIN
  SELECT id INTO v_maria   FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'Maria Gonzalez';
  SELECT id INTO v_john    FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'John Smith';
  SELECT id INTO v_emma    FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'Emma Wilson';
  SELECT id INTO v_michael FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'Michael Chen';

  -- Ayer como primer dia: hoy cae en el dia 2 de los siete, asi se ve que el
  -- calculo del dia en curso no es simplemente el primero.
  UPDATE plan
     SET start_date = CURRENT_DATE - 1
   WHERE nutritionist_id = v_nutri AND deleted_at IS NULL;

  -- Mismos desplazamientos relativos que el seed original.
  UPDATE appointment SET scheduled_at = now() - INTERVAL '5 days'
   WHERE nutritionist_id = v_nutri AND client_id = v_michael AND status = 'completed';
  UPDATE appointment SET scheduled_at = date_trunc('hour', now()) + INTERVAL '1 day 2 hours'
   WHERE nutritionist_id = v_nutri AND client_id = v_maria AND status = 'scheduled';
  UPDATE appointment SET scheduled_at = date_trunc('hour', now()) + INTERVAL '2 days 3 hours'
   WHERE nutritionist_id = v_nutri AND client_id = v_emma AND status = 'cancelled';
  UPDATE appointment SET scheduled_at = date_trunc('hour', now()) + INTERVAL '3 days 4 hours'
   WHERE nutritionist_id = v_nutri AND client_id = v_john AND status = 'scheduled';
  UPDATE appointment SET scheduled_at = date_trunc('hour', now()) + INTERVAL '6 days 2 hours'
   WHERE nutritionist_id = v_nutri AND client_id = v_emma AND status = 'scheduled';
  UPDATE appointment SET scheduled_at = date_trunc('hour', now()) + INTERVAL '9 days 5 hours'
   WHERE nutritionist_id = v_nutri AND client_id = v_michael AND status = 'scheduled';

  -- Los mensajes se recolocan manteniendo su orden, para que el hilo no quede
  -- fechado en el pasado en la pantalla del cliente.
  UPDATE message m
     SET created_at = now() - (INTERVAL '1 hour' * s.rank)
    FROM (
      SELECT id, row_number() OVER (ORDER BY created_at DESC) AS rank
        FROM message
       WHERE nutritionist_id = v_nutri AND deleted_at IS NULL
    ) s
   WHERE m.id = s.id;
END
$$;

-- Interacciones del cliente de demostracion. Van aqui y no en un seed aparte
-- porque sufren el mismo problema que lo de arriba: son fechas relativas que
-- caducan, y la demostracion necesita un solo comando que lo reancle todo.
DO $$
DECLARE
  v_nutri UUID := '03f06edf-603e-489d-8aed-71bc93f97ef0';
  v_maria INTEGER;
  v_peso  NUMERIC(5,2);
BEGIN
  SELECT id, COALESCE(weight_kg, 68) INTO v_maria, v_peso
    FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'Maria Gonzalez';
  IF v_maria IS NULL THEN
    RETURN;
  END IF;

  -- Seis pesos semanales que terminan hoy en el que consta en su ficha, con
  -- una bajada suave. El ultimo coincide a proposito con client.weight_kg: la
  -- serie es lo que ella declara y aquella columna la valida el profesional.
  DELETE FROM weight_entry WHERE client_id = v_maria;
  INSERT INTO weight_entry (client_id, measured_on, weight_kg)
  SELECT v_maria, CURRENT_DATE - (7 * g), v_peso + (0.4 * g)
    FROM generate_series(0, 5) AS g;

  -- Comidas cumplidas: casi todas las de los dias ya cerrados y la mitad de las
  -- de hoy, para que la adherencia arranque en un valor creible y no en cero.
  DELETE FROM meal_check
   WHERE plan_id IN (SELECT id FROM plan WHERE client_id = v_maria);

  INSERT INTO meal_check (plan_id, day_num, meal_type_id, checked_at)
  SELECT plan_id, day_num, meal_type_id, now() - INTERVAL '6 hours'
    FROM (
      SELECT i.plan_id,
             i.day_num,
             i.meal_type_id,
             p.start_date + (i.day_num - 1) < CURRENT_DATE AS cerrado,
             row_number() OVER (
               PARTITION BY i.plan_id, i.day_num ORDER BY mt.default_order
             ) AS pos
        FROM plan_meal_item i
        JOIN meal_type mt ON mt.id = i.meal_type_id
        JOIN plan p       ON p.id = i.plan_id
       WHERE p.client_id = v_maria
         AND p.approved_at IS NOT NULL
         AND p.deleted_at IS NULL
         AND p.start_date + (i.day_num - 1) <= CURRENT_DATE
       GROUP BY i.plan_id, i.day_num, i.meal_type_id, mt.default_order, p.start_date
    ) s
   WHERE (cerrado AND pos <= 4) OR (NOT cerrado AND pos <= 2);

  -- Una peticion sin contestar, para que el calendario del profesional ensene
  -- la seccion de peticiones en la demostracion.
  DELETE FROM appointment WHERE client_id = v_maria AND status = 'pending';
  INSERT INTO appointment (nutritionist_id, client_id, scheduled_at, duration_min, status, notes)
  VALUES (
    v_nutri, v_maria,
    date_trunc('hour', now()) + INTERVAL '4 days 3 hours',
    30, 'pending',
    'I would like to go over the plan, dinners are the hard part for me.'
  );
END
$$;
