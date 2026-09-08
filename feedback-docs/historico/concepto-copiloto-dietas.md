# Herramienta de creación automatizada de dietas para nutricionistas

**Visión conceptual · Versión 0.1 · Abril de 2026**

> Autor: Víctor Martínez Blanco — TFG Doble Grado Ingeniería Informática + ADE, UCM
>
> Documento pensado para compartir con un colaborador externo con experiencia en desarrollo de herramientas de IA, con el objetivo de ayudar a perfilar cómo llevar esta idea a la práctica.

---

## 1. Punto de partida

Un nutricionista profesional dedica una parte muy importante de su tiempo a **construir planes de dieta a mano** para cada uno de sus clientes. Aunque cada cliente tiene sus propias necesidades, lo que ocurre en la práctica es que el nutricionista acaba repitiendo, de forma algo modificada, los mismos patrones una y otra vez: un cierto reparto de macronutrientes para cada tipo de objetivo, una selección habitual de alimentos, unas frecuencias que le funcionan, unas estructuras de comida recurrentes. En otras palabras, cada nutricionista desarrolla con los años un **estilo clínico propio** que aplica de forma consistente a sus pacientes, y que lo diferencia de otros profesionales del mismo sector.

Hoy existen plataformas generalistas —Nutrium, Foodzilla, Practice Better— que automatizan parcialmente la creación de dietas con inteligencia artificial. El problema es que estas soluciones son **genéricas**: producen planes "correctos" desde un punto de vista nutricional, pero sin el sello del profesional. Un plan generado por Nutrium para el mismo cliente es idéntico lo pida el nutricionista A o el nutricionista B. Eso no es útil como copiloto: el profesional acaba reescribiendo tanto el plan propuesto que el ahorro de tiempo es mínimo.

## 2. La idea

La herramienta que quiero construir **automatiza la creación de dietas aprendiendo del propio nutricionista**. En lugar de usar un modelo genérico aplicable a todos, cada nutricionista tiene su propia versión del sistema, entrenada con sus planes históricos y su forma concreta de trabajar. Cuando el nutricionista pide un plan para un cliente concreto, la herramienta combina dos cosas:

1. Las **variables del cliente** para el que se pide el plan (objetivo, condiciones clínicas, alergias, preferencias, etc.).
2. Lo que ha **aprendido del estilo clínico** de ese nutricionista en base a todos los planes que ha creado previamente dentro de la herramienta.

El resultado es un borrador personalizado que se parece mucho más a lo que ese nutricionista habría hecho a mano que a un plan estándar. El nutricionista siempre revisa y aprueba el plan antes de entregárselo al cliente —la herramienta es un copiloto, no un sustituto—, pero se ahorra la mayor parte del trabajo repetitivo.

## 3. Cómo se alimenta el sistema

El motor necesita una base de datos que recoja **todas las dietas que ese nutricionista haya introducido** en la herramienta. Estas dietas son el material de entrenamiento: de ellas se extrae el estilo. Para cada plan cargado, el nutricionista especifica el contexto en el que ese plan se diseñó, mediante un conjunto de variables que describen al cliente original y al objetivo clínico. Este etiquetado es lo que permite después al sistema buscar, en su propia base de planes, los más relevantes para un caso nuevo.

Las variables que condicionan cada plan son, aproximadamente:

- **Objetivo clínico**: pérdida de peso, mantenimiento, ganancia de masa muscular (hipertrofia), rendimiento deportivo, recomposición corporal, etc.
- **Perfil del cliente**: edad, sexo, actividad física, antropometría (peso, altura, composición corporal).
- **Situaciones especiales**: embarazo, lactancia, menopausia, adolescencia, tercera edad.
- **Patologías o condiciones clínicas**: diabetes, hipertensión, síndrome del intestino irritable, celiaquía, enfermedad renal, hígado graso, etc.
- **Alergias e intolerancias**: a alimentos concretos (aguacate, frutos secos, lactosa, gluten, marisco, etc.).
- **Preferencias alimentarias**: vegetariano, vegano, mediterránea, halal, kosher, aversiones individuales.
- **Parámetros prácticos**: número de comidas al día, presupuesto, tiempo disponible para cocinar, cultura gastronómica.

La idea es que cada plan histórico quede **mapeado** contra este conjunto de variables, para que la herramienta pueda identificar patrones del tipo *"cuando este nutricionista diseña un plan de pérdida de peso para una mujer con diabetes, estructura las comidas así y usa preferentemente estos alimentos"*.

## 4. Cómo se pide un plan nuevo

Cuando el nutricionista quiere generar un plan para un cliente concreto, introduce las variables de ese cliente —las mismas dimensiones que se usaron para etiquetar los planes históricos— y la herramienta produce un borrador. Internamente, lo que hace el sistema es algo parecido a esto:

1. **Buscar en la base de planes del nutricionista** los que más se parecen al caso nuevo (mismo objetivo, perfil parecido, restricciones compatibles).
2. **Extraer del conjunto recuperado los patrones estilísticos** —estructura de las comidas, ingredientes predilectos, repartos de macronutrientes, frecuencias— que ese nutricionista suele aplicar en situaciones similares.
3. **Aplicar restricciones duras** derivadas automáticamente de las variables del cliente: no pueden aparecer sus alergias, las incompatibilidades con sus patologías, los rangos calóricos y de macronutrientes adecuados a su objetivo.
4. **Construir un plan nuevo** que respete simultáneamente el estilo del nutricionista y las restricciones clínicas del cliente.

El borrador se muestra al nutricionista en un formato editable para que pueda aceptarlo tal cual, modificarlo parcialmente (cambiar una comida, sustituir un ingrediente) o pedir que se regenere con ajustes. Ejemplo del tipo de petición que el sistema debería ser capaz de atender: *"pérdida de peso para hombre con diabetes tipo 2 y alergia a los aguacates, cinco comidas al día"*.

