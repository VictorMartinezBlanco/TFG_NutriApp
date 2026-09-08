-- Deja la actividad de la demostracion llena y vigente durante un periodo de
-- evaluacion, no solo el dia en que se siembra.
--
-- Se ejecuta DESPUES de 0017_seed_demo_refresh.sql, que es quien empuja los
-- planes viejos al pasado. Este fichero se ocupa de lo que caduca rapido:
--   1. afina la fecha de inicio del plan vigente de cada cliente
--   2. reescribe las citas con horizonte de tres semanas, solo en laborables
--   3. reescribe los hilos de mensajes, con tres conversaciones vivas
--   4. regenera las series de peso, ampliadas a nueve clientes
--   5. regenera las comidas marcadas, dejando el dia de hoy libre en la cuenta
--      de cliente que se entrega para probar la aplicacion
--   6. siembra un historial de tareas de generacion, todas cerradas
--
-- Idempotente y re-anclable: todas las fechas se calculan desde CURRENT_DATE y
-- now(), y cada seccion borra antes lo que ella misma crea. Ejecutarlo dos
-- veces seguidas deja los mismos conteos.
--
-- Los planes duran siete dias, asi que el margen antes de que uno caduque es de
-- cinco dias como maximo. Conviene volver a lanzarlo una vez por semana, que es
-- tambien lo que evita que el proyecto de Supabase se pause por inactividad.

DO $$
DECLARE
  v_nutri1 UUID := '03f06edf-603e-489d-8aed-71bc93f97ef0';
  v_nutri2 UUID;
  v_maria_active INTEGER;
