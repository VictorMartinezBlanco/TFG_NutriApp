-- Acceso del cliente a la aplicacion. Introduce el segundo rol: hasta aqui
-- todas las policies eran "el nutri ve lo suyo" y un cliente logueado no habria
-- visto nada.
--
-- Tres piezas:
--   1. el vinculo client -> auth.users (nullable: no todo cliente tiene cuenta)
--   2. el trigger de alta, que ya no crea un nutricionista para una cuenta de
--      cliente
--   3. la familia de policies del cliente sobre las tablas que ya existen
--
-- Las policies permisivas se combinan con OR, asi que ninguna policy del nutri
-- se toca ni se reescribe: el panel del profesional queda exactamente igual.
-- Todas las del cliente son de LECTURA. La escritura (marcar comidas, escribir
-- mensajes, pedir cita) llega con sus pantallas.
--
-- Idempotente: guardas por catalogo y DROP POLICY IF EXISTS antes de cada
-- CREATE POLICY.

-- ===== 1. Vinculo con la cuenta =====
-- ON DELETE SET NULL, no CASCADE: borrar la cuenta de acceso no puede borrar la
-- historia clinica, que es del nutricionista. El UNIQUE ya crea el indice por
-- el que se busca el cliente logueado, no hace falta otro.
ALTER TABLE client ADD COLUMN IF NOT EXISTS auth_user_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_client_auth_user'
  ) THEN
    ALTER TABLE client ADD CONSTRAINT uq_client_auth_user UNIQUE (auth_user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_client_auth_user'
  ) THEN
    ALTER TABLE client ADD CONSTRAINT fk_client_auth_user
      FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- ===== 2. Alta por rol =====
-- El rol viaja en los metadatos del alta porque es el unico dato disponible en
-- el INSERT de auth.users: la fila de client se vincula despues. Ese metadato
-- NO se usa en ninguna policy, porque el propio usuario puede editarlo desde el
-- navegador; la autorizacion va siempre por el vinculo de abajo.
-- Sin rol declarado el alta sigue creando un nutricionista, asi que el registro
-- que ya existia no cambia.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(NEW.raw_user_meta_data->>'role', 'nutritionist') = 'client' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.nutritionist (id, full_name, locale_default)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NEW.email,
      'Nutricionista'
    ),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'locale', ''), 'es')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ===== 3. Quien es el cliente logueado =====
-- SECURITY DEFINER por dos razones: una policy sobre client que consultara
-- client entraria en recursion infinita de RLS, y asi la resolucion del vinculo
-- no depende de las policies que ella misma alimenta. STABLE para que el plan
-- la evalue una vez por sentencia y no por fila.
-- Un cliente dado de baja (deleted_at) deja de resolver, y con ello pierde el
-- acceso a todo sin tocar ninguna policy.
CREATE OR REPLACE FUNCTION public.current_client_id()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id
  FROM public.client c
  WHERE c.auth_user_id = auth.uid() AND c.deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.current_client_nutritionist_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.nutritionist_id
  FROM public.client c
  WHERE c.auth_user_id = auth.uid() AND c.deleted_at IS NULL
$$;

REVOKE ALL ON FUNCTION public.current_client_id() FROM public;
REVOKE ALL ON FUNCTION public.current_client_nutritionist_id() FROM public;
GRANT EXECUTE ON FUNCTION public.current_client_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_client_nutritionist_id() TO authenticated;

-- ===== 4. Familia de policies del cliente =====
-- Para un nutricionista las dos funciones devuelven NULL, y una comparacion con
-- NULL no es cierta, asi que ninguna de estas policies le concede una fila.

-- Su propia ficha. Predicado directo, sin funcion, porque es su misma fila.
DROP POLICY IF EXISTS p_client_self_read ON client;
CREATE POLICY p_client_self_read ON client
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() AND deleted_at IS NULL);

