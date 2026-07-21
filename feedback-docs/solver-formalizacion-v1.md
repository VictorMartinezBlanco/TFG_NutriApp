# Formalización matemática del solver de planes (v1)

**Julio de 2026. Formalización del modelo real, con las reglas estructurales de sentido común ya incorporadas.**

> Este documento formaliza matemáticamente el generador de planes de NutriApp tal como está implementado, no como se diseñó en papel. La especificación inicial (v0) fijó el modelo antes de programarlo; al implementar el solver y añadir después las reglas estructurales de sentido común, el modelo cambió en varios puntos concretos. Aquí se recoge el modelo definitivo, con notación matemática, para que sirva de fuente única de la sección de formalización de la memoria y de guía del código. El motor es correcto y está verificado; este documento no lo rehace, lo describe con rigor.

La formalización se apoya en la misma estructura que se usa en la literatura de planificación con restricciones: conjuntos base, parámetros de entrada precalculados, variables de decisión con su dominio, restricciones agrupadas en familias numeradas y una función objetivo con su estrategia de resolución. La distinción entre restricción dura (acota el espacio de soluciones) y restricción blanda (penaliza o premia en la función objetivo) es el eje del modelo y se marca explícitamente en cada punto.

Como aclaración de lectura, y siguiendo el convenio habitual, cualquier variable booleana dentro de un sumatorio aporta 1 si la condición se cumple y 0 en caso contrario.

---

## Índice

