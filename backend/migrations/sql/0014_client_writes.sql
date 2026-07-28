-- Escritura del cliente. Hasta aqui el segundo rol solo leia: esta migracion le
-- deja aportar informacion sin tocar nada del material clinico del profesional.
--
-- Cuatro piezas:
--   1. las dos tablas que faltaban (comidas cumplidas y serie de pesos)
--   2. el estado 'pending' de las citas, para que una peticion no sea todavia
--      una cita confirmada
--   3. la familia de policies de escritura del cliente
--   4. dos funciones para las mutaciones parciales, que una policy de UPDATE no
--      sabe expresar
--
-- Idempotente: CREATE ... IF NOT EXISTS, DROP ... IF EXISTS antes de crear.

-- ===== 1. Comidas cumplidas =====
-- Una fila por comida marcada. Que la fila exista es la marca: no hay columna
-- booleana ni borrado logico, desmarcar es borrarla.
--
-- La marca vive aparte del plan a proposito. Guardarla en plan_meal_item
-- obligaria a dar al cliente permiso de escritura sobre la tabla donde el
-- nutricionista pone los gramos y los alimentos, que es justo lo que no puede
-- pasar. Y la granularidad de aquella es por alimento, no por comida.
--
-- La clave primaria es la propia regla: una comida de un dia de un plan se
-- marca una vez. No hace falta un id subrogado que nadie referencia, ni un
-- indice aparte: la clave ya ordena por (plan, dia), que es como se consulta.
CREATE TABLE IF NOT EXISTS meal_check (
  plan_id      INTEGER  NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  day_num      SMALLINT NOT NULL CHECK (day_num > 0),
  meal_type_id INTEGER  NOT NULL REFERENCES meal_type(id),
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, day_num, meal_type_id)
);

-- ===== 2. Serie de pesos =====
-- El peso que declara el cliente. NO actualiza client.weight_kg, que es la
-- entrada del solver: un dato autoinformado no cambia un calculo clinico sin
-- que lo valide el profesional. Mismo tipo y mismo CHECK que aquella columna
-- para que ambos midan lo mismo.
--
-- Un peso por dia natural, y la clave primaria lo dice. Registrar dos veces el
-- mismo dia pisa el valor anterior, asi que corregir un dedazo es volver a
-- enviarlo.
CREATE TABLE IF NOT EXISTS weight_entry (
  client_id   INTEGER NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  measured_on DATE    NOT NULL,
  weight_kg   NUMERIC(5,2) NOT NULL CHECK (weight_kg > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, measured_on)
);

-- ===== 3. La cita pedida todavia no es una cita =====
-- 'scheduled' sigue significando confirmada, asi que las citas ya sembradas no
-- cambian de estado ni hay que migrar nada.
--
--   cliente pide            -> pending
--   nutricionista confirma  -> pending   -> scheduled
--   nutricionista rechaza   -> pending   -> cancelled
--   cliente cancela         -> pending | scheduled -> cancelled
--   nutricionista cierra    -> scheduled -> completed | no_show
--
-- Una pending cuya fecha ya paso no cambia de estado: se etiqueta como vencida
-- al pintarla. Marcarla en la tabla exigiria un proceso periodico que este
-- sistema no tiene, y borrarla esconderia una peticion sin contestar.
ALTER TABLE appointment DROP CONSTRAINT IF EXISTS appointment_status_check;
ALTER TABLE appointment ADD CONSTRAINT appointment_status_check
  CHECK (status IN ('pending', 'scheduled', 'completed', 'cancelled', 'no_show'));

-- ===== 4. Row Level Security =====
ALTER TABLE meal_check   ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_entry ENABLE ROW LEVEL SECURITY;

-- --- Comidas cumplidas ---
-- Las subconsultas de una policy pasan por la RLS de las tablas que nombran,
-- asi que estos EXISTS ya solo alcanzan planes que el propio actor puede ver.
-- Las condiciones se repiten igualmente: la policy dice lo que exige y no
-- depende de que otra siga siendo como es hoy.

DROP POLICY IF EXISTS p_meal_check_client_read ON meal_check;
CREATE POLICY p_meal_check_client_read ON meal_check
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM plan p
     WHERE p.id = meal_check.plan_id
       AND p.client_id = (SELECT public.current_client_id())
       AND p.approved_at IS NOT NULL
       AND p.deleted_at IS NULL
  ));