-- Solo su nutricionista, para poder poner su nombre en pantalla.
DROP POLICY IF EXISTS p_nutri_client_read ON nutritionist;
CREATE POLICY p_nutri_client_read ON nutritionist
  FOR SELECT TO authenticated
  USING (id = (SELECT public.current_client_nutritionist_id()));

-- Solo planes FIRMADOS. Un borrador es material de trabajo del profesional y es
-- invisible para el cliente en la propia base de datos, no solo en la interfaz.
DROP POLICY IF EXISTS p_plan_client_read ON plan;
CREATE POLICY p_plan_client_read ON plan
  FOR SELECT TO authenticated
  USING (
    client_id = (SELECT public.current_client_id())
    AND approved_at IS NOT NULL
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS p_pmi_client_read ON plan_meal_item;
CREATE POLICY p_pmi_client_read ON plan_meal_item
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM plan p
    WHERE p.id = plan_meal_item.plan_id
      AND p.client_id = (SELECT public.current_client_id())
      AND p.approved_at IS NOT NULL
      AND p.deleted_at IS NULL
  ));

DROP POLICY IF EXISTS p_message_client_read ON message;
CREATE POLICY p_message_client_read ON message
  FOR SELECT TO authenticated
  USING (client_id = (SELECT public.current_client_id()));

DROP POLICY IF EXISTS p_appointment_client_read ON appointment;
CREATE POLICY p_appointment_client_read ON appointment
  FOR SELECT TO authenticated
  USING (client_id = (SELECT public.current_client_id()));

-- La disponibilidad de su nutricionista, para pedir cita mas adelante.
DROP POLICY IF EXISTS p_availability_client_read ON availability;
CREATE POLICY p_availability_client_read ON availability
  FOR SELECT TO authenticated
  USING (nutritionist_id = (SELECT public.current_client_nutritionist_id()));

-- Los alimentos del catalogo global ya los ve cualquier usuario logueado por
-- p_food_read, pero los que el nutricionista se creo a medida no, y su plan
-- puede estar hecho con ellos. Esta policy suma esos, sin tocar la del nutri.
DROP POLICY IF EXISTS p_food_client_read ON food;
CREATE POLICY p_food_client_read ON food
  FOR SELECT TO authenticated
  USING (nutritionist_id = (SELECT public.current_client_nutritionist_id()));

-- Y su composicion, que vive en otra tabla con el mismo limite.
DROP POLICY IF EXISTS p_fn_client_read ON food_nutrient;
CREATE POLICY p_fn_client_read ON food_nutrient
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM food f
    WHERE f.id = food_nutrient.food_id
      AND f.nutritionist_id = (SELECT public.current_client_nutritionist_id())
  ));

-- Sin policy a proposito: diet_constraint (razonamiento clinico del
-- profesional), food_tag, recipe, recipe_ingredient, external_food_mapping,
-- generation_task y llm_translation (herramienta interna del nutricionista).
-- Los catalogos (nutrient, tag, meal_type, unit) ya son legibles para cualquier
-- usuario autenticado y no necesitan nada.

-- Para revertir:
-- DROP POLICY IF EXISTS p_fn_client_read ON food_nutrient;
-- DROP POLICY IF EXISTS p_food_client_read ON food;
-- DROP POLICY IF EXISTS p_availability_client_read ON availability;
-- DROP POLICY IF EXISTS p_appointment_client_read ON appointment;
-- DROP POLICY IF EXISTS p_message_client_read ON message;
-- DROP POLICY IF EXISTS p_pmi_client_read ON plan_meal_item;
-- DROP POLICY IF EXISTS p_plan_client_read ON plan;
-- DROP POLICY IF EXISTS p_nutri_client_read ON nutritionist;
-- DROP POLICY IF EXISTS p_client_self_read ON client;
-- DROP FUNCTION IF EXISTS public.current_client_nutritionist_id();
-- DROP FUNCTION IF EXISTS public.current_client_id();
-- ALTER TABLE client DROP COLUMN IF EXISTS auth_user_id;
