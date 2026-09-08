# Puntos abiertos del feedback de los tutores

Registro de las sugerencias y dudas de los directores que todavia no tienen
respuesta visible, ni en la memoria ni en los correos enviados. El objetivo es
que ninguna se quede sin concretar: cada punto lleva su destino y, cuando se
ejecuta, se mueve a la tabla de resueltos con la ubicacion donde quedo
reflejado.

Origen: 1a ronda (agosto de 2026, borrador-indice), 2a ronda (finales de agosto,
capitulos 2, 3 y 5), 3a ronda (4 y 5 de septiembre, version entregable) y
correo de Alejandro con marcas sobre el PDF (6 y 7 de septiembre) y su cuarta
resena sobre la declaracion de uso de IA (7 de septiembre).
Revisado el 7 de septiembre de 2026 tras el bloque 9b-11.

## Pendientes

| Punto | Quien | Destino | Que debe quedar |
|---|---|---|---|
| Cero placeholders en portada y andamios | Pablo (3a ronda) | cover.tex, dedicatoria.tex, agradecimientos.tex (Victor, ultimos pasos) | Fecha real en la portada (hoy "DIA de MES de AÑO" en rojo), dedicatoria y agradecimientos (hoy "Proximamente"). El bloque de colaboradores se quito el 6-sep (decision: nadie) |
| Cierre 8.4 en la voz de Victor | Victor (decision del 9b-6) | ConclusionesTrabajoFuturo.tex, seccion 8.4, y su espejo en ConclusionsFutureWork.tex | Hoy es borrador del chat con comentario LaTeX; reescribirlo y re-sincronizar el ingles |
| Re-sincronizar los capitulos en ingles | (herencia del 9b-7) | Introduction.tex y ConclusionsFutureWork.tex (bloque 9b-9) | Tras las ediciones de Victor de la intro y el cap 8 |
| Revision de Victor de caps 2 (2.2-2.5), 7 + Anexo D, 8 | Victor | Rondas 14+ del corpus | Sin revisar a 7-sep; el cap 7 se revisa ya aligerado (9b-10); la declaracion de IA si (ronda 14 y su reescritura del 9b-11) |
| Material adicional para el tribunal: ZIP del repo privado y direcciones del despliegue en el documento que pidan | Alejandro (correo 6/7-sep) | Bloque Entrega, cuando lleguen las instrucciones oficiales | ZIP limpio (sin `.env*`, `node_modules` ni secretos), URLs de Netlify, Render y repo; credenciales de prueba por el canal que decida Victor |
| Enviar la version final a los tutores con margen para sus ultimos comentarios | ambos (2a ronda) | Bloque 9b-final | Lectura lineal previa del PDF entero |

## Resueltos

