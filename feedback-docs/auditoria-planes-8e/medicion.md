# Medicion de la capa de sentido comun (fase 6 del Bloque 8e)

Fecha: 31 de julio de 2026. Maquina local de desarrollo (8 workers CP-SAT,
limite 90 s). El despliegue en Render y la regeneracion de los planes demo
persistidos quedan en espera: la ventana de prueba 8.5 esta abierta y no se
toca lo que ven los testers. La medicion en Render se hara al desplegar.

## Metodo

Linea base ANTES de tocar el motor (misma sesion: bancos tras aplicar la 0018
pero con el solver v0), una pasada por cambio y REPETICIONES para el veredicto
(leccion 7g/8c: los casos pesados oscilan entre pasadas y una pasada suelta
mide ruido). El "despues" de calidad se midio EN MEMORIA regenerando los 9
objetivos demo sin persistir (script gitignored `_after_audit_verify.py`), con
las restricciones reales de cada cliente, incluido el estilo clinico de nutri2.

## Bancos: verdes tras la capa

| Banco | Antes | Despues |
|---|---|---|
| check_solver | 25/25 | 30/30 (crece con 7 garantias de plausibilidad; ver nota) |
| check_validator | 25/25 | 38/38 (familia D nueva: 6 violaciones artificiales cazadas) |
| check_async | 14/14 | 14/14 |
| check_nutri_scope | 7/7 | 7/7 |
| Frontend RLS / E2E servidos | 106/106, 39/39 | 106/106, 39/39 |
| tsc / build | limpios | limpios |

