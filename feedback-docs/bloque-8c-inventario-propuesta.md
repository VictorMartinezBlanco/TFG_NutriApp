# Bloque 8c. Inventario y propuesta de datos de demostracion

Estado: propuesta VALIDADA el 28 de julio de 2026. Las siete decisiones estan
resueltas y anotadas en la seccion 10. La ejecucion va en marcha.

Fecha del inventario: 28 de julio de 2026, contra la BD de Supabase (Frankfurt).
Las cifras de "hoy" son consultadas, no estimadas.

## 0. Linea base medida ANTES de tocar nada (hallazgo)

Con los 58 alimentos y los datos de hoy:

| Banco | Resultado |
|---|---|
| `check_solver` (local) | **22/22 PASS** |
| `check_e2e` (contra Render) | **28 PASS, 1 FAIL** |

El fallo es el **caso 2** (Maria, objetivo calorico 1500 blando sobre 7x5):
**8,53 % de desviacion calorica**, con el umbral del banco en 5 %. El mismo caso
en local da **0,0 % y optimo en 2,1 s**.

**El benchmark ya no estaba en 29/29 antes de este bloque.** El 6f lo dejo en
29/29 con el caso 2 al 2,25 %, con el mismo codigo, los mismos datos y el mismo
limite de 90 s. Asi que lo que ha cambiado es el presupuesto efectivo de CPU del
free tier de Render, no el modelo.

Esto es exactamente lo que la linea base tenia que capturar: si hubiera cargado
primero los 100 alimentos, la degradacion se le habria achacado al catalogo.

Otro detalle del mismo run: el nucleo del caso 6 sale
`{forbid_tag, kcal_target, nutrient_min}`, con el `forbid_tag` de la alergia de
John que la API agrega desde el seed. El assert comprueba subconjunto, asi que
pasa; es el hallazgo 2 del 6e, vigente.

### El caso 2 no fallaba, oscilaba

Repitiendo los dos casos mas pesados con el servicio ya despierto, tres veces
cada uno, con 58 alimentos:

| Caso | rep 1 | rep 2 | rep 3 | tiempo de solve | gap |
|---|---|---|---|---|---|
| 2, Maria kcal 1500 sobre 7x5 | 1,33 % | 5,03 % | 6,09 % | 90 s las tres | ~1,0 |
| 7, Michael kcal 2000 + reparto sobre 7x4 | 8,24 % | 3,22 % | 5,32 % | 90 s las tres | 1,0 |

Los seis agotan el limite y cierran con `gap = 1.0`, es decir **el solver no
llega a acotar nada**: devuelve el mejor incumbente que encontro, y su calidad
depende de hasta donde llego la busqueda en 90 s de CPU estrangulada. El umbral
del 5 % del banco se cruza en dos de cada tres pasadas. **No es un fallo nuevo
del bloque: es una prueba inestable que llevaba tiempo asi y que el 6f pillo en
una pasada buena.**

## 0 bis. La misma medida con 100 alimentos (pasada 1)

| Caso | 58 alimentos | 100 alimentos |
|---|---|---|
| 2, en Render | 1,33 / 5,03 / 6,09 % | **1,36 / 1,36 / 0,13 %** |
| 7, en Render | 8,24 / 3,22 / 5,32 % | **12,21 / 13,70 %** |
| 2, en local | 0,0 %, optimo, 2,1 s | **0,0 %, optimo, 4,9 s** |
| 3, en local | 0,0 %, optimo, 3,4 s | **0,0 %, optimo, 8,0 s** |

Tres conclusiones que no se veian venir:

1. **Ampliar el catalogo no degrada la calidad por si mismo, y en el caso 2 la
   mejora.** Con mas alimentos hay mas combinaciones que cuadran 1500 kcal, asi
   que un incumbente bueno aparece antes. El caso 7, que ademas reparte la
   energia por comida y por tanto multiplica las variables auxiliares, si empeora.