1. [Alcance y contrato](#1-alcance-y-contrato)
2. [Conjuntos y parámetros](#2-conjuntos-y-parámetros)
3. [Variables de decisión y dominios](#3-variables-de-decisión-y-dominios)
4. [Restricciones estructurales invariantes](#4-restricciones-estructurales-invariantes)
5. [Catálogo de restricciones configurables](#5-catálogo-de-restricciones-configurables)
6. [Función objetivo](#6-función-objetivo)
7. [Estrategia de resolución](#7-estrategia-de-resolución)
8. [Distinción hard/soft como eje del modelo](#8-distinción-hardsoft-como-eje-del-modelo)
9. [Referencias](#9-referencias)
- [Apéndice A. Mapa de restricciones a código](#apéndice-a-mapa-de-restricciones-a-código)

---

## 1. Alcance y contrato

### 1.1 Qué es el solver

El solver es un motor determinista que, dados un cliente y un conjunto de restricciones expresadas en un vocabulario cerrado, construye un borrador de plan nutricional que respeta por construcción todas las restricciones obligatorias y optimiza el cumplimiento de las preferencias. El resultado es un borrador editable para que el nutricionista lo ajuste y firme, no un plan cerrado que lo sustituya. El profesional mantiene el control clínico; el solver le ahorra partir de una hoja en blanco.

De este posicionamiento salen tres decisiones que atraviesan todo el modelo: el resultado es editable, expone qué restricciones aplicó para que sea auditable, y cuando el problema no tiene solución explica el conflicto en lugar de fallar en silencio.

### 1.2 Tecnología

El modelo se resuelve con OR-Tools CP-SAT, el solver de programación con restricciones sobre dominios enteros de Google, invocado desde Python. Toda la formalización que sigue es la del modelo CP-SAT real. Otros trabajos del área formalizan problemas equivalentes sobre MiniZinc o sobre Z3 (SMT); aquí se ha optado por CP-SAT por integrarse de principio a fin con el resto del backend en Python y porque su soporte de asunciones permite explicar las infactibilidades, como se detalla en la sección 7. La notación de este documento es independiente del solver; la implementación es CP-SAT.

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
    meal_codes: list[str],           # code por indice de comida
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

- **F** = conjunto de alimentos del catálogo visible (`food_pool`). Cada alimento *f ∈ F* tiene un identificador, una composición nutricional por cada 100 g y un conjunto de etiquetas.
- **D** = {1, ..., duration_days}: días del plan.
- **M** = {1, ..., meals_per_day}: comidas dentro de un día.
- **N** = conjunto de códigos de nutriente presentes en la composición de algún alimento del catálogo (energía, proteína, hidratos, grasa, sodio, calcio y los demás nutrientes cargados).

El tamaño del problema queda fijado por |F| · |D| · |M|. Los dos parámetros duration_days y meals_per_day no son restricciones optimizables sino la dimensión del problema, y entran por la firma de la función.

### 2.2 Parámetros de entrada precalculados

Antes de construir el modelo se preparan en Python los siguientes parámetros. Trabajar con enteros es la práctica recomendada en CP-SAT, que opera sobre dominios enteros; por eso los valores nutricionales, que en las tablas de composición vienen con decimales, se escalan a enteros con una constante de escala *s* = `NUTRIENT_SCALE` = 10.

- **kcal100(f)**, **nut100(f, n)** ∈ ℤ≥0, ∀f ∈ F, n ∈ N: valor del nutriente *n* (y de la energía) por 100 g del alimento *f*, escalado a entero multiplicando por *s* y redondeando. Si el alimento no tiene dato para ese nutriente, vale 0.
- **floor(c)** ∈ ℤ≥0: suelo calórico diario de seguridad del cliente *c*, en kcal. Es el metabolismo basal por Mifflin-St Jeor, acotado por debajo por un suelo absoluto según el sexo (sección 4, restricción R3).
- **prot_min(c)**, **prot_max(c)** ∈ ℝ≥0: cotas humanas de proteína diaria del cliente, en gramos, derivadas de su peso (0.8 y 2.2 g/kg). Si falta el peso, se usa un peso por defecto de 70 kg.
- **tag(f)** ⊆ etiquetas: familias y marcadores del alimento *f* (por ejemplo `vegetable`, `lactose`, `red_meat`). Para una etiqueta *t*, se define **miembros(t)** = { f ∈ F : t ∈ tag(f) }.
- Umbrales estructurales, todos en `config.py`: `GRAMS_MAX` = 300, `MIN_GRAMS_PRESENT` = 10, `MAX_ITEMS_PER_MEAL` = 4, `MAX_SAME_FOOD_PER_DAY` = 2, `MIN_DISTINCT_PER_DAY` = 4, `MIN_DISTINCT_PER_WEEK` = 10, `MAX_APPEARANCES_PER_DAY_RATIO` = 0.6, `FAT_MIN_PCT_ENERGY` = 15, rango de proteína (0.8, 2.2) g/kg.
- Pesos del objetivo por familia (`ObjectiveWeights`): w_kcal = 10, w_protein = 8, w_carb = 6, w_fat = 6, w_prefer = 4, w_no_repeat = 5, w_variety = 5, w_spread = 4. Sobre ellos, cada fila de restricción modula con su peso propio, de 1 a 10 (sección 6.4).

### 2.3 Escala entera y comparación cruzada

Un nutriente aportado por un alimento en una comida es, en unidad real, `value_per_100g(f, n) · g[f,d,m] / 100`. Para no dividir dentro del modelo, se guarda el coeficiente escalado nut100(f, n) = round(value_per_100g · *s*) y no se divide por 100. Así, la suma

$$
\text{nut}_{d,n} \;=\; \sum_{m \in M}\ \sum_{f \in F} \text{nut100}(f, n)\cdot g[f,d,m]
$$

representa la cantidad real del nutriente *n* en el día *d* multiplicada por (100 · *s*). Para comparar esa suma con un valor real *v* (un objetivo, un mínimo), se lleva *v* a la misma escala con el helper `scale_target(v) = round(v · s · 100)`, y se comparan dos enteros. Este mismo patrón de multiplicación cruzada resuelve cualquier restricción expresada como porcentaje o cociente sin introducir divisiones.

---

## 3. Variables de decisión y dominios

El modelo usa dos familias de variables por cada terna alimento-día-comida.

$$
x[f,d,m] \in \{0, 1\}, \qquad \forall f \in F,\ d \in D,\ m \in M
$$

$$
g[f,d,m] \in \{0, 1, \dots, \text{GRAMS\_MAX}\}, \qquad \forall f \in F,\ d \in D,\ m \in M
$$

`x[f,d,m]` vale 1 si el alimento *f* aparece en la comida *m* del día *d*, y 0 si no. `g[f,d,m]` son los gramos de ese alimento en esa comida, entero en [0, 300]. Se trabaja en gramos enteros con paso de 1 g, resolución de sobra para la práctica nutricional.

Las dos familias se enlazan para que los gramos sean cero si el alimento no está presente, y al menos un umbral mínimo si lo está.

$$
g[f,d,m] \ge \text{MIN\_GRAMS\_PRESENT} \iff x[f,d,m] = 1
$$

expresado en el solver como dos implicaciones condicionadas:

$$
x[f,d,m] = 1 \;\Rightarrow\; g[f,d,m] \ge \text{MIN\_GRAMS\_PRESENT}
$$
$$
x[f,d,m] = 0 \;\Rightarrow\; g[f,d,m] = 0
$$

El umbral mínimo de presencia (10 g) es una decisión de modelado que no estaba en el diseño en papel. Sin él, con el enlace `g ≥ 1 ⟺ x = 1`, el solver metía alimentos a 1 g solo para cumplir la presencia mínima por comida o la variedad barata, produciendo planes irreales con items de un gramo. Subir el mínimo a 10 g evita ese absurdo sin cambiar la naturaleza del enlace.

Además de las variables principales, el modelo introduce variables auxiliares enteras y booleanas que se definen donde se usan: los indicadores de uso diario y semanal de cada alimento (sección 4, R6 y R8), y las variables de exceso y defecto que linealizan los valores absolutos de la función objetivo (sección 6).

---

## 4. Restricciones estructurales invariantes

Estas restricciones no las configura el profesional: son propiedades del problema o límites fisiológicos y de sentido común que se aplican siempre, con independencia de las restricciones que lleguen en la entrada. Todas son duras. Las tres últimas (R6, R7 y el reparto de la sección 6.3) responden a la observación de que los planes salían matemáticamente válidos pero irreales, concentrando un alimento y rellenando el resto casi al azar.

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

El reparto de un alimento a lo largo del plan es la tercera regla de sentido común, pero se modela como término blando de la función objetivo y no como restricción dura, por lo que se describe en la sección 6.3.

---

## 5. Catálogo de restricciones configurables

Estas son las restricciones que el profesional (o, más adelante, el traductor automático) pone sobre un cliente o sobre su propio estilo clínico. Llegan como filas de `diet_constraint` en un vocabulario cerrado de 16 tipos. Cada fila tiene un campo de prioridad que decide si la restricción es dura o blanda: una restricción dura acota el espacio factible, una blanda entra como término de la función objetivo. Dos de los 16 tipos son estructurales (fijan la dimensión del problema y no generan restricción).

Para cada tipo se da su semántica, su naturaleza por defecto y su formulación. Se usan las abreviaturas de la sección 2: nut_{d,n} es la suma escalada del nutriente *n* en el día *d*, y scale_target lleva un valor real a esa escala.

### 5.1 Tipos estructurales

**meals_per_day** y **plan_duration_days**. Fijan el número de comidas por día y de días del plan. No generan restricción optimizable: determinan los conjuntos M y D y, por tanto, cuántas variables se crean. Llegan por la firma de la función.

### 5.2 Objetivos de energía y macronutrientes

**kcal_target** (blanda por defecto). Acerca la energía diaria a un valor *v*. Como blanda, penaliza la desviación absoluta con el patrón de exceso y defecto (sección 6.2). Como dura, fija la igualdad:

$$
\text{nut}_{d,\text{kcal}} = \text{scale\_target}(v), \qquad \forall d \in D \quad (\text{si es dura})
$$

**macro_target** (blanda por defecto). Igual que kcal_target pero sobre la suma de un macronutriente (proteína, hidratos o grasa). El peso de familia del objetivo se elige según el macro (w_protein, w_carb o w_fat).

### 5.3 Límites de nutrientes

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

### 5.4 Prohibiciones y preferencias

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

### 5.5 Reparto y frecuencia

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

### 5.6 Variedad y no repetición

**no_repeat_food** (blanda por defecto) y **no_repeat_tag** (blanda por defecto). Impiden o penalizan que un alimento, o cualquier alimento de una familia, se repita en menos de *sep* días. Se define la presencia por día del objetivo como el máximo de sus apariciones en las comidas del día:

$$
\text{pres}_{d} = \max_{f \in \text{obj},\, m \in M} x[f,d,m]
$$

y sobre esa presencia se aplica una ventana deslizante de *sep* días. Como dura, en cada ventana W de más de un día como mucho un día tiene el objetivo presente:

$$
\sum_{d \in W} \text{pres}_{d} \le 1
$$

Como blanda, penaliza el exceso sobre 1 en cada ventana. La diferencia entre las dos versiones del tipo es solo el conjunto objetivo: un alimento (no_repeat_food) o los miembros de una etiqueta (no_repeat_tag).

### 5.7 Combinaciones

**forbid_combination** (dura por defecto). Prohíbe que dos alimentos, o un alimento y una familia, coincidan en la misma comida. Con indicadores de presencia de cada grupo en la comida (a = máx del primer grupo, b = máx del segundo):

$$
a_{d,m} + b_{d,m} \le 1, \qquad \forall d \in D,\ m \in M
$$

### 5.8 Resumen del catálogo

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

## 6. Función objetivo

### 6.1 Estructura general

Las restricciones blandas no acotan el espacio factible; se agregan en una función objetivo que el solver minimiza. La función es una suma de penalizaciones menos bonificaciones, más dos términos estructurales de variedad y reparto:

$$
\min \Big( \sum_{i} \text{penalización}_i \;-\; \sum_{j} \text{bonificación}_j \;+\; w_{\text{variety}}\cdot P_{\text{variety}} \;+\; w_{\text{spread}}\cdot P_{\text{spread}} \Big)
$$

Cada penalización y bonificación ya viene multiplicada por su peso efectivo desde el catálogo (sección 6.4). Las bonificaciones (preferencias) entran con signo negativo porque se minimiza.

### 6.2 Linealización del valor absoluto

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

Los dominios de over y under se acotan ajustados en lugar de con una cota holgada común: el exceso llega como mucho a (cota_superior − objetivo) y el defecto como mucho a objetivo. La cota superior de cada nutriente se deriva del máximo real del nutriente en el catálogo, no de una holgura arbitraria; con catálogos grandes una cota fija podía superar el rango de la suma y hacer que el solver rechazara el modelo. Acotar ajustado mejora además la propagación.

### 6.3 Términos estructurales de variedad y reparto

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

### 6.4 Modulación por peso de fila

Los pesos por familia son fijos (sección 2.2). Sobre ellos, cada fila de restricción lleva su propio peso, de 1 a 10, que modula su contribución individual. El peso efectivo de un término es el producto de ambos:

$$
\text{peso efectivo} = w_{\text{familia}} \cdot \text{peso de la fila}
$$

Esto da una regla de prioridad clara sin necesidad de exponer un panel de ajuste global. Un objetivo calórico con peso de fila 7 pesa 10 · 7 = 70; una preferencia de familia con peso 4 pesa 4 · 4 = 16.

---

## 7. Estrategia de resolución

### 7.1 Solver y parámetros

El modelo se resuelve con `CpSolver` de OR-Tools con estos parámetros:

- Límite de tiempo `SOLVE_TIME_LIMIT_S` = 90 s. Es holgado sobre el objetivo de referencia de 5 s; cubre el hardware limitado del hosting gratuito, donde los casos más pesados (objetivo calórico exacto combinado con preferencia o reparto por comida sobre la semana) tardan más. Al ampliar el catálogo a 58 alimentos hubo que subirlo, porque más variables por comida hacen que refinar el objetivo calórico exacto tarde más.
- Brecha relativa `SOLVE_RELATIVE_GAP` = 0.02. El solver para al llegar al 2 % de la cota inferior. Un borrador editable no necesita el óptimo demostrado, y parar al 2 % evita agotar el tiempo probando optimalidad.
- 8 hilos de búsqueda.

La política es devolver la mejor solución factible encontrada si el tiempo expira antes del óptimo. El estado reportado distingue óptimo (demostrado) de factible (válido pero no probado óptimo).

### 7.2 Diagnóstico de infactibilidad

Cuando el conjunto de restricciones duras no admite solución, el solver no falla en silencio: devuelve el subconjunto mínimo de restricciones en conflicto. Se apoya en las asunciones de CP-SAT. Cada restricción dura se envuelve en un literal booleano de activación *ℓ*, se aplica condicionada a ese literal (`OnlyEnforceIf(ℓ)`) y se declara el literal como asunción (`AddAssumption(ℓ)`). Si el modelo es infactible, `SufficientAssumptionsForInfeasibility()` devuelve el conjunto de literales responsables, que se mapean de vuelta a sus restricciones por su índice.

El resultado es un `InfeasiblePlan` con tres piezas: el núcleo mínimo (`unsat_core`), una sugerencia en lenguaje natural redactada a partir de los tipos del núcleo, y la lista de restricciones relajables. Convierte un fallo opaco en una conversación útil con el profesional. Por ejemplo, un objetivo de 900 kcal duro junto a un mínimo de 180 g de proteína duro devuelve el núcleo {kcal_target, nutrient_min}, porque 180 g de proteína aportan unas 720 kcal y con el mínimo del resto de macros superan las 900.

### 7.3 Por qué enteros

CP-SAT opera sobre dominios enteros. Trabajar en enteros no es solo una conveniencia: es la forma natural del solver y permite que ciertas comparaciones se resuelvan sin condicionales. La escala de los nutrientes (sección 2.3) y la multiplicación cruzada de porcentajes y cocientes son las dos técnicas que mantienen todo el modelo en enteros sin perder precisión relevante.

---

## 8. Distinción hard/soft como eje del modelo

La separación entre restricción dura y blanda es la decisión de diseño que organiza todo el modelo, y conviene enunciarla de forma explícita porque no siempre es la misma para un tipo de restricción dado.

Una **restricción dura** acota el espacio de soluciones: una solución que la viole no existe para el solver. En la implementación, cada dura se aplica de forma condicionada a un literal de asunción, lo que permite tanto garantizarla por construcción como reconstruir el núcleo de infactibilidad si el conjunto de duras es inconsistente. El cumplimiento de las duras es del 100 % por construcción: si alguna no se puede satisfacer, el resultado es infactible, no un plan que la incumple.

Una **restricción blanda** no acota el espacio factible: aporta un término a la función objetivo que penaliza desviarse de lo deseado o premia una configuración preferida. El solver prefiere unas soluciones factibles sobre otras según la suma ponderada de esos términos, pero puede incumplir una blanda si el resto del objetivo lo compensa.

Qué es duro y qué es blando se decide en tres niveles:

- **Por naturaleza del tipo.** Las prohibiciones (forbid_food, forbid_tag, forbid_combination) son duras por defecto: una alergia es absoluta. Los objetivos y preferencias (kcal_target, macro_target, prefer_food, prefer_tag, meal_kcal_ratio) son blandos: son dianas a las que aproximarse. Los límites de nutriente y de frecuencia son configurables, a veces exigencia clínica dura y a veces recomendación blanda.
- **Por el campo de prioridad de la fila.** El profesional decide en última instancia marcando cada restricción como dura o blanda. El valor por defecto por tipo es solo el que el productor asume cuando no se especifica.
- **Por decisión estructural del modelo.** Las reglas de sentido común de la sección 4 se aplican siempre. Dos de ellas (no repetir el mismo alimento el mismo día, variedad diaria mínima) son duras porque son límites que ningún plan real viola. La tercera (reparto en el plan) es blanda a propósito, para no volver infactible un caso con catálogo ajustado: se prefiere un plan imperfecto a un fallo.

Este último punto es el que resume la filosofía del solver: garantiza lo que debe garantizar, orienta el resto, y nunca sacrifica la factibilidad de un borrador editable por perseguir una preferencia.

---

## 9. Referencias

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
| Variables x, g y su enlace | `model.build_base_model` |
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
| Resolución, gap y tiempo | `result.solve` |
| Diagnóstico de infactibilidad (unsat_core) | `result._extract_infeasible` |

---

*Formalización versión 1, del modelo implementado y verificado. Sustituye a efectos de la memoria a la parte de modelo formal del documento de especificación v0, que se conserva como registro del diseño inicial.*
