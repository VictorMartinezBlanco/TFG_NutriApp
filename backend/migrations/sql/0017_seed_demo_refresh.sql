-- Reancla al dia de hoy todo el juego de datos de demostracion que lleva fecha.
-- Sucede a 0013_seed_demo_refresh.sql, que cubria cuatro clientes y una sola
-- serie de pesos; este cubre los doce clientes de los dos nutricionistas.
--
-- Es UN SOLO COMANDO antes de una demostracion o de una prueba con usuario.
-- Idempotente y re-ejecutable: no depende del estado anterior.
--
-- Que hace:
--   1. mueve el start_date de los planes, con desplazamientos distintos por
--      cliente para que la app no ensene doce planes empezados el mismo dia
--   2. reescribe las citas, con estados variados y una peticion ya vencida
--   3. reescribe los hilos de mensajes y su read_at, que es lo que enciende los
--      avisos de no leidos en cada uno de los dos paneles
--   4. regenera las series de peso declarado, con tendencias distintas
--   5. regenera las comidas marcadas para que la adherencia salga dispar
--
-- Las citas y los mensajes se borran y se reinsertan en vez de moverse: son las
-- dos tablas a las que nada apunta, asi que reescribirlas es mas simple que
-- calcular desplazamientos, y deja este fichero como unica fuente de la parte
-- fechada de la demostracion (tambien de lo que sembro 0008).
--
-- Los pesos y las marcas SI dependen de los planes, asi que van despues de
-- mover las fechas.

DO $$
DECLARE
  v_nutri1 UUID := '03f06edf-603e-489d-8aed-71bc93f97ef0';
  v_nutri2 UUID;
  v_maria_active INTEGER;