2. **En hardware suficiente el modelo aguanta de sobra**: en local sigue dando el
   optimo demostrado con 0,0 % de desviacion, al doble de tiempo (2,1 a 4,9 s).
   Lo que falla en Render es el presupuesto de CPU, no el modelo.
3. **El coste real es el tiempo de respuesta.** El caso 8 pasa a tardar
   **114,4 s** contra Render (90 s de solve mas unos 24 s de cargar el pool de
   100 alimentos, validar y serializar 350 items), y en otra repeticion 91,9 s.
   El cliente del banco cortaba a los 120 s.

### Efecto no previsto: cuesta mas DEMOSTRAR una infactibilidad

Buscando en local el umbral del caso 12 (minimo de calcio con lacteos, pescado,
soja y frutos secos prohibidos) con los 100 alimentos:

| Minimo de calcio | Veredicto | Nucleo |
|---|---|---|
| 3000 mg | infactible | **vacio**, con el mensaje de que se agoto el tiempo |
| 3500 mg y por encima | infactible | `{forbid_tag, nutrient_min}` correcto |

El caso sigue siendo infactible, pero a 3000 mg **la infactibilidad ya no se
demuestra dentro del limite**, y una infactibilidad sin demostrar devuelve el
`unsat_core` vacio, que es justo el diagnostico que el 6c construyo. Con 75 de
los 100 alimentos fuera de las cuatro familias prohibidas, el espacio a descartar
es mayor y la prueba se alarga.

Es el efecto contrario al que yo esperaba: no es que sobre calcio y el caso se
vuelva factible, es que cuesta mas cerrar el argumento.

(Nota posterior: con 120 s en local, a 3000 SI aparecio una solucion factible,
asi que a ese umbral el caso ya ni siquiera es infactible con el pool ampliado.
El caso del benchmark quedo recalibrado a 6000, donde la prueba tarda 2 s en
local y Render la cierra con el nucleo correcto.)

## 0 ter. El estilo clinico se paga en el solver (resultado de la decision 3)

La decision 3 se ejecuto como se pacto: sembrar las 2 restricciones de ambito
nutricionista en el principal (opcion a) y MEDIR. Resultado, con atribucion
aislada por sonda (mismo dia, mismos casos, con y sin las 2 filas):

| Caso contra Render | Con estilo en nutri1 | Sin estilo |
|---|---|---|
| 4 (John, forbid peanuts, 7x5) | infactible, nucleo VACIO, 92 s | factible, 92 s |
| 5 (Emma, forbid lactose, 7x5) | infactible, nucleo VACIO, 92 s | factible OPTIMA, 60 s |
| 8 (Michael, max red_meat, 7x5) | infactible, nucleo VACIO, 92 s | factible, 92 s |
| Flujo del boton de generar (Emma) | sin plan | persiste y firma |

Dos terminos blandos mas en el objetivo bastan para que la CPU del free tier no
encuentre NI EL PRIMER incumbente en 90 s en los casos 7x5 con prohibiciones. Y
un solver que agota el limite sin incumbente responde "infactible" con el nucleo
vacio, que es falso ademas de inutil. En local la diferencia ni se aprecia.

**Plan B ejecutado** (el pactado en la decision 3): el estilo clinico vive en el
SEGUNDO nutricionista. La 0016 quedo reescrita con el porque medido en su
comentario. El tab del principal ensena su estado vacio honesto; el del segundo
se ensena entrando con su cuenta. Para la memoria: la evidencia empirica de que
una restriccion de ambito nutricionista no es decoracion del tab, es una
restriccion real del modelo con coste real.

## Veredicto final del bloque

Pasada final de `check_e2e` contra Render, con el catalogo de 100, el caso 12
recalibrado a 6000 y el estilo en nutri2: **29 PASS, 0 FAIL**, incluido el flujo
completo generar -> Draft -> firmar -> Signed y el nucleo de infactibilidad
DEMOSTRADO en el free tier. El resto del criterio de hecho: check_solver 25/25
(antes 22), validator 25/25, translator 15/15, precheck 44/44, async 14/14,
`check-client-rls` 106/106, `check-client-e2e` 39/39, build y tsc limpios,
pasada visual servida 27/27.

