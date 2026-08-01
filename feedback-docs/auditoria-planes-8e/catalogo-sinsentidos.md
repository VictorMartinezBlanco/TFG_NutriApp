# Auditoría de sentido común alimentario (fase 0 del Bloque 8e)

Fecha: 31 de julio de 2026. Instrumento: `backend/scripts/audit_plans.py`
(permanente; se vuelve a correr al cerrar el bloque para el antes/después).
Salida completa de esta pasada: `linea-base-antes.txt` en esta carpeta.

## Qué se auditó

Los 12 planes vivos de la base de datos, todos generados por el pipeline real
(solver + validador + firma), con 1.382 items en 420 comidas:

- Los 3 planes históricos de Maria, John y Emma (11, 12, 13), generados con el
  catálogo anterior a los 100 alimentos.
- Los 9 planes de demostración del Bloque 8c (48 a 56), generados por
  `seed_demo_plans.py` con las restricciones reales de cada cliente.
- El plan 54 (Second Tester Client) salió del flujo de la prueba 8.5 (recorrido
  o tester); es igual de válido para la auditoría porque lo produjo el mismo
  motor. La ventana de la prueba sigue abierta: el feedback de los nutris se
  volcará aquí según llegue, antes de cerrar la calibración de perfiles.

Método: primero medir, luego decidir (mismo criterio que el estudio de formatos
del 7g). El script solo mide; los umbrales que usa para señalar candidatos
(25 g, 250 g, 150 kcal) son heurísticos de auditoría para revisar a mano, no
constantes del modelo. Este documento pone el juicio encima de esa medición y
de él salen las reglas de la capa, cada una motivada por un sinsentido
documentado, no al revés.

## El hallazgo central: los límites globales actúan de atractores

El solver v0 tiene dos constantes iguales para los 100 alimentos:
`MIN_GRAMS_PRESENT = 10` y `GRAMS_MAX = 300`. La auditoría muestra que no son
un rango dentro del que el modelo elige, sino dos imanes:

| Dónde cae el item | Items | Porcentaje |
|---|---|---|
| En el suelo (10 g) | 488 | 35,3% |
| En el techo (295-300 g) | 429 | 31,0% |
| Total pegado a un límite | 917 de 1.382 | 66,3% |

La mecánica es visible en los datos:

- El suelo de 10 g es el relleno barato con el que el solver cumple la variedad
  mínima diaria y el reparto del 6f: mete "testigos" de 10 g que no aportan
  nada a la comida (10 g de jamón cocido, 10 g de pera). La regla de variedad
  se satisface en la letra y se viola en el espíritu.
- El techo de 300 g es donde aparca volumen de baja densidad calórica para
  ajustar kcal sin pasarse: verduras crudas a 300 g en todas las franjas
  (mediana 300 en brócoli, calabacín, coliflor, champiñón, espinacas...).

La consecuencia es que el 66% de las cantidades del plan no las decide ninguna
lógica nutricional. Es la causa raíz confirmada que motiva el perfil de ración
por alimento.

Matiz de lectura: los totales DIARIOS sí están garantizados (suelo calórico,
rangos de macros, restricciones duras: eso lo vigilan solver y validador desde
el 6c/6d). El sinsentido vive un nivel por debajo, dentro de cada comida, que
es justo donde el modelo v0 no tiene reglas.

## Catálogo de sinsentidos

Cada entrada: qué es, cuánto hay, ejemplos reales (plan, día, comida) y la
regla de la capa que lo elimina.

### S1. Raciones fuera de rango por alimento

Sin perfil por alimento, cualquier cantidad entre 10 y 300 g es legal para
cualquier alimento. Casos medidos:

- Aceite de oliva virgen extra a 158 g en un desayuno (plan 54, día 7): 1.397
  kcal de aceite. También 98 g como merienda entera (plan 54, día 2, 866 kcal).
