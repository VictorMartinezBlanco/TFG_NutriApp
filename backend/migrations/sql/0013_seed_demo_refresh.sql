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