---

## 1. Foto actual de la base de datos

| Tabla | Filas hoy | Comentario |
|---|---|---|
| `nutritionist` | 2 | Dra. Test Nutri (5 clientes) y Dr. Second Tester (1) |
| `client` | 6 | 4 reales de nutri1 + 1 de nutri2 + 1 borrado logico ("RLS probe own", residuo) |
| `food` | 58 | todos globales, `source='custom'` |
| `food_nutrient` | 607 | media de 10,5 nutrientes por alimento |
| `food_tag` | 303 | |
| `diet_constraint` | 7 | 6 del seed 0005 + 1 residuo de prueba (Michael, `carb_g` min 100) |
| `plan` | 6 | 3 del seed 0006 + 3 borradores residuo del 16 de julio |
| `plan_meal_item` | 357 | |
| `appointment` | 7 | 6 del 0008 + 1 pendiente del 0013 |
| `availability` | 10 | solo nutri1 (lunes a viernes, dos tramos) |
| `message` | 10 | 3 hilos, **todos leidos** (los runners marcaron leido) |
| `meal_check` | 6 | solo Maria |
| `weight_entry` | 6 | solo Maria, seis pesos semanales |
| `recipe`, `recipe_ingredient` | 0 | fuera del modelo v0 |
| `external_food_mapping` | 0 | carga masiva BEDCA/USDA es trabajo futuro |
| `llm_translation` | 0 | se llena al usar el traductor con Ollama |
| `generation_task` | 0 | se llena al usar la generacion asincrona |
| `nutrient` / `tag` / `meal_type` / `unit` | 12 / 27 / 6 / 7 | catalogos cerrados |

Reparto de familias en los 58 alimentos: `protein_source` 13, `cereal` 11,
`vegetable` 10, `fruit` 8, `dairy` 7, `legume` 4, `red_meat` 1 (subfamilia),
5 sin familia (aceite, almendras, crema de cacahuete, nueces, semillas de girasol).

Tres tags del catalogo no los usa ningun alimento: `mollusks_allergen`,
`high_phosphorus`, y `nova_4` solo uno (jamon cocido).

### Residuos de ejecucion detectados

No son datos de demostracion intencionales, sino restos de pruebas:

- `plan` 22, 23 y 24: borradores creados el 16 de julio por pruebas del pipeline.
  Dejan a John con tres planes y a Emma con dos, sin criterio.
- `diet_constraint` 31: Michael con `nutrient_min carb_g 100 soft`, creada el 16
  de julio desde la UI del 6b. **Michael es el cliente "limpio" en el que se
  apoyan los casos 7 a 12 del benchmark E2E**, y el caso 11 dice literalmente
  "genera para un cliente sin constraints propias". El residuo lo desmiente.
- `client` 14 ("RLS probe own"), borrado logico el 7 de julio por un runner.
- `message`: todos con `read_at` puesto. El badge de no leidos, que es una de las
  cosas que el 8b anadio, **hoy no se ve en la demostracion**.

Propuesta: borrar los tres primeros y hacer que el refresh reponga los no leidos.

---

## 2. Propuesta tabla por tabla