- Arroz blanco crudo a 300 g en un desayuno (plan 56, día 7): 1.062 kcal de
  arroz solo. Los alimentos que el catálogo define en crudo o en seco (arroz,
  pasta, legumbre seca) multiplican el absurdo: 300 g en seco son unos 900 g
  cocinados.
- Aceituna verde a 287 g, pistachos a 277 g, aguacate a 296 g como cena de un
  solo item (plan 54, día 2).
- En el otro extremo, el relleno de 10 g: 10 g de plátano como desayuno entero
  (plan 54, día 4, 9 kcal), 10 g de pechuga de pavo como comida (plan 54,
  día 7).
- 555 items a 25 g o menos y 492 items a 250 g o más (de 1.382).

Regla que lo elimina: perfil de ración por alimento (`min_serving_g`,
`max_serving_g`) que sustituye a los globales por aparición. Los globales
quedan solo como fallback para alimentos sin perfil.

Nota de calibración: los perfiles se definen sobre el estado en que el catálogo
describe el alimento (crudo/seco), igual que sus nutrientes por 100 g.

### S2. Comidas hechas de testigos de 10 g

La combinación del relleno de S1 con la falta de reglas por comida produce
comidas que existen solo sobre el papel:

- Desayuno de Maria (plan 48, día 4): tomate 10 g, berenjena 10 g, pepino
  10 g, repollo 10 g. Total: 8 kcal.
- Comida del plan 54 (día 4): cebolla 10 g. Total: 4 kcal.
- 106 de las 420 comidas (25%) quedan por debajo de 150 kcal, y las peores
  bajan de 20 kcal.

Regla que lo elimina: el propio perfil de ración (un min_serving_g realista
convierte el testigo en ración o lo expulsa) más el tamaño de comida (mínimo y
máximo de alimentos por comida). El umbral de 150 kcal es heurístico de
auditoría; no se propone un suelo de kcal por comida porque no está en el
diseño aprobado (si al implementar pareciera necesario, se pregunta antes).

### S3. Comidas de un solo alimento donde no toca

60 de 420 comidas tienen un único item. El matiz importa y calibra la regla:

- Legítimas: las de media mañana y merienda de los planes históricos (manzana
  150 g, yogur 125 g, almendras 30 g). Un tentempié de una pieza es normal.
- Sinsentido: comida principal de un solo alimento. Comida = 300 g de
  calabacín crudo (plan 52, día 3, 51 kcal), desayuno = 300 g de repollo
  (plan 56, día 6), cena = 296 g de aguacate (plan 54, día 2), desayuno =
  300 g de arroz crudo (plan 56, día 7).

Regla que lo elimina: tamaño de comida con mínimos distintos por franja (las
principales exigen composición; los tentempiés admiten pieza única). La franja
se apoya en los tags de momento de la fase 1.

### S4. Condimentos y grasas como plato

Alimentos cuyo papel es acompañar aparecen como comida entera:

- Las dos comidas de solo aceite del plan 54 (S1) son el caso extremo.
- 18 comidas se componen solo de alimentos sin familia (grasas y frutos
  secos). Las 16 de almendras a 30 g como merienda son defendibles; las de
  aceite no lo son nunca.

Regla que lo elimina: tag de rol condimento + acompañamiento obligatorio (un
condimento nunca va solo en una comida) + tope diario de condimentos. El tope
diario hoy no se viola (0 casos de condimento repetido en el día, porque la
regla del 6f ya limita a 2 las apariciones del mismo alimento por día), pero
la regla cierra el hueco de 5 condimentos DISTINTOS en un día, que hoy es
legal.

### S5. Alimentos en momentos del día absurdos

La matriz alimento x franja de la línea base muestra que el modelo no sabe qué
es un desayuno:

- Pescado y marisco en el desayuno: bacalao (3 veces), calamar, mejillón,
  sardina, merluza, gambas.
- Legumbre seca en el desayuno: haba seca (4 veces), lenteja roja, garbanzos,
  alubia blanca.