Nota (hallazgo de banco): los 2 asserts comparativos del 8c ("sin reglas el
tope se pasaba", "las reglas reparten mejor") pasaron a fallar de forma
SISTEMATICA: los perfiles de racion son DATOS del catalogo, no constantes de
config, asi que la capa acota tambien la pasada "sin reglas" y el mundo pre-6f
ya no se puede reproducir relajando constantes. Se reformularon a asserts de
garantia (el banco queda en 30) y la pasada relajada queda como impresion
informativa. Continua la leccion del 8c sobre comparar solves no deterministas.

## Tiempos del banco del solver (local, segundos)

| Caso | Antes (1 pasada) | Despues p1 | Despues p2 |
|---|---|---|---|
| 1 Maria trivial 3x3 | <1 | 0,5 opt | 0,6 opt |
| 2 Maria kcal 1500 | (sin dato) | 7,0 opt | 8,8 opt |
| 3 kcal + vegetariana 7x5 | 22,2 opt | 20,8 opt | 43,8 opt |
| 4 forbid + proteina 7x5 | 68,8 opt | 90 feas | 89,2 opt |
| 5 forbid + sodio 7x5 | 90,0 opt | 90 feas | 90 feas |
| 8 sintetico completo | 90 feas | 90 feas | 90 feas |

Lectura honesta: los casos ligeros siguen ligeros; los pesados ya estaban
pegados al limite antes de la capa y siguen en el, y la oscilacion entre
pasadas (caso 4: feasible en p1, optimo en p2) es mayor que cualquier efecto
atribuible a la capa. La calidad se mantiene dentro de umbrales en todas las
pasadas (bancos verdes). En Render, pendiente de medir al desplegar.

## Generacion de los 9 objetivos demo (en memoria, 7x5)

9/9 factibles, 0 infactibles, 0 hard-fails del validador (que ahora audita
tambien la familia de plausibilidad).

| Cliente | Estado | Tiempo | Desviacion kcal |
|---|---|---|---|
| Maria Gonzalez | optimo | 53,6 s | 0,00% |
| Lucia Fernandez | factible | 90,4 s | sin objetivo |
| David Romero (sodio 1500 HARD) | factible | 90,5 s | 0,01% |
| Sofia Marin | factible | 90,5 s | sin objetivo |
| Carlos Ruiz | factible | 90,4 s | 0,04% |
| Tomas Alvarez (3000 kcal) | factible | 90,6 s | 11,33% |
| Second Tester Client (nutri2, CON estilo clinico) | factible | 90,4 s | sin objetivo |
| Alba Nieto (nutri2) | optimo | 20,9 s | 0,00% |
| Hugo Ferrer (nutri2) | optimo | 7,7 s | sin objetivo |

La generacion con el estilo clinico de nutri2 sigue viva en local con la capa
puesta. Tomas mejora respecto al 8c (17,85% -> 11,33%, mismo caso limite: 3000
kcal con el techo estructural de proteina). Salida completa en
`preview-despues-en-memoria.txt`.

## El antes/despues sobre el catalogo de sinsentidos (la figura del bloque)

Antes: 12 planes persistidos, 1.382 items. Despues: 9 planes en memoria, 1.094
items. Mismo instrumento (`audit_plans.py` / `main_report`).

| Contador | Antes | Despues |
|---|---|---|
| Items pegados al suelo global (10 g) | 488 (35,3%) | 23 (2,1%), todos minimos legitimos de perfil |
| Items pegados al techo global (300 g) | 429 (31,0%) | 37 (3,4%), todos maximos legitimos de perfil |
| Items fuera del perfil de su alimento | no medible | 0 (garantia dura, asserts del banco) |
| Comidas principales de un solo alimento | 12 | 0 (los 40 single-item son tentempies) |
| Comidas de solo aceite/condimento | 2 | 0 |
| Comidas con mas de una fruta | 47 | 0 |
| Comidas principales de solo fruta | 15 | 0 |
| Alimentos fuera de franja (pescado en desayuno...) | matriz S5 | 0 (garantia dura) |
| Comidas por debajo de 150 kcal | 106 (25,2%) | 49 (15,6%), residuo, ver abajo |

La figura FINAL del bloque se tomara re-ejecutando `audit_plans.py` sobre los
planes demo regenerados y persistidos, cuando se cierre la revision y se pueda
tocar la base de datos (ventana 8.5).

## Decision de Victor sobre el residuo: 4 comidas por defecto (medida)

En vez de un suelo de kcal por comida, Victor decidio bajar el defecto de 5 a
3/4 comidas. Al implementarlo aflora un fallo del mapeo original: "las
primeras N franjas por default_order" dejaba un plan de 3 comidas en
desayuno/media manana/comida, SIN CENA. Arreglado con un mapeo explicito en el
loader (3 = desayuno/comida/cena; 4 = + merienda; 5 = + media manana; 6 = +
recena) y defecto 4 en la UI de generacion, el cliente del backend y el schema
de la API.

Re-medicion con 4 comidas (mismos 9 objetivos, en memoria): 9/9 factibles,
0 hard-fails, bancos verdes tras el cambio de franjas (solver 30/30, validador
38/38, async 14/14).

| Contador | Antes de la capa (5c) | Capa con 5 comidas | Capa con 4 comidas |
|---|---|---|---|
| Comidas < 150 kcal | 106 (25,2%) | 49 (15,6%) | 16 (6,3%) |
| Comidas de un solo item | 60 (14,3%) | 40 (12,7%, tentempies) | 8 (3,2%, meriendas) |
| Comidas de solo frutos secos | 18 | 10 | 0 |
| Items en el suelo / techo global | 35,3% / 31,0% | 2,1% / 3,4% | 1,9% / 3,5% |

La hipotesis de Victor se confirma: el residuo de comidas de baja energia baja
a un tercio y el desayuno de solo frutos secos desaparece sin regla nueva.
Salida completa en `preview-despues-4-comidas.txt`.

## La figura final (planes regenerados y PERSISTIDOS, 4 comidas)

Tras el OK de Victor: borrados los 9 planes demo del 8c (48-56, respetando los
3 heredados 11-13), regenerados con `seed_demo_plans` (9/9 factibles, firmas
segun objetivo, planes 78-86) y fechas reancladas con el 0017. Auditoria final
con `audit_plans.py 78` (el filtro nuevo deja fuera los heredados pre-capa):

| Contador | Antes (linea base) | Final persistido |
|---|---|---|
| Items en el suelo global de 10 g | 35,3% | 2,4% (minimos legitimos) |
| Items en el techo de 300 g | 31,0% | 3,5% (maximos legitimos) |
| Comidas de un solo item | 14,3% | 2,0% (meriendas) |
| Comidas de solo condimento/frutos secos | 18 | 0 |
| Comidas con mas de una fruta | 47 | 0 |
| Comidas principales de solo fruta | 15 | 0 |
| Comidas < 150 kcal | 25,2% | 5,2% |

Salida completa en `linea-final-despues.txt`. Los sinsentidos concretos de la
tabla de regresion del catalogo (desayuno-aceite, comida de 4 kcal, desayuno
de 300 g de arroz, fruta a granel, bacalao en desayuno) ya no pueden aparecer:
son garantias duras del modelo, no coincidencias de esta pasada.

**Trade-off medido de las 4 comidas**: los objetivos caloricos ALTOS pierden
margen. Tomas (3000 kcal) pasa de 11,33% de desviacion con 5 comidas a 40,87%
con 4 (optimo demostrado: no da mas de si), porque 4 comidas x 4 items con
raciones acotadas topan la energia diaria alcanzable. El defecto es 4, y para
un objetivo alto el profesional sube las comidas en el propio formulario (el
campo sigue editable 1-6).

## Casos frontera restantes

1. **Tentempies de una pieza** (8 comidas, meriendas de fruta): legitimos por
   diseno.
2. **Desayuno de solo frutos secos**: desaparecio con 4 comidas en la pasada
   medida; sigue siendo POSIBLE en teoria (sin franja ni rol). Se deja
   anotado; si reaparece en la figura final, se pregunta antes de anadir regla.