## 5. Aprendizaje iterativo

La herramienta no se limita a generar planes "en una sola pasada". Un punto central del concepto es que el sistema **mejora con el uso**, y lo hace de varias formas:

- **Propuestas parciales**. Cuando el nutricionista lo prefiera, la herramienta puede ofrecer primero uno o dos días de dieta como prueba, y solo continuar con la semana completa cuando el profesional confirme que la línea es la correcta. Esto es especialmente útil para casos clínicos complejos donde el nutricionista quiere validar el enfoque antes de ver el plan entero.
- **Varias alternativas para un mismo caso**. El sistema puede generar dos o tres planes distintos en paralelo y dejar que el nutricionista elija el que más le encaje, o combine partes de varios. La elección es una señal fuerte de preferencia que alimenta la memoria del sistema.
- **Feedback implícito a partir de las ediciones del nutricionista**. Cada modificación que el profesional hace sobre un borrador —un ingrediente que sustituye, una comida que reescribe, una estructura que retoca— se guarda como información sobre su estilo y se tiene en cuenta en las generaciones futuras.
- **Preguntas activas de la herramienta**. Cuando el sistema detecta incertidumbre en algún aspecto del plan, puede preguntar directamente al nutricionista: *"he dudado entre estas dos opciones, ¿cuál prefieres?"*. Esta interacción también pasa a la memoria.

El efecto acumulado es que, cuanto más usa el nutricionista la herramienta, **menos correcciones necesita hacer sobre los borradores generados**, porque el sistema se ha calibrado a su forma de trabajar. Al principio, el nutricionista probablemente edite la mayor parte del plan propuesto; con el tiempo, los borradores se acercan cada vez más a lo que él habría hecho manualmente.

## 6. Personalización por nutricionista

Un aspecto clave del diseño es que **no hay un único modelo común a todos los nutricionistas**. Cada profesional tiene su propia instancia de la herramienta, con su propia base de planes históricos y su propio aprendizaje acumulado. Esto tiene dos consecuencias prácticas:

- **Aislamiento de datos**. Los planes de un nutricionista nunca se usan para entrenar el sistema de otro. Cada profesional es dueño de su base de conocimiento, lo que además es coherente con el deber de confidencialidad clínica de la profesión.
- **Herramienta verdaderamente personalizada**. Dos nutricionistas que pidan un plan para el mismo cliente teórico recibirán borradores distintos, porque el sistema reflejará en cada caso el estilo del profesional concreto que está delante. Esto es, precisamente, lo que hace que el copiloto sea útil como acelerador del trabajo y no como un sustituto genérico.

## 7. Valor esperado

La propuesta persigue tres beneficios medibles:

1. **Ahorro de tiempo significativo** para el nutricionista, especialmente en la parte repetitiva del trabajo clínico. El profesional deja de escribir planes desde cero y pasa a revisar y ajustar borradores.
2. **Escalabilidad de la práctica**. Al liberar tiempo por cliente, el profesional puede atender a más pacientes sin sacrificar la calidad ni la personalización de cada plan.
3. **Coherencia clínica**. Los planes generados mantienen el sello del nutricionista, con lo que la experiencia para el cliente es consistente con la que ya tenía del profesional y no parece salir de una herramienta genérica.

## 8. Cuestiones abiertas para aterrizar la idea

Hasta aquí el concepto. Las decisiones técnicas que hay que tomar a continuación, y donde me interesa especialmente el criterio de alguien con experiencia en desarrollo de sistemas de inteligencia artificial, son varias:

- **Cómo implementar exactamente el "mapeo"** entre las variables del cliente y la base de planes del nutricionista. Existen varias familias de técnicas candidatas (recuperación por similitud semántica con embeddings, optimización matemática para cumplir restricciones, modelos de lenguaje generativos con contexto enriquecido) y casi seguro habrá que combinar varias.
- **Cómo modelar el "estilo clínico"** de un profesional de forma que sea utilizable por el sistema. ¿Reglas explícitas extraídas automáticamente de los planes históricos? ¿Un vector latente? ¿Una combinación de ambos? ¿Un documento editable que el propio nutricionista pueda revisar?
- **Cómo resolver el arranque en frío** del sistema para un nutricionista nuevo que aún no tiene planes cargados. Hay varias vías posibles (biblioteca semilla común, cuestionario inicial de estilo, planes sintéticos validados) y hay que elegir cuáles entran en el alcance.
- **Cómo garantizar la seguridad clínica** de los borradores: qué restricciones son "duras" (alergias, incompatibilidades con patologías, rangos calóricos) y cómo se bloquea cualquier plan que las incumpla antes siquiera de mostrárselo al nutricionista.
- **Cómo recolectar la primera base de dietas** del nutricionista. Formulario estructurado, carga de PDFs existentes, importación desde otras plataformas.
- **Cómo medir si la herramienta funciona bien**: qué métricas capturan la utilidad real (tasa de aceptación de los borradores, cantidad media de edición, adherencia de los clientes a los planes generados, valoración subjetiva del profesional).
- **Cómo tratar los datos de salud** implicados, dado que caen en la categoría especial del Reglamento General de Protección de Datos. Esto afecta a decisiones de arquitectura que no son menores (modelos cloud vs. autohospedados, acuerdos con proveedores de IA, cifrado, derecho al olvido).

Estas preguntas no tienen una única respuesta correcta, y la combinación de elecciones es lo que determinará qué herramienta termina siendo viable construir en el plazo del TFG y cuál queda como evolución posterior. Ese es precisamente el punto en el que pido la ayuda externa: contrastar opciones, descartar caminos muertos y llegar a una arquitectura realista y defendible.
