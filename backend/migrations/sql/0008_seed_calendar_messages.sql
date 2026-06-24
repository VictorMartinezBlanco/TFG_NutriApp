-- Datos de demostracion de calendario y mensajeria para el nutri de prueba.
-- No es seed de produccion. Reaplicable: borra availability, appointment y
-- message del nutri antes de reinsertar.
--
-- Depende de 0004 (clientes demo) y 0007 (las tres tablas). Resuelve clientes
-- por nombre, sin ids hardcodeados. Fechas relativas a CURRENT_DATE/now().

DO $$
DECLARE
  v_nutri   UUID := '03f06edf-603e-489d-8aed-71bc93f97ef0';
  v_maria   INTEGER;
  v_john    INTEGER;
  v_emma    INTEGER;
  v_michael INTEGER;
BEGIN
  SELECT id INTO v_maria   FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'Maria Gonzalez';
  SELECT id INTO v_john    FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'John Smith';
  SELECT id INTO v_emma    FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'Emma Wilson';
  SELECT id INTO v_michael FROM client WHERE nutritionist_id = v_nutri AND full_name_pseudonym = 'Michael Chen';

  -- arranca de cero para este nutri
  DELETE FROM message      WHERE nutritionist_id = v_nutri;
  DELETE FROM appointment  WHERE nutritionist_id = v_nutri;
  DELETE FROM availability WHERE nutritionist_id = v_nutri;

  -- ===== Disponibilidad: lun-vie (dow 0-4), manana y tarde =====
  INSERT INTO availability (nutritionist_id, day_of_week, start_time, end_time) VALUES
    (v_nutri, 0, '09:00', '13:00'), (v_nutri, 0, '15:00', '19:00'),
    (v_nutri, 1, '09:00', '13:00'), (v_nutri, 1, '15:00', '19:00'),
    (v_nutri, 2, '09:00', '13:00'), (v_nutri, 2, '15:00', '19:00'),
    (v_nutri, 3, '09:00', '13:00'), (v_nutri, 3, '15:00', '19:00'),
    (v_nutri, 4, '09:00', '13:00'), (v_nutri, 4, '15:00', '19:00');

  -- ===== Citas: 6, duraciones y estados variados =====
  -- Una completed en el pasado (histórico), una cancelled, el resto scheduled.
  INSERT INTO appointment (nutritionist_id, client_id, scheduled_at, duration_min, status, notes) VALUES
    (v_nutri, v_michael, (CURRENT_DATE - 5)  + TIME '10:00', 60, 'completed', 'Initial assessment and goal setting.'),
    (v_nutri, v_maria,   (CURRENT_DATE + 1)  + TIME '09:00', 60, 'scheduled', 'Follow-up on the vegetarian plan.'),
    (v_nutri, v_emma,    (CURRENT_DATE + 2)  + TIME '16:00', 30, 'cancelled', NULL),
    (v_nutri, v_john,    (CURRENT_DATE + 3)  + TIME '11:00', 45, 'scheduled', 'Review protein intake.'),
    (v_nutri, v_emma,    (CURRENT_DATE + 6)  + TIME '16:00', 30, 'scheduled', NULL),
    (v_nutri, v_michael, (CURRENT_DATE + 9)  + TIME '10:00', 60, 'scheduled', NULL);

  -- ===== Mensajes: hilos cortos con Maria, John y Emma (Michael sin hilo) =====
  -- Turnos client -> nutritionist -> client. Algunos del cliente sin leer
  -- (read_at NULL) para que el badge de no leidos tenga algo que mostrar.
  INSERT INTO message (nutritionist_id, client_id, sender, body, read_at, created_at) VALUES
    -- Maria: hilo activo, su ultimo mensaje sin leer
    (v_nutri, v_maria, 'nutritionist', 'Hi Maria, how did the meal plan go yesterday? I saw your lunch log but missed the dinner entry.', now() - INTERVAL '2 days' + INTERVAL '1 min', now() - INTERVAL '2 days'),
    (v_nutri, v_maria, 'client',       'It went well overall! I managed to prep everything in the morning.', now() - INTERVAL '2 days' + INTERVAL '30 min', now() - INTERVAL '2 days' + INTERVAL '20 min'),
    (v_nutri, v_maria, 'client',       'I struggled a bit with the protein goal though. I felt very full after the afternoon snack.', NULL, now() - INTERVAL '4 hours'),
    -- John: un par de mensajes, el ultimo del cliente sin leer
    (v_nutri, v_john, 'client',        'Thanks for the new plan, looks solid.', now() - INTERVAL '1 day', now() - INTERVAL '1 day' - INTERVAL '2 hours'),
    (v_nutri, v_john, 'nutritionist',  'Glad you like it. Let me know how the high-protein breakfasts feel this week.', now() - INTERVAL '1 day', now() - INTERVAL '1 day'),
    (v_nutri, v_john, 'client',        'Will do. Quick question, can I swap the tuna for chicken on day two?', NULL, now() - INTERVAL '6 hours'),
    -- Emma: hilo cerrado, todo leido
    (v_nutri, v_emma, 'client',        'Could we reschedule our next check-in?', now() - INTERVAL '3 days', now() - INTERVAL '3 days' - INTERVAL '1 hour'),
    (v_nutri, v_emma, 'nutritionist',  'Of course. I have a slot open next Wednesday afternoon, would that work?', now() - INTERVAL '3 days', now() - INTERVAL '3 days'),
    (v_nutri, v_emma, 'client',        'Wednesday works, thank you!', now() - INTERVAL '3 days' + INTERVAL '15 min', now() - INTERVAL '3 days' + INTERVAL '10 min'),
    (v_nutri, v_emma, 'nutritionist',  'Booked. See you then.', now() - INTERVAL '3 days' + INTERVAL '20 min', now() - INTERVAL '3 days' + INTERVAL '18 min');
END $$;
