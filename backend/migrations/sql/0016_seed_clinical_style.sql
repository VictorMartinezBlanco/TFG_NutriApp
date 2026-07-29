-- Estilo clinico de demostracion: dos restricciones de ambito nutricionista,
-- las primeras del proyecto. Sin ellas el tab "My clinical style" de Settings
-- sale vacio, porque hasta ahora todas las restricciones sembradas eran de
-- ambito cliente.
--
-- Viven en el SEGUNDO nutricionista, no en el principal, y es una decision
-- MEDIDA, no de gusto. Se sembraron primero en el principal y se paso el
-- benchmark de extremo a extremo contra el despliegue antes y despues: con el
-- estilo cargado, los casos de 7 dias y 5 comidas con alguna prohibicion
-- dejaron de encontrar un plan dentro del limite de 90 s en la CPU del hosting
-- gratuito (~0.1 CPU) y volvian como infactibles con el nucleo vacio; sin el,
-- los mismos casos salen factibles (uno incluso optimo en 60 s). En local la
-- diferencia no se aprecia: el mismo caso con estilo resuelve factible en ~90 s
-- y sin el en 30-45 s. Dos terminos blandos mas en el objetivo bastan para
-- empujar la busqueda del primer incumbente fuera del presupuesto del free
-- tier, y eso rompia el propio boton de generar de la demostracion.
--
-- Con el estilo en el segundo profesional, el tab se ensena entrando con su
-- cuenta y la generacion del principal queda como estaba. Es ademas el ejemplo
-- honesto de que una restriccion de ambito nutricionista es una restriccion DE
-- VERDAD del modelo, no decoracion del tab: se paga en el solver.
--
-- Idempotente: borra las de los dos nutris de prueba antes de reinsertar (las
-- del principal, por si quedo alguna de la medicion).

DO $$
DECLARE
  v_nutri1 UUID := '03f06edf-603e-489d-8aed-71bc93f97ef0';
  v_nutri2 UUID;
  v_tag_vegetable INTEGER;
  v_nut_sugar     INTEGER;
  v_unit_g        INTEGER;
BEGIN
  SELECT id INTO v_nutri2 FROM nutritionist WHERE full_name = 'Dr. Second Tester';
  IF v_nutri2 IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_tag_vegetable FROM tag      WHERE code = 'vegetable';
  SELECT id INTO v_nut_sugar     FROM nutrient WHERE code = 'sugar_added_g';
  SELECT id INTO v_unit_g        FROM unit     WHERE code = 'g';

  DELETE FROM diet_constraint
   WHERE scope_type = 'nutritionist'
     AND scope_nutritionist_id IN (v_nutri1, v_nutri2);

  INSERT INTO diet_constraint
    (scope_type, scope_nutritionist_id, type, target_tag_id, target_nutrient_id,
     operator, value, unit_id, priority, weight, source)
  VALUES
    ('nutritionist', v_nutri2, 'prefer_tag',   v_tag_vegetable, NULL,        'prefer', NULL, NULL,     'soft', 5, 'manual'),
    ('nutritionist', v_nutri2, 'nutrient_max', NULL,            v_nut_sugar, 'max',    25,   v_unit_g, 'soft', 5, 'manual');
END $$;
