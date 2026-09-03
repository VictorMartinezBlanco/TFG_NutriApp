# Puntos abiertos del feedback de los tutores

Registro de las sugerencias y dudas de Pablo y Alejandro que todavia no tienen
respuesta visible, ni en la memoria ni en los correos enviados. El objetivo es
que ninguna se quede sin concretar: cada punto lleva su destino y, cuando se
ejecuta, se mueve a la tabla de resueltos con la ubicacion donde quedo
reflejado.

Origen: 2a ronda de feedback (finales de agosto de 2026) sobre los capitulos
2, 3 y 5, mas los restos de la 1a ronda al borrador-indice.

## Pendientes

| Punto | Quien | Destino | Que debe quedar |
|---|---|---|---|
| Trabajo futuro del tope de 4 alimentos por comida | Pablo | Cap 8 (trabajo futuro) | Rol de acompanante (tomate, cebolla, lechuga) que no consuma el tope; revisar el valor. El cap 5 ya lo justifica y remite |
| Reglas estructurales no anulables (caso renal) | Pablo | Cap 8 (trabajo futuro) | Que el profesional pueda ver, editar, retirar o endurecer las reglas estructurales. El cap 5 ya documenta la asuncion con el ejemplo renal |
| El reparto por comidas domina el objetivo | tutores (derivado del punto de inconmensurabilidad) | Cap 8 (trabajo futuro) | Renormalizar el termino de meal_kcal_ratio. El cap 5 ya lo documenta como asuncion |
| Recetas y sustituciones (RF-26/RF-27), parte de trabajo futuro | Pablo | Cap 8 | El cap 3 ya los marca como pospuestos (9b-5); en el cap 8 va la extension (recetas con interfaz, sustituciones en el motor) |
| Variante blanda de nutrient_ratio sin modelar | (limite propio, no de tutores; se registra por completitud) | Cap 8 (limites de v0) | Ya visible en cap 5; recogerlo en la lista de limites |
| Fuente de la base de alimentos en el cap 3 (BEDCA) | (detectado en el 9b-5, no es de tutores) | Cap 3 (bloque 9b-final) | El cap 3 dice que RF-45 se alimenta de BEDCA; el catalogo real es el seed propio de 100 alimentos (caps 4 y 5). Alinear RF-45, tablas 3.10 y 3.13 y la seccion 3.6 |
| RF-39 (dashboard con edit distance y coste) | (herencia del 9b-0) | Cap 8 | El cap 3 lo define tal cual; el hueco con lo implementado (dashboard con datos reales, sin edit distance ni coste) se cuenta como trabajo futuro |
| Fechas por fase en la intro y reformular informalidades | Alejandro | Intro (bloque 9b-final) | Rango temporal en el subtitulo de cada fase |
| Pasada global de negritas en mitad de frase | Alejandro | Toda la memoria (bloque 9b-final) | Solo negritas estructurales |
| Placements [H] y espacios en blanco | Alejandro | Toda la memoria (bloque 9b-final) | Ultima pasada de maquetacion |

## Resueltos

| Punto | Quien | Donde quedo |
|---|---|---|
| Sobreventa de la tabla 2.1 y del cap 2 | Pablo | Cap 2 reescrito entero sobre lo que la app entrega (9b-5); la tabla de la idea inicial se conserva en el Anexo A como registro |
| Coherencia del 2.5 (BD como eje, fuente de alimentos) | Pablo | Cap 2, seccion de posicionamiento (9b-5): catalogo propio, sin Open Food Facts ni BD como eje; la seccion de integraciones desaparece |
| Criterio de generacion por IA en la comparativa | Pablo | Cap 2, criterios y tabla 2.1 (9b-5): generacion automatica, peticion en lenguaje natural, metodo publicado, explicacion de infactibilidad y revision profesional; analizadas Foodzilla, Eat This Much y That Clean Life (via Practice Better), webs consultadas el 3-sep-2026 |
| Literatura academica de CP y menu planning | Pablo | Cap 2, seccion 2.1 nueva (9b-5): Stigler/Dantzig, Balintfy, Petot, Kahraman, Gazan, CP-SAT, Kambhampati, Valmeekam, Papastratis, Michailidis; todas verificadas en su fuente |
| Capturas o figuras por competidor | Alejandro | Cap 2, figuras 2.1 a 2.4 (9b-5): capturas de las webs publicas con URL y fecha en el pie |
| Tabla 3.1 fuera de margenes | Alejandro | Cap 3, tabla 3.1 (9b-5): columnas p{} y cabecera V1/V2 a dos lineas, comprobada en el PDF |
| Recetas y sustituciones (RF-26/RF-27) en el cap 3 | Pablo | Cap 3 (9b-5): fuera de la tabla 3.6, a la tabla 3.12 de pospuestos con su razon; recuento 29 a 27 RF y 52 a 56 %; tabla 3.13 y seccion 3.6 al dia; coherente con la exclusion de 5.2.1 |
| Renombrar variables de decision a legibles | Alejandro | Cap 5 y Anexo C (bloque 9b-1b) |
| Dominios explicitos de F y N | Alejandro | Cap 5, seccion de conjuntos (9b-1b) |
| Introduccion didactica a CP | Alejandro | Cap 5, seccion nueva antes de la formulacion (9b-1b) |
| Justificar el tope de 4 por comida y el ratio 0.6 | Pablo | Cap 5, restricciones estructurales y funcion objetivo (9b-1b) |
| Asuncion de las reglas duras con el caso renal | Pablo | Cap 5, cierre de restricciones estructurales (9b-1b); decision de mantener R4 en 0.8 comunicada por correo |
| Objetivo inconmensurable | Pablo y Alejandro | Motor corregido (pesos x1000, bloque EXP-motor); cap 5 al dia (9b-1b); analisis en el cap 7, seccion 7.2.3, y las bandas de tolerancia como segundo paso del mismo hilo en la 7.2.4 (9b-4) |
| Cotas de dominio del objetivo | (mejora derivada del EXP) | Motor (EXP-motor); cap 5 y Anexo C al dia (9b-1b) |
| Rotura de simetria entre dias | Alejandro | Medida y retirada con datos (EXP-motor); contada como experimento en el cap 7, seccion 7.3.3 (9b-4) |
| Tabla del tamano del problema y escalado | Pablo y Alejandro | Medidos (EXP-motor); cap 7, secciones 7.3.1 y 7.3.2 (9b-4) |
| Material del EXP-motor (magnitudes, simetria, tamano, escalado, versiones) | Pablo y Alejandro | Cap 7 (9b-4): eje de calidad en 7.2 (auditoria, versiones, magnitudes, bandas) y eje de eficiencia en 7.3 (tamano, escalado, simetria, cotas, alojamiento gratuito), con las figuras de los experimentos |
| Experimentos comparativos entre versiones del modelo | Alejandro | Cap 7, seccion 7.2.2 (9b-4) |
| Explicacion de los workers | Alejandro | Ya cubierta en caps 4 y 5; verificado en 9b-1b |