| Punto | Quien | Donde quedo |
|---|---|---|
| Cosas dichas como hechas que no lo estan (aviso A1) y puntos que se cerraran al termino de la memoria (aviso A8) | Alejandro (correo 6/7-sep) | Auditoria de coherencia completa en `feedback-docs/auditoria-coherencia-memoria.md` (9b-11): 456 afirmaciones contrastadas con el codigo, las migraciones, las rutas y los crudos; 55 fixes minimos aplicados. Cap 3 recortado a lo construido (24 RF: RF-03, RF-13 y RF-39 a pospuestos; clausulas de editar, filtrar por estado, vistas de calendario, reprogramar, crear planes a mano y grafico combinado retiradas), caps 4 y 6 sin la re-validacion en la firma ni los avisos junto al plan, 8.1 sin "en curso", comentarios LaTeX de trabajo interno fuera, recuentos coherentes en intro, cap 3, cap 8 y Anexo A. Mini-bloque de codigo para que RNF-IA-2 sea cierto (un borrador con fallo duro del validador no se persiste) y para RF-02 (buscador por nombre) |
| E2E contra Render tras el despliegue del mini-bloque de codigo del 9b-11 | (verificacion) | 29 de 29 el 7-sep con la API nueva (validador que bloquea la persistencia, mensaje del nucleo con las reglas base) |
| Declaracion de uso de IA: antes del resumen, sin la clausula de la UCM, con Victor como sujeto del codigo y de la memoria | Alejandro (4a resena, 7-sep) | `Cascaras/declaracionIA.tex` en el frontmatter, tras los agradecimientos y en el indice; los anexos vuelven a ser A-D; texto reescrito y validado por Victor (9b-11) |
| Cap 7 muy denso: simetria, magnitudes y bandas a resumen | Alejandro (correo 6/7-sep) | 7.2.3, 7.2.4 y 7.3.3 en 2-3 parrafos (problema, abordaje, conclusion, efecto en el modelo) con una tabla o figura cada una; pre-registros, tablas por caso, hipotesis y criterios en el Anexo D (secciones D.2 a D.4 con etiquetas); 7.2.1 y 7.2.2 intactas; el cap 7 baja de 25 a 22 paginas con la tabla de casos nueva (9b-10) |
| Nombres de personas con planes que no aparecen en ninguna tabla | Alejandro (marca pag. 84) | Tabla 7.2 de casos de evaluacion al final de 7.1 (ocho del banco, seis clientes de demostracion, caso de diseno, con perfil, restricciones y experimentos) y referencia en la primera mencion de Tomas y de los clientes demo (9b-10) |
| Capturas de la aplicacion en el cap 6 | Alejandro (correo 6/7-sep) | Tres capturas reales de la app desplegada con generacion real para Nadia: pantalla de revision AI/Manual (6.4), generacion fallida con la infactibilidad explicada y borrador generado (6.5) (9b-10) |
| Marcas sobre el PDF: 'tecnicas de programacion', 'mi tutor, Alejandro', hard/soft constraints en cursiva, atribuciones en 7.2.2, 7.2.3, intro de 7.3 y caso renal | Alejandro (13 marcas, 6 ya hechas por 9b-8/9b-9) | Intro objetivo 3 y fase 9 (ES y EN), cap 5.1, 5.3 (caso renal como ejemplo propio), 7.2.2, 7.2.3 y 7.3 sin atribucion, cap 8 sin 'puso de ejemplo'; Radix/Tailwind atribuido a Pablo en 4.1 (tecnologia ajena a la carrera, permitido por su correo) (9b-10) |
| Cita de Cervantes de la plantilla en la bibliografia | Victor | Bloque `\setCitaBibliografia` eliminado de `Cascaras/bibliografia.tex` (9b-10) |
| Prueba con nutricionistas sin alusiones colgando | Pablo (3a ronda) y 2a reunion de julio | 7.5 con la prueba de dos nutricionistas (25-ago y 4-sep de 2026: 16 de 16 tareas faciles, unico pero la espera al generar), sintesis en 8.1, limitacion en 8.2, pautas en 8.3.1 y 8.3.4, intro fase 12; espejos en ingles; cero "en curso" (9b-9) |
| Placements [H] y espacios en blanco, overfull | Alejandro (2a ronda) | 61 flotantes a [htbp] con parametros de flotantes en el preambulo: ninguna tabla en pagina propia; 0 overfull tras reordenar una frase y estrechar dos tabulares del Anexo B (9b-9) |
| Em-dashes en el cap 3 y en el Anexo A | Alejandro (1a ronda) | Fuera de la prosa (12 frases a parentesis); se conservan solo en los titulos de los RNF y en las captions de las tablas de RF, por decision de Victor (9b-9) |
| Objetivo 2 de la intro alineado con el cap 2 (competencia y posicionamiento, sin estudio economico) | (detectado en el 9b-6) | Intro ES y EN con la redaccion acotada; cap 8 ya no lo da por cumplido a medias (9b-9) |
| Colaboradores de la portada | Pablo (3a ronda, placeholders) | Bloque "Colaborador" retirado de las dos portadas: no hay colaborador en la direccion (9b-9) |
| Declaracion de uso de IA con modelos e identificadores | Pablo (3a ronda) | Anexo E nuevo, ultimo del documento (9b-8): herramientas y modelos con identificadores de la documentacion oficial, tareas en general, autoria y verificacion; validado por Victor |
| Ejemplo de 900 kcal y 180 g de proteina mal explicado | Pablo (3a ronda) | Reproducido con el solver (9b-8): la causa real es el suelo calorico R3 (basal de 1810 kcal), no la proteina; 5.6 y 6.5 reescritos con el mismo ejemplo; de paso, "nucleo minimo" corregido a "subconjunto suficiente" en 2.1, 5.1 y 5.6 |
| Nombres de los directores en el texto | Pablo (3a ronda) | 29 menciones sustituidas por "los directores del TFG" y variantes, en castellano e ingles (9b-8); portada, bibliografia y agradecimientos intactos |
| Cita in situ de Stigler | Pablo (3a ronda) | Cap 2, seccion 2.1 (9b-8) |
| Citas de Supabase, Radix UI, Next.js, Ollama y Open Food Facts | Pablo (3a ronda) | Primera mencion de cada una (9b-8), ampliado por decision de Victor a todas las herramientas (PostgreSQL, FastAPI, Tailwind, Netlify, Render, Figma, BEDCA, Claude Code, MCP de Figma) y a los competidores de la intro; 28 entradas @misc con fecha de consulta |
| Columna "Metodo publicado" de la tabla 2.1 | Pablo (3a ronda) | Fila y criterio de 2.2 retirados; 2.4, 2.5 y el objetivo 2 del cap 8 coherentes (9b-8) |
| Anexo vs apendice | Pablo (3a ronda) | `\appendixname` redefinido a "Anexo" en el preambulo (9b-8); cabeceras e indice coherentes con la prosa |
| Empates entre soluciones | Alejandro via Pablo (3a ronda) | Cap 8, seccion 8.3.1 y su espejo en ingles (9b-8): orden lexicografico o lista corta de alternativas para el profesional |
| Listado de acronimos | Pablo (3a ronda, opcional) | Lista manual de 24 entradas tras el indice de tablas (9b-8) |
| Fechas por fase en la intro | Alejandro (2a ronda) | Intro (9b-6): rango temporal en el subtitulo de cada fase con las fechas dictadas por Victor |
| Pasada global de negritas en mitad de frase | Alejandro (2a ronda) | Toda la memoria (9b-7): 17 negritas de enfasis retiradas, solo quedan las estructurales |
| Resumen y palabras clave acabados, traducciones al ingles, metadatos del PDF | (normativa y 1a ronda) | Cascaras y capitulos en ingles (9b-7) |
| Trabajo futuro del tope de 4 alimentos por comida | Pablo | Cap 8, seccion 8.3.1 (9b-6): rol de acompanante que no consuma el tope, con la dependencia del catalogo |
| Reglas estructurales no anulables (caso renal) | Pablo | Cap 8, seccion 8.2 (limitacion) y 8.3.1 (editables por el profesional) (9b-6) |
| El reparto por comidas domina el objetivo | tutores | Cap 8, seccion 8.2 y 8.3.1 (9b-6): renormalizar con division entera y banda porcentual; razon de no medirlo |
| Recetas y sustituciones (RF-26/RF-27), parte de trabajo futuro | Pablo | Cap 8, seccion 8.3.1 (9b-6): recetas con composicion agregada e interfaz, sustituciones con modelo de equivalencia; parrafo final de 8.3 los senala como los pospuestos con enganche |
| Variante blanda de nutrient_ratio sin modelar | (limite propio) | Cap 8, seccion 8.2 y 8.3.1 (9b-6) |
| Duras con elasticidad minima y tolerancia por fila | Victor (revision del 9b-1c) | Cap 8, seccion 8.2 (igualdad exacta como limitacion) y 8.3.1 (tolerancias configurables) (9b-6) |
| Fuente de la base de alimentos en el cap 3 (BEDCA) | (detectado en el 9b-5) | Cap 3 (9b-6): parrafo de 3.6 con la historia real (BEDCA prevista, catalogo propio, carga como trabajo futuro), RF-45, tabla de dependencias y funcionalidades; cap 8 seccion 8.2 y 8.3.3 |
| RF-39 (dashboard con edit distance y coste) | (herencia del 9b-0) | Cap 8, seccion 8.2 (no construido), 8.3.2 (depende de la edicion del plan) y 8.3.4 (metricas de uso real) (9b-6) |
| RF-03 (notas privadas del cliente) conservado y no construido | (detectado en el 9b-6) | Cap 8, seccion 8.1 (objetivo 1), 8.2 y 8.3.3 (9b-6) |
| Reformular informalidades de la intro | Alejandro | Intro (9b-6): fase 7 (su ejemplo literal), fase 6; fases 9 y 10 corregidas en contenido; Victor decide dejar dos expresiones suyas |
| Coherencia del cap 3 con la narrativa del pivote ("se documentan como trabajo futuro") | (detectado en el 9b-6) | Cap 3 (9b-6): cuatro frases pasan a "se recogen en el capitulo 8" / "quedan fuera del alcance"; el cap 8 explica que los bloques eliminados no son trabajo futuro |
| Sobreventa de la tabla 2.1 y del cap 2 | Pablo | Cap 2 reescrito entero sobre lo que la app entrega (9b-5); la tabla de la idea inicial se conserva en el Anexo A como registro |
| Coherencia del 2.5 (BD como eje, fuente de alimentos) | Pablo | Cap 2, seccion de posicionamiento (9b-5): catalogo propio, sin Open Food Facts ni BD como eje; la seccion de integraciones desaparece |
| Criterio de generacion por IA en la comparativa | Pablo | Cap 2, criterios y tabla 2.1 (9b-5): generacion automatica, peticion en lenguaje natural, explicacion de infactibilidad y revision profesional; analizadas Foodzilla, Eat This Much y That Clean Life (via Practice Better), webs consultadas el 3-sep-2026 |
| Literatura academica de CP y menu planning | Pablo | Cap 2, seccion 2.1 nueva (9b-5): Stigler/Dantzig, Balintfy, Petot, Kahraman, Gazan, CP-SAT, Kambhampati, Valmeekam, Papastratis, Michailidis; todas verificadas en su fuente |
| Capturas o figuras por competidor | Alejandro | Cap 2, figuras 2.1 a 2.4 (9b-5): capturas de las webs publicas con URL y fecha en el pie |
| Tabla 3.1 fuera de margenes | Alejandro | Cap 3, tabla 3.1 (9b-5): columnas p{} y cabecera V1/V2 a dos lineas, comprobada en el PDF |
| Recetas y sustituciones (RF-26/RF-27) en el cap 3 | Pablo | Cap 3 (9b-5): fuera de la tabla 3.6, a la tabla 3.12 de pospuestos con su razon; recuento 29 a 27 RF y 52 a 56 %; tabla 3.13 y seccion 3.6 al dia; coherente con la exclusion de 5.2.1 |
| Renombrar variables de decision a legibles | Alejandro | Cap 5 y Anexo B (bloque 9b-1b) |
| Dominios explicitos de F y N | Alejandro | Cap 5, seccion de conjuntos (9b-1b) |
| Introduccion didactica a CP | Alejandro | Cap 5, seccion nueva antes de la formulacion (9b-1b) |
| Justificar el tope de 4 por comida y el ratio 0.6 | Pablo | Cap 5, restricciones estructurales y funcion objetivo (9b-1b) |
| Asuncion de las reglas duras con el caso renal | Pablo | Cap 5, cierre de restricciones estructurales (9b-1b); decision de mantener R4 en 0.8 comunicada por correo |
| Objetivo inconmensurable | Pablo y Alejandro | Motor corregido (pesos x1000, bloque EXP-motor); cap 5 al dia (9b-1b); analisis en el cap 7, seccion 7.2.3, y las bandas de tolerancia como segundo paso del mismo hilo en la 7.2.4 (9b-4) |
| Cotas de dominio del objetivo | (mejora derivada del EXP) | Motor (EXP-motor); cap 5 y Anexo B al dia (9b-1b) |
| Rotura de simetria entre dias | Alejandro | Medida y retirada con datos (EXP-motor); contada como experimento en el cap 7, seccion 7.3.3 (9b-4) |
| Tabla del tamano del problema y escalado | Pablo y Alejandro | Medidos (EXP-motor); cap 7, secciones 7.3.1 y 7.3.2 (9b-4) |
| Material del EXP-motor (magnitudes, simetria, tamano, escalado, versiones) | Pablo y Alejandro | Cap 7 (9b-4): eje de calidad en 7.2 (auditoria, versiones, magnitudes, bandas) y eje de eficiencia en 7.3 (tamano, escalado, simetria, cotas, alojamiento gratuito), con las figuras de los experimentos |
| Experimentos comparativos entre versiones del modelo | Alejandro | Cap 7, seccion 7.2.2 (9b-4) |
| Explicacion de los workers | Alejandro | Ya cubierta en caps 4 y 5; verificado en 9b-1b |
| Cap 3 sin la seccion de decisiones tecnologicas; cap 4 por capas con 4.5 y 4.6 reducidos; cap 5 solo solver; cap 6 con la figura del profesional; cap 7 con rendimiento y usuarios separados; remisiones de los caps 5 y 6 al cap 7 | Alejandro (1a ronda) | Ejecutado en los bloques 9b-1 a 9b-4; caps 5 y 6 remiten al cap 7 en 8 y 5 puntos respectivamente |
