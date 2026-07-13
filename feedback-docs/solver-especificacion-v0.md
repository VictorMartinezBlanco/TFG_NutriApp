# Especificación formal del solver de planes y catálogo cerrado de restricciones (v0)

**Julio de 2026. Documento de diseño, sin código de producción.**

> Este documento define el modelo formal del generador de planes de NutriApp como problema de programación con restricciones (constraint programming) y cierra el vocabulario de restricciones que el generador acepta como entrada. Es la especificación de referencia para la implementación posterior del solver y para la interfaz de usuario que produce las restricciones. No monta el solver, no define interfaz gráfica y no modifica el esquema de la base de datos. La única función que describe es una función pura sobre sus entradas.

---

## Índice

1. [Alcance y contrato](#1-alcance-y-contrato)
2. [Modelo formal](#2-modelo-formal)
3. [Catálogo cerrado de tipos de restricción](#3-catálogo-cerrado-de-tipos-de-restricción)
4. [Persistencia permanente frente a temporal](#4-persistencia-permanente-frente-a-temporal)
5. [Casos de prueba manuales](#5-casos-de-prueba-manuales)
6. [Métricas y calidad del solver](#6-métricas-y-calidad-del-solver)
7. [Contrato JSON del endpoint de generación](#7-contrato-json-del-endpoint-de-generación)
8. [Propuestas de cambio para la base de datos](#8-propuestas-de-cambio-para-la-base-de-datos)
9. [Referencias](#9-referencias)

---

## 1. Alcance y contrato

### 1.1 Objetivo en una frase

El solver es un motor determinista que, dados un cliente y un conjunto de restricciones expresadas en un vocabulario cerrado, construye un borrador de plan nutricional que respeta por construcción todas las restricciones obligatorias y optimiza el cumplimiento de las preferencias, para que el nutricionista lo edite, ajuste y firme. Es un editor inteligente que asiste al profesional, no un generador autónomo que lo sustituye. El nutricionista tiene siempre la última palabra sobre el plan; el solver solo le ahorra el trabajo de partir de una hoja en blanco.

Este posicionamiento tiene consecuencias concretas en el diseño. El objetivo medible no es la calidad abstracta de la dieta que produce la máquina, sino el tiempo que ahorra al profesional manteniendo intactos su control y su responsabilidad clínica. Por eso el solver produce un borrador editable y no un plan cerrado, expone qué restricciones aplicó para que el resultado sea auditable, y cuando el problema no tiene solución explica cuál es el conflicto en lugar de fallar en silencio.

### 1.2 Firma formal de la función de generación

El solver se expone como una función pura. Su firma conceptual es la siguiente.

```python
def generate_plan(
    client: ClientProfile,          # datos antropométricos y de actividad
    duration_days: int,             # numero de dias del plan, dominio [1, 90]
    meals_per_day: int,             # numero de comidas por dia, dominio [1, 6]
    constraints: list[Constraint],  # restricciones del cliente + del nutricionista
    food_pool: list[Food],          # catalogo de alimentos visible para el nutricionista
    weights: ObjectiveWeights = DEFAULT_WEIGHTS,  # pesos del objetivo, con valores por defecto
) -> PlanResult:
    ...
```

El resultado es una unión de dos casos disjuntos. Se modela como un tipo suma para forzar al llamante a distinguir explícitamente entre plan factible e infactible.

```python
PlanResult = FeasiblePlan | InfeasiblePlan

@dataclass
class FeasiblePlan:
    days: list[Day]                 # un elemento por dia del plan
    metrics: SolveMetrics           # tiempo, cumplimiento, gap de optimizacion
    warnings: list[str]             # avisos no bloqueantes (soft incumplidas relevantes)

@dataclass
class Day:
    day_num: int                    # 1..duration_days
    meals: list[Meal]

@dataclass
class Meal:
    meal_type_code: str             # breakfast, lunch, dinner, ...
    items: list[MealItem]

@dataclass
class MealItem:
    food_id: int
    grams: int                      # gramos enteros, ver seccion 2

@dataclass
class InfeasiblePlan:
    unsat_core: list[ConstraintRef]     # subconjunto minimo de restricciones en conflicto
    suggestion: str                     # explicacion en lenguaje natural del conflicto
    relaxable: list[ConstraintRef]      # restricciones soft que, relajadas, harian factible
```

La estructura de `FeasiblePlan` es isomorfa a la jerarquía de la base de datos. Un `MealItem` corresponde a una fila de `plan_meal_item` con su `food_id` y su `quantity_g`; un `Meal` agrupa los items de un mismo tipo de comida en un día; un `Day` agrupa las comidas de un día. El solver no persiste nada, pero devuelve exactamente la información que la capa de escritura necesita para materializar las filas.

### 1.3 Contenido del caso infactible

Cuando el conjunto de restricciones obligatorias no admite ninguna solución, el solver no devuelve un plan vacío ni lanza una excepción genérica. Devuelve un `InfeasiblePlan` con tres piezas de información pensadas para que la interfaz explique al nutricionista qué ha pasado y cómo arreglarlo.

- `unsat_core` es un subconjunto de las restricciones obligatorias tal que, si se elimina cualquiera de ellas, el problema pasa a ser factible. Es el núcleo mínimo de inconsistencia. Se obtiene con la funcionalidad de núcleo de asunciones de CP-SAT: cada restricción obligatoria se asocia a una variable booleana de activación, se resuelve pidiendo el núcleo de las que no pueden satisfacerse a la vez, y el solver devuelve el conjunto de literales responsables. El llamante recibe referencias a restricciones concretas, no un mensaje opaco.
- `suggestion` es una frase construida a partir del núcleo, del tipo "el objetivo de 1200 kcal es incompatible con el mínimo de 180 g de proteína, que ya aporta 720 kcal, más el mínimo estructural del resto de macros". El solver conoce el tipo de cada restricción del núcleo, así que puede redactar el conflicto en términos que el profesional entienda.
- `relaxable` lista las restricciones blandas que, de convertirse en no obligatorias o de aflojar su umbral, devolverían la factibilidad. Sirve para que la interfaz ofrezca acciones concretas ("relajar el objetivo de proteína a 140 g") en lugar de dejar al usuario a ciegas.

Esta información es la que consumirán el validador clínico del sub-bloque 6d y la interfaz de generación, para convertir un fallo del solver en una conversación útil con el profesional.

### 1.4 Qué se asume del cliente

El perfil del cliente que entra en el solver contiene los campos antropométricos y de actividad que ya recoge la ficha: sexo, fecha de nacimiento (de la que se deriva la edad), altura en centímetros, peso en kilogramos y nivel de actividad. Estos datos alimentan el cálculo del mínimo calórico fisiológico y de los rangos humanos de macronutrientes descritos en la sección 2.4. Cuando alguno falta, el solver usa valores conservadores por defecto documentados en esa misma sección y lo refleja como aviso.

Las restricciones del cliente y las del nutricionista llegan ya resueltas en la lista `constraints`. El llamante es responsable de recolectarlas antes de invocar al solver: toma las restricciones activas de ámbito cliente correspondientes a ese cliente y las combina con las de ámbito nutricionista del profesional que genera el plan. El estilo clínico del profesional entra por esta segunda vía, como restricciones de ámbito nutricionista, sin ningún tratamiento especial dentro del solver. Para el motor, una preferencia del nutricionista y una preferencia del cliente son restricciones del mismo tipo; solo difieren en su origen.

### 1.5 Fuente de alimentos

El universo de alimentos con el que trabaja el solver es `food_pool`, el catálogo visible para el nutricionista que genera el plan. En la práctica son los alimentos del catálogo global más los propios que el profesional haya dado de alta, filtrados por las reglas de acceso de la base de datos. Para cada alimento el solver necesita su composición nutricional por cada cien gramos (de la tabla de nutrientes por alimento), sus etiquetas semánticas (para poder resolver restricciones expresadas sobre familias) y, cuando existe, su ración típica en gramos (que orienta los dominios y sirve de valor por defecto de presentación). El solver nunca inventa alimentos: solo combina los que recibe en `food_pool`. La variedad y la calidad del plan dependen directamente de la riqueza de ese catálogo.

### 1.6 Qué no hace el solver

El alcance del solver está deliberadamente acotado. Lo que queda fuera es tan importante de fijar como lo que queda dentro.

- No consulta ningún modelo de lenguaje. Las restricciones le llegan ya estructuradas en el vocabulario cerrado de la sección 3. Quién las produjo (el profesional a mano o un traductor automático a partir de texto libre) es irrelevante para el motor.
- No ejecuta el validador clínico. La comprobación de seguridad clínica que revisa alergias, interacciones y rangos es un paso posterior e independiente, descrito en el sub-bloque 6d. El solver garantiza por construcción las restricciones obligatorias que se le pasaron, pero no sustituye a esa capa de seguridad.
- No persiste nada. No escribe planes, ni restricciones, ni trazas. Es una función pura: mismas entradas producen el mismo resultado, salvo el desempate interno del solver ante soluciones de igual coste. La materialización en base de datos es responsabilidad de la capa que lo invoca.
- No decide la estructura del plan más allá de lo que se le indica. El número de días y de comidas por día son parámetros de entrada, no decisiones del motor.

---

## 2. Modelo formal

### 2.1 Vocabulario y notación

El problema se formula con el vocabulario estándar de la programación con restricciones. Las variables de decisión son las incógnitas que el solver puede fijar; cada una tiene un dominio, el conjunto de valores que puede tomar. Las restricciones obligatorias, que en adelante llamaremos duras, acotan qué combinaciones de valores son admisibles: una solución que las viole no existe para el solver. Las restricciones blandas no acotan el espacio de soluciones sino que penalizan o premian ciertas configuraciones a través de la función objetivo, de modo que el solver prefiere unas soluciones factibles sobre otras. El solver reduce dominios propagando las restricciones y, cuando la propagación no basta, busca por ramificación y retroceso.

Sean los índices:

- `f` recorre los alimentos de `food_pool`.
- `d` recorre los días del plan, de 1 a `duration_days`.
- `m` recorre las comidas de un día, de 1 a `meals_per_day`.

### 2.2 Variables de decisión

Se adopta una formulación con dos familias de variables por cada terna alimento-día-comida. Es la opción más expresiva de las candidatas manejadas en el diseño y se prefiere sobre la alternativa de contar raciones porque permite prescribir gramos exactos, que es como el profesional razona y como la tabla de items del plan almacena las cantidades.

```python
# x[f, d, m] = 1 si el alimento f aparece en la comida m del dia d
x[f, d, m] = model.NewBoolVar(f"x_{f}_{d}_{m}")

# g[f, d, m] = gramos del alimento f en la comida m del dia d
g[f, d, m] = model.NewIntVar(0, GRAMS_MAX, f"g_{f}_{d}_{m}")
```

Las dos familias se enlazan para que los gramos sean estrictamente positivos si y solo si el alimento está presente, y cero en caso contrario.

```python
model.Add(g[f, d, m] >= 1).OnlyEnforceIf(x[f, d, m])
model.Add(g[f, d, m] == 0).OnlyEnforceIf(x[f, d, m].Not())
```

La alternativa de una sola variable entera por terna que contase raciones de la ración típica del alimento se descartó: discretiza los gramos en múltiplos de la ración (cuarenta gramos de avena solo podrían ser cuarenta, ochenta, ciento veinte) y encaja mal con objetivos finos de macronutrientes y con el almacenamiento libre de gramos de la tabla de items.

### 2.3 Dominios

- `x[f, d, m]` es booleana, dominio `{0, 1}`.
- `g[f, d, m]` es entera con dominio `[0, GRAMS_MAX]`. El techo por defecto es de trescientos gramos por alimento y comida, una cota superior generosa para prácticamente cualquier alimento en una ingesta. `GRAMS_MAX` es configurable por restricción cuando un caso concreto lo exija (por ejemplo, verduras que admiten raciones mayores), pero el valor por defecto acota el problema a un dominio pequeño y manejable.

Se trabaja en gramos enteros con paso de un gramo. Un gramo de resolución es suficiente para la práctica nutricional; nadie prescribe con precisión inferior. Trabajar con enteros en lugar de reales es además la práctica recomendada en CP-SAT, que es un solver sobre dominios enteros: los valores nutricionales por cien gramos, que en las tablas de composición vienen con decimales, se escalan a enteros antes de entrar en el modelo para evitar aritmética fraccionaria dentro del solver.

Una consecuencia de escalar es que la energía y los macronutrientes de un alimento en una comida se calculan como una cantidad por gramo multiplicada por los gramos. Si `kcal_100(f)` son las kilocalorías por cien gramos del alimento, la energía aportada es `kcal_100(f) * g[f, d, m] / 100`. Para mantener todo entero, los coeficientes por cien gramos se multiplican por una constante de escala y las divisiones por cien se difieren a la comparación final, como se detalla en la linealización de la sección 2.6.

### 2.4 Restricciones estructurales invariantes

Hay restricciones que no configura el profesional porque son propiedades del problema o límites fisiológicos. Se aplican siempre, con independencia de las restricciones que lleguen en la lista de entrada. Son duras por naturaleza.

**Dimensión del problema.** El número de días y de comidas por día fijan cuántas variables existen. No son restricciones optimizables sino la forma del problema. Entran por la firma de la función.

**Presencia mínima por comida.** Cada comida del plan debe contener al menos un alimento, para que no haya comidas vacías. Para cada día y comida:

```python
model.Add(sum(x[f, d, m] for f in foods) >= 1)
```

**Cota superior de alimentos por comida.** Para evitar comidas con una lista interminable de ingredientes minúsculos, se limita el número de alimentos distintos por comida a una cota razonable, por defecto cuatro.

```python
model.Add(sum(x[f, d, m] for f in foods) <= MAX_ITEMS_PER_MEAL)
```

**Mínimo calórico fisiológico.** La energía total de cada día no puede bajar de un suelo de seguridad calculado sobre los datos del cliente. Se usa la ecuación de Mifflin-St Jeor para el metabolismo basal, que es la referencia clínica actual para población general.

Para el metabolismo basal en kilocalorías por día:

```
hombre: BMR = 10 * peso_kg + 6.25 * altura_cm - 5 * edad + 5
mujer:  BMR = 10 * peso_kg + 6.25 * altura_cm - 5 * edad - 161
```

El gasto energético total se obtiene multiplicando el basal por un factor de actividad según el nivel declarado (sedentario 1.2, ligero 1.375, moderado 1.55, activo 1.725, muy activo 1.9). El mínimo fisiológico diario del plan se fija como el mayor entre el metabolismo basal y un suelo absoluto por sexo (por defecto 1200 kcal en mujeres y 1500 kcal en hombres, umbrales habituales por debajo de los cuales una dieta deja de considerarse segura sin supervisión específica).

```python
kcal_min = max(round(bmr), floor_by_sex)  # suelo de seguridad
for d in days:
    model.Add(daily_kcal[d] >= kcal_min)   # daily_kcal linealizado, ver 2.6
```

Cuando faltan datos antropométricos para calcular el basal, se recurre directamente al suelo absoluto por sexo y se emite un aviso. Este mínimo estructural convive con el objetivo calórico que el profesional puede fijar como restricción blanda: el objetivo tira del total hacia el valor deseado, pero nunca por debajo del suelo de seguridad, que es duro.

**Rangos humanos de macronutrientes.** Con independencia de lo que pidan las restricciones, la proteína, los hidratos y la grasa diarios se mantienen dentro de rangos compatibles con el peso corporal y con las recomendaciones generales. Por defecto la proteína se acota en el intervalo de 0.8 a 2.2 gramos por kilo de peso y día, y las grasas no bajan de un mínimo que garantice la absorción de vitaminas liposolubles (del orden del 15 por ciento de la energía). Estos rangos son duros y estructurales; su función es impedir que una combinación de restricciones blandas mal ponderada empuje el plan hacia una composición inhumana.

**Variedad mínima semanal.** Para planes de al menos una semana, se exige un número mínimo de alimentos distintos en cada ventana de siete días, por defecto una decena, para evitar la monotonía que hace que los pacientes abandonen. Se modela con variables booleanas de uso por alimento en la ventana.

```python
# used[f] = 1 si el alimento f aparece algun dia de la ventana
for f in foods:
    model.AddMaxEquality(used[f], [x[f, d, m] for d in window for m in meals])
model.Add(sum(used[f] for f in foods) >= MIN_DISTINCT_PER_WEEK)
```

### 2.5 Función objetivo

Las restricciones blandas no acotan el espacio factible; se agregan en una función objetivo que el solver minimiza. La función es una suma ponderada de términos, cada uno de los cuales penaliza una desviación respecto a lo deseado o premia una configuración preferida (con signo negativo, ya que se minimiza).

Los pesos por familia son fijos con valores por defecto. Sobre ellos, el campo de peso de cada fila de restricción, con rango de uno a diez, modula la contribución individual de esa restricción concreta. Es decir, el peso efectivo de un término es el peso por familia multiplicado por el peso de la fila. Esto da una regla de prioridad clara y defendible sin necesidad de exponer un panel de ajuste global en la interfaz.

Pesos por familia por defecto:

```python
DEFAULT_WEIGHTS = ObjectiveWeights(
    w_kcal      = 10,   # cercania al objetivo calorico
    w_protein   = 8,    # cercania al objetivo de proteina
    w_carb      = 6,    # cercania al objetivo de hidratos
    w_fat       = 6,    # cercania al objetivo de grasa
    w_prefer    = 4,    # bonificacion por alimento o familia preferidos
    w_no_repeat = 5,    # penalizacion por repeticion no deseada
    w_variety   = 5,    # penalizacion por baja variedad
)
```

Estructura del objetivo, de forma esquemática:

```python
objective = (
    w_kcal    * dev_kcal
  + w_protein * dev_protein
  + w_carb    * dev_carb
  + w_fat     * dev_fat
  - w_prefer  * prefer_bonus
  + w_no_repeat * repeat_penalty
  + w_variety * variety_penalty
)
model.Minimize(objective)
```

La energía y los macronutrientes solo entran en el objetivo cuando el profesional ha fijado el objetivo correspondiente como restricción blanda; si un objetivo se marca como duro, pasa a ser una restricción del modelo y sale de la función objetivo. Los términos de preferencia, repetición y variedad se activan según las restricciones presentes de esas familias.

### 2.6 Linealización de valores absolutos y divisiones

Dos operaciones frecuentes no son lineales de forma directa y se reescriben con variables auxiliares, siguiendo el patrón habitual en CP-SAT.

**Valor absoluto de una desviación.** Acercarse a un objetivo significa minimizar la distancia entre una suma y un valor deseado, que es un valor absoluto. Se linealiza con dos variables no negativas que representan el exceso y el defecto.

```python
# desviacion respecto al objetivo calorico del dia
over  = model.NewIntVar(0, BIG, "over")
under = model.NewIntVar(0, BIG, "under")
model.Add(daily_kcal[d] - kcal_target == over - under)
dev_kcal = over + under   # esto es |daily_kcal - kcal_target|
```

**Sumas de nutrientes con división por cien.** La energía de una comida es la suma sobre los alimentos de la cantidad por cien gramos por los gramos, dividida por cien. Para no introducir divisiones, se define la suma escalada y la comparación se hace multiplicando el otro lado por cien.

```python
# energia diaria escalada por 100 (evita dividir dentro del modelo)
daily_kcal_x100 = sum(kcal_100(f) * g[f, d, m] for f in foods for m in meals)
# comparar con un objetivo: multiplicar el objetivo por 100
model.Add(daily_kcal_x100 >= kcal_min * 100)
```

Este mismo patrón de multiplicación cruzada resuelve cualquier restricción expresada como cociente o porcentaje, como los ratios entre nutrientes o los repartos de energía por comida. Se detalla en el catálogo de la sección 3 para cada tipo que lo necesita.

---

## 3. Catálogo cerrado de tipos de restricción

Esta sección cierra el vocabulario que el solver acepta. Cada tipo se documenta con su semántica formal, los argumentos que recibe, su naturaleza por defecto (dura, blanda o configurable por el productor), su patrón de modelado en el solver y un ejemplo real. El catálogo consta de dieciséis tipos. De ellos, dos son estructurales: no son restricciones optimizables sino que fijan la forma del problema.

Los argumentos se expresan en términos de los campos de la fila de restricción: el alimento objetivo, la etiqueta objetivo, el nutriente objetivo, la unidad, un valor numérico, un segundo valor numérico para rangos, el peso, la prioridad y un campo de contexto libre para matices como la ventana temporal, el tipo de comida o los días de la semana.

Convenio de naturaleza por defecto. El campo de prioridad de cada fila decide en última instancia si una restricción es dura o blanda. El valor por defecto que se documenta aquí es el que el productor (interfaz manual o traductor automático) debería asumir cuando el profesional no lo especifica, elegido según la semántica clínica: las prohibiciones absolutas son duras, los objetivos y preferencias son blandos, y los límites de nutrientes y de frecuencia quedan a criterio del productor por ser a veces exigencias clínicas y a veces recomendaciones.

### 3.1 Tipos estructurales

#### meals_per_day

- **Semántica.** Fija el número de comidas por día del plan.
- **Argumentos.** Valor numérico entero. Sin objetivo.
- **Naturaleza.** Estructural. Parametriza la dimensión del problema; llega por la firma de la función.
- **Modelado.** No genera restricción optimizable. Determina el índice de comidas y, por tanto, cuántas variables se crean.
- **Ejemplo.** "Cinco comidas al día": valor 5.
- **Casos límite.** Un número de comidas mayor que la variedad disponible en el catálogo puede volver el problema infactible por la presencia mínima por comida. Un número muy alto multiplica el tamaño del problema.

#### plan_duration_days

- **Semántica.** Fija el número de días del plan.
- **Argumentos.** Valor numérico entero, dominio de 1 a 90.
- **Naturaleza.** Estructural. Llega por la firma de la función.
- **Modelado.** No genera restricción optimizable. Determina el índice de días.
- **Ejemplo.** "Plan semanal": valor 7.
- **Casos límite.** Planes largos amplían la ventana de las restricciones de variedad y frecuencia y aumentan el tamaño del problema de forma lineal.

Estos dos tipos se conservan en el vocabulario porque el productor de restricciones (tanto la interfaz manual como el traductor automático) puede emitirlos de forma natural al leer la petición del profesional, y porque documentan explícitamente que la estructura del plan es parte del contrato. En el modelo formal, sin embargo, fijan la forma del problema y no participan de la optimización.

### 3.2 Objetivos de energía y macronutrientes

#### kcal_target

- **Semántica.** Acerca la energía total diaria del plan a un valor objetivo.
- **Argumentos.** Valor numérico (kilocalorías por día), operador de igualdad aproximada. Sin objetivo de alimento ni de nutriente.
- **Naturaleza.** Blanda por defecto. El objetivo calórico es una diana a la que aproximarse, no un valor exacto obligatorio; el suelo fisiológico duro de la sección 2.4 impide desviaciones peligrosas por debajo.
- **Modelado.** Penaliza la desviación absoluta respecto al objetivo mediante el patrón de exceso y defecto.

```python
model.Add(daily_kcal[d] - value == over[d] - under[d])
dev_kcal = sum(over[d] + under[d] for d in days)
# entra en el objetivo con peso w_kcal * weight_fila
```

- **Ejemplo real.** Maria, pérdida de peso: objetivo de 1500 kcal, blando, peso de fila 7.
- **Casos límite.** Un objetivo por debajo del suelo fisiológico es matemáticamente inalcanzable como valor exacto; el término blando tirará hacia abajo hasta toparse con el suelo duro, y el plan quedará en el suelo con una desviación registrada. Combinado con un mínimo de proteína alto, el objetivo bajo puede ser el origen de una infactibilidad si ambos se marcan como duros.

#### macro_target

- **Semántica.** Acerca los gramos diarios de un macronutriente (proteína, hidratos o grasa) a un valor objetivo, o a un porcentaje de la energía.
- **Argumentos.** Nutriente objetivo (el macronutriente), valor numérico (gramos o porcentaje según la unidad), operador de igualdad aproximada.
- **Naturaleza.** Blanda por defecto, por la misma razón que el objetivo calórico.
- **Modelado.** Idéntico al objetivo calórico pero sobre la suma del macronutriente. Si el objetivo es porcentual, se linealiza con multiplicación cruzada contra la energía total.

```python
# objetivo en gramos
model.Add(daily_macro[d] - value == over_m[d] - under_m[d])
# objetivo porcentual: gramos * kcal_por_gramo * 100 comparado con pct * kcal
```

- **Ejemplo real.** Un reparto del 30 por ciento de la energía en proteína para un cliente deportista.
- **Casos límite.** Objetivos porcentuales de los tres macronutrientes que no sumen cien por cien generan tensiones que el solver resuelve minimizando la suma de desviaciones. Objetivos en gramos incompatibles con el objetivo calórico compiten en el objetivo según sus pesos.

### 3.3 Límites de nutrientes

#### nutrient_min

- **Semántica.** Exige que la cantidad diaria de un nutriente alcance al menos un mínimo.
- **Argumentos.** Nutriente objetivo, valor numérico, unidad, operador de mínimo.
- **Naturaleza.** Configurable. A veces es una exigencia clínica dura (proteína mínima en un paciente con sarcopenia), a veces una recomendación blanda.
- **Modelado.** Suma del nutriente mayor o igual que el valor, escalando por cien.

```python
model.Add(
    sum(nut_100(f) * g[f, d, m] for f in foods for m in meals) >= value * 100
)
```

- **Ejemplo real.** John, ganancia muscular: al menos 140 g de proteína al día, blando, peso de fila 6.
- **Casos límite.** Un mínimo de nutriente alto combinado con la prohibición de las principales fuentes de ese nutriente puede volver el problema infactible; ese conflicto es un candidato típico del núcleo de infactibilidad.

#### nutrient_max

- **Semántica.** Exige que la cantidad diaria de un nutriente no supere un máximo.
- **Argumentos.** Nutriente objetivo, valor numérico, unidad, operador de máximo.
- **Naturaleza.** Configurable. El tope de sodio de un hipertenso puede ser duro; un tope de azúcar puede ser blando.
- **Modelado.** Suma del nutriente menor o igual que el valor, escalando por cien.

```python
model.Add(
    sum(nut_100(f) * g[f, d, m] for f in foods for m in meals) <= value * 100
)
```

- **Ejemplo real.** Emma, diabetes: sodio máximo de 2000 mg al día, blando, peso de fila 7.
- **Casos límite.** Un máximo muy restrictivo sobre un nutriente presente en casi todos los alimentos del catálogo puede dejar el espacio factible casi vacío y forzar planes monótonos o infactibilidad.

#### nutrient_ratio

- **Semántica.** Acota el cociente entre dos nutrientes a un valor máximo o mínimo.
- **Argumentos.** Nutriente objetivo (numerador), el nutriente del denominador en el contexto, valor numérico (el cociente límite), operador.
- **Naturaleza.** Configurable, tirando a dura cuando expresa un objetivo clínico concreto.
- **Modelado.** Se linealiza con multiplicación cruzada para no dividir.

```python
# ratio numerador/denominador <= value  ->  numerador <= value * denominador
model.Add(sum_num <= value * sum_den)
```

- **Ejemplo real.** Ratio omega 6 sobre omega 3 no mayor que cuatro, cuando el catálogo tenga esos nutrientes cargados.
- **Casos límite.** Depende de que ambos nutrientes estén presentes en la composición de los alimentos del catálogo; si el denominador puede ser cero, la multiplicación cruzada lo maneja sin división por cero, pero el ratio pierde sentido y conviene un mínimo del denominador acompañante.

### 3.4 Prohibiciones y preferencias

#### forbid_food

- **Semántica.** Prohíbe que un alimento concreto aparezca en el plan.
- **Argumentos.** Alimento objetivo, operador de prohibición.
- **Naturaleza.** Dura por defecto. Una prohibición de alimento suele responder a una aversión fuerte o a una indicación clínica.
- **Modelado.** Fija a cero la presencia del alimento en todas las comidas de todos los días.

```python
for d in days:
    for m in meals:
        model.Add(x[target_food_id, d, m] == 0)
```

- **Ejemplo real.** Un paciente que no tolera un alimento específico del catálogo.
- **Casos límite.** Si el alimento prohibido era imprescindible para cumplir un mínimo de nutriente duro, aparece un conflicto de infactibilidad.

#### prefer_food

- **Semántica.** Favorece la aparición de un alimento concreto en el plan.
- **Argumentos.** Alimento objetivo, operador de preferencia, y en el contexto opcionalmente el tipo de comida donde se prefiere.
- **Naturaleza.** Blanda por definición. Una preferencia nunca es obligatoria.
- **Modelado.** Suma una bonificación al objetivo por cada aparición del alimento (o por su aparición en el tipo de comida indicado).

```python
prefer_bonus += sum(x[target_food_id, d, m] for d in days for m in meals)
# entra restando en el objetivo con peso w_prefer * weight_fila
```

- **Ejemplo real.** "En desayunos suele tomar avena": preferencia del alimento avena con contexto de desayuno.
- **Casos límite.** Preferencias con pesos altos que compiten con objetivos de macronutrientes pueden desplazar el plan; la modulación por el peso de fila permite graduar esa tensión.

#### forbid_tag

- **Semántica.** Prohíbe que aparezca cualquier alimento de una familia o etiqueta.
- **Argumentos.** Etiqueta objetivo, operador de prohibición.
- **Naturaleza.** Dura por defecto. Es el mecanismo de alergias, intolerancias y vetos culturales o religiosos, que son absolutos.
- **Modelado.** Se expande la etiqueta al conjunto de alimentos que la llevan y se prohíben todos.

```python
for f in foods_with_tag(target_tag_id):
    for d in days:
        for m in meals:
            model.Add(x[f, d, m] == 0)
```

- **Ejemplo real.** John, alergia a cacahuetes: prohibición de la etiqueta de cacahuetes, dura, peso de fila 10. Emma, intolerante a la lactosa: prohibición de la etiqueta de lactosa, dura.
- **Casos límite.** Una etiqueta muy amplia (por ejemplo, una familia grande) puede vaciar el catálogo de alimentos viables para ciertas comidas. Si dos etiquetas prohibidas cubren entre las dos casi todo el catálogo, el problema tiende a la infactibilidad. La expansión por etiqueta debe considerar la jerarquía: prohibir una etiqueta padre implica prohibir sus hijas.

#### prefer_tag

- **Semántica.** Favorece la aparición de alimentos de una familia o etiqueta.
- **Argumentos.** Etiqueta objetivo, operador de preferencia, contexto opcional.
- **Naturaleza.** Blanda por definición.
- **Modelado.** Bonifica en el objetivo cada aparición de un alimento con esa etiqueta.

```python
prefer_bonus += sum(
    x[f, d, m] for f in foods_with_tag(target_tag_id) for d in days for m in meals
)
```

- **Ejemplo real.** Maria, pérdida de peso: preferencia por la etiqueta vegetariana, blanda, peso de fila 4.
- **Casos límite.** Una preferencia de familia amplia con peso alto puede dominar el plan y desplazar la variedad; se equilibra con el peso de fila y con la penalización de variedad.

### 3.5 Reparto y frecuencia

#### meal_kcal_ratio

- **Semántica.** Distribuye la energía diaria entre las comidas según porcentajes deseados.
- **Argumentos.** En el contexto, el reparto porcentual por tipo de comida. Valor de tolerancia opcional.
- **Naturaleza.** Blanda por defecto. El reparto ideal es una guía; forzarlo como duro puede tensar el resto de objetivos.
- **Modelado.** Para cada comida, penaliza la desviación de su energía respecto al porcentaje deseado de la energía total, con multiplicación cruzada para evitar dividir.

```python
# objetivo: kcal_meal ~ ratio_m * kcal_total
# desviacion: |kcal_meal * 100 - ratio_pct * kcal_total|
model.Add(kcal_meal_x100[d][m] - ratio_pct[m] * daily_kcal[d] == o[d][m] - u[d][m])
# o + u entra en el objetivo
```

- **Ejemplo real.** "Desayuno 25 por ciento, comida 35, cena 25, medias 15".
- **Casos límite.** Repartos que no suman cien por cien generan una desviación mínima inevitable que el solver reparte. Como duro, un reparto estricto combinado con un objetivo calórico duro puede ser infactible.

#### max_servings_per_period

- **Semántica.** Limita el número de raciones o apariciones de un alimento o de una familia en una ventana temporal.
- **Argumentos.** Alimento o etiqueta objetivo, valor numérico (máximo de apariciones), en el contexto la ventana en días.
- **Naturaleza.** Configurable. Un tope de carne roja por semana puede ser recomendación blanda o pauta dura.
- **Modelado.** Suma de apariciones en la ventana menor o igual que el máximo. Cuando es blanda, se penaliza el exceso.

```python
# dura: como maximo N apariciones en la ventana
model.Add(sum(x[f, d, m] for d in window for m in meals) <= value)
```

- **Ejemplo real.** "Como máximo dos raciones de carne roja por semana".
- **Casos límite.** Un tope bajo sobre una familia que el profesional también prefiere genera una tensión legítima entre preferencia y límite; ambas conviven, la preferencia en el objetivo y el límite como cota.

### 3.6 Variedad y no repetición

Esta familia desarrolla el requisito de no repetición que los directores del trabajo señalaron de forma explícita. Se descompone en tres tipos con semánticas separadas y limpias, en lugar de un único tipo con parámetros ocultos, para que cada uno tenga un patrón de modelado claro y sea fácil de explicar. El primero opera sobre el alimento concreto, el segundo sobre la familia, y el tercero (el tope de frecuencia) ya está cubierto por el tipo de la sección anterior.

#### no_repeat_food

- **Semántica.** Impide, o penaliza, que un mismo alimento se repita en menos de un número dado de días.
- **Argumentos.** Alimento objetivo, valor numérico (separación mínima en días), en el contexto la granularidad (día completo o mismo tipo de comida).
- **Naturaleza.** Blanda por defecto. La no repetición mejora la variedad pero rara vez es una exigencia absoluta; forzarla como dura puede reducir mucho el espacio factible en catálogos pequeños.
- **Modelado.** En la variante dura, se prohíbe que el alimento aparezca en dos días separados por menos de la ventana. En la blanda, cada repetición dentro de la ventana suma penalización.

```python
# dura, separacion minima de N dias:
for d in days:
    presence = [x[f, dd, m] for dd in range(d, d + N) if dd <= last_day for m in meals]
    model.Add(sum(presence) <= 1)   # a lo sumo un dia con el alimento en cada ventana
```

- **Ejemplo real.** "El salmón no se repite en menos de cuatro días".
- **Casos límite.** Como dura, con una ventana amplia y un catálogo escaso, puede no haber alimentos suficientes para llenar los días sin repetir, lo que lleva a infactibilidad; de ahí que el valor por defecto sea blando.

#### no_repeat_tag

- **Semántica.** Impide, o penaliza, que aparezcan alimentos de una misma familia en menos de un número dado de días. Captura casos como "no pescado dos días seguidos" con independencia de que sea una especie distinta cada día.
- **Argumentos.** Etiqueta objetivo, valor numérico (separación mínima en días), contexto con la granularidad.
- **Naturaleza.** Blanda por defecto, por la misma razón que la no repetición por alimento.
- **Modelado.** Se define una presencia de familia por día como el máximo de las presencias de sus alimentos, y se aplica la misma lógica de ventana sobre esa presencia agregada.

```python
# presencia de la familia en el dia d
for d in days:
    model.AddMaxEquality(tag_present[d], [x[f, d, m] for f in foods_with_tag(tag) for m in meals])
# dura, separacion minima de N dias sobre la presencia de familia
for d in days:
    model.Add(sum(tag_present[dd] for dd in range(d, d + N) if dd <= last_day) <= 1)
```

- **Ejemplo real.** "No repetir pescado en días consecutivos", con la etiqueta de pescado.
- **Casos límite.** Igual que la variante por alimento pero más restrictiva, porque agrupa varios alimentos; se recomienda blanda salvo indicación clínica.

Este tipo es el único cambio de vocabulario respecto al enum actual y se recoge como propuesta de cambio en la sección 8. Los otros quince ya existen.

### 3.7 Combinaciones

#### forbid_combination

- **Semántica.** Prohíbe que dos alimentos, o un alimento y una familia, coincidan en la misma comida.
- **Argumentos.** Un alimento o etiqueta objetivo y el otro término en el contexto, operador de prohibición.
- **Naturaleza.** Dura por defecto. Suele modelar interacciones reales que conviene evitar siempre.
- **Modelado.** Para cada comida, la suma de las presencias de los dos términos no supera uno.

```python
for d in days:
    for m in meals:
        model.Add(x[a, d, m] + x[b, d, m] <= 1)
```

- **Ejemplo real.** Evitar el café en la misma comida que un alimento rico en hierro no hemo, por la interferencia en la absorción.
- **Casos límite.** Si los dos términos son a la vez preferidos, la prohibición de combinación y las preferencias conviven sin conflicto porque operan a distinto nivel (una acota, las otras puntúan), pero pueden empujar a que cada término aparezca en comidas distintas.

### 3.8 Resumen del catálogo

| Tipo | Familia | Naturaleza por defecto | Objetivo del patrón |
|---|---|---|---|
| meals_per_day | estructural | estructural | dimensiona comidas |
| plan_duration_days | estructural | estructural | dimensiona días |
| kcal_target | energía | blanda | desviación absoluta |
| macro_target | macros | blanda | desviación absoluta |
| nutrient_min | nutrientes | configurable | suma mayor o igual |
| nutrient_max | nutrientes | configurable | suma menor o igual |
| nutrient_ratio | nutrientes | configurable | multiplicación cruzada |
| forbid_food | prohibición | dura | fija a cero |
| prefer_food | preferencia | blanda | bonifica en objetivo |
| forbid_tag | prohibición | dura | fija a cero por familia |
| prefer_tag | preferencia | blanda | bonifica por familia |
| meal_kcal_ratio | reparto | blanda | desviación de reparto |
| max_servings_per_period | frecuencia | configurable | suma en ventana |
| no_repeat_food | variedad | blanda | ventana por alimento |
| no_repeat_tag | variedad | blanda | ventana por familia |
| forbid_combination | combinación | dura | suma por comida menor o igual que uno |

---

## 4. Persistencia permanente frente a temporal

### 4.1 El problema que se resuelve

Cuando el profesional describe un caso, mezcla en la misma frase rasgos duraderos del cliente y circunstancias puntuales del plan que va a generar ahora. Una intolerancia es permanente y debe aplicarse a todos los planes futuros; una preferencia por comidas frías durante un viaje de tres días es temporal y no debe contaminar los planes siguientes. El sistema distingue entre ambos casos para que el profesional no tenga que reintroducir a mano los rasgos permanentes cada vez, y para que los temporales no se queden pegados por error.

### 4.2 Cómo se refleja la persistencia en el modelo de datos

La persistencia se apoya en dos elementos que ya existen en la fila de restricción, sin necesidad de un campo dedicado.

- El **ámbito** distingue si la restricción pertenece al cliente o al nutricionista. Una restricción permanente del cliente se guarda con ámbito cliente asociada a ese cliente; una regla de estilo del profesional se guarda con ámbito nutricionista.
- El **origen** distingue si la restricción la introdujo el profesional a mano, si la propuso un traductor automático y fue confirmada, o si la derivó una regla del sistema.

Una restricción permanente es, por tanto, una fila persistida en la tabla de restricciones con su ámbito y su origen correspondientes. Una restricción temporal, en cambio, no se persiste en esa tabla: se aplica solo durante la ejecución del solver para el plan en curso y, a efectos de auditoría, queda registrada en la traza de la traducción que la originó.

### 4.3 Ciclo de vida de una restricción

El recorrido de una restricción, del caso a su aplicación, es el siguiente.

1. **Detección.** El productor (interfaz manual o traductor automático) identifica la restricción y propone una clasificación de persistencia (permanente o temporal) con un breve razonamiento.
2. **Confirmación.** El profesional revisa las restricciones clasificadas como permanentes y decide cuáles guarda. Las temporales se le muestran de forma informativa. La ficha del cliente nunca se modifica sin una acción explícita del profesional.
3. **Persistencia selectiva.** Las permanentes confirmadas se guardan como filas con su ámbito y origen. Las temporales no se guardan; quedan en la traza.
4. **Aplicación.** El solver recibe la unión de las permanentes ya guardadas y las temporales del plan en curso. Para el motor no hay diferencia entre unas y otras: todas son restricciones del mismo vocabulario.
5. **Reutilización.** En el siguiente plan de ese cliente, las permanentes vuelven a entrar automáticamente; las temporales del plan anterior no reaparecen.

### 4.4 Límite conocido del modelo actual

El modelo de datos actual persiste las restricciones permanentes por ámbito, pero no ata una restricción a un plan concreto: no existe una referencia de plan en la fila de restricción. Esto es suficiente para el flujo descrito, porque las temporales por diseño no se persisten. Sin embargo, si en el futuro se quisiera conservar el registro de qué restricciones temporales se aplicaron a cada plan como parte del propio plan (y no solo en la traza de la traducción), haría falta una referencia de plan opcional en la fila de restricción, o una tabla puente entre plan y restricción. Se recoge como posibilidad en la sección 8, sin implementarla en este sub-bloque.

El alcance de esta sección es definir el modelo de estados. La interfaz de confirmación y la lógica de clasificación automática pertenecen a sub-bloques posteriores.

---

## 5. Casos de prueba manuales

Esta sección define doce escenarios concretos que el solver deberá resolver correctamente. Servirán de banco de pruebas en la verificación de extremo a extremo del pipeline sin componente de inteligencia artificial. Cada caso indica su descripción, las restricciones exactas que se aplican y el resultado esperado. Los seis primeros se anclan a los clientes reales del catálogo de demostración (Maria, con pérdida de peso; John, con ganancia muscular; Emma, con diabetes) y a sus restricciones ya cargadas. Los seis restantes usan perfiles sintéticos, etiquetados como casos de diseño, para cubrir familias de restricción que los clientes reales no ejercen; no corresponden a filas existentes en la base de datos.

La cobertura buscada es: al menos un caso trivial factible, cada familia de restricción ejercida al menos una vez, dos o tres infactibilidades deliberadas con su conflicto identificable, y al menos un caso que incorpore estilo del profesional por la vía del ámbito nutricionista.

### Casos anclados a clientes reales

**Caso 1. Trivial factible.**
Cliente Maria, plan de 3 días, 3 comidas, sin más restricciones que las estructurales.
Restricciones: ninguna configurable.
Resultado esperado: factible. Cada comida con al menos un alimento, energía diaria por encima del suelo fisiológico, macronutrientes dentro de rango humano.

**Caso 2. Objetivo calórico blando.**
Cliente Maria, plan de 7 días, 5 comidas, objetivo de 1500 kcal.
Restricciones: kcal_target 1500, blanda, peso 7.
Resultado esperado: factible. Energía diaria próxima a 1500 kcal; desviación media pequeña, esperada por debajo del cinco por ciento en un catálogo suficiente.

**Caso 3. Objetivo calórico más preferencia de familia.**
Cliente Maria, plan de 7 días, 5 comidas, objetivo de 1500 kcal y preferencia vegetariana.
Restricciones: kcal_target 1500 blanda peso 7; prefer_tag vegetariano blanda peso 4.
Resultado esperado: factible. Predominio de alimentos vegetarianos, con energía próxima al objetivo. La preferencia no es absoluta, así que puede aparecer algún alimento no vegetariano si mejora el resto del objetivo.

**Caso 4. Prohibición dura por alergia más mínimo de nutriente.**
Cliente John, plan de 7 días, 5 comidas, alergia a cacahuetes y mínimo de proteína.
Restricciones: forbid_tag cacahuetes dura peso 10; nutrient_min proteína 140 g blanda peso 6.
Resultado esperado: factible si el catálogo tiene fuentes de proteína suficientes distintas del cacahuete. Ningún alimento con la etiqueta de cacahuete; proteína diaria cercana o superior a 140 g.

**Caso 5. Intolerancia dura más tope de sodio.**
Cliente Emma, plan de 7 días, 5 comidas, intolerancia a la lactosa y tope de sodio.
Restricciones: forbid_tag lactosa dura peso 9; nutrient_max sodio 2000 mg blanda peso 7.
Resultado esperado: factible. Ausencia total de alimentos con lactosa; sodio diario por debajo o próximo a 2000 mg.

**Caso 6. Infactibilidad por objetivo calórico imposible marcado como duro.**
Cliente John, plan de 3 días, 5 comidas, objetivo calórico muy bajo forzado como duro junto al mínimo de proteína también duro.
Restricciones: kcal_target 900 dura; nutrient_min proteína 180 g dura.
Resultado esperado: infactible. El núcleo de conflicto debe contener el objetivo calórico y el mínimo de proteína, ya que 180 g de proteína aportan unas 720 kcal y, con el mínimo estructural del resto de macronutrientes, superan las 900 kcal. La sugerencia debe explicar esa incompatibilidad y proponer relajar uno de los dos.

### Casos de diseño con perfiles sintéticos

**Caso 7. Reparto de energía por comida.**
Perfil sintético: adulto, mantenimiento, plan de 7 días, 4 comidas.
Restricciones: kcal_target 2000 blanda peso 8; meal_kcal_ratio con reparto 25 / 35 / 25 / 15, blanda.
Resultado esperado: factible. Energía repartida entre comidas próxima a los porcentajes indicados, con desviación pequeña.

**Caso 8. Tope de frecuencia de una familia.**
Perfil sintético: adulto con recomendación de moderar la carne roja, plan de 7 días, 5 comidas.
Restricciones: max_servings_per_period sobre la familia de carne roja, máximo 2 en ventana de 7 días, dura.
Resultado esperado: factible. La carne roja aparece como mucho dos veces en la semana.

**Caso 9. No repetición por alimento.**
Perfil sintético: adulto que pide variedad, plan de 7 días, 3 comidas.
Restricciones: no_repeat_food sobre un alimento concreto, separación mínima de 4 días, blanda peso 6.
Resultado esperado: factible. El alimento no se repite en ventanas menores de cuatro días, o si lo hace es con penalización asumida por falta de alternativas.

**Caso 10. No repetición por familia.**
Perfil sintético: adulto que no quiere pescado dos días seguidos, plan de 7 días, 3 comidas.
Restricciones: no_repeat_tag sobre la familia de pescado, separación mínima de 2 días, blanda peso 5.
Resultado esperado: factible. Días con pescado separados entre sí, salvo penalización asumida.

**Caso 11. Estilo del profesional por ámbito nutricionista.**
Perfil sintético de cliente sin restricciones propias relevantes, plan de 7 días, 5 comidas, más el estilo del profesional.
Restricciones: de ámbito nutricionista, prefer_tag de una familia de referencia (por ejemplo, aceite de oliva como grasa preferida) blanda, y max_servings sobre ultraprocesados dura. De ámbito cliente, ninguna configurable.
Resultado esperado: factible. El plan refleja el estilo del profesional aunque el cliente no aporte restricciones, demostrando que el estilo entra por la misma vía que las restricciones del cliente.

**Caso 12. Infactibilidad por prohibición que agota las fuentes de un mínimo duro.**
Perfil sintético con un mínimo de calcio duro y prohibición de las familias que aportan calcio en el catálogo, plan de 7 días, 5 comidas.
Restricciones: nutrient_min calcio dura con un valor alto; forbid_tag de la familia láctea dura y forbid_tag de la familia de pescado con espina dura.
Resultado esperado: infactible si el catálogo no tiene otras fuentes de calcio suficientes. El núcleo debe señalar el mínimo de calcio junto con las prohibiciones de familia, y la sugerencia debe indicar que no hay fuentes de calcio disponibles bajo esas prohibiciones.

---

## 6. Métricas y calidad del solver

### 6.1 Métricas medibles

El solver reporta un conjunto de métricas por cada generación, que sirven tanto para evaluar la calidad del resultado como para la verificación del pipeline.

- **Tiempo de resolución.** Milisegundos que tarda el solver desde que recibe el modelo construido hasta que devuelve el resultado. Objetivo de referencia: por debajo de cinco segundos en una máquina de trabajo normal para un plan de siete días y cinco comidas sobre un catálogo de unos cientos de alimentos.
- **Cumplimiento de restricciones duras.** Porcentaje de restricciones duras satisfechas. Debe ser siempre del cien por cien por construcción: si alguna dura no se puede cumplir, el resultado es infactible, no un plan que la incumple. Esta métrica es una comprobación de sanidad, no una variable de calidad.
- **Cumplimiento de restricciones blandas.** Porcentaje de restricciones blandas satisfechas dentro de su tolerancia, y desviación agregada de las que no. Es la métrica de calidad principal del plan: cuanto más alta, mejor encaja el plan con las preferencias.
- **Valor del objetivo y brecha de optimización.** Valor de la función objetivo de la mejor solución encontrada y brecha respecto a la cota inferior que calcula el solver. Una brecha de cero indica óptimo demostrado; una brecha pequeña indica una solución muy buena aunque no probada como óptima dentro del tiempo límite.
- **Estado de la resolución.** Uno de óptimo, factible (solución válida pero no probada óptima al agotar el tiempo), o infactible.

### 6.2 Cuándo se considera aceptable un plan

Un plan generado se considera aceptable, a efectos de la verificación del pipeline, cuando cumple simultáneamente estas condiciones:

- El estado es óptimo o factible.
- El cumplimiento de restricciones duras es del cien por cien (garantizado por construcción, se verifica igualmente).
- La desviación del objetivo calórico, si se fijó, está por debajo del cinco por ciento; la de los macronutrientes, por debajo del diez por ciento. Estos umbrales son coherentes con los que aplicará el validador clínico.
- El tiempo de resolución está dentro del objetivo de referencia.
- La variedad mínima estructural se cumple.

Cuando el estado es factible pero no óptimo por agotamiento del tiempo, el plan sigue siendo aceptable si cumple los umbrales de desviación; simplemente no se garantiza que sea el mejor posible.

### 6.3 Cómo se reportan las métricas

Las métricas viajan en el propio resultado de la generación, dentro del bloque de métricas del plan factible, y se serializan en la respuesta del endpoint descrito en la sección 7. Esto las hace visibles tanto para la interfaz (que puede mostrar al profesional el grado de cumplimiento y avisar de las preferencias no satisfechas) como para los scripts de verificación del pipeline, que las comparan contra los umbrales de aceptabilidad. No se requiere un panel de observación aparte en esta fase: el transporte de las métricas en la respuesta es suficiente.

---

## 7. Contrato JSON del endpoint de generación

El solver se expone por HTTP para que la capa de presentación lo invoque. Esta sección fija el contrato del endpoint, que la implementación del solver respeta y que el consumidor de la interfaz de generación consume. Definirlo aquí evita renegociarlo más tarde.

### 7.1 Método y ruta

```
POST /plans/generate
Content-Type: application/json
```

### 7.2 Cuerpo de la petición

La petición identifica al cliente, la forma del plan y la lista de restricciones ya estructuradas. Las restricciones se envían con los mismos campos que la fila de la base de datos, en su forma serializable.

```json
{
  "client_id": 12,
  "duration_days": 7,
  "meals_per_day": 5,
  "constraints": [
    {
      "type": "kcal_target",
      "operator": "eq",
      "value": 1500,
      "priority": "soft",
      "weight": 7
    },
    {
      "type": "forbid_tag",
      "target_tag_id": 3,
      "operator": "forbid",
      "priority": "hard",
      "weight": 10
    },
    {
      "type": "prefer_tag",
      "target_tag_id": 11,
      "operator": "prefer",
      "priority": "soft",
      "weight": 4,
      "context": { "meal_type": "breakfast" }
    }
  ],
  "weights": null
}
```

Notas del contrato de la petición:

- Los objetivos de alimento, etiqueta y nutriente se envían por identificador, no por nombre. El solver no resuelve texto libre; espera referencias a entidades existentes.
- El campo de contexto es opcional y lleva los matices de ventana temporal, tipo de comida o días de la semana según el tipo de restricción.
- El campo de pesos es opcional. Si es nulo, el solver usa los pesos por defecto de la sección 2.5. Si se envía, sustituye los pesos por familia para esa generación.
- El identificador de cliente se usa para recuperar el perfil antropométrico y, del lado del servidor, para verificar el acceso del profesional a ese cliente antes de generar.

### 7.3 Respuesta en caso de éxito

```json
{
  "status": "feasible",
  "plan": {
    "duration_days": 7,
    "meals_per_day": 5,
    "days": [
      {
        "day_num": 1,
        "meals": [
          {
            "meal_type_code": "breakfast",
            "items": [
              { "food_id": 45, "grams": 60 },
              { "food_id": 88, "grams": 125 }
            ]
          }
        ]
      }
    ]
  },
  "metrics": {
    "solve_status": "optimal",
    "solve_time_ms": 1830,
    "hard_satisfied_pct": 100.0,
    "soft_satisfied_pct": 92.5,
    "objective_value": 415,
    "optimality_gap": 0.0,
    "kcal_mean_deviation_pct": 2.1
  },
  "warnings": [
    "La preferencia de avena en desayuno no se aplico dos dias por falta de alternativas de macros."
  ]
}
```

La estructura del plan es directamente materializable: cada elemento de items corresponde a una fila de la tabla de items del plan, con su alimento y sus gramos. El código del tipo de comida se resuelve al identificador correspondiente en la escritura.

### 7.4 Respuesta en caso de infactibilidad

```json
{
  "status": "infeasible",
  "unsat_core": [
    { "type": "kcal_target", "value": 900, "priority": "hard" },
    { "type": "nutrient_min", "target_nutrient_id": 2, "value": 180, "priority": "hard" }
  ],
  "suggestion": "El objetivo de 900 kcal es incompatible con el minimo de 180 g de proteina, que ya aporta unas 720 kcal; sumado al minimo estructural del resto de macronutrientes, supera el objetivo. Considere relajar el objetivo calorico o el minimo de proteina.",
  "relaxable": [
    { "type": "kcal_target", "value": 900 },
    { "type": "nutrient_min", "target_nutrient_id": 2, "value": 180 }
  ]
}
```

Notas del contrato de la respuesta de infactibilidad:

- El campo de estado toma el valor de infactible, distinto del de éxito, para que el consumidor lo distinga sin ambigüedad.
- El núcleo de conflicto es el subconjunto mínimo de restricciones incompatibles, con la información suficiente para que la interfaz las señale al profesional.
- La sugerencia es texto en lenguaje natural listo para mostrar.
- Las relajables son las restricciones sobre las que la interfaz puede ofrecer una acción de aflojar para reintentar.

### 7.5 Códigos de estado HTTP

- 200 para una generación resuelta, tanto si el resultado es factible como si es infactible. La infactibilidad es un resultado legítimo del dominio, no un error del servidor, y viaja en el cuerpo con su estado.
- 400 si la petición está mal formada o referencia entidades inexistentes (por ejemplo, un identificador de etiqueta que no existe).
- 403 si el profesional no tiene acceso al cliente indicado.
- 422 si las restricciones son sintácticamente válidas pero incoherentes con el vocabulario (por ejemplo, un tipo que exige objetivo de nutriente sin proporcionarlo).
- 500 para fallos internos no previstos del solver.

---

## 8. Propuestas de cambio para la base de datos

Este sub-bloque no modifica el esquema. Las siguientes propuestas se apuntan para una migración posterior (candidata a numerarse como 0009), que se ejecutará en el sub-bloque donde haga falta antes de consumirla: en el de la interfaz manual si se necesita para producir las restricciones, o en el del solver si es una necesidad del motor.

**Propuesta 1. Añadir el tipo no_repeat_tag al vocabulario.** Es el único tipo nuevo del catálogo cerrado respecto al enum actual. Requiere ampliar el enumerado de tipos de restricción con el valor no_repeat_tag y extender la comprobación de coherencia de objetivo para exigir etiqueta objetivo en ese tipo, igual que ya se hace con la prohibición y la preferencia por etiqueta.

**Propuesta 2 (opcional, no requerida en v0). Referencia de plan en la restricción.** Solo si en el futuro se decide conservar las restricciones temporales aplicadas a cada plan como parte del propio plan, y no únicamente en la traza de la traducción. Se resolvería con una referencia de plan opcional en la fila de restricción, o con una tabla puente entre plan y restricción. El flujo de persistencia actual no lo necesita, porque las temporales por diseño no se persisten. Se deja anotada para no perder el hilo, sin compromiso de implementación.

Ninguna otra propuesta se deriva de este sub-bloque. El resto del esquema soporta el modelo formal y el catálogo tal como están.

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

*Documento de diseño, versión 0. Las decisiones de modelado aquí fijadas pueden revisarse a la luz de la implementación del solver y de la verificación del pipeline.*
