# Formalización matemática del solver de planes (v2)

**Agosto de 2026. Formalización del modelo real tras la capa de plausibilidad del catálogo: perfiles de ración por alimento, cantidades por unidades y reglas de composición de las comidas. Actualizada en septiembre de 2026 con dos ajustes de eficiencia medidos: pesos del objetivo conmensurables (sección 2.2) y cotas de dominio apoyadas en la regla R2 (sección 8.2).**

Nota de notación: la memoria del TFG llama `ha_consumido[f,d,m]` y `gramos_alimento[f,d,m]` a las variables que este documento escribe `x[f,d,m]` y `g[f,d,m]`. Son las mismas variables; este documento conserva la notación corta.

> Este documento formaliza matemáticamente el generador de planes de NutriApp tal como está implementado, no como se diseñó en papel. Es la segunda versión de la formalización: la primera recogió el modelo con las reglas estructurales de sentido común; desde entonces el modelo ha incorporado una capa de plausibilidad alimentaria que sustituye los límites globales de gramos por perfiles de ración por alimento, cuantiza ciertos alimentos a piezas y medias piezas, y añade reglas de composición de las comidas (franjas del día, acompañamiento de condimentos, papel del dulce y la fruta). Aquí se recoge el modelo definitivo, con notación matemática, para que sirva de fuente única de la sección de formalización de la memoria y de guía del código. La versión anterior se conserva como registro del modelo previo. El motor es correcto y está verificado; este documento no lo rehace, lo describe con rigor.

La formalización se apoya en la misma estructura que se usa en la literatura de planificación con restricciones: conjuntos base, parámetros de entrada precalculados, variables de decisión con su dominio, restricciones agrupadas en familias numeradas y una función objetivo con su estrategia de resolución. Sobre esa estructura, dos distinciones organizan el modelo y se marcan explícitamente en cada punto: la distinción entre restricción dura (acota el espacio de soluciones) y blanda (penaliza o premia en la función objetivo), y la distinción entre restricciones clínicas (las pone el profesional) y restricciones de catálogo (viven en el modelo y en los datos del catálogo), que esta versión hace explícita en una sección propia.

Como aclaración de lectura, y siguiendo el convenio habitual, cualquier variable booleana dentro de un sumatorio aporta 1 si la condición se cumple y 0 en caso contrario.

---

## Índice