- Verdura cruda dominando el desayuno: acelga (11), champiñón (13), brócoli
  (11), berenjena (6)... a menudo a 300 g.
- Los cereales de desayuno azucarados aparecen 2 veces, y ninguna en el
  desayuno (las dos en media mañana).
- Pierna de cordero como merienda (4 de sus 6 apariciones).

Regla que lo elimina: afinidad comida-momento con tags de momento del día
(fase 1): el alimento restringido a sus franjas plausibles.

### S6. Fruta apilada y fruta como plato único

- 47 comidas con más de una fruta. El plan 55 (Alba) es el caso extremo: casi
  todas sus comidas son 3-4 frutas (su preferencia vegetariana más el hueco
  del modelo convergen en un plan de fruta a granel).
- 15 comidas principales son SOLO fruta, incluida la variante con cantidades
  grandes: comida = plátano 10 g + naranja 10 g + sandía 300 g + melocotón
  300 g (plan 55, día 3).

Regla que lo elimina: dulce/fruta como complemento (máximo 1 por comida y la
fruta no puede ser el plato único de una comida principal).

### S7. El plan monotemático como suma de los anteriores

El plan 48 (Maria, kcal bajas más preferencia vegetariana) es casi entero
verdura cruda a 300 g con testigos de 10 g; el plan 55 es el equivalente en
fruta. Ninguna regla individual los describe: son el aspecto que toma un plan
cuando las cantidades las decide la geometría del espacio de búsqueda. Sirven
de casos de regresión de conjunto: tras la capa, estos dos clientes deben
recibir planes que un humano reconozca como menús.

## Lista de casos de regresión (el antes/después del bloque)

El criterio de cierre es re-ejecutar `audit_plans.py` sobre los planes
regenerados (`seed_demo_plans.py`) con la capa puesta y comprobar:

| Contador de la auditoría | Antes | Después esperado |
|---|---|---|
| Items pegados al suelo global de 10 g | 488 (35,3%) | 0 salvo alimentos cuyo perfil admita 10 g (aceites, semillas) |
| Items pegados al techo global de 300 g | 429 (31,0%) | 0 salvo alimentos cuyo perfil admita 300 g |
| Items fuera del perfil de su alimento | no medible aún | 0 (garantía dura) |
| Comidas de solo condimento/grasa sin acompañar | 18 | 0 |
| Comidas principales de un solo alimento | 12 | 0 |
| Comidas principales de solo fruta | 15 | 0 |
| Comidas con más de 1 fruta/dulce | 47 | 0 |
| Alimentos fuera de sus franjas horarias | matriz S5 | 0 apariciones fuera de franja |
| Comidas por debajo de 150 kcal | 106 (25%) | revisar el residuo (indicador, no regla) |

Casos concretos que deben desaparecer (verificables uno a uno en la línea
base): el desayuno-aceite (plan 54 d7), la merienda-aceite (plan 54 d2), el
desayuno de 8 kcal (plan 48 d4), la comida de 4 kcal (plan 54 d4), el
desayuno de 300 g de arroz (plan 56 d7), la comida de fruta a granel (plan 55
d3) y las 3 apariciones de bacalao en desayunos (matriz S5).

Los dos asserts de conjunto: los planes regenerados de Maria (perfil kcal bajo
+ vegetariana) y Alba dejan de ser monotemáticos (S7).

Matiz esperado (lección 6f/8c): al estrechar dominios, algún caso del banco
puede volverse infactible o más caro de resolver. Eso es un hallazgo a
discutir y documentar con su escalera, no un bug silencioso.

## Hueco abierto: feedback de la prueba 8.5

La ventana con nutricionistas está abierta a fecha de este documento. Lo que
llegue se vuelca en este catálogo (nuevas categorías o ejemplos que refuercen
las existentes) antes de cerrar la calibración de los perfiles de la fase 2.
Si aparecieran tipos de sinsentido que pidan reglas no listadas en el diseño
aprobado, se consultan antes de implementar.