| Tabla | Hoy | Propuesto | Perfil de los datos | Como se siembra |
|---|---|---|---|---|
| `food` | 58 | **100** (+42) | reparto equilibrado por familia, valores aprox BEDCA/USDA, bilingues, `source='custom'` | `app/seed_foods.py` + `scripts/load_foods.py` (idempotente) |
| `client` nutri1 | 4 | **10** (+6) | edades 22 a 58, ambos sexos, cinco niveles de actividad, objetivos dispares | SQL numerado `0015` |
| `client` nutri2 | 1 | **3** (+2) | dos carteras distintas para que el aislamiento luzca; al existente se le rellena el perfil (hoy esta a NULL) | SQL `0015` |
| `diet_constraint` cliente | 6 (+1 residuo) | **22** | 12 de los 13 tipos de la UI, con `context` donde toca | SQL `0015` |
| `diet_constraint` nutricionista | 0 | **2** | el tab "My clinical style" del 7d hoy sale vacio | SQL `0015`, ver riesgo 3 |
| `plan` | 6 (3 residuo) | **11** | 7 firmados, 2 borradores, 2 clientes sin plan, 1 historico antiguo | script `scripts/seed_demo_plans.py` con el pipeline REAL |
| `plan_meal_item` | 357 | ~1000 | consecuencia de lo anterior | idem |
| `meal_check` | 6 | ~180 | adherencias dispares: 90, 80, 75, 65, 45, 30 por ciento | refresh `0016` |
| `weight_entry` | 6 | ~45 | 6 a 10 pesos semanales de 6 clientes, con tendencias distintas (bajada, plano, subida) | refresh `0016` |
| `message` | 10 | ~30 | 6 hilos: uno sin responder de hace 3 dias, uno antiguo, uno cerrado, dos clientes sin hilo | `0015` + refresh `0016` (fechas y `read_at`) |
| `appointment` | 7 | ~16 | 2 pendientes sin contestar, 1 pendiente vencida, 3 completadas, 1 no_show, 1 cancelada, resto futuras | `0015` + refresh `0016` |
| `availability` | 10 | **16** (+6) | nutri2 pasa de 0 a 6 tramos; nutri1 se queda como esta | SQL `0015` |
| cuenta cliente | 1 (Maria) | **2** | la segunda con datos propios vivos, para que Jaime no ensucie la de Maria | Admin API, `scripts/create_demo_client.py` parametrizado |

### Lo que NO se toca (y por que)

- `recipe` y `recipe_ingredient`: fuera del modelo v0.
- `external_food_mapping`: la carga masiva BEDCA/USDA sigue siendo trabajo futuro.
- `llm_translation`: se llena sola al usar el traductor con Ollama. Sembrarla a
  mano seria inventar salidas de un modelo.
- `generation_task`: ver decision 5. Por defecto no se siembra a mano.
- `nutrient`, `tag`, `meal_type`, `unit`: catalogos cerrados. Con los 42
  alimentos nuevos **no hace falta ningun tag nuevo**, y de paso se activan tres
  que hoy no usa nadie.
- Los datos de Maria, John, Emma y Michael mas alla de lo que el refresh ya hace.
  Son los casos anclados de los bancos: se anade alrededor.

---

## 3. Los 42 alimentos nuevos

| Familia | Hoy | Nuevos | Alimentos |
|---|---|---|---|
| `vegetable` | 10 | +9 | coliflor, berenjena, pepino, champinon, esparrago verde, puerro, repollo, acelga, remolacha |
| `fruit` | 8 | +7 | melon, sandia, pina, mango, melocoton, ciruela, arandano |
| `cereal` | 11 | +6 | bulgur, pasta integral, pan de centeno, tortitas de arroz, cereales de desayuno azucarados, mijo |
| `legume` | 4 | +4 | haba seca, alubia pinta, lenteja roja, edamame |
| `dairy` | 7 | +5 | leche desnatada, kefir, mozzarella, queso de cabra, queso azul |
| `protein_source` | 13 | +7 | bacalao, caballa, mejillon, calamar, pierna de cordero, tempeh, clara de huevo |
| sin familia | 5 | +4 | pistachos, avellanas, aceituna verde, aceite de girasol |
| **Total** | **58** | **+42** | **100** |

Tags que se activan sin migracion: `mollusks_allergen` (mejillon, calamar),
`high_phosphorus` (queso azul), `nova_4` (cereales azucarados, y ya lo tenia el
jamon cocido). El cordero da un segundo `red_meat`, con lo que el tope de
raciones de carne roja empieza a morder de verdad.

