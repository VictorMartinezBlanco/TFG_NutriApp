-- NutriApp - alta automática del nutricionista.
-- Cuando Supabase Auth crea un usuario, este trigger le crea su fila en
-- nutritionist. El full_name viene de los metadatos del registro (options.data
-- en el signUp); si no llega, usa el email.
--
-- SECURITY DEFINER para poder escribir en nutritionist saltándose la RLS.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Para revertir:
-- DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_auth_user CASCADE;
