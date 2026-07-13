# Especificación del solver de planes: resumen y mapa de restricciones (v0)

**Julio de 2026. Mapa conceptual de acceso rápido.**

> Resumen de una página larga del documento completo `solver-especificacion-v0.md`. Sirve para ver de un vistazo qué restricciones acepta el generador de planes y cuáles son los conceptos generales del solver, sin entrar en el detalle de modelado, casos límite ni contrato del endpoint. Para la especificación completa, consultar el documento de referencia.

---

## 1. El solver en una frase

Motor determinista que, dados un cliente y un conjunto de restricciones expresadas en un vocabulario cerrado, construye un borrador de plan nutricional que respeta por construcción las restricciones obligatorias y optimiza las preferencias, para que el nutricionista lo edite y firme. Es un editor inteligente que asiste al profesional, no un generador autónomo que lo sustituye.

## 2. Firma de la función de generación

```
generate_plan(cliente, dias, comidas_por_dia, restricciones, catalogo_alimentos, pesos)
    -> Plan factible (dias con comidas y gramos + metricas)
     | Plan infactible (nucleo de conflicto + sugerencia + restricciones relajables)
```

Es una función pura: no consulta ningún modelo de lenguaje, no ejecuta el validador clínico y no persiste nada. Las restricciones le llegan ya estructuradas, con independencia de quién las produjo (el profesional a mano o un traductor automático).

## 3. Las dieciséis restricciones

La tabla lista el vocabulario cerrado. La naturaleza por defecto indica qué asume el sistema cuando el profesional no lo especifica: dura es obligatoria (acota el espacio de soluciones), blanda es una preferencia (se optimiza sin ser obligatoria), configurable queda a criterio de quien la crea. Dos tipos son estructurales: no son restricciones optimizables, fijan la forma del problema.

| Tipo | Familia | Naturaleza | Concepto |
|---|---|---|---|
| `meals_per_day` | estructural | estructural | Número de comidas por día |
| `plan_duration_days` | estructural | estructural | Número de días del plan |
| `kcal_target` | energía | blanda | Acercar la energía diaria a un objetivo calórico |
| `macro_target` | macros | blanda | Acercar un macronutriente a un objetivo en gramos o porcentaje |
| `nutrient_min` | nutrientes | configurable | Alcanzar al menos un mínimo diario de un nutriente |
| `nutrient_max` | nutrientes | configurable | No superar un máximo diario de un nutriente |
| `nutrient_ratio` | nutrientes | configurable | Acotar el cociente entre dos nutrientes |
| `forbid_food` | prohibición | dura | Prohibir un alimento concreto en todo el plan |
| `prefer_food` | preferencia | blanda | Favorecer la aparición de un alimento concreto |
| `forbid_tag` | prohibición | dura | Prohibir toda una familia o etiqueta (alergias, vetos) |
| `prefer_tag` | preferencia | blanda | Favorecer una familia o etiqueta |
| `meal_kcal_ratio` | reparto | blanda | Repartir la energía diaria entre comidas por porcentajes |
| `max_servings_per_period` | frecuencia | configurable | Limitar apariciones de un alimento o familia en una ventana |
| `no_repeat_food` | variedad | blanda | Evitar repetir un mismo alimento en menos de N días |
| `no_repeat_tag` | variedad | blanda | Evitar repetir una misma familia en menos de N días |
| `forbid_combination` | combinación | dura | Impedir que dos alimentos o familias coincidan en una comida |

Quince de estos tipos ya existen en el modelo de datos. El único añadido respecto a la versión anterior es `no_repeat_tag`, que amplía la no repetición del alimento concreto a la familia (por ejemplo, no repetir pescado en días seguidos aunque sea una especie distinta). Los tipos estructurales `meals_per_day` y `plan_duration_days` se conservan en el vocabulario porque el productor de restricciones puede emitirlos al leer la petición, pero en el modelo fijan la dimensión del problema.

## 4. Modelo formal en cinco ideas

- **Variables de decisión.** Por cada terna alimento-día-comida, una variable que decide si el alimento está presente y otra que decide cuántos gramos. Los gramos son enteros, de cero a un techo de trescientos por alimento y comida.
- **Restricciones estructurales invariantes** (siempre duras, no las configura el profesional): cada comida tiene al menos un alimento, la energía diaria no baja de un suelo fisiológico calculado con la ecuación de Mifflin-St Jeor sobre los datos del cliente, los macronutrientes se mantienen en rangos humanos por peso corporal, y hay una variedad mínima de alimentos distintos por semana.
- **Restricciones duras**: acotan el espacio de soluciones. Si son incompatibles entre sí, el problema es infactible.
- **Restricciones blandas**: se agregan en una función objetivo ponderada que el solver optimiza. Los pesos por familia son fijos por defecto y el peso individual de cada restricción los modula.
- **Resultado.** Si hay solución, un borrador de plan con métricas de cumplimiento. Si no la hay, el núcleo mínimo de restricciones en conflicto y una sugerencia para resolverlo.

## 5. Persistencia de restricciones

El sistema distingue las restricciones permanentes del cliente (una intolerancia, una aversión duradera), que se guardan en su ficha y vuelven a aplicarse en todos los planes futuros, de las temporales (una circunstancia puntual de un plan concreto), que se aplican solo a ese plan y no se conservan. El profesional confirma siempre qué se guarda: la ficha del cliente nunca se modifica sin su acción explícita.

## 6. Casos de prueba de un vistazo

El documento completo define doce escenarios que el solver deberá resolver correctamente, para usarse como banco de pruebas en la verificación del pipeline. Cubren un caso trivial factible, cada familia de restricción ejercida al menos una vez, dos infactibilidades deliberadas con conflicto identificable, y un caso con estilo del profesional. Seis se anclan a los clientes reales del catálogo de demostración (pérdida de peso, ganancia muscular, diabetes) y seis usan perfiles sintéticos de diseño.

## 7. Métricas de calidad

El solver reporta por cada generación el tiempo de resolución (objetivo por debajo de cinco segundos para un plan semanal de cinco comidas), el cumplimiento de restricciones duras (cien por cien por construcción), el cumplimiento de las blandas (métrica de calidad principal) y la brecha de optimización. Un plan se considera aceptable cuando la desviación del objetivo calórico está por debajo del cinco por ciento y la de los macronutrientes por debajo del diez por ciento.

---

*Para el detalle de cada restricción, el modelado formal, el contrato del endpoint y los doce casos de prueba, consultar `solver-especificacion-v0.md`.*