1. [Alcance y contrato](#1-alcance-y-contrato)
2. [Conjuntos y parámetros](#2-conjuntos-y-parámetros)
3. [Variables de decisión y dominios](#3-variables-de-decisión-y-dominios)
4. [Restricciones estructurales invariantes](#4-restricciones-estructurales-invariantes)
5. [Restricciones de plausibilidad del catálogo](#5-restricciones-de-plausibilidad-del-catálogo)
6. [Restricciones clínicas y restricciones de catálogo](#6-restricciones-clínicas-y-restricciones-de-catálogo)
7. [Catálogo de restricciones configurables](#7-catálogo-de-restricciones-configurables)
8. [Función objetivo](#8-función-objetivo)
9. [Estrategia de resolución](#9-estrategia-de-resolución)
10. [Distinción hard/soft como eje del modelo](#10-distinción-hardsoft-como-eje-del-modelo)
11. [Referencias](#11-referencias)
- [Apéndice A. Mapa de restricciones a código](#apéndice-a-mapa-de-restricciones-a-código)

---

## 1. Alcance y contrato

### 1.1 Qué es el solver

El solver es un motor determinista que, dados un cliente y un conjunto de restricciones expresadas en un vocabulario cerrado, construye un borrador de plan nutricional que respeta por construcción todas las restricciones obligatorias y optimiza el cumplimiento de las preferencias. El resultado es un borrador editable para que el nutricionista lo ajuste y firme, no un plan cerrado que lo sustituya. El profesional mantiene el control clínico; el solver le ahorra partir de una hoja en blanco.

De este posicionamiento salen tres decisiones que atraviesan todo el modelo: el resultado es editable, expone qué restricciones aplicó para que sea auditable, y cuando el problema no tiene solución explica el conflicto en lugar de fallar en silencio.

### 1.2 Tecnología

El modelo se resuelve con OR-Tools CP-SAT, el solver de programación con restricciones sobre dominios enteros de Google, invocado desde Python. Toda la formalización que sigue es la del modelo CP-SAT real. Otros trabajos del área formalizan problemas equivalentes sobre MiniZinc o sobre Z3 (SMT); aquí se ha optado por CP-SAT por integrarse de principio a fin con el resto del backend en Python y porque su soporte de asunciones permite explicar las infactibilidades, como se detalla en la sección 9. La notación de este documento es independiente del solver; la implementación es CP-SAT.

### 1.3 Firma de la función

El solver es una función pura sobre sus entradas.

```python
def generate_plan(
    client: ClientProfile,           # datos antropometricos y de actividad
    duration_days: int,              # numero de dias del plan
    meals_per_day: int,              # numero de comidas por dia
    constraints: list[Constraint],   # restricciones del cliente + del nutricionista
    food_pool: list[Food],           # catalogo de alimentos visible
    *,
    nutrient_codes: dict[int, str],  # id de nutriente -> code
    meal_codes: list[str],           # code de franja por indice de comida
    weights: ObjectiveWeights = DEFAULT_WEIGHTS,
    time_limit_s: float = SOLVE_TIME_LIMIT_S,
) -> PlanResult:
    ...
```

El resultado es una unión de dos casos disjuntos, para forzar al llamante a distinguir plan factible de infactible.

```
PlanResult = FeasiblePlan | InfeasiblePlan
```

Un `FeasiblePlan` lleva los días del plan (cada día con sus comidas y cada comida con sus items alimento-gramos), un bloque de métricas (tiempo, cumplimiento blando, valor del objetivo, brecha, desviación calórica media) y avisos no bloqueantes. Un `InfeasiblePlan` lleva el núcleo mínimo de restricciones en conflicto, una sugerencia en lenguaje natural y la lista de restricciones relajables. La estructura del plan factible es isomorfa a la jerarquía de la base de datos: cada item corresponde a una fila de la tabla de items del plan.

### 1.4 Qué no hace

No consulta ningún modelo de lenguaje: las restricciones le llegan ya estructuradas. No ejecuta el validador clínico, que es un paso posterior e independiente. No persiste nada: es una función pura, la escritura en base de datos es de la capa que lo invoca. No decide la estructura del plan más allá de lo que se le indica; el número de días y de comidas son parámetros de entrada.

---

## 2. Conjuntos y parámetros

### 2.1 Conjuntos base

- **F** = conjunto de alimentos del catálogo visible (`food_pool`). Cada alimento *f ∈ F* tiene un identificador, una composición nutricional por cada 100 g, un conjunto de etiquetas y, desde esta versión, un perfil de ración (sección 2.3) y opcionalmente unos gramos por unidad si se sirve por piezas.
- **D** = {1, ..., duration_days}: días del plan.
- **M** = {1, ..., meals_per_day}: comidas dentro de un día. Cada comida *m ∈ M* lleva asociado un código de franja **c(m)** (desayuno, comida, cena, tentempié...), que entra por el parámetro `meal_codes` y que las reglas de plausibilidad consultan (sección 2.4).
- **N** = conjunto de códigos de nutriente presentes en la composición de algún alimento del catálogo (energía, proteína, hidratos, grasa, sodio, calcio y los demás nutrientes cargados).

El tamaño del problema queda fijado por |F| · |D| · |M|. Los dos parámetros duration_days y meals_per_day no son restricciones optimizables sino la dimensión del problema, y entran por la firma de la función.

### 2.2 Parámetros de entrada precalculados

Antes de construir el modelo se preparan en Python los siguientes parámetros. Trabajar con enteros es la práctica recomendada en CP-SAT, que opera sobre dominios enteros; por eso los valores nutricionales, que en las tablas de composición vienen con decimales, se escalan a enteros con una constante de escala *s* = `NUTRIENT_SCALE` = 10.

- **kcal100(f)**, **nut100(f, n)** ∈ ℤ≥0, ∀f ∈ F, n ∈ N: valor del nutriente *n* (y de la energía) por 100 g del alimento *f*, escalado a entero multiplicando por *s* y redondeando. Si el alimento no tiene dato para ese nutriente, vale 0.
- **min_f**, **max_f** ∈ ℤ≥0, ∀f ∈ F: gramos mínimos y máximos por aparición del alimento, derivados de su perfil de ración (sección 2.3).
- **gpu(f)** ∈ ℤ>0, opcional: gramos por unidad del alimento, si se sirve por piezas (sección 2.3).
- **floor(c)** ∈ ℤ≥0: suelo calórico diario de seguridad del cliente *c*, en kcal. Es el metabolismo basal por Mifflin-St Jeor, acotado por debajo por un suelo absoluto según el sexo (sección 4, restricción R3).
- **prot_min(c)**, **prot_max(c)** ∈ ℝ≥0: cotas humanas de proteína diaria del cliente, en gramos, derivadas de su peso (0.8 y 2.2 g/kg). Si falta el peso, se usa un peso por defecto de 70 kg.
- **tag(f)** ⊆ etiquetas: familias, marcadores, roles y franjas del alimento *f* (por ejemplo `vegetable`, `lactose`, `red_meat`, `condiment`, `moment_breakfast`). Para una etiqueta *t*, se define **miembros(t)** = { f ∈ F : t ∈ tag(f) }. Los subconjuntos que consumen las reglas de plausibilidad se definen en la sección 2.4.
- Umbrales estructurales, todos en `config.py`: `MIN_GRAMS_PRESENT` = 10, `MAX_ITEMS_PER_MEAL` = 4, `MAX_SAME_FOOD_PER_DAY` = 2, `MIN_DISTINCT_PER_DAY` = 4, `MIN_DISTINCT_PER_WEEK` = 10, `MAX_APPEARANCES_PER_DAY_RATIO` = 0.6, `FAT_MIN_PCT_ENERGY` = 15, rango de proteína (0.8, 2.2) g/kg.
- Umbrales de plausibilidad, también en `config.py`: `MIN_ITEMS_MAIN_MEAL` = 2, `CONDIMENT_MAX_PER_DAY` = 2, `SWEET_FRUIT_MAX_PER_MEAL` = 1, y los fallbacks del perfil `FALLBACK_MIN_SERVING_G` = 20 y `FALLBACK_MAX_SERVING_G` = 250.
- Pesos del objetivo por familia (`ObjectiveWeights`): w_kcal = 10, w_protein = 8, w_carb = 6, w_fat = 6, w_prefer = 4.000, w_no_repeat = 5.000, w_variety = 5.000, w_spread = 4.000. Sobre ellos, cada fila de restricción modula con su peso propio, de 1 a 10 (sección 8.4). Los pesos de las familias no nutricionales llevan incorporado un factor de 1.000 que compensa la escala entera de las desviaciones: una desviación nutricional se mide en unidades escaladas (1 kcal o 1 g son 1.000 unidades, sección 2.5) mientras que una preferencia o un alimento sin usar se miden en unidades de 1, y sin ese factor mover una familia estructural entera no compensaba ni una unidad natural de desviación. Con él, las intenciones relativas de los pesos (10 frente a 5 frente a 4) operan sobre unidades conmensurables: un alimento sin usar equivale a medio punto de kcal de desviación, no a media milésima.

### 2.3 El perfil de ración como dato del catálogo

La primera versión del modelo acotaba los gramos de cualquier alimento con dos límites globales, un mínimo de presencia de 10 g y un techo de 300 g, iguales para todo el catálogo. Fue una decisión honesta de partida, pero con una consecuencia medida al auditar los planes generados: los límites universales actuaban de atractores, y en torno a dos de cada tres cantidades servidas caían exactamente en uno de los dos extremos (raciones de relleno de 10 g para cumplir variedad, raciones de 300 g de un solo alimento como volumen calórico barato). El modelo no sabía que una ración razonable depende del alimento: 10 g de fruta o 300 g de aceite eran soluciones legales.

Esta versión sustituye los límites globales por un **perfil de ración por alimento**, que es un dato del catálogo y no una constante del modelo: cada alimento lleva en base de datos sus gramos mínimos y máximos por aparición (`min_serving_g`, `max_serving_g`) y, si se sirve por piezas, sus gramos por unidad (`grams_per_unit`). Los parámetros efectivos del modelo se derivan así:

$$
\text{min}_f = \max\big(\text{round}(\text{min\_serving\_g}(f)),\ \text{MIN\_GRAMS\_PRESENT}\big), \qquad \text{max}_f = \text{round}(\text{max\_serving\_g}(f))
$$

Para un alimento sin perfil (típicamente uno dado de alta a mano por un profesional), se usan los fallbacks globales de 20 y 250 g: más estrechos que los límites históricos, para que un alimento nuevo sin datos se sirva en raciones prudentes. El mínimo global de 10 g sobrevive como suelo absoluto bajo cualquier perfil.

Los perfiles se poblaron alimento a alimento para todo el catálogo, con dos convenciones relevantes para el modelo: los gramos por unidad son pares, para que las medias piezas caigan en gramos enteros, y un pequeño conjunto de alimentos que no se parten (huevo, yogur) solo admite piezas enteras. Ese conjunto, `WHOLE_UNIT_FOOD_NAMES`, se identifica por nombre en esta versión; si crece, pasará a columna.

### 2.4 Franjas del día y roles de alimento

Las reglas de plausibilidad razonan sobre dos vocabularios nuevos, ambos montados sobre la infraestructura de etiquetas existente:

- **Franjas.** Cada comida *m* tiene un código de franja c(m). El llamante decide qué franjas usa un plan según su número de comidas, con una decisión de diseño explícita: las comidas principales entran primero y los tentempiés se añaden después (3 comidas son desayuno, comida y cena; 4 añaden la merienda; 5 la media mañana; 6 la recena). Elegir "las primeras N franjas en orden cronológico" parecía equivalente y no lo era: dejaba un plan de 3 comidas en desayuno, media mañana y comida, sin cena. El número de comidas por defecto de la aplicación es 4. Se define **MAIN** = {desayuno, comida, cena} como el conjunto de franjas principales.
- **Roles y momentos.** Un alimento puede llevar el rol `condiment` (aceites y similares: acompañan, no son plato) o `sweet` (dulces), y cualquier alimento puede llevar etiquetas de momento `moment_<franja>` que forman su lista blanca de franjas: **momentos(f)** = { franjas *c* : moment_c ∈ tag(f) }. Un alimento sin etiquetas de momento puede aparecer en cualquier franja. Se definen **COND** = miembros(condiment), **DULCE** = miembros(sweet) y **FRUTA** = miembros(fruit).

### 2.5 Escala entera y comparación cruzada

Un nutriente aportado por un alimento en una comida es, en unidad real, `value_per_100g(f, n) · g[f,d,m] / 100`. Para no dividir dentro del modelo, se guarda el coeficiente escalado nut100(f, n) = round(value_per_100g · *s*) y no se divide por 100. Así, la suma

$$
\text{nut}_{d,n} \;=\; \sum_{m \in M}\ \sum_{f \in F} \text{nut100}(f, n)\cdot g[f,d,m]
$$

representa la cantidad real del nutriente *n* en el día *d* multiplicada por (100 · *s*). Para comparar esa suma con un valor real *v* (un objetivo, un mínimo), se lleva *v* a la misma escala con el helper `scale_target(v) = round(v · s · 100)`, y se comparan dos enteros. Este mismo patrón de multiplicación cruzada resuelve cualquier restricción expresada como porcentaje o cociente sin introducir divisiones.

---

## 3. Variables de decisión y dominios

El modelo usa dos familias de variables por cada terna alimento-día-comida, más una tercera para los alimentos que se sirven por piezas.

$$
x[f,d,m] \in \{0, 1\}, \qquad \forall f \in F,\ d \in D,\ m \in M
$$

$$
g[f,d,m] \in \{0, 1, \dots, \text{max}_f\}, \qquad \forall f \in F,\ d \in D,\ m \in M
$$

`x[f,d,m]` vale 1 si el alimento *f* aparece en la comida *m* del día *d*, y 0 si no. `g[f,d,m]` son los gramos de ese alimento en esa comida, entero con paso de 1 g, resolución de sobra para la práctica nutricional. A diferencia de la versión anterior, el dominio de los gramos ya no es global: su techo es el máximo del perfil de ración del alimento.

Las dos familias se enlazan para que los gramos sean cero si el alimento no está presente, y una ración dentro del perfil si lo está:

$$
x[f,d,m] = 1 \;\Rightarrow\; g[f,d,m] \ge \text{min}_f
$$
$$
x[f,d,m] = 0 \;\Rightarrow\; g[f,d,m] = 0
$$

que junto con el dominio equivale a: presente implica min_f ≤ g ≤ max_f. Este enlace es la regla R9 del modelo (sección 5): la ración de cada aparición entra en el sentido común del alimento concreto, no en unos límites universales. El umbral mínimo absoluto de presencia (10 g) viene de la primera implementación: sin él, con un enlace `g ≥ 1 ⟺ x = 1`, el solver metía alimentos a 1 g solo para cumplir la presencia mínima por comida o la variedad barata.

Para los alimentos que se sirven por piezas (gpu(f) definido) se añade una variable entera de **unidades** que cuantiza los gramos a medias piezas (regla R10 de la sección 5). *k* cuenta medias unidades: k = 3 son 1.5 piezas.

$$
k[f,d,m] \in \Big\{0, \dots, \Big\lfloor \tfrac{2 \cdot \text{max}_f}{\text{gpu}(f)} \Big\rfloor\Big\}, \qquad 2 \cdot g[f,d,m] = k[f,d,m] \cdot \text{gpu}(f)
$$

Los alimentos que solo admiten piezas enteras (huevo, yogur) usan la variante sin medias:

$$
k[f,d,m] \in \Big\{0, \dots, \Big\lfloor \tfrac{\text{max}_f}{\text{gpu}(f)} \Big\rfloor\Big\}, \qquad g[f,d,m] = k[f,d,m] \cdot \text{gpu}(f)
$$

La cuantización compone con el enlace: si el alimento no está presente, g = 0 fuerza k = 0; si lo está, el perfil acota k a las piezas que caben entre min_f y max_f. En base de datos el plan sigue guardando gramos; las unidades son a la vez una restricción del modelo y la forma natural de presentar esos alimentos en pantalla.

Además de estas variables, el modelo introduce variables auxiliares enteras y booleanas que se definen donde se usan: los indicadores de uso diario y semanal de cada alimento (sección 4, R6 y R8), y las variables de exceso y defecto que linealizan los valores absolutos de la función objetivo (sección 8).

---

## 4. Restricciones estructurales invariantes

Estas restricciones no las configura el profesional: son propiedades del problema o límites fisiológicos y de sentido común que se aplican siempre, con independencia de las restricciones que lleguen en la entrada. Todas son duras. Las tres últimas (R6, R7 y el reparto de la sección 8.3) responden a la observación de que los planes salían matemáticamente válidos pero irreales, concentrando un alimento y rellenando el resto casi al azar. La sección 5 recoge la segunda familia de invariantes, la de plausibilidad, que llegó después con la misma motivación aplicada a la composición de cada comida.

**R1. Presencia mínima por comida.** Cada comida contiene al menos un alimento, para que no haya comidas vacías.

$$
\sum_{f \in F} x[f,d,m] \ge 1, \qquad \forall d \in D,\ m \in M
$$

**R2. Cota de alimentos por comida.** Como mucho `MAX_ITEMS_PER_MEAL` = 4 alimentos distintos por comida, para evitar comidas con una lista interminable de ingredientes minúsculos.

$$
\sum_{f \in F} x[f,d,m] \le \text{MAX\_ITEMS\_PER\_MEAL}, \qquad \forall d \in D,\ m \in M
$$

**R3. Suelo calórico diario.** La energía total de cada día no baja de un suelo de seguridad. Este suelo es el metabolismo basal, no el gasto energético total. El basal se calcula con la ecuación de Mifflin-St Jeor:

$$
\text{BMR}(c) = 10\, w_c + 6.25\, h_c - 5\, a_c +
\begin{cases}
+5 & \text{si el sexo es } M \\
-161 & \text{si el sexo es } F
\end{cases}
$$

donde *w_c*, *h_c*, *a_c* son peso (kg), altura (cm) y edad del cliente. El suelo diario es el mayor entre el basal y un suelo absoluto por sexo (1200 kcal en mujeres, 1500 en hombres):

$$
\text{floor}(c) = \max\big(\text{BMR}(c),\ \text{FLOOR\_KCAL}[\text{sexo}]\big)
$$
$$
\sum_{m \in M}\ \sum_{f \in F} \text{kcal100}(f)\cdot g[f,d,m] \;\ge\; \text{scale\_target}(\text{floor}(c)), \qquad \forall d \in D
$$

La decisión de usar el basal y no el gasto total tiene consecuencia clínica: el gasto total (basal por factor de actividad) orienta el objetivo calórico que fije el profesional, pero el suelo duro que ninguna dieta puede cruzar es el basal, para permitir planes de déficit. Con el gasto total como suelo, un objetivo de pérdida de peso quedaría por debajo del propio suelo y sería inalcanzable. Cuando faltan datos antropométricos se usa el suelo absoluto por sexo y se emite un aviso.

**R4. Rango humano de proteína.** La proteína diaria se mantiene entre 0.8 y 2.2 g por kg de peso, con independencia de lo que pidan las restricciones.

$$
\text{scale\_target}(\text{prot\_min}(c)) \;\le\; \sum_{m \in M}\sum_{f \in F} \text{nut100}(f, \text{prot})\cdot g[f,d,m] \;\le\; \text{scale\_target}(\text{prot\_max}(c)), \qquad \forall d \in D
$$

**R5. Grasa mínima por energía.** La grasa diaria aporta al menos el 15 % de la energía, para garantizar la absorción de vitaminas liposolubles. Partiendo de `fat_g · 9 ≥ (pct/100) · kcal` y despejando la división, en las sumas escaladas queda:

$$
\Big(\sum_{m,f} \text{nut100}(f, \text{fat})\cdot g[f,d,m]\Big)\cdot 9 \cdot 100 \;\ge\; 15 \cdot \Big(\sum_{m,f} \text{kcal100}(f)\cdot g[f,d,m]\Big), \qquad \forall d \in D
$$

**R6. No repetir el mismo alimento dentro del día.** Un mismo alimento aparece como mucho `MAX_SAME_FOOD_PER_DAY` = 2 veces entre todas las comidas de un día. Evita el pollo en desayuno, comida y cena.

$$
\sum_{m \in M} x[f,d,m] \le \text{MAX\_SAME\_FOOD\_PER\_DAY}, \qquad \forall f \in F,\ d \in D
$$

**R7. Variedad mínima diaria.** Cada día usa al menos `MIN_DISTINCT_PER_DAY` = 4 alimentos distintos (acotado al tamaño del catálogo si fuera menor). Se introduce un indicador de uso diario `usado_dia[f,d]`, que vale 1 si el alimento aparece en alguna comida del día:

$$
\text{usado\_dia}[f,d] = \max_{m \in M} x[f,d,m], \qquad \forall f \in F,\ d \in D
$$
$$
\sum_{f \in F} \text{usado\_dia}[f,d] \;\ge\; \min(\text{MIN\_DISTINCT\_PER\_DAY},\ |F|), \qquad \forall d \in D
$$

**R8. Variedad mínima semanal.** Para planes de al menos una semana, cada ventana de 7 días usa al menos `MIN_DISTINCT_PER_WEEK` = 10 alimentos distintos, para evitar la monotonía que hace abandonar la dieta. Con un indicador de uso en la ventana `usado_sem[f]` = máx sobre los días de la ventana:

$$
\text{usado\_sem}[f] = \max_{d \in \text{ventana},\, m \in M} x[f,d,m]
$$
$$
\sum_{f \in F} \text{usado\_sem}[f] \;\ge\; \min(\text{MIN\_DISTINCT\_PER\_WEEK},\ |F|), \qquad \text{para cada ventana de 7 días}
$$

El reparto de un alimento a lo largo del plan es la tercera regla de sentido común, pero se modela como término blando de la función objetivo y no como restricción dura, por lo que se describe en la sección 8.3.

---

## 5. Restricciones de plausibilidad del catálogo

Las reglas R1 a R8 hacen que el plan tenga lógica nutricional a nivel de día y de semana (variedad, reparto, suelos fisiológicos), pero no dicen nada de la composición de cada comida ni de qué es una ración razonable de cada alimento. Auditar los planes generados destapó ese hueco: aparecían comidas que eran combinaciones legales de cantidades pero no comidas (un desayuno de solo aceite, pescado a primera hora, fruta apilada como plato único). Esta familia cierra ese hueco con reglas parametrizadas por los datos del catálogo: los perfiles de ración, los roles y las franjas de la sección 2.

Las siete reglas son duras: una comida implausible no es algo que se pueda compensar con el resto del objetivo. A diferencia de las restricciones clínicas duras (sección 7), no se envuelven en literales de asunción, igual que R1 a R8: no forman parte del vocabulario que el profesional puede relajar, así que nunca aparecen en un núcleo de infactibilidad. La numeración continúa la serie estructural.

**R9. Perfil de ración por aparición.** Si un alimento está presente en una comida, sus gramos caen dentro del perfil de ración del alimento. Formulada en la sección 3 como parte del enlace presencia-gramos:

$$
x[f,d,m] = 1 \;\Rightarrow\; \text{min}_f \le g[f,d,m] \le \text{max}_f
$$

**R10. Cantidades por unidades.** Los alimentos que se sirven por piezas cuantizan sus gramos a medias piezas (o piezas enteras para los que no se parten), con la variable entera *k* de la sección 3:

$$
2 \cdot g[f,d,m] = k[f,d,m] \cdot \text{gpu}(f) \qquad (\text{o } g = k \cdot \text{gpu}(f) \text{ en piezas enteras})
$$

**R11. Lista blanca de franjas.** Un alimento con etiquetas de momento solo puede aparecer en esas franjas. Un alimento sin etiquetas de momento no queda restringido.

$$
x[f,d,m] = 0, \qquad \forall f : \text{momentos}(f) \ne \emptyset,\ \forall d \in D,\ \forall m : c(m) \notin \text{momentos}(f)
$$

Evita los momentos absurdos (merluza en el desayuno, cereales de desayuno en la cena) sin prohibir nada a los alimentos versátiles.

**R12. Composición mínima de las comidas principales.** Las comidas de franja principal piden al menos `MIN_ITEMS_MAIN_MEAL` = 2 alimentos (acotado al tamaño del catálogo). Las franjas de tentempié conservan el mínimo estructural de uno: una manzana a media mañana es un tentempié normal, una comida de un solo item no es una comida.

$$
\sum_{f \in F} x[f,d,m] \ge \min(\text{MIN\_ITEMS\_MAIN\_MEAL},\ |F|), \qquad \forall d \in D,\ \forall m : c(m) \in \text{MAIN}
$$

**R13. El condimento nunca va solo.** Un condimento en una comida exige al menos un alimento que no sea condimento en esa misma comida. La cota por la suma de acompañantes cubre a la vez el caso de una comida de solo condimentos.

$$
x[f,d,m] \;\le\; \sum_{f' \in F \setminus \text{COND}} x[f',d,m], \qquad \forall f \in \text{COND},\ d \in D,\ m \in M
$$

Caso frontera: si el catálogo visible solo tuviera condimentos, la regla dejaría el problema sin solución por construcción; en ese caso degenerado se omite y se emite un aviso.

**R14. Tope diario de condimentos.** Entre todos los condimentos, como mucho `CONDIMENT_MAX_PER_DAY` = 2 apariciones al día. Evita el aceite en las cinco comidas.

$$
\sum_{f \in \text{COND}}\ \sum_{m \in M} x[f,d,m] \;\le\; \text{CONDIMENT\_MAX\_PER\_DAY}, \qquad \forall d \in D
$$

**R15. Dulce y fruta como complemento.** Entre dulces y fruta, como mucho `SWEET_FRUIT_MAX_PER_MEAL` = 1 aparición por comida: el papel de ambos es complementar, no apilarse. Combinada con R12, implica además que la fruta no puede ser el plato único de una comida principal.

$$
\sum_{f \in \text{DULCE} \cup \text{FRUTA}} x[f,d,m] \;\le\; \text{SWEET\_FRUIT\_MAX\_PER\_MEAL}, \qquad \forall d \in D,\ m \in M
$$

Una propiedad transversal de esta familia es que las reglas son fijas pero su alcance es dato: qué alimentos son condimento, qué franjas admite cada uno y qué ración es razonable vive en el catálogo, no en el código. Dar de alta un alimento nuevo con su perfil y sus etiquetas lo somete a todas las reglas sin tocar el modelo. La contrapartida es que el modelo ya no se puede evaluar "sin la capa" relajando constantes: los perfiles son datos, no umbrales.

---

## 6. Restricciones clínicas y restricciones de catálogo

Llegados aquí conviene hacer explícita la frontera que organiza las restricciones del modelo en dos mitades, porque responde a una pregunta de diseño que atraviesa todo el sistema: quién define cada cosa.

Las **restricciones clínicas** son las del profesional. Viven como filas de la tabla `diet_constraint`, en un vocabulario cerrado de 16 tipos (sección 7), con un ámbito (un cliente concreto, o el estilo clínico del nutricionista aplicado a todos los suyos) y una prioridad que el propio profesional decide. Expresan juicio clínico: una alergia, un objetivo calórico, una preferencia de dieta. Quién las produce es intercambiable (un formulario manual o un traductor automático de texto libre), y el solver las consume sin distinguir el origen. Cuando un conjunto de clínicas duras es inconsistente, son ellas las que aparecen en el núcleo de infactibilidad, porque son lo único que el profesional puede relajar.

Las **restricciones de catálogo** son las del modelo: las estructurales R1 a R8 y las de plausibilidad R9 a R15. No las escribe nadie por cliente; se aplican siempre. Expresan lo que cualquier humano da por hecho antes de hablar de nutrición: que una comida no es un chorro de aceite, que la merluza no es un desayuno, que una ración de almendras no son 300 g. Este conocimiento no es vocabulario del profesional, y ponérselo delante sería ruido: ningún nutricionista prescribe "el aceite debe ir acompañado", igual que no prescribe "los platos se sirven en un plato". Por eso no viven en `diet_constraint` sino en el modelo y, desde esta versión, en los datos del catálogo que las parametrizan.

La frontera también explica dónde evoluciona cada mitad. El vocabulario clínico crece añadiendo tipos al catálogo cerrado (una migración del esquema); la plausibilidad crece etiquetando y perfilando alimentos (datos), sin tocar ni el esquema ni el código. Y delimita responsabilidades ante un plan malo: si viola una clínica, el fallo es del motor (y el validador posterior lo cazaría); si es implausible, lo que falta es una regla o un dato de catálogo.

---

## 7. Catálogo de restricciones configurables

Estas son las restricciones clínicas de la sección 6: las que el profesional (o, más adelante, el traductor automático) pone sobre un cliente o sobre su propio estilo clínico. Llegan como filas de `diet_constraint` en un vocabulario cerrado de 16 tipos. Cada fila tiene un campo de prioridad que decide si la restricción es dura o blanda: una restricción dura acota el espacio factible, una blanda entra como término de la función objetivo. Dos de los 16 tipos son estructurales (fijan la dimensión del problema y no generan restricción).

Para cada tipo se da su semántica, su naturaleza por defecto y su formulación. Se usan las abreviaturas de la sección 2: nut_{d,n} es la suma escalada del nutriente *n* en el día *d*, y scale_target lleva un valor real a esa escala.

### 7.1 Tipos estructurales

**meals_per_day** y **plan_duration_days**. Fijan el número de comidas por día y de días del plan. No generan restricción optimizable: determinan los conjuntos M y D y, por tanto, cuántas variables se crean. Llegan por la firma de la función.

### 7.2 Objetivos de energía y macronutrientes

**kcal_target** (blanda por defecto). Acerca la energía diaria a un valor *v*. Como blanda, penaliza la desviación absoluta con el patrón de exceso y defecto (sección 8.2). Como dura, fija la igualdad:

$$
\text{nut}_{d,\text{kcal}} = \text{scale\_target}(v), \qquad \forall d \in D \quad (\text{si es dura})
$$

**macro_target** (blanda por defecto). Igual que kcal_target pero sobre la suma de un macronutriente (proteína, hidratos o grasa). El peso de familia del objetivo se elige según el macro (w_protein, w_carb o w_fat).

### 7.3 Límites de nutrientes

**nutrient_min** (configurable). Exige un mínimo diario del nutriente. Como dura:

$$
\text{nut}_{d,n} \ge \text{scale\_target}(v), \qquad \forall d \in D
$$

Como blanda, penaliza solo el defecto respecto al mínimo, con una variable de defecto por día:

$$
\text{def}_{d} \ge \text{scale\_target}(v) - \text{nut}_{d,n}, \qquad \text{def}_{d} \ge 0
$$

**nutrient_max** (configurable). Exige un máximo diario. Como dura, `nut_{d,n} ≤ scale_target(v)`. Como blanda, penaliza el exceso con una variable de exceso `exc_d ≥ nut_{d,n} − scale_target(v)`. A diferencia de nutrient_min blanda, que se pondera con el peso del macro, nutrient_max blanda se pondera con el peso calórico (w_kcal), por ser el peso de referencia para límites que no van atados a un macronutriente concreto.

**nutrient_ratio** (configurable). Acota el cociente entre dos nutrientes (numerador *a*, denominador *b*) a un valor límite. Se linealiza con multiplicación cruzada para no dividir; el cociente se representa con 3 decimales como num/1000. Como dura, con cota máxima:

$$
\text{nut}_{d,a}\cdot 1000 \;\le\; \text{round}(v \cdot 1000)\cdot \text{nut}_{d,b}, \qquad \forall d \in D
$$

y con cota mínima la desigualdad se invierte. **La variante blanda no se modela en esta versión**: penalizar la desviación de un cociente requiere linealizar el propio cociente, no una simple multiplicación cruzada. Cuando llega una nutrient_ratio blanda, el solver no la aplica pero emite un aviso, para no silenciar en silencio una restricción que el profesional puso. Queda anotado como límite conocido.

### 7.4 Prohibiciones y preferencias

**forbid_food** (dura por defecto). Prohíbe un alimento concreto en todo el plan.

$$
x[f_0,d,m] = 0, \qquad \forall d \in D,\ m \in M
$$

**forbid_tag** (dura por defecto). Prohíbe todos los alimentos de una familia o etiqueta. Es el mecanismo de alergias e intolerancias.

$$
x[f,d,m] = 0, \qquad \forall f \in \text{miembros}(t),\ d \in D,\ m \in M
$$

**prefer_food** (blanda). Bonifica cada aparición del alimento (opcionalmente solo en un tipo de comida). El término entra restando en el objetivo:

$$
\text{bonus} \mathrel{+}= \sum_{d \in D}\ \sum_{m \in M_{\text{ctx}}} x[f_0,d,m]
$$

donde M_ctx son las comidas del tipo indicado, o todas si no se indica.

**prefer_tag** (blanda). Como prefer_food pero bonificando cada aparición de un alimento de la familia.

### 7.5 Reparto y frecuencia

**meal_kcal_ratio** (blanda por defecto). Reparte la energía diaria entre las comidas según porcentajes deseados. Para cada comida con porcentaje objetivo *pct*, penaliza la desviación de su energía respecto a ese porcentaje de la energía del día, con multiplicación cruzada. El porcentaje se escala por 10 para conservar un decimal:

$$
\text{kcal}_{d,m}\cdot 1000 - \text{round}(pct \cdot 10)\cdot \text{nut}_{d,\text{kcal}} = \text{over}_{d,m} - \text{under}_{d,m}
$$

y over + under entra como penalización en el objetivo. `kcal_{d,m}` es la energía escalada de la comida *m* del día *d*.

**max_servings_per_period** (configurable). Limita las apariciones de un alimento o de una familia en una ventana temporal de `window_days` días. Como dura, para cada ventana W:

$$
\sum_{f \in \text{obj}}\ \sum_{d \in W}\ \sum_{m \in M} x[f,d,m] \le \text{cap}
$$

Como blanda, penaliza el exceso sobre el tope en cada ventana.

### 7.6 Variedad y no repetición

**no_repeat_food** (blanda por defecto) y **no_repeat_tag** (blanda por defecto). Impiden o penalizan que un alimento, o cualquier alimento de una familia, se repita en menos de *sep* días. Se define la presencia por día del objetivo como el máximo de sus apariciones en las comidas del día:

$$
\text{pres}_{d} = \max_{f \in \text{obj},\, m \in M} x[f,d,m]
$$

y sobre esa presencia se aplica una ventana deslizante de *sep* días. Como dura, en cada ventana W de más de un día como mucho un día tiene el objetivo presente:

$$
\sum_{d \in W} \text{pres}_{d} \le 1
$$

Como blanda, penaliza el exceso sobre 1 en cada ventana. La diferencia entre las dos versiones del tipo es solo el conjunto objetivo: un alimento (no_repeat_food) o los miembros de una etiqueta (no_repeat_tag).

### 7.7 Combinaciones

**forbid_combination** (dura por defecto). Prohíbe que dos alimentos, o un alimento y una familia, coincidan en la misma comida. Con indicadores de presencia de cada grupo en la comida (a = máx del primer grupo, b = máx del segundo):

$$
a_{d,m} + b_{d,m} \le 1, \qquad \forall d \in D,\ m \in M
$$

### 7.8 Resumen del catálogo

| Tipo | Familia | Naturaleza por defecto | Patrón |
|---|---|---|---|
| meals_per_day | estructural | estructural | dimensiona comidas |
| plan_duration_days | estructural | estructural | dimensiona días |
| kcal_target | energía | blanda | desviación absoluta |
| macro_target | macros | blanda | desviación absoluta |
| nutrient_min | nutrientes | configurable | suma ≥ / defecto blando |
| nutrient_max | nutrientes | configurable | suma ≤ / exceso blando |
| nutrient_ratio | nutrientes | configurable | multiplicación cruzada (blanda no modelada) |
| forbid_food | prohibición | dura | fija a cero |
| prefer_food | preferencia | blanda | bonifica en objetivo |
| forbid_tag | prohibición | dura | fija a cero por familia |
| prefer_tag | preferencia | blanda | bonifica por familia |
| meal_kcal_ratio | reparto | blanda | desviación de reparto |
| max_servings_per_period | frecuencia | configurable | suma en ventana |
| no_repeat_food | variedad | blanda | ventana por alimento |
| no_repeat_tag | variedad | blanda | ventana por familia |
| forbid_combination | combinación | dura | suma por comida ≤ 1 |

---

## 8. Función objetivo

### 8.1 Estructura general

Las restricciones blandas no acotan el espacio factible; se agregan en una función objetivo que el solver minimiza. La función es una suma de penalizaciones menos bonificaciones, más dos términos estructurales de variedad y reparto:

$$
\min \Big( \sum_{i} \text{penalización}_i \;-\; \sum_{j} \text{bonificación}_j \;+\; w_{\text{variety}}\cdot P_{\text{variety}} \;+\; w_{\text{spread}}\cdot P_{\text{spread}} \Big)
$$

Cada penalización y bonificación ya viene multiplicada por su peso efectivo desde el catálogo (sección 8.4). Las bonificaciones (preferencias) entran con signo negativo porque se minimiza.

### 8.2 Linealización del valor absoluto

Acercarse a un objetivo es minimizar |suma − objetivo|, que no es lineal de forma directa. Se linealiza con dos variables no negativas, exceso y defecto, siguiendo el patrón estándar en programación con restricciones (el mismo recurso que emplean los modelos SMT descomponiendo el valor absoluto en dos desigualdades):

$$
\text{over} \ge 0, \quad \text{under} \ge 0
$$
$$
\text{suma} - \text{objetivo} = \text{over} - \text{under}
$$
$$
|\text{suma} - \text{objetivo}| = \text{over} + \text{under}
$$

Los dominios de over y under se acotan ajustados en lugar de con una cota holgada común: el exceso llega como mucho a (cota_superior − objetivo) y el defecto como mucho a objetivo. La cota superior de cada nutriente por comida se apoya en la propia regla R2: como una comida lleva a lo sumo MAX_ITEMS_PER_MEAL alimentos distintos, la cota es la suma de las MAX_ITEMS_PER_MEAL mayores aportaciones individuales alcanzables (ración máxima del alimento por su densidad escalada), y la diaria es esa cota por el número de comidas. La formulación anterior suponía el catálogo entero coincidiendo en una comida, cada alimento con la mayor ración y la mayor densidad del catálogo; la cota actual es entre uno y dos órdenes de magnitud menor sin excluir ninguna solución, y los dominios pequeños mejoran la propagación y reducen la memoria del proceso.

### 8.3 Términos estructurales de variedad y reparto

Dos penalizaciones no vienen de ninguna fila de restricción; son estructurales y empujan al plan hacia una distribución realista.

**Variedad global (P_variety).** Penaliza cada alimento del catálogo que no se use en todo el plan, suavemente, para favorecer usar más alimentos distintos cuando nada más lo decide. Con `usado[f]` = máx de x sobre todo el plan:

$$
P_{\text{variety}} = \sum_{f \in F} \big(1 - \text{usado}[f]\big)
$$

**Reparto (P_spread).** Es la tercera regla de sentido común de la sección 4: penaliza que un mismo alimento aparezca demasiadas veces en todo el plan, para que la ingesta se distribuya en vez de concentrarse. El tope antes de penalizar es `cap = ⌈MAX_APPEARANCES_PER_DAY_RATIO · |D|⌉` (0.6 por día, unas 4 apariciones en una semana). Con una variable de exceso por alimento:

$$
\text{exceso}[f] \ge \Big(\sum_{d \in D}\sum_{m \in M} x[f,d,m]\Big) - \text{cap}, \qquad \text{exceso}[f] \ge 0
$$
$$
P_{\text{spread}} = \sum_{f \in F} \text{exceso}[f]
$$

Esta regla es blanda a propósito. Si el catálogo aprieta (un cliente con muchas restricciones), el solver puede concentrar algo antes que declararse infactible. Se prefiere un plan factible imperfecto a un fallo. Las otras dos reglas de sentido común (R6 y R7) sí son duras porque son límites que ningún plan real viola.

### 8.4 Modulación por peso de fila

Los pesos por familia son fijos (sección 2.2). Sobre ellos, cada fila de restricción lleva su propio peso, de 1 a 10, que modula su contribución individual. El peso efectivo de un término es el producto de ambos:

$$
\text{peso efectivo} = w_{\text{familia}} \cdot \text{peso de la fila}
$$

Esto da una regla de prioridad clara sin necesidad de exponer un panel de ajuste global. Un objetivo calórico con peso de fila 7 pesa 10 · 7 = 70 por unidad escalada de desviación (70.000 por kcal); una preferencia de familia con peso 4 pesa 4.000 · 4 = 16.000 por aparición, que en unidades naturales son magnitudes comparables (sección 2.2).

---

## 9. Estrategia de resolución

### 9.1 Solver y parámetros

El modelo se resuelve con `CpSolver` de OR-Tools con estos parámetros:

- Límite de tiempo `SOLVE_TIME_LIMIT_S` = 90 s. Es holgado sobre el objetivo de referencia de 5 s; cubre el hardware limitado del hosting gratuito, donde los casos más pesados (objetivo calórico exacto combinado con preferencia o reparto por comida sobre la semana) tardan más. Al ampliar el catálogo hubo que subirlo, porque más variables por comida hacen que refinar el objetivo calórico exacto tarde más.
- Brecha relativa `SOLVE_RELATIVE_GAP` = 0.02. El solver para al llegar al 2 % de la cota inferior. Un borrador editable no necesita el óptimo demostrado, y parar al 2 % evita agotar el tiempo probando optimalidad.
- Hilos de búsqueda `SOLVE_WORKERS`, configurables por entorno: 8 por defecto, que aprovechan una máquina de desarrollo, y 2 en el hosting gratuito. La instancia gratuita (media vCPU y 512 MB) no gana velocidad con más hilos, porque el cuello de botella es la CPU, pero cada hilo mantiene su propia copia del estado de búsqueda y la memoria sí escala con ellos: con 8 hilos el proceso llegó a superar el límite de memoria de la instancia. Adecuar el paralelismo a los recursos reales es una decisión de despliegue, no del modelo; el coste asumible es que con menos hilos más casos agotan el límite de tiempo y terminan en factible en lugar de óptimo, con la misma calidad de plan útil.

La política es devolver la mejor solución factible encontrada si el tiempo expira antes del óptimo. El estado reportado distingue óptimo (demostrado) de factible (válido pero no probado óptimo).

### 9.2 Diagnóstico de infactibilidad

Cuando el conjunto de restricciones duras no admite solución, el solver no falla en silencio: devuelve el subconjunto mínimo de restricciones en conflicto. Se apoya en las asunciones de CP-SAT. Cada restricción clínica dura se envuelve en un literal booleano de activación *ℓ*, se aplica condicionada a ese literal (`OnlyEnforceIf(ℓ)`) y se declara el literal como asunción (`AddAssumption(ℓ)`). Si el modelo es infactible, `SufficientAssumptionsForInfeasibility()` devuelve el conjunto de literales responsables, que se mapean de vuelta a sus restricciones por su índice. Las restricciones de catálogo (secciones 4 y 5) no llevan literal: no son relajables por el profesional, así que no forman parte del diagnóstico.

El resultado es un `InfeasiblePlan` con tres piezas: el núcleo mínimo (`unsat_core`), una sugerencia en lenguaje natural redactada a partir de los tipos del núcleo, y la lista de restricciones relajables. Convierte un fallo opaco en una conversación útil con el profesional. Por ejemplo, un objetivo de 900 kcal duro junto a un mínimo de 180 g de proteína duro devuelve el núcleo {kcal_target, nutrient_min}, porque 180 g de proteína aportan unas 720 kcal y con el mínimo del resto de macros superan las 900.

### 9.3 Por qué enteros

CP-SAT opera sobre dominios enteros. Trabajar en enteros no es solo una conveniencia: es la forma natural del solver y permite que ciertas comparaciones se resuelvan sin condicionales. La escala de los nutrientes (sección 2.5), la multiplicación cruzada de porcentajes y cocientes, y la cuantización de las unidades a medias piezas con gramos por unidad pares (sección 3) son las técnicas que mantienen todo el modelo en enteros sin perder precisión relevante.

---

## 10. Distinción hard/soft como eje del modelo

La separación entre restricción dura y blanda es, junto con la frontera clínica/catálogo de la sección 6, la decisión de diseño que organiza todo el modelo, y conviene enunciarla de forma explícita porque no siempre es la misma para un tipo de restricción dado.

Una **restricción dura** acota el espacio de soluciones: una solución que la viole no existe para el solver. En la implementación, cada clínica dura se aplica de forma condicionada a un literal de asunción, lo que permite tanto garantizarla por construcción como reconstruir el núcleo de infactibilidad si el conjunto de duras es inconsistente. El cumplimiento de las duras es del 100 % por construcción: si alguna no se puede satisfacer, el resultado es infactible, no un plan que la incumple.

Una **restricción blanda** no acota el espacio factible: aporta un término a la función objetivo que penaliza desviarse de lo deseado o premia una configuración preferida. El solver prefiere unas soluciones factibles sobre otras según la suma ponderada de esos términos, pero puede incumplir una blanda si el resto del objetivo lo compensa.

Qué es duro y qué es blando se decide en tres niveles:

- **Por naturaleza del tipo.** Las prohibiciones (forbid_food, forbid_tag, forbid_combination) son duras por defecto: una alergia es absoluta. Los objetivos y preferencias (kcal_target, macro_target, prefer_food, prefer_tag, meal_kcal_ratio) son blandos: son dianas a las que aproximarse. Los límites de nutriente y de frecuencia son configurables, a veces exigencia clínica dura y a veces recomendación blanda.
- **Por el campo de prioridad de la fila.** El profesional decide en última instancia marcando cada restricción como dura o blanda. El valor por defecto por tipo es solo el que el productor asume cuando no se especifica.
- **Por decisión estructural del modelo.** Las reglas de las secciones 4 y 5 se aplican siempre. Las estructurales R6 y R7 y las siete de plausibilidad son duras porque son límites que ningún plan real viola: una comida implausible no se compensa con nada. La regla de reparto es blanda a propósito, para no volver infactible un caso con catálogo ajustado: se prefiere un plan imperfecto a un fallo.

Este último punto es el que resume la filosofía del solver: garantiza lo que debe garantizar, orienta el resto, y nunca sacrifica la factibilidad de un borrador editable por perseguir una preferencia.

---

## 11. Referencias

- Stigler, G. J. (1945). The Cost of Subsistence. Journal of Farm Economics, 27(2), 303-314.
- Dantzig, G. B. (1990). The Diet Problem. Interfaces, 20(4), 43-47.
- Balintfy, J. L. (1964). Menu Planning by Computer. Communications of the ACM, 7(4), 255-259.
- Petot, G. J., Marling, C., & Sterling, L. (1998). An Artificial Intelligence System for Computer-Assisted Menu Planning. Journal of the American Dietetic Association, 98(9), 1009-1014.
- Kahraman, A., & Seven, H. A. (2005). Healthy Daily Meal Planner. Proceedings of GECCO 2005.
- Mifflin, M. D., St Jeor, S. T., Hill, L. A., Scott, B. J., Daugherty, S. A., & Koh, Y. O. (1990). A New Predictive Equation for Resting Energy Expenditure in Healthy Individuals. The American Journal of Clinical Nutrition, 51(2), 241-247.
- Nethercote, N., Stuckey, P. J., Becket, R., Brand, S., Duck, G. J., & Tack, G. (2007). MiniZinc: Towards a Standard CP Modelling Language. Principles and Practice of Constraint Programming (CP 2007), LNCS 4741, 529-543.
- Perron, L., & Furnon, V. OR-Tools User's Manual. Google.

---

## Apéndice A. Mapa de restricciones a código

Correspondencia entre cada restricción formal de este documento y su ubicación en el solver, para que el modelo sea trazable en ambos sentidos. Se citan fichero y función, no números de línea.

| Elemento formal | Código |
|---|---|
| Variables x, g, k y su enlace | `model.build_base_model` |
| Perfil de ración min_f, max_f (R9) | `model.serving_bounds` |
| Cuantización por unidades (R10) | `model.build_base_model` (variable k) |
| Sumas escaladas nut_{d,n} | `model.build_base_model` (bucle de nutrientes) |
| Escala entera (scale_target, scaled_100) | `model.scale_target`, `model.scaled_100` |
| R1 presencia mínima por comida | `model._structural_constraints` |
| R2 cota de items por comida | `model._structural_constraints` |
| R3 suelo calórico (BMR / Mifflin) | `model.daily_kcal_floor`, `model.mifflin_bmr` |
| R4 rango de proteína | `model._structural_constraints` |
| R5 grasa mínima por energía | `model._structural_constraints` |
| R6 no repetir alimento el mismo día | `model._structural_constraints` |
| R7 variedad diaria mínima | `model._structural_constraints` |
| R8 variedad semanal mínima | `model._structural_constraints` |
| R11 lista blanca de franjas | `model._plausibility_constraints` |
| R12 composición de comidas principales | `model._plausibility_constraints` |
| R13 condimento acompañado | `model._plausibility_constraints` |
| R14 tope diario de condimentos | `model._plausibility_constraints` |
| R15 dulce y fruta como complemento | `model._plausibility_constraints` |
| Franjas por número de comidas | `loader._SLOTS_BY_COUNT`, `loader.load_meal_type_codes` |
| Catálogo (aplicación y assumptions) | `catalog.apply_constraints`, `catalog.hard_enforce` |
| kcal_target / macro_target | `catalog._h_kcal_target`, `catalog._h_macro_target` |
| nutrient_min / max / ratio | `catalog._h_nutrient_min`, `_h_nutrient_max`, `_h_nutrient_ratio` |
| forbid_food / forbid_tag | `catalog._h_forbid_food`, `_h_forbid_tag` |
| prefer_food / prefer_tag | `catalog._h_prefer_food`, `_h_prefer_tag` |
| meal_kcal_ratio | `catalog._h_meal_kcal_ratio` |
| max_servings_per_period | `catalog._h_max_servings` |
| no_repeat_food / no_repeat_tag | `catalog._h_no_repeat_food`, `_h_no_repeat_tag`, `catalog._no_repeat_windows` |
| forbid_combination | `catalog._h_forbid_combination` |
| Linealización del valor absoluto | `catalog._abs_dev` |
| Función objetivo (suma ponderada) | `objective.set_objective` |
| P_variety término de variedad | `objective._variety_penalty` |
| P_spread término de reparto | `objective._spread_penalty` |
| Resolución, gap, tiempo e hilos | `result.solve`, `config.SOLVE_WORKERS` |
| Diagnóstico de infactibilidad (unsat_core) | `result._extract_infeasible` |

---

*Formalización versión 2, del modelo implementado y verificado. Sustituye a la versión 1 a efectos de la memoria; la versión 1 se conserva como registro del modelo previo a la capa de plausibilidad, igual que la especificación v0 quedó como registro del diseño inicial.*