BEGIN
  SELECT id INTO v_nutri2 FROM nutritionist WHERE full_name = 'Dr. Second Tester';

  -- ===== 1. Fecha de inicio del plan vigente =====
  -- Reparto amplio: el mas fresco empieza ayer y el mas veterano hace cinco
  -- dias, de modo que la adherencia se mide sobre varios dias y la lista de
  -- planes no ensena una docena de fechas identicas.
  --
  -- Maria se queda en "ayer" y no se mueve de ahi: los dos bancos permanentes
  -- calculan un dia futuro de su plan desde esta fecha, y con un desplazamiento
  -- mayor ese dia se saldria de la duracion.
  --
  -- Lucia es la cuenta de cliente que se entrega para probar la aplicacion, asi
  -- que va tres dias atras: le quedan dias por venir y su panel ensena tanto la
  -- adherencia acumulada como los dias que aun no han llegado.
  WITH ranked AS (
    SELECT p.id, c.full_name_pseudonym AS name,
           row_number() OVER (
             PARTITION BY p.client_id ORDER BY p.start_date DESC, p.id DESC
           ) AS pos
      FROM plan p
      JOIN client c ON c.id = p.client_id
     WHERE p.deleted_at IS NULL
       AND c.nutritionist_id IN (v_nutri1, COALESCE(v_nutri2, v_nutri1))
  )
  UPDATE plan p
     SET start_date = CURRENT_DATE + t.doff
    FROM ranked r
    JOIN (VALUES
      ('Maria Gonzalez',       -1),
      ('Emma Wilson',          -1),
      ('John Smith',           -2),
      ('Second Tester Client', -2),
      ('Lucia Fernandez',      -3),
      ('Sofia Marin',          -4),
      ('Alba Nieto',           -4),
      ('David Romero',         -5),
      ('Carlos Ruiz',          -5),
      ('Hugo Ferrer',           2),
      ('Tomas Alvarez',         3)
    ) AS t(name, doff) ON t.name = r.name
   WHERE p.id = r.id AND r.pos = 1;

  SELECT p.id INTO v_maria_active
    FROM plan p
    JOIN client c ON c.id = p.client_id
   WHERE c.nutritionist_id = v_nutri1
     AND c.full_name_pseudonym = 'Maria Gonzalez'
     AND p.approved_at IS NOT NULL AND p.deleted_at IS NULL
   ORDER BY p.start_date DESC, p.id DESC
   LIMIT 1;

  -- ===== 2. Citas =====
  -- Horizonte de tres semanas hacia delante y un mes hacia atras. El CASE
  -- empuja al lunes lo que caiga en sabado o domingo, asi que el reparto sigue
  -- siendo laborable sea cual sea el dia en que se lance esto, y las horas
  -- entran en los tramos de disponibilidad de cada profesional.
  --
  -- Cuatro peticiones sin decidir alimentan el aviso del calendario. La de David
  -- tiene la fecha ya pasada y sigue en pending a proposito: convertirla en otro
  -- estado exigiria un proceso periodico que no existe, y la interfaz la etiqueta
  -- como vencida al pintarla.
  DELETE FROM appointment
   WHERE nutritionist_id = v_nutri1
      OR (v_nutri2 IS NOT NULL AND nutritionist_id = v_nutri2);

  INSERT INTO appointment (nutritionist_id, client_id, scheduled_at, duration_min, status, notes)
  SELECT v_nutri1, c.id,
         (t.d + CASE EXTRACT(ISODOW FROM t.d) WHEN 6 THEN 2 WHEN 7 THEN 1 ELSE 0 END) + t.tod,
         t.mins, t.status, t.notes
    FROM (
      SELECT v.name, CURRENT_DATE + v.doff AS d, v.tod, v.mins, v.status, v.notes
        FROM (VALUES
          -- Historial, para que el calendario tampoco este vacio hacia atras.
          ('Carlos Ruiz',     -30, TIME '16:00', 60, 'completed', 'Initial assessment.'),
          ('Lucia Fernandez', -21, TIME '10:00', 60, 'completed', 'First visit, switched the plan to a vegan one.'),
          ('John Smith',      -16, TIME '11:00', 45, 'completed', 'Reviewed the protein target.'),
          ('Sofia Marin',     -12, TIME '09:30', 45, 'completed', 'Coeliac follow-up.'),
          ('Carlos Ruiz',      -9, TIME '16:30', 30, 'no_show',   NULL),
          ('Michael Chen',     -5, TIME '10:00', 60, 'completed', 'Initial assessment and goal setting.'),
          ('David Romero',     -2, TIME '17:00', 30, 'pending',   'I need to talk about the salt, eating out is hard.'),
          -- Primera semana.
          ('Maria Gonzalez',    1, TIME '09:00', 60, 'scheduled', 'Follow-up on the vegetarian plan.'),
          ('Nadia Haddad',      2, TIME '10:00', 60, 'scheduled', 'First visit.'),
          ('Lucia Fernandez',   2, TIME '17:00', 30, 'scheduled', 'Check the iron numbers.'),
          ('John Smith',        3, TIME '11:00', 45, 'scheduled', 'Review protein intake.'),
          ('Carlos Ruiz',       3, TIME '17:30', 30, 'pending',   'I want to talk about what to eat after the gym.'),
          ('Sofia Marin',       4, TIME '09:30', 45, 'scheduled', 'Check fiber intake without gluten.'),
          ('Maria Gonzalez',    4, TIME '15:00', 30, 'pending',   'I would like to go over the plan, dinners are the hard part for me.'),
          ('Emma Wilson',       5, TIME '16:00', 30, 'cancelled', NULL),
          -- Segunda semana.
          ('Michael Chen',      8, TIME '12:00', 30, 'pending',   'Could we move my next visit to the morning?'),
          ('Lucia Fernandez',   9, TIME '11:00', 30, 'scheduled', NULL),
          ('Tomas Alvarez',     9, TIME '18:00', 45, 'scheduled', 'Review the training week.'),
          ('David Romero',     10, TIME '17:00', 45, 'scheduled', 'Sodium and eating out.'),
          ('Emma Wilson',      11, TIME '16:00', 30, 'scheduled', NULL),
          ('Nadia Haddad',     12, TIME '09:00', 45, 'scheduled', 'Review the breakfast options.'),
          -- Tercera semana.
          ('Maria Gonzalez',   15, TIME '09:00', 60, 'scheduled', 'Monthly review.'),
          ('Carlos Ruiz',      16, TIME '16:00', 60, 'scheduled', NULL),
          ('Sofia Marin',      17, TIME '10:00', 45, 'scheduled', NULL),
          ('John Smith',       18, TIME '11:00', 30, 'scheduled', NULL),
          ('Michael Chen',     19, TIME '10:00', 60, 'scheduled', 'Second visit.')
        ) AS v(name, doff, tod, mins, status, notes)
    ) t
    JOIN client c ON c.nutritionist_id = v_nutri1 AND c.full_name_pseudonym = t.name
   WHERE c.deleted_at IS NULL;

  IF v_nutri2 IS NOT NULL THEN
    INSERT INTO appointment (nutritionist_id, client_id, scheduled_at, duration_min, status, notes)
    SELECT v_nutri2, c.id,
           (t.d + CASE EXTRACT(ISODOW FROM t.d) WHEN 6 THEN 2 WHEN 7 THEN 1 ELSE 0 END) + t.tod,
           t.mins, t.status, t.notes
      FROM (
        SELECT v.name, CURRENT_DATE + v.doff AS d, v.tod, v.mins, v.status, v.notes
          FROM (VALUES
            ('Hugo Ferrer',          -6, TIME '12:00', 60, 'completed', 'Initial assessment.'),
            ('Alba Nieto',            3, TIME '11:00', 45, 'scheduled', NULL),
            ('Second Tester Client',  8, TIME '10:00', 60, 'scheduled', NULL),
            ('Alba Nieto',           10, TIME '12:00', 30, 'pending',   'Could we talk about breakfast?'),
            ('Hugo Ferrer',          16, TIME '12:00', 60, 'scheduled', NULL)
          ) AS v(name, doff, tod, mins, status, notes)
      ) t
      JOIN client c ON c.nutritionist_id = v_nutri2 AND c.full_name_pseudonym = t.name
     WHERE c.deleted_at IS NULL;
  END IF;

  -- ===== 3. Mensajes =====
  -- read_at significa "leido por el destinatario", y quien es el destinatario lo
  -- dice sender. Un mensaje del cliente sin leer enciende el aviso del
  -- profesional; uno del profesional sin leer enciende el del cliente.
  --
  -- Tres hilos rematan en las ultimas horas para que la bandeja tenga movimiento
  -- reciente, uno lleva dos dias sin respuesta y otro esta apagado desde hace
  -- casi dos semanas.
  --
  -- Maria no deja ningun mensaje del profesional sin leer a proposito: es la
  -- cuenta de cliente que usan los bancos, y su aviso tiene que poder encenderse
  -- y apagarse dentro de la propia pasada.
  --
  -- Michael, Tomas y Nadia no tienen hilo. No todo el mundo escribe, y el estado
  -- vacio tambien se tiene que poder ver.
  DELETE FROM message
   WHERE nutritionist_id = v_nutri1
      OR (v_nutri2 IS NOT NULL AND nutritionist_id = v_nutri2);

  INSERT INTO message (nutritionist_id, client_id, sender, body, read_at, created_at)
  SELECT v_nutri1, c.id, t.sender, t.body,
         CASE WHEN t.unread THEN NULL ELSE now() - (INTERVAL '1 hour' * t.hours_ago) + INTERVAL '20 min' END,
         now() - (INTERVAL '1 hour' * t.hours_ago)
    FROM (VALUES
      -- Maria: hilo de ayer, remata ella y el profesional aun no lo ha leido.
      ('Maria Gonzalez', 'nutritionist', 'Hi Maria, how did the meal plan go yesterday? I saw your lunch log but missed the dinner entry.', 30, FALSE),
      ('Maria Gonzalez', 'client',       'It went well overall! I managed to prep everything in the morning.', 29, FALSE),
      ('Maria Gonzalez', 'client',       'I struggled a bit with the protein goal though. I felt very full after the afternoon snack.', 4, TRUE),
      -- John: pregunta abierta de hace unas horas.
      ('John Smith', 'client',       'Thanks for the new plan, looks solid.', 26, FALSE),
      ('John Smith', 'nutritionist', 'Glad you like it. Let me know how the high-protein breakfasts feel this week.', 25, FALSE),
      ('John Smith', 'client',       'Will do. Quick question, can I swap the tuna for chicken on day two?', 6, TRUE),
      -- Lucia: hilo vivo. Remata el profesional y ella no lo ha abierto, asi que
      -- su panel de cliente ensena el aviso de no leidos.
      ('Lucia Fernandez', 'client',       'The lentil dinners are working really well, I am not hungry at night anymore.', 49, FALSE),
      ('Lucia Fernandez', 'nutritionist', 'That is what we were after. Keep the portion as it is for another week.', 48, FALSE),
      ('Lucia Fernandez', 'client',       'Perfect. One question, can I swap the tofu for tempeh sometimes?', 27, FALSE),
      ('Lucia Fernandez', 'nutritionist', 'Yes, they are close enough. Same amount in grams, and the iron is similar.', 3, TRUE),
      -- Sofia: hilo cerrado ayer, ya leido por las dos partes.
      ('Sofia Marin', 'client',       'The gluten-free breakfasts are much better than what I had before.', 30, FALSE),
      ('Sofia Marin', 'nutritionist', 'Good. I raised the fiber a little this week, tell me if it feels heavy.', 26, FALSE),
      ('Sofia Marin', 'client',       'Noted, I will keep an eye on it.', 24, FALSE),
      -- David: escribio hace dos dias y sigue sin respuesta.
      ('David Romero', 'client', 'I went over the salt at the weekend, there was a family lunch and I could not avoid it.', 50, TRUE),
      -- Emma: hilo cerrado, todo leido por las dos partes.
      ('Emma Wilson', 'client',       'Could we reschedule our next check-in?', 74, FALSE),
      ('Emma Wilson', 'nutritionist', 'Of course. I have a slot open next week, would that work?', 73, FALSE),
      ('Emma Wilson', 'client',       'That works, thank you!', 72, FALSE),
      ('Emma Wilson', 'nutritionist', 'Booked. See you then.', 71, FALSE),
      -- Carlos: hilo apagado, la ultima palabra es del profesional hace doce dias.
      ('Carlos Ruiz', 'client',       'I am finding it hard to keep up with the plan lately.', 314, FALSE),
      ('Carlos Ruiz', 'nutritionist', 'Understood. Let us simplify it, tell me which meals are the hardest ones.', 288, FALSE)
    ) AS t(name, sender, body, hours_ago, unread)
    JOIN client c ON c.nutritionist_id = v_nutri1 AND c.full_name_pseudonym = t.name
   WHERE c.deleted_at IS NULL;

  IF v_nutri2 IS NOT NULL THEN
    INSERT INTO message (nutritionist_id, client_id, sender, body, read_at, created_at)
    SELECT v_nutri2, c.id, t.sender, t.body,
           CASE WHEN t.unread THEN NULL ELSE now() - (INTERVAL '1 hour' * t.hours_ago) + INTERVAL '20 min' END,
           now() - (INTERVAL '1 hour' * t.hours_ago)
      FROM (VALUES
        ('Alba Nieto',  'client',       'Got the new plan, thanks.', 25, FALSE),
        ('Alba Nieto',  'nutritionist', 'Great. Tell me next week how the fruit at breakfast goes.', 24, TRUE),
        ('Hugo Ferrer', 'client',       'When will my plan be ready?', 8, TRUE)
      ) AS t(name, sender, body, hours_ago, unread)
      JOIN client c ON c.nutritionist_id = v_nutri2 AND c.full_name_pseudonym = t.name
     WHERE c.deleted_at IS NULL;
  END IF;

  -- ===== 4. Peso declarado =====
  -- El ultimo registro coincide con client.weight_kg a proposito: la serie es lo
  -- que declara el cliente y aquella columna la valida el profesional. El signo
  -- del incremento semanal cuenta la historia: positivo significa que venia de
  -- mas peso y ha bajado, negativo que ha subido.
  --
  -- Emma, Michael y Nadia se quedan sin serie: el widget vacio tambien forma
  -- parte de lo que hay que poder ensenar.
  DELETE FROM weight_entry we
   USING client c
   WHERE c.id = we.client_id
     AND (c.nutritionist_id = v_nutri1
          OR (v_nutri2 IS NOT NULL AND c.nutritionist_id = v_nutri2));

  INSERT INTO weight_entry (client_id, measured_on, weight_kg)
  SELECT c.id,
         CURRENT_DATE - (7 * g),
         COALESCE(c.weight_kg, 70) + (t.weekly * g)
    FROM (VALUES
      ('Maria Gonzalez',  6, 0.40),   -- bajada suave
      ('Lucia Fernandez', 8, 0.45),   -- bajada sostenida
      ('John Smith',      6, 0.35),
      ('David Romero',    8, 0.05),   -- practicamente plano
      ('Sofia Marin',     6, 0.20),
      ('Carlos Ruiz',     8, -0.30),  -- ha ido subiendo
      ('Tomas Alvarez',   8, -0.25),  -- sube por masa muscular
      ('Alba Nieto',      4, 0.30),
      ('Hugo Ferrer',     5, 0.15)
    ) AS t(name, weeks, weekly)
    JOIN client c ON c.full_name_pseudonym = t.name AND c.deleted_at IS NULL
   CROSS JOIN generate_series(0, 8) AS g
   WHERE g <= t.weeks;

  -- ===== 5. Comidas marcadas =====
  -- Solo de planes firmados y vivos, y solo de dias ya transcurridos, que es lo
  -- que la policy del cliente permite y lo que la adherencia cuenta.
  DELETE FROM meal_check mc
   USING plan p, client c
   WHERE p.id = mc.plan_id AND c.id = p.client_id
     AND (c.nutritionist_id = v_nutri1
          OR (v_nutri2 IS NOT NULL AND c.nutritionist_id = v_nutri2));

  -- El plan vigente de Maria lleva su propia regla, casi todas las comidas de
  -- los dias cerrados y la mitad de las de hoy, porque los dos bancos
  -- permanentes se apoyan en que hoy le queden comidas sin marcar.
  INSERT INTO meal_check (plan_id, day_num, meal_type_id, checked_at)
  SELECT plan_id, day_num, meal_type_id, now() - INTERVAL '6 hours'
    FROM (
      SELECT i.plan_id, i.day_num, i.meal_type_id,
             p.start_date + (i.day_num - 1) < CURRENT_DATE AS cerrado,
             row_number() OVER (
               PARTITION BY i.plan_id, i.day_num ORDER BY mt.default_order
             ) AS pos
        FROM plan_meal_item i
        JOIN meal_type mt ON mt.id = i.meal_type_id
        JOIN plan p       ON p.id = i.plan_id
       WHERE p.id = v_maria_active
         AND p.start_date + (i.day_num - 1) <= CURRENT_DATE
       GROUP BY i.plan_id, i.day_num, i.meal_type_id, mt.default_order, p.start_date
    ) s
   WHERE (cerrado AND pos <= 4) OR (NOT cerrado AND pos <= 2);

  -- El resto lleva un porcentaje objetivo por cliente. La seleccion reparte las
  -- marcas por todo el plan en vez de agrupar las primeras, que se leeria como
  -- un abandono y no como un cumplimiento parcial: se marca la comida n cuando
  -- la division entera de n*pct entre 100 avanza respecto a la de (n-1)*pct.
  --
  -- Lucia entra con hoy_incluido en falso: su plan vigente queda con todas las
  -- comidas de hoy y de los dias que faltan sin marcar, que es por donde empieza
  -- quien entre con la cuenta de cliente que se entrega. Su porcentaje se aplica
  -- solo a los dias cerrados, asi que la adherencia que ensena la pantalla queda
  -- por debajo de ese numero: el dia en curso cuenta en el denominador desde que
  -- empieza. Por eso la mejor adherencia de la cartera es la de Sofia y no la
  -- suya.
  INSERT INTO meal_check (plan_id, day_num, meal_type_id, checked_at)
  SELECT s.plan_id, s.day_num, s.meal_type_id, now() - INTERVAL '6 hours'
    FROM (
      SELECT i.plan_id, i.day_num, i.meal_type_id, t.pct,
             row_number() OVER (
               PARTITION BY i.plan_id ORDER BY i.day_num, mt.default_order
             ) AS pos
        FROM plan_meal_item i
        JOIN meal_type mt ON mt.id = i.meal_type_id
        JOIN plan p       ON p.id = i.plan_id
        JOIN client c     ON c.id = p.client_id
        JOIN (VALUES
          ('Sofia Marin',          90, TRUE),   -- la que mejor cumple
          ('Maria Gonzalez',       85, TRUE),   -- solo alcanza a su plan historico
          ('Alba Nieto',           75, TRUE),
          ('John Smith',           70, TRUE),
          ('Lucia Fernandez',      95, FALSE),  -- casi todo lo cerrado, hoy sin tocar
          ('Second Tester Client', 60, TRUE),
          ('David Romero',         45, TRUE),
          ('Carlos Ruiz',          30, TRUE)    -- el que peor cumple
        ) AS t(name, pct, hoy_incluido) ON t.name = c.full_name_pseudonym
       WHERE p.approved_at IS NOT NULL AND p.deleted_at IS NULL
         AND c.deleted_at IS NULL
         AND p.id IS DISTINCT FROM v_maria_active
         AND p.start_date + (i.day_num - 1)
               <= CURRENT_DATE - (CASE WHEN t.hoy_incluido THEN 0 ELSE 1 END)
       GROUP BY i.plan_id, i.day_num, i.meal_type_id, mt.default_order, t.pct
    ) s
   WHERE (s.pos * s.pct) / 100 > ((s.pos - 1) * s.pct) / 100;

  -- ===== 6. Historial de tareas de generacion =====
  -- Todas cerradas. Ni queued ni in_progress: una tarea abierta se quedaria
  -- colgada si el worker local no esta levantado, y la interfaz la ensenaria
  -- esperando indefinidamente.
  --
  -- Las tareas 'done' no las pinta ninguna vista, van por completitud del
  -- registro. La fallida si sale en la lista de generaciones de Planes durante
  -- veinticuatro horas, con su explicacion llana y el nucleo del conflicto, que
  -- es la unica forma de ensenar el diagnostico de infactibilidad sin provocar
  -- una de verdad.
  --
  -- La clave 'seed' dentro de result marca las filas de este fichero. Ninguna
  -- vista la lee, y sirve para reescribirlas sin tocar las tareas reales de un
  -- ensayo.
  DELETE FROM generation_task WHERE result->>'seed' = '0019';

  INSERT INTO generation_task (
    nutritionist_id, client_id, kind, input_text, constraints,
    duration_days, meals_per_day, status, plan_id, result, error,
    created_at, started_at, finished_at
  )
  SELECT v_nutri1, c.id, t.kind, t.input_text, '[]'::jsonb,
         7, 4, t.status,
         CASE WHEN t.usa_plan THEN (
           SELECT p.id FROM plan p
            WHERE p.client_id = c.id AND p.approved_at IS NOT NULL
              AND p.deleted_at IS NULL
            ORDER BY p.start_date DESC, p.id DESC LIMIT 1
         ) END,
         t.result::jsonb, t.error,
         now() - (INTERVAL '1 hour' * t.hours_ago),
         now() - (INTERVAL '1 hour' * t.hours_ago) + INTERVAL '2 sec',
         now() - (INTERVAL '1 hour' * t.hours_ago) + (INTERVAL '1 sec' * t.secs)
    FROM (VALUES
      ('Maria Gonzalez', 'translate', 'Nada de lacteos y unas 1500 kcal al dia, prefiere comida vegetariana.',
       FALSE, 'done', NULL,
       '{"seed":"0019","constraints":[{"type":"forbid_tag","priority":"hard","operator":"forbid","target_tag_id":3},{"type":"kcal_target","priority":"soft","operator":"eq","value":1500,"weight":5},{"type":"prefer_tag","priority":"soft","operator":"prefer","target_tag_id":11,"weight":3}],"rejected":[],"model":"qwen2.5:7b-instruct","latency_ms":9184,"precheck":{"status":"ok","message":null,"details":null}}',
       96, 11),
      ('Sofia Marin', 'translate', 'Sin gluten y que la fibra llegue a 30 gramos diarios.',
       FALSE, 'done', NULL,
       '{"seed":"0019","constraints":[{"type":"forbid_tag","priority":"hard","operator":"forbid","target_tag_id":1},{"type":"nutrient_min","priority":"soft","operator":"min","value":30,"target_nutrient_id":6,"weight":4}],"rejected":[],"model":"qwen2.5:7b-instruct","latency_ms":7620,"precheck":{"status":"ok","message":null,"details":null}}',
       72, 9),
      ('David Romero', 'generate', NULL,
       TRUE, 'done', NULL,
       '{"seed":"0019","findings":[]}',
       98, 74),
      ('Lucia Fernandez', 'generate', 'Manten la dieta vegana y sube el hierro todo lo que puedas.',
       TRUE, 'done', NULL,
       '{"seed":"0019","rejected":[],"findings":[]}',
       74, 96),
      ('Sofia Marin', 'generate', 'Necesito que la fibra suba a 40 gramos al dia.',
       FALSE, 'failed',
       'The minimum of 40 g of fiber conflicts with excluding gluten foods: no combination of the available foods satisfies both. Consider relaxing one of them.',
       '{"seed":"0019","infeasible":{"explanation":"The minimum of 40 g of fiber conflicts with excluding gluten foods: no combination of the available foods satisfies both. Consider relaxing one of them.","core":[{"type":"nutrient_min","value":40,"target":"Fiber","unit":"g"},{"type":"forbid_tag","value":null,"target":"Gluten","unit":null}]}}',
       4, 108)
    ) AS t(name, kind, input_text, usa_plan, status, error, result, hours_ago, secs)
    JOIN client c ON c.nutritionist_id = v_nutri1 AND c.full_name_pseudonym = t.name
   WHERE c.deleted_at IS NULL;
END $$;