-- Marcar exige cuatro cosas. Las tres primeras van juntas porque son el mismo
-- plan: que sea suyo, que este firmado y que el dia no sea futuro. La cuarta va
-- aparte: que esa comida exista de verdad en ese dia del plan. Sin ella se
-- podria marcar una comida no planificada y la adherencia pasaria del 100%.
--
-- El limite de fecha usa CURRENT_DATE, que es la fecha del servidor en UTC. En
-- la franja horaria de Espana eso adelanta el corte hasta un par de horas de
-- madrugada: el dia en curso no se puede marcar hasta las 02:00. Se asume.
DROP POLICY IF EXISTS p_meal_check_client_write ON meal_check;
CREATE POLICY p_meal_check_client_write ON meal_check
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plan p
       WHERE p.id = meal_check.plan_id
         AND p.client_id = (SELECT public.current_client_id())
         AND p.approved_at IS NOT NULL
         AND p.deleted_at IS NULL
         AND p.start_date + (meal_check.day_num - 1) <= CURRENT_DATE
    )
    AND EXISTS (
      SELECT 1 FROM plan_meal_item i
       WHERE i.plan_id = meal_check.plan_id
         AND i.day_num = meal_check.day_num
         AND i.meal_type_id = meal_check.meal_type_id
    )
  );

-- Desmarcar lleva el mismo predicado que marcar salvo la comprobacion de que la
-- comida sigue en el plan: si el nutricionista la quita despues, la marca
-- huerfana tiene que poder borrarse igual.
DROP POLICY IF EXISTS p_meal_check_client_undo ON meal_check;
CREATE POLICY p_meal_check_client_undo ON meal_check
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM plan p
     WHERE p.id = meal_check.plan_id
       AND p.client_id = (SELECT public.current_client_id())
       AND p.approved_at IS NOT NULL
       AND p.deleted_at IS NULL
       AND p.start_date + (meal_check.day_num - 1) <= CURRENT_DATE
  ));

-- El profesional lee las marcas de sus clientes, tambien las de un plan que
-- todavia no ha firmado o que ya retiro, para no perder el historico.
DROP POLICY IF EXISTS p_meal_check_nutri_read ON meal_check;
CREATE POLICY p_meal_check_nutri_read ON meal_check
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM plan p
     WHERE p.id = meal_check.plan_id
       AND p.nutritionist_id = auth.uid()
       AND p.deleted_at IS NULL
  ));

-- --- Pesos ---
DROP POLICY IF EXISTS p_weight_client_read ON weight_entry;
CREATE POLICY p_weight_client_read ON weight_entry
  FOR SELECT TO authenticated
  USING (client_id = (SELECT public.current_client_id()));

DROP POLICY IF EXISTS p_weight_client_insert ON weight_entry;
CREATE POLICY p_weight_client_insert ON weight_entry
  FOR INSERT TO authenticated
  WITH CHECK (
    client_id = (SELECT public.current_client_id())
    AND measured_on <= CURRENT_DATE
  );

-- Pisar el peso del dia es un UPDATE, asi que hace falta su policy. Aqui una
-- policy es lo correcto y no una funcion: todas las columnas de la fila son
-- dato del propio cliente, de modo que no hay ninguna que deba quedar fuera de
-- su alcance. Donde la fila mezcla lo suyo con lo ajeno (el cuerpo de un
-- mensaje, la fecha de una cita) se resuelve mas abajo, y de otra manera.
DROP POLICY IF EXISTS p_weight_client_update ON weight_entry;
CREATE POLICY p_weight_client_update ON weight_entry
  FOR UPDATE TO authenticated
  USING (client_id = (SELECT public.current_client_id()))
  WITH CHECK (
    client_id = (SELECT public.current_client_id())
    AND measured_on <= CURRENT_DATE
  );

-- Retirar un peso declarado. La interfaz no lo ofrece, porque volver a enviarlo
-- ya corrige el del dia, pero el dato es enteramente del cliente y sin esta
-- policy no habria nadie capaz de borrarlo: el profesional solo lo lee.
DROP POLICY IF EXISTS p_weight_client_delete ON weight_entry;
CREATE POLICY p_weight_client_delete ON weight_entry
  FOR DELETE TO authenticated
  USING (client_id = (SELECT public.current_client_id()));