Se mantiene el criterio del 6f: las grasas y los frutos secos siguen **sin
familia**, porque no encajan en las seis y forzarlos ensuciaria la taxonomia.
Con esto pasan de 5 a 9 alimentos sin familia. La alternativa seria una familia
nueva tipo `fat_nuts` con su migracion; ver decision 6.

### Exclusiones deliberadas del catalogo (importante)

Cuatro alimentos que encajarian por variedad se dejan fuera **porque romperian
un caso de prueba**, y eso se documenta en vez de esconderlo:

- **Sesamo, tahini, semillas de chia y algas.** Son fuentes de calcio muy altas
  (el sesamo ronda 975 mg/100 g, la chia 630) y **no llevan ninguno de los tags
  que el caso 12 del benchmark prohibe** (`milk_allergen`, `fish_allergen`,
  `soy`, `tree_nuts`). Meterlos convertiria en factible la infactibilidad que
  ese caso construye. Ya paso algo parecido en el 6e: el caso 12 del diseno no
  mordia con el catalogo real y hubo que subir el minimo a 3000 mg.
- **Seitan y aislados de proteina.** El caso 7 del banco del solver espera
  INFEASIBLE con 200 g de proteina y siete familias prohibidas. Un alimento con
  75 g de proteina por 100 g podria darle la vuelta.

Si prefieres tenerlos en el catalogo, la alternativa es subir el umbral del caso
12 y volver a medir el caso 7. Es una decision, no un impedimento.

---

## 4. Los diez clientes de nutri1

`client` **no tiene columna de objetivo**: el objetivo del cliente solo existe a
traves de sus restricciones, que es justo lo que la UI en lenguaje llano del 7d
enseña. Por eso la columna "objetivo" de esta tabla es descriptiva, no un campo.

| Cliente | Sexo / nac. / altura / peso / actividad | Objetivo | Restricciones propuestas | Plan | Adherencia |
|---|---|---|---|---|---|
| Maria Gonzalez *(existe)* | F 1990 165 68 active | perdida de peso | kcal 1500 soft, prefer vegetarian soft | firmado + uno historico | 65 % |
| John Smith *(existe)* | M 1985 180 88 moderate | masa muscular | forbid peanuts hard, min protein 140 soft | firmado | 75 % |
| Emma Wilson *(existe)* | F 1978 170 74 light | diabetes | forbid lactose hard, max sodium 2000 soft | **borrador** | sin datos |
| Michael Chen *(existe)* | M 1995 175 70 very_active | mantenimiento | **ninguna** (se borra el residuo) | **sin plan** | sin datos |
| Lucia Fernandez | F 1998 162 57 light | dieta vegana | forbid `milk_allergen` hard, forbid `eggs_allergen` hard, prefer `vegan` soft, min iron 18 mg soft | firmado | **90 %** |
| David Romero | M 1979 176 95 sedentary | hipertension | max sodium 1500 **hard**, forbid `high_sodium` soft, kcal 1900 soft | firmado | **45 %** |
| Sofia Marin | F 1993 168 61 moderate | celiaquia | forbid `gluten` **hard**, min fiber 25 g soft | firmado | 80 % |
| Carlos Ruiz | M 1968 172 89 light | diabetes tipo 2 | forbid `high_gi` hard, kcal 1800 soft, `max_servings_per_period` `nova_4` <= 1/7 dias hard | firmado | **30 %** |
| Nadia Haddad | F 1996 158 54 active | halal, sin cerdo | `forbid_food` lomo de cerdo hard, `forbid_food` jamon cocido hard, prefer `halal` soft | **sin plan** | sin datos |
| Tomas Alvarez | M 2004 183 72 very_active | ganar masa | `macro_target` protein 160 g soft, kcal 3000 soft, `meal_kcal_ratio` 5 comidas soft | **borrador** | sin datos |

Dos matices que valen para la memoria:

- **"Sin cerdo" no se expresa prohibiendo un tag.** `no_pork` y `halal` son tags
  POSITIVOS (los lleva el alimento apto). Un `forbid_tag no_pork` prohibiria
  precisamente los alimentos permitidos. Se resuelve con `forbid_food` sobre los
  dos alimentos de cerdo del catalogo mas un `prefer_tag halal`. Es el primer uso
  de `forbid_food` en los datos, y ensena que la polaridad del tag importa.
- Con esto los datos ejercitan **12 de los 13 tipos** que la UI ofrece. El unico
  que queda fuera es `nutrient_ratio`, porque en version soft el solver no lo
  modela (limite conocido del 6c) y en hard es artificioso para un cliente demo.
  `forbid_combination` se puede anadir a Irene si quieres los 13; lo he dejado
  fuera para no inflar.

### nutri2 (cartera ligera, para el aislamiento)

| Cliente | Perfil | Restricciones | Plan |
|---|---|---|---|
| Second Tester Client *(existe)* | hoy todo a NULL, se rellena: M 1987 178 82 moderate | forbid `tree_nuts` hard | firmado |
| Alba Nieto | F 1991 167 64 active | kcal 1700 soft, prefer `fruit` soft | firmado |
| Hugo Ferrer | M 1975 181 91 sedentary | max `sat_fat` 20 g soft | borrador |

Mas 6 tramos de `availability` y un hilo corto de mensajes, para que su panel no
salga vacio si en la defensa se entra con esa cuenta.

---

## 5. Como se generan los planes

Los planes NO se escriben a mano: los produce el pipeline real, cliente por
cliente, con sus restricciones ya sembradas. Script nuevo
`scripts/seed_demo_plans.py`:

1. Para cada cliente de la lista, llama a `run_generation` (el mismo camino que
   usan el endpoint sincrono y el worker).
2. Si sale factible, persiste el borrador y, cuando toca, llama a `sign_plan`.
3. Deja constancia por pantalla del veredicto, el tiempo y la desviacion
   calorica de cada uno.

Dos consecuencias que hay que resolver en el script:

- `persist_plan` fija `start_date = date.today()`. Los once planes naceran
  empezando hoy. El refresh `0016` los recoloca: la mayoria a "ayer" (para que
  hoy sea el dia 2 de 7, como ya hace el 0013), el historico de Maria cinco
  semanas atras, y el borrador de Tomas empezando el lunes que viene.
- Generar once planes con 100 alimentos son once solves. A 30 a 90 segundos cada
  uno, el script tarda entre 5 y 15 minutos. Se ejecuta **en local** (no contra
  Render) para no depender del free tier.

Ademas, esos once solves son de paso una prueba de fuego del catalogo ampliado
con restricciones reales y variadas: si alguno sale INFEASIBLE, es informacion.

---

## 6. El riesgo central: el solver con 100 alimentos

Es el punto de mayor riesgo del bloque y va en el criterio de hecho, no como
opcional. Los numeros de partida:

- Con 58 alimentos, un plan de 7 dias por 5 comidas son 2030 booleanas mas 2030
  enteras. **Con 100 pasan a 3500 y 3500, un 72 % mas de variables.**
- El limite de tiempo ya se subio dos veces por esto: 10 a 30 segundos en el 6e
  (por la CPU del free tier de Render) y 30 a 60 a 90 en el 6f (por pasar de 28 a
  58 alimentos). Hoy `SOLVE_TIME_LIMIT_S = 90.0`.
- Con 90 segundos el benchmark contra Render da 29/29, pero los casos 2 y 7 ya
  iban justos: el caso 2 no demuestra el optimo y cierra con 2,25 % de
  desviacion calorica, y el umbral del banco es 5 %.

Lo que puede fallar, en orden de probabilidad:

1. **Caso 2 o 7 del E2E**: menos tiempo efectivo por variable, la desviacion
   calorica sube y cruza el 5 %. Es el fallo mas probable.
2. **Caso 12 del E2E** (infactibilidad por calcio): mitigado excluyendo sesamo,
   tahini y chia.