BEGIN
  SELECT id INTO v_nutri2 FROM nutritionist WHERE full_name = 'Dr. Second Tester';

  -- ===== 1. Planes =====
  -- Primero los planes viejos de cada cliente (los que no son el ultimo), para
  -- que al recalcular el orden el activo siga siendo el activo. Maria es la
  -- unica con historico: cinco semanas atras, ya terminado.
  WITH ranked AS (
    SELECT p.id,
           row_number() OVER (
             PARTITION BY p.client_id ORDER BY p.start_date DESC, p.id DESC
           ) AS pos
      FROM plan p
      JOIN client c ON c.id = p.client_id
     WHERE p.deleted_at IS NULL
       AND c.nutritionist_id IN (v_nutri1, COALESCE(v_nutri2, v_nutri1))
  )
  UPDATE plan p
     SET start_date = CURRENT_DATE - 35
    FROM ranked r
   WHERE p.id = r.id AND r.pos > 1;

  -- El plan vigente de cada cliente. Maria se queda en "ayer" a proposito: hoy
  -- cae en su dia 2 de 7, asi que le quedan dias por venir y se ve tanto el
  -- calculo del dia en curso como el estado "aun no toca" de los siguientes.
  -- Los demas arrancan mas atras para que su adherencia se mida sobre varios
  -- dias y no sobre uno. Los borradores de Tomas y Hugo empiezan en el futuro.
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
      ('John Smith',           -2),
      ('Emma Wilson',          -1),
      ('Lucia Fernandez',      -5),
      ('David Romero',         -5),
      ('Sofia Marin',          -3),
      ('Carlos Ruiz',          -6),
      ('Tomas Alvarez',         3),
      ('Second Tester Client', -2),
      ('Alba Nieto',           -4),
      ('Hugo Ferrer',           2)
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
  -- Una peticion con la fecha ya pasada sigue en pending: no se convierte en un
  -- estado nuevo porque eso exigiria un proceso periodico que no existe, y se
  -- etiqueta como vencida al pintarla. Es la de David, y es a proposito.
  DELETE FROM appointment
   WHERE nutritionist_id = v_nutri1
      OR (v_nutri2 IS NOT NULL AND nutritionist_id = v_nutri2);

  INSERT INTO appointment (nutritionist_id, client_id, scheduled_at, duration_min, status, notes)
  SELECT v_nutri1, c.id, (CURRENT_DATE + t.doff) + t.tod, t.mins, t.status, t.notes
    FROM (VALUES
      ('Michael Chen',    -5, TIME '10:00', 60, 'completed', 'Initial assessment and goal setting.'),
      ('Carlos Ruiz',    -30, TIME '16:00', 60, 'completed', 'Initial assessment.'),
      ('Lucia Fernandez', -21, TIME '10:00', 60, 'completed', 'First visit, switched the plan to a vegan one.'),
      ('Carlos Ruiz',     -9, TIME '16:00', 30, 'no_show',   NULL),
      ('David Romero',    -2, TIME '17:00', 30, 'pending',   'I need to talk about the salt, eating out is hard.'),
      ('Maria Gonzalez',   1, TIME '09:00', 60, 'scheduled', 'Follow-up on the vegetarian plan.'),
      ('Nadia Haddad',     2, TIME '10:00', 60, 'scheduled', 'First visit.'),
      ('Emma Wilson',      2, TIME '16:00', 30, 'cancelled', NULL),
      ('John Smith',       3, TIME '11:00', 45, 'scheduled', 'Review protein intake.'),
      ('Maria Gonzalez',   4, TIME '15:00', 30, 'pending',   'I would like to go over the plan, dinners are the hard part for me.'),
      ('Sofia Marin',      4, TIME '09:30', 45, 'scheduled', 'Check fiber intake without gluten.'),
      ('Lucia Fernandez',  5, TIME '11:00', 30, 'pending',   'Can we look at my iron numbers?'),
      ('Emma Wilson',      6, TIME '16:00', 30, 'scheduled', NULL),
      ('Tomas Alvarez',    7, TIME '18:00', 45, 'scheduled', 'Review the training week.'),
      ('Michael Chen',     9, TIME '10:00', 60, 'scheduled', NULL)
    ) AS t(name, doff, tod, mins, status, notes)
    JOIN client c ON c.nutritionist_id = v_nutri1 AND c.full_name_pseudonym = t.name
   WHERE c.deleted_at IS NULL;

  IF v_nutri2 IS NOT NULL THEN
    INSERT INTO appointment (nutritionist_id, client_id, scheduled_at, duration_min, status, notes)
    SELECT v_nutri2, c.id, (CURRENT_DATE + t.doff) + t.tod, t.mins, t.status, t.notes
      FROM (VALUES
        ('Hugo Ferrer',          -6, TIME '12:00', 60, 'completed', 'Initial assessment.'),
        ('Alba Nieto',            3, TIME '11:00', 45, 'scheduled', NULL),
        ('Second Tester Client',  8, TIME '10:00', 60, 'scheduled', NULL)
      ) AS t(name, doff, tod, mins, status, notes)
      JOIN client c ON c.nutritionist_id = v_nutri2 AND c.full_name_pseudonym = t.name
     WHERE c.deleted_at IS NULL;
  END IF;

  -- ===== 3. Mensajes =====
  -- read_at significa "leido por el destinatario", y quien es el destinatario lo
  -- dice sender. Un mensaje del cliente sin leer enciende el aviso del
  -- profesional; uno del profesional sin leer enciende el del cliente.
  --
  -- Maria no deja ningun mensaje del profesional sin leer a proposito: es la
  -- cuenta de cliente que usan los runners, y su aviso tiene que poder
  -- encenderse y apagarse dentro de la propia pasada.
  --
  -- Sofia, Nadia, Tomas y Michael no tienen hilo. No todo el mundo escribe, y
  -- el estado vacio tambien se tiene que poder ver.
  DELETE FROM message
   WHERE nutritionist_id = v_nutri1
      OR (v_nutri2 IS NOT NULL AND nutritionist_id = v_nutri2);

  INSERT INTO message (nutritionist_id, client_id, sender, body, read_at, created_at)
  SELECT v_nutri1, c.id, t.sender, t.body,
         CASE WHEN t.unread THEN NULL ELSE now() - (INTERVAL '1 hour' * t.hours_ago) + INTERVAL '20 min' END,
         now() - (INTERVAL '1 hour' * t.hours_ago)
    FROM (VALUES
      -- Maria: hilo de hoy, remata ella y el profesional aun no lo ha leido.
      ('Maria Gonzalez', 'nutritionist', 'Hi Maria, how did the meal plan go yesterday? I saw your lunch log but missed the dinner entry.', 30, FALSE),
      ('Maria Gonzalez', 'client',       'It went well overall! I managed to prep everything in the morning.', 29, FALSE),
      ('Maria Gonzalez', 'client',       'I struggled a bit with the protein goal though. I felt very full after the afternoon snack.', 4, TRUE),
      -- John: pregunta abierta de hace unas horas.
      ('John Smith', 'client',       'Thanks for the new plan, looks solid.', 26, FALSE),
      ('John Smith', 'nutritionist', 'Glad you like it. Let me know how the high-protein breakfasts feel this week.', 25, FALSE),
      ('John Smith', 'client',       'Will do. Quick question, can I swap the tuna for chicken on day two?', 6, TRUE),
      -- Emma: hilo cerrado, todo leido por las dos partes.
      ('Emma Wilson', 'client',       'Could we reschedule our next check-in?', 74, FALSE),
      ('Emma Wilson', 'nutritionist', 'Of course. I have a slot open next Wednesday afternoon, would that work?', 73, FALSE),
      ('Emma Wilson', 'client',       'Wednesday works, thank you!', 72, FALSE),
      ('Emma Wilson', 'nutritionist', 'Booked. See you then.', 71, FALSE),
      -- Lucia: hilo vivo. Remata el profesional y ella no lo ha abierto, asi que
      -- su panel de cliente ensena el aviso de no leidos.
      ('Lucia Fernandez', 'client',       'The lentil dinners are working really well, I am not hungry at night anymore.', 49, FALSE),
      ('Lucia Fernandez', 'nutritionist', 'That is what we were after. Keep the portion as it is for another week.', 48, FALSE),
      ('Lucia Fernandez', 'client',       'Perfect. One question, can I swap the tofu for tempeh sometimes?', 27, FALSE),
      ('Lucia Fernandez', 'nutritionist', 'Yes, they are close enough. Same amount in grams.', 3, TRUE),
      -- David: escribio hace tres dias y sigue sin respuesta.
      ('David Romero', 'client', 'I went over the salt at the weekend, there was a family lunch and I could not avoid it.', 72, TRUE),
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
        ('Alba Nieto', 'client',       'Got the new plan, thanks.', 25, FALSE),
        ('Alba Nieto', 'nutritionist', 'Great. Tell me next week how the fruit at breakfast goes.', 24, TRUE)
      ) AS t(name, sender, body, hours_ago, unread)
      JOIN client c ON c.nutritionist_id = v_nutri2 AND c.full_name_pseudonym = t.name
     WHERE c.deleted_at IS NULL;
  END IF;

  -- ===== 4. Peso declarado =====
  -- El ultimo registro coincide con client.weight_kg a proposito: la serie es lo
  -- que declara el cliente y aquella columna la valida el profesional. El signo
  -- del incremento semanal cuenta la historia: positivo significa que venia de
  -- mas peso y ha bajado, negativo que ha subido.
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
      ('Maria Gonzalez',  5, 0.40),   -- bajada suave
      ('Lucia Fernandez', 7, 0.45),   -- bajada sostenida
      ('David Romero',    7, 0.05),   -- practicamente plano
      ('Sofia Marin',     5, 0.20),
      ('Carlos Ruiz',     7, -0.30),  -- ha ido subiendo
      ('Tomas Alvarez',   7, -0.25),  -- sube por masa muscular
      ('Alba Nieto',      3, 0.30)
    ) AS t(name, weeks, weekly)
    JOIN client c ON c.full_name_pseudonym = t.name AND c.deleted_at IS NULL
   CROSS JOIN generate_series(0, 7) AS g
   WHERE g <= t.weeks;

  -- ===== 5. Comidas marcadas =====
  -- Solo de planes firmados y vivos, y solo de dias ya transcurridos, que es lo
  -- que la policy del cliente permite y lo que la adherencia cuenta.
  DELETE FROM meal_check mc
   USING plan p, client c
   WHERE p.id = mc.plan_id AND c.id = p.client_id
     AND (c.nutritionist_id = v_nutri1
          OR (v_nutri2 IS NOT NULL AND c.nutritionist_id = v_nutri2));

  -- El plan vigente de Maria conserva la regla del 0013 (casi todas las comidas
  -- de los dias cerrados y la mitad de las de hoy), porque los dos runners
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
          ('Maria Gonzalez',       85),  -- solo alcanza a su plan historico
          ('John Smith',           70),
          ('Lucia Fernandez',      90),
          ('David Romero',         45),
          ('Sofia Marin',          80),
          ('Carlos Ruiz',          30),
          ('Second Tester Client', 60),
          ('Alba Nieto',           75)
        ) AS t(name, pct) ON t.name = c.full_name_pseudonym
       WHERE p.approved_at IS NOT NULL AND p.deleted_at IS NULL
         AND c.deleted_at IS NULL
         AND p.id IS DISTINCT FROM v_maria_active
         AND p.start_date + (i.day_num - 1) <= CURRENT_DATE
       GROUP BY i.plan_id, i.day_num, i.meal_type_id, mt.default_order, t.pct
    ) s
   WHERE (s.pos * s.pct) / 100 > ((s.pos - 1) * s.pct) / 100;
END $$;