DROP POLICY IF EXISTS p_weight_nutri_read ON weight_entry;
CREATE POLICY p_weight_nutri_read ON weight_entry
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM client c
     WHERE c.id = weight_entry.client_id
       AND c.nutritionist_id = auth.uid()
       AND c.deleted_at IS NULL
  ));

-- --- Mensajes ---
-- El guard de sender es el nucleo de la policy: sin el, un cliente podria
-- escribir en su propio hilo una linea firmada por su nutricionista.
DROP POLICY IF EXISTS p_message_client_write ON message;
CREATE POLICY p_message_client_write ON message
  FOR INSERT TO authenticated
  WITH CHECK (
    client_id = (SELECT public.current_client_id())
    AND nutritionist_id = (SELECT public.current_client_nutritionist_id())
    AND sender = 'client'
  );

-- --- Citas ---
-- Misma idea aplicada al estado: el cliente solo puede crear la peticion, nunca
-- darla por confirmada. Y solo hacia el futuro.
DROP POLICY IF EXISTS p_appointment_client_request ON appointment;
CREATE POLICY p_appointment_client_request ON appointment
  FOR INSERT TO authenticated
  WITH CHECK (
    client_id = (SELECT public.current_client_id())
    AND nutritionist_id = (SELECT public.current_client_nutritionist_id())
    AND status = 'pending'
    AND scheduled_at > now()
    AND deleted_at IS NULL
  );

-- Sin policy de UPDATE para el cliente ni en message ni en appointment: le
-- dejaria reescribir el cuerpo de un mensaje o mover la fecha de una cita. Esas
-- dos mutaciones son parciales y van por funcion.

-- ===== 5. Las dos mutaciones parciales =====
-- Mismo patron que las funciones de 0012: SECURITY DEFINER para saltar la RLS
-- por dentro, search_path vacio para que nadie pueda colar sus propias tablas,
-- EXECUTE solo para authenticated, y el filtro de propiedad DENTRO de la
-- funcion, no en el argumento.

-- Marcar como leido lo que le ha escrito su nutricionista. Sin parametros a
-- proposito: no hay ningun id que manipular, asi que no hay hilo ajeno al que
-- apuntar. El UPDATE solo nombra read_at, de modo que el cuerpo del mensaje
-- queda fuera de alcance por construccion.
CREATE OR REPLACE FUNCTION public.client_mark_thread_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client INTEGER := public.current_client_id();
  v_count  INTEGER;
BEGIN
  IF v_client IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.message
     SET read_at = now()
   WHERE client_id = v_client
     AND sender = 'nutritionist'
     AND read_at IS NULL
     AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Cancelar una cita propia. El id llega por argumento, pero de nada sirve pasar
-- uno ajeno: el WHERE exige ademas que sea de su ficha. Solo cambia el estado,
-- y solo desde los dos que admiten cancelacion. Devuelve si cambio algo, para
-- poder distinguir la cancelacion de un intento que no encontro fila.
CREATE OR REPLACE FUNCTION public.client_cancel_appointment(p_appointment_id INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client INTEGER := public.current_client_id();
  v_count  INTEGER;
BEGIN
  IF v_client IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.appointment
     SET status = 'cancelled'
   WHERE id = p_appointment_id
     AND client_id = v_client
     AND status IN ('pending', 'scheduled')
     AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.client_mark_thread_read() FROM public;
REVOKE ALL ON FUNCTION public.client_cancel_appointment(INTEGER) FROM public;
GRANT EXECUTE ON FUNCTION public.client_mark_thread_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_cancel_appointment(INTEGER) TO authenticated;

-- Para revertir:
-- DROP FUNCTION IF EXISTS public.client_cancel_appointment(INTEGER);
-- DROP FUNCTION IF EXISTS public.client_mark_thread_read();
-- DROP POLICY IF EXISTS p_appointment_client_request ON appointment;
-- DROP POLICY IF EXISTS p_message_client_write ON message;
-- DROP TABLE IF EXISTS weight_entry;
-- DROP TABLE IF EXISTS meal_check;
-- ALTER TABLE appointment DROP CONSTRAINT IF EXISTS appointment_status_check;
-- ALTER TABLE appointment ADD CONSTRAINT appointment_status_check
--   CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show'));