3. **Caso 7 de `check_solver`** (infactibilidad por proteina): mitigado
   excluyendo seitan.
4. **Casos 8 y 10** (`max_servings` de carne roja, `no_repeat_tag` de pescado):
   con un segundo `red_meat` y dos moluscos mas cambian de dificultad, pero
   siguen esperando factible.

### Metodo de medida: en dos pasadas, para poder atribuir

Se mide **antes** de sembrar clientes, y otra vez despues. Asi se sabe que parte
del coste es del catalogo y que parte de las restricciones nuevas:

| Pasada | Que hay | Que aisla |
|---|---|---|
| 0. Linea base | 58 alimentos, datos de hoy | punto de partida real, hoy sin medir |
| 1. Solo catalogo | 100 alimentos, ninguna constraint nueva | el coste del pool ampliado |
| 2. Con restricciones | 100 alimentos + las de ambito nutricionista | el coste de las restricciones de estilo |

En cada pasada: `check_solver` en local y `check_e2e` contra Render.

### Opciones si degrada, con numeros delante

| Opcion | Coste | Nota |
|---|---|---|
| Subir `SOLVE_TIME_LIMIT_S` 90 a 150 | un request pesado puede tardar 2,5 min | hay que subir tambien el `timeout=120` de `check_e2e`, o el propio benchmark corta antes. **El 7bc dejo la generacion asincrona con polling, asi que un solve largo ya no bloquea la pantalla**: es lo que hace esta opcion aceptable ahora y no lo era en el 6f |
| Recortar el catalogo a 85 | menos variedad en la demo | reversible, es solo quitar entradas del seed |
| Quitar las 2 restricciones de ambito nutricionista | el tab de estilo clinico vuelve a salir vacio | ver decision 3 |
| Relajar el umbral del 5 % | **descartada** | seria esconder el problema |

Recomendacion: medir, y si caen los casos 2 o 7, subir a 150 segundos y ajustar
el timeout del benchmark. Si aun asi cae algo, recortar el catalogo.

---

## 7. El refresh previo a la demostracion

Hoy es `0013_seed_demo_refresh.sql`, que reancla planes, 6 citas y mensajes de
los cuatro clientes originales, mas los pesos y check-ins de Maria. Con diez
clientes, series de seis y hilos de seis, se queda corto.

Decidido: **`0017_seed_demo_refresh.sql` como sucesor**, que hace todo lo que
hacia el 0013 y ademas:

- recoloca los planes con desplazamientos distintos por cliente (no todos
  "ayer"), y manda los historicos cinco semanas atras,
- regenera los `meal_check` con un porcentaje objetivo por cliente, respetando
  que solo se marcan dias ya vividos de planes firmados,
- regenera las series de peso con su tendencia,
- **repone `read_at` a NULL** en los mensajes que deben salir sin leer, que es lo
  que hoy hace que el aviso no se vea,
- reescribe las citas con sus estados (dos peticiones sin contestar, una de ellas
  vencida), deshaciendo lo que el runner de E2E confirma en su pasada.

Reparto final de ficheros, para no mantener la misma lista dos veces:

| Fichero | Contenido | Cuando se aplica |
|---|---|---|
| `0015_seed_demo_clients.sql` | clientes, restricciones de ambito cliente, disponibilidad del segundo nutri. Nada con fecha | una vez |
| `0016_seed_clinical_style.sql` | las 2 restricciones de ambito nutricionista | una vez, y aparte para poder medir el benchmark sin ellas |
| `0017_seed_demo_refresh.sql` | TODO lo fechado: planes, citas, mensajes, pesos, marcas | antes de cada demostracion |

Las citas y los mensajes viven enteros en el 0017 y no en el 0015: son las dos
tablas a las que nada apunta, asi que reescribirlas es mas simple que calcular
desplazamientos, y deja un solo sitio donde mirar. El 0017 sustituye tambien a la
parte fechada del 0008. El 0013 se queda en el repo por historia.

---

## 8. La segunda cuenta de cliente

Patron del 8a: Admin API con `user_metadata.role = 'client'` (para que el trigger
no cree una fila de nutricionista) mas el `UPDATE` del vinculo
`client.auth_user_id`.

- Cliente elegido: **Lucia Fernandez**, porque es la de datos mas ricos (plan
  firmado, 90 % de adherencia, serie de peso con bajada sostenida, hilo activo).
  Jaime navega con ella y la cuenta de Maria queda intacta para los runners.
- Correo `lucia.client@nutriapp.dev`. Contrasena a `.test-user.local.md`
  (gitignored). En la memoria solo la referencia al fichero, nunca el contenido.
- `create_demo_client.py` tiene el cliente y el correo **cableados a Maria**.
  Propuesta de micro-cambio justificado: parametrizarlo por variables de entorno
  (`DEMO_CLIENT_NAME`, `DEMO_CLIENT_EMAIL`) con los valores de hoy por defecto,
  en vez de duplicar el script. Es el unico cambio de codigo previsto fuera de
  los seeds.

---

## 9. Orden de ejecucion propuesto

0. Linea base: `check_solver` y `check_e2e` **antes de tocar nada**.
1. Limpiar residuos (planes 22, 23, 24; constraint 31; cliente 14).
2. Ampliar `seed_foods.py` a 100 y recargar. Verificar que re-ejecutar no duplica.
3. **Pasada 1 de medida**: `check_solver` local + `check_e2e` contra Render.
4. Seed `0015` (clientes, restricciones, estilo clinico, availability de nutri2,
   mensajes y citas) mas su espejo Alembic.
5. **Pasada 2 de medida**: `check_e2e` con las restricciones de ambito
   nutricionista ya en juego.
6. `seed_demo_plans.py`: generar y firmar los once planes.
7. Refresh `0016` con las series, los no leidos y las fechas.
8. Segunda cuenta de cliente.
9. Runners del frontend: `check-client-rls` 106/106 y `check-client-e2e` 39/39.
10. Build limpio, pasada visual documentada, memoria y commit.

Si el paso 3 o el 5 salen mal, se para ahi y se decide con los numeros en la mano.

---

## 10. Decisiones, ya resueltas

1. **Volumen y perfiles**: la tabla de diez clientes de nutri1, con esos
   objetivos y esas restricciones. Cambia lo que quieras (nombres, patologias,
   quien se queda sin plan).
2. **Exclusiones del catalogo**: dejar fuera sesamo, tahini, chia y seitan para
   no tumbar los casos 12 del E2E y 7 del solver. La alternativa es meterlos y
   reajustar esos dos casos.
3. **Restricciones de ambito nutricionista (2 filas)**: llenan el tab "My
   clinical style", que hoy sale vacio, pero **se aplican a todos los clientes de
   nutri1, incluidos los doce casos del benchmark**. Opciones: (a) sembrarlas y
   medir, (b) sembrarlas solo en nutri2, (c) no sembrarlas y ensenar el tab
   vacio. Recomiendo (a), con (b) como plan B si degrada.
4. **Refresh**: `0016` sucesor (recomendado) o reescribir el `0013` en su sitio.
5. **`generation_task`**: el historial de generaciones con IA del 7f hoy sale
   vacio. Se puede llenar de verdad encolando 2 o 3 tareas de tipo `generate`
   (no necesitan Ollama, solo el solver) para que la lista tenga vida, incluida
   una fallida con su nucleo. Recomiendo hacerlo; di si lo dejas fuera.
6. **Familia nueva para grasas y frutos secos**: con 9 alimentos sin familia,
   ¿se mantiene el criterio del 6f (sin familia es honesto) o se anade un tag
   `fat_nuts` con su migracion pequena? Recomiendo mantener el criterio.
7. **Reparto de firmados**: 7 firmados, 2 borradores (Emma y Tomas), 2 sin plan
   (Michael y Nadia), mas un historico antiguo de Maria. ¿Te cuadra?
