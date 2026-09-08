# Investigación previa al diseño de la base de datos del copiloto NutriApp

**Fase A del plan de implementación · Junio de 2026**

> Documento de investigación que cierra la primera fase del plan de implementación del copiloto IA del TFG NutriApp. Recoge el estudio en profundidad de las bases de datos oficiales y públicas de composición de alimentos, las APIs comerciales del sector, los competidores directos en el mercado de software para nutricionistas, y el estado del arte académico sobre sistemas de recomendación dietética, optimización con restricciones, RAG en contexto clínico y personalización de modelos de lenguaje. La síntesis se cruza con las quince decisiones de la auditoría externa previa (`auditoria-bd-ia.md`) para confirmarlas, ajustarlas o cerrarlas con datos.

---

## Tabla de contenidos

0. [Resumen ejecutivo y decisiones cerradas](#resumen-ejecutivo)
1. [Introducción y propósito](#1-introducción-y-propósito)
2. [Bases de datos oficiales y públicas](#2-bases-de-datos-oficiales-y-públicas)
3. [APIs comerciales del sector](#3-apis-comerciales-del-sector)
4. [Competidores directos del software para nutricionistas](#4-competidores-directos)
5. [Estado del arte académico](#5-estado-del-arte-académico)
6. [Síntesis transversal por temáticas](#6-síntesis-transversal-por-temáticas)
7. [Decisiones cerradas tras la investigación](#7-decisiones-cerradas-tras-la-investigación)
8. [Plan de la Fase B (diseño BD v0)](#8-plan-de-la-fase-b)
9. [Bibliografía consolidada](#9-bibliografía-consolidada)

---

## Resumen ejecutivo

La investigación sustenta y precisa el diseño que la auditoría había planteado. Los hallazgos clave son los siguientes.

- **USDA FoodData Central como núcleo de datos** por su licencia *CC0 1.0 Universal*, su API REST estable y, especialmente, por mantener tablas oficiales de *yield* (rendimiento de cocción) y *retention factors* (factores de retención de nutrientes) que permiten calcular alimentos cocinados a partir del alimento crudo sin almacenarlos como entradas separadas. SR Legacy (7 793 alimentos) más Foundation Foods cubren la mayoría de los casos prescriptivos de un nutricionista profesional.
- **BEDCA como capa de localización española**, con un subset curado (200-300 alimentos típicos de la dieta mediterránea sin equivalente exacto en USDA: aceites de oliva, jamón ibérico, quesos, pescados del Cantábrico, embutidos, legumbres autóctonas). Carga manual con cita académica; **no hay API pública ni licencia clara para uso comercial**, lo cual es una limitación documentada por la propia revisión de Olmedilla-Alonso et al. (2018) en *Endocrinología, Diabetes y Nutrición*.
- **Open Food Facts como capa de productos envasados**, vía dump Parquet en HuggingFace cargado en Postgres para evitar los rate limits de la API y permitir búsqueda full-text local. Filtrado inicial por `countries_tags=en:spain`, *fallback* al global.
- **AESAN INR 2019 y SENC 2016 como capa de guardrails**, cargadas como tablas relacionales (`nutrient_reference` y `food_group_servings`). El copiloto las usa para emitir avisos cuando un plan se aleja de la pirámide SENC o se desvía más del 20 % de las ingestas de referencia.
- **Crudo↔cocinado modelado con la aproximación pragmática mixta**: alimento canónico en estado crudo, método de cocción a nivel de línea de receta, aplicación de retention y yield USDA al vuelo, *fallback* a entrada cocinada explícita cuando exista en BEDCA. Esto cubre la crítica que el arquitecto/a de BD señaló en la auditoría como punto frágil del diseño original.
- **Foodzilla, único competidor con generación IA real**, no usa un LLM puro: combina motor de optimización con catálogo curado y envoltorio LLM cosmético. **Valida la apuesta arquitectónica del TFG** (RAG + solver + LLM + validador) frente a la deriva de "todo al LLM" que es defensivamente más débil.
- **Cronometer usa NCCDB** (Nutrition Coordinating Center Database de la Universidad de Minnesota, ~195 nutrientes) como ventaja competitiva, pero NCCDB es comercial y de pago. Para un TFG no es accesible; la combinación **USDA + BEDCA + INR AESAN-2019** es académicamente suficiente y completamente reproducible.
- **APIs comerciales (Edamam, Spoonacular, Nutritionix) descartadas** en el TFG por presupuesto, cobertura geográfica anglosajona o términos de uso restrictivos. **FatSecret Premier Free para estudiante con email universitario** es la única vía gratuita realista a una BD comercial extensa con cobertura España; vale la pena solicitar el alta aunque la verificación tarde semanas.
- **Sustento académico para la arquitectura propuesta**: Almanac de Zakka et al. en *NEJM AI* (2024) es la cita canónica para defender RAG en clínica con trazabilidad y rechazo cuando no hay evidencia. Donkor et al. (2023) y Prajapati et al. (2025) sustentan el componente solver con programación lineal. Papastratis et al. (2024) en *Scientific Reports* legitima la arquitectura "lógica determinista + LLM como capa de presentación". Zhang et al. (2024) formaliza la personalización por *prompt + retrieval* sin fine-tuning como técnica de primer orden.

La conclusión global es que la investigación **confirma las quince decisiones de la auditoría** y añade tres ajustes técnicos concretos: (i) modelado crudo↔cocinado con retention+yield USDA en vez de duplicar entradas; (ii) integración de las INR AESAN-2019 y la pirámide SENC-2016 como guardrails estructurados, no solo como referencia conceptual; (iii) modelo multi-fuente con tabla puente `external_food_mapping(source, external_id, food_id_canonical, confidence)` para reconciliar BEDCA, USDA y Open Food Facts sin deduplicación destructiva.

---

## 1. Introducción y propósito

NutriApp es mi TFG (Doble Grado en Ingeniería Informática y ADE, UCM). La pieza estrella es un copiloto IA que asiste al nutricionista en la creación de planes nutricionales aprendiendo de su estilo clínico. Tras una primera fase de pivote y una auditoría externa con tres perspectivas independientes (`auditoria-bd-ia.md`), las decisiones de modelado de la base de datos quedaron cerradas con el cuerpo de quince decisiones, pero condicionadas a una investigación posterior que cerrase varias preguntas técnicas: si convenía apoyarse en una base oficial (BEDCA, USDA), una API comercial (Edamam, Spoonacular), una mezcla, qué hacían los competidores reales, y qué literatura académica sostiene cada elección arquitectónica.

Este documento es esa investigación. Los datos se han recogido consultando directamente las fuentes (sitios oficiales, documentación de APIs, papers en revistas con DOI verificable, reseñas de software en plataformas independientes como Capterra y G2). Cuando una afirmación no se ha podido verificar contra una fuente primaria, se indica explícitamente.

El documento se organiza en cuatro grandes bloques de investigación (secciones 2 a 5), una síntesis transversal por temáticas (sección 6), las decisiones aplicables al TFG (sección 7), el plan de la siguiente fase (sección 8) y la bibliografía consolidada (sección 9).

---

## 2. Bases de datos oficiales y públicas

### 2.1 BEDCA

BEDCA, *Base de Datos Española de Composición de Alimentos*, es la base de datos oficial española de composición nutricional, mantenida por la Red BEDCA (investigadores de universidades públicas, CSIC, FIAB y Fundación Triptolemos) y coordinada por AESAN. Su primera versión pública data de 2010 y se desarrolló según los estándares de EuroFIR.

La revisión de Olmedilla-Alonso et al. publicada en *Endocrinología, Diabetes y Nutrición* en 2018 cuantifica BEDCA en **950 alimentos, 34 componentes y 13 grupos alimentarios**. Los 34 componentes cubren energía, macronutrientes con desglose de ácidos grasos saturados, monoinsaturados y poliinsaturados, hidratos disponibles, fibra, agua, nueve minerales (Ca, Fe, I, Mg, Zn, Na, K, P, Se) y trece vitaminas (A, D, E, K, B1, B2, niacina, B6, folato, B12, C, biotina, ácido pantoténico). Cada par alimento-componente recoge método analítico, valor medio, número de muestras y referencia bibliográfica, manteniendo la trazabilidad EuroFIR.

Modela el cocinado como **entradas independientes** del alimento crudo cuando existen datos analíticos. Por ejemplo, distingue "Lentejas, secas" de "Lentejas, cocidas" y "Pollo, pechuga, cruda" de "Pollo, pechuga, asada". No mantiene tablas de retención ni rendimientos: si un cocinado no tiene entrada propia, no es derivable.

El acceso es por **consulta web libre** en `https://www.bedca.net/bdpub/`. **No existe API REST pública documentada ni descarga abierta del dataset completo**. La página declara "todos los derechos reservados"; el uso académico se acepta con cita pero sin licencia explícita tipo Creative Commons. Para uso en sistemas de producción comerciales AESAN exige consulta caso por caso. Esto es la limitación más grave para NutriApp.

Las limitaciones adicionales detectadas, relevantes para un nutricionista clínico español, son: pocos productos ultraprocesados de marca; ausencia de fibra soluble e insoluble desglosada y de EPA/DHA individualizados (solo se reporta el total de poliinsaturados en la mayoría de entradas); cobertura irregular de yodo y selenio; ausencia de timestamp de última actualización pública verificable.

### 2.2 USDA FoodData Central

USDA FoodData Central (FDC) es el portal del USDA Agricultural Research Service que integra cinco colecciones complementarias:

- **Foundation Foods**: alimentos analizados con muestras y metadatos exhaustivos. Se actualiza en abril y octubre.
- **SR Legacy**: 7 793 alimentos con hasta 150 componentes. Release final en abril de 2018, ya no se actualiza pero sigue siendo la columna vertebral.
- **FNDDS** (Food and Nutrient Database for Dietary Studies): alimentos tal y como se consumen, ciclo bienal.
- **Branded Foods**: más de 368 000 productos etiquetados, actualización mensual hasta noviembre de 2023.
- **Experimental Foods**: alimentos publicados en revistas peer-review con USDA.

La API REST se encuentra en `https://api.nal.usda.gov/fdc/v1/` con endpoints `/food/{fdcId}`, `/foods`, `/foods/list` y `/foods/search`. Requiere API key gratuita de api.data.gov con un rate limit por defecto de 1 000 peticiones por hora e IP. Especificación OpenAPI v3, respuesta JSON.

La licencia es **CC0 1.0 Universal (dominio público)**, con atribución solicitada pero no obligada. Para NutriApp esto es decisivo: a diferencia de BEDCA, USDA FDC se puede embeber en producción comercial sin fricción legal.

El elemento más crítico para el diseño del TFG son las dos tablas técnicas de USDA: la *Table of Nutrient Retention Factors, Release 6* (2007), que cubre 16 vitaminas, 8 minerales y alcohol para aproximadamente 290 alimentos con factores redondeados al 5 %, y la *Table of Cooking Yields for Meat and Poultry, Release 2*. Estas tablas permiten calcular `nutriente_cocinado = nutriente_crudo × retention% / yield%`. Ejemplos del orden de magnitud documentados: la tiamina del pollo asado retiene en torno al 75-85 %, el folato de las espinacas hervidas y escurridas baja al 50-55 %, los minerales (Fe, Zn, Ca) suelen retenerse al 100 % salvo cuando hay escurrido. *Yields* típicos: pechuga de pollo asada ~71 %, arroz blanco hervido ~280-300 % por absorción de agua, espinacas hervidas y escurridas ~60-70 %.

USDA FDC desglosa fibra soluble e insoluble, EPA y DHA individualmente, vitamina D2/D3, B12, folato (DFE), selenio, zinc, hierro total. **No diferencia hierro hemo y no hemo** (hay que estimarlo: 40 % hemo en carne roja, 60 % no hemo según AND/EFSA). **Yodo es irregular**: muchos ítems no lo reportan.

### 2.3 Open Food Facts

Open Food Facts (OFF) es un proyecto sin ánimo de lucro lanzado en 2012 por Stéphane Gigandet en Francia. A 2025 supera los 4 millones de productos crowdsourceados por más de 25 000 contribuidores desde 150 países. Para España, la facet oficial está en `world.openfoodfacts.org/facets/countries/spain`; el conteo concreto fluctúa pero se mueve en el orden de las decenas de miles de productos.

Cada entrada es un producto envasado identificado por código de barras (EAN/UPC). Contiene cientos de campos posibles agrupados en bloques: identificación (`code`, `product_name`, `brands`, `quantity`), categorización (`categories_tags`, `labels_tags`, `countries_tags`), composición (`ingredients_text`, `ingredients_analysis_tags`, `allergens_tags`, `traces_tags`), nutrientes por 100 g/ml o por porción, índices calculados (`nutriscore_grade`, `nova_group`, `ecoscore_grade`) e imágenes.

El crowdsourcing implica que los campos cabecera y los nutrientes para los productos top suelen estar completos, pero traducciones, *serving size* consistente, *quantity* parseable y campos derivados son irregulares. **Robotoff** (`https://openfoodfacts.github.io/robotoff/`) es el sistema de IA propio de OFF: aplica OCR sobre las fotos, detecta logos (Nutri-Score, BIO), parsea ingredientes con LLMs open-source y genera *insights* que se aplican automáticamente con alta confianza o pasan a moderación humana. Sus modelos están en GitHub con licencia abierta.

El acceso es por API REST v2 (v3 en desarrollo) con rate limits de 15 peticiones por minuto e IP para producto y 10 por minuto para search, o bien por **dumps masivos** descargables en formato MongoDB, JSONL, CSV (~0,9 GB comprimido / ~9 GB descomprimido) y especialmente **Parquet en HuggingFace** (`huggingface.co/datasets/openfoodfacts/product-database`), que es el formato más cómodo para analítica con Pandas o DuckDB.

La licencia es doble: ODbL sobre la base de datos y DbCL sobre los contenidos individuales, más CC-BY-SA 3.0 para imágenes. Implicación para NutriApp: si se distribuye una BD derivada hay obligación de share-alike y atribución; el uso interno en una aplicación SaaS no obliga a publicar la BD completa, solo a permitir a los usuarios el acceso a la versión derivada.

La limitación clave de OFF para un nutricionista es que **cataloga productos envasados, no alimentos atómicos**. Para una prescripción tipo "80 g de pollo + 60 g de arroz", OFF no resuelve el caso. La solución es combinar OFF con BEDCA y USDA.

### 2.4 Guías nutricionales españolas: AESAN, SENC, FESNAD

AESAN publicó en 2019 las **Ingestas Nutricionales de Referencia (INR)** para 15 minerales y 13 vitaminas en la población española (*Revista del Comité Científico AESAN nº 29*, 2019, pp. 43-68). Para macronutrientes y energía AESAN asume los valores de EFSA. Antes de 2019 la referencia era el documento **FESNAD 2010**. El formato es PDF, sin datos estructurados descargables; las tablas son parseables con Tabula o Camelot.

SENC publicó la **Pirámide de la Alimentación Saludable** en diciembre de 2016 como suplemento de *Nutrición Hospitalaria*. Las raciones clave son: frutas 3-4 al día, verduras 2-3, lácteos 2-3, AOVE 3-4 cucharadas al día, pescado 2-3 veces a la semana, legumbres 2-3 o más raciones por semana, carnes magras y huevos alternados. Incorpora actividad física, balance emocional y procedimientos culinarios saludables como base de la pirámide.

Otras instituciones relevantes son FEN (Federación Española de Nutrición), AEDN/AED-N (Academia Española de Nutrición y Dietética), SEEN (Sociedad Española de Endocrinología y Nutrición) y SEEDO (Sociedad Española para el Estudio de la Obesidad). El INNOVADIETA de la UCM actúa como meta-recurso (`https://www.ucm.es/innovadieta/ingestas-recomendadas`).

Lo viable para NutriApp es modelar las INR AESAN-2019 como tabla `nutrient_reference(group, sex, age_min, age_max, nutrient_id, value, unit)` cargada manualmente desde el PDF, y las raciones SENC-2016 como `food_group_servings(group_id, frequency_unit, min, max)` para emitir avisos automáticos cuando el plan se aleje de las recomendaciones.

### 2.5 Crudo↔cocinado: la decisión técnica clave

Tres aproximaciones son posibles:

- **Aproximación BEDCA** (entrada separada por estado): simple de consultar pero limitada a los cocinados pre-analizados. No hay forma de derivar combinaciones que no estén ya en la base.
- **Aproximación USDA** (alimento crudo + factor de retención + yield): permite generar combinaciones (pollo asado, pollo hervido, pollo a la plancha) sin nuevos análisis, pero exige cargar las tablas auxiliares y un método de cocción canónico por receta.
- **Aproximación pragmática mixta** (la recomendada): el alimento se carga *como ingrediente crudo o tal cual se compra*; el método de cocción es atributo de la línea de receta; la composición del plato cocinado se calcula al vuelo aplicando retention y yield, con *fallback* a entrada cocinada explícita si el alimento la tiene en BEDCA.

La aproximación mixta es académicamente la más rica para un TFG: ilustra una decisión de diseño BD no trivial, justifica cargar las tablas USDA de retención y rendimiento, y permite responder a la pregunta "¿qué pasa con la pechuga de pollo que se cocina al vapor en lugar de asada?" sin tener que esperar a que alguien analice las muestras.

---

## 3. APIs comerciales del sector

### 3.1 Edamam

Edamam ofrece tres APIs separadas:

- **Food Database API**: búsqueda de alimentos genéricos y empaquetados, parser de ingredientes, lookup por UPC, devuelve estructura `parsed`/`hints` con 28 nutrientes, healthLabels, dietLabels y categoryLabel.
- **Recipe Search API**: aproximadamente 2,3 millones de recetas indexadas con filtros por dieta, alergia y nutrientes.
- **Nutrition Analysis API**: recibe ingredientes en texto libre y devuelve análisis nutricional completo.

El parser NLP de Nutrition Analysis está optimizado para inglés. Las pruebas con texto en castellano rinden peor: la unidad y el ingrediente se reconocen por separado pero la cobertura de productos no anglosajones es limitada. Para NutriApp en España esto obliga a traducir al inglés antes del parseo o asumir errores.

El pricing en 2026 es opaco. El plan **Developer (gratis)** ofrece unas 10 000 llamadas al mes, 10 peticiones por minuto y prohíbe explícitamente uso comercial. Los planes **Basic** parten de 49 USD/mes para Nutrition Analysis. **Food & Grocery Database** escala hasta 799 USD/mes y **Recipe Search** hasta 999 USD/mes en sus tiers altos. **Enterprise** es custom.

### 3.2 Spoonacular

Spoonacular se orienta a recetas y planes de comida. Las recetas incluyen `steps`, `equipment`, `ingredients` parseados, conversión US/métrica, índice y carga glucémica, perfiles de sabor (sweet, salty, sour, bitter, umami, fatty), pairings y sustituciones. Endpoints destacados: `complexSearch`, `analyzeRecipe`, `parseIngredients`, `mealplanner`, `convertAmount`.

El pricing es por sistema de puntos: el plan **Free** da 50 puntos al día con 1 petición por segundo y exige backlink; **Cook** 29 USD/mes; **Culinarian** 79 USD/mes; **Chef** 149 USD/mes; **Enterprise** desde 300 USD/mes. Cada llamada consume típicamente un punto más 0,01 punto por resultado.

La cobertura para España es **pobre**: el catálogo es predominantemente anglosajón, las recetas mediterráneas españolas aparecen en versiones angloajustadas y los ingredientes locales (cecina, manchego DOP, judía del barco) no están en el catálogo principal. Para un TFG dirigido a nutricionistas españoles, Spoonacular es un mal *fit*.

### 3.3 Nutritionix y FatSecret

**Nutritionix Track API** ofrece una BD de aproximadamente 1,9 millones de items con fuerte cobertura en productos de marca de Estados Unidos y cadenas de restaurantes. Su endpoint estrella `/v2/natural/nutrients` parsea texto libre tipo "1 cup of pasta with tomato sauce". El NLP es solo en inglés. **Ya no hay tier gratuito público**; *Enterprise* desde 1 850 USD/mes facturado anualmente. Cobertura España: marginal.

**FatSecret Platform** ofrece más de 2,3 millones de items verificados con cobertura en 58 países y 26 idiomas (incluido español nativamente), 19 000 recetas, 90 % o más de cobertura barcode global, NLP por voz/texto y reconocimiento de imagen. El plan **Basic (gratis con self sign-up)** da 5 000 llamadas al día pero **solo para dataset USA**. El plan **Premier Free** ofrece llamadas ilimitadas con verificación, dirigido a startups de menos de 1M USD, ONGs y estudiantes; requiere atribución y aplica 50 % de descuento en NLP e Image Recognition. Premier es a precio bajo solicitud.

Para España, FatSecret es claramente la mejor opción comercial: tiene dataset específico con marcas locales (Mercadona, Hacendado, Carrefour) e idioma español. **El tier Premier Free para estudiante con TFG es la única vía gratuita realista a una BD comercial extensa con cobertura España** — vale la pena solicitarlo aunque la verificación tarde semanas.

### 3.4 ¿Pagar API en un TFG? Análisis coste-beneficio

Como TFG con presupuesto típicamente cero, ninguna API comercial aporta valor diferencial frente a la combinación gratuita OFF + BEDCA + USDA para una demo académica. Spoonacular Cook (29 USD/mes) y Edamam Basic (49 USD/mes) son baratos pero la cobertura geográfica es inadecuada. Nutritionix (1 850 USD/mes) está fuera de cualquier consideración.

La única apuesta razonable es **solicitar FatSecret Premier Free** con email universitario y, mientras tanto, trabajar con OFF + BEDCA + USDA. Si lo conceden, FatSecret reemplaza a OFF para productos españoles con datos limpios y NLP castellano nativo. Si no, OFF cubre el caso con calidad aceptable.

Una capa de abstracción (`Adapter` por fuente, entidad `Food` interna canónica con campos normalizados) es imprescindible y bien justificada académicamente — cada fuente tiene su schema, sus unidades, su granularidad, y la abstracción es un capítulo natural en la memoria del TFG.

---

## 4. Competidores directos

### 4.1 Nutrium

Nutrium es una startup portuguesa fundada en 2015 en Braga. Levantó una Serie A de 4,25 M de euros en 2020 (Indico Capital, Faber Ventures) y una ronda adicional de 10 M en 2025 para escalar su programa corporativo en EE. UU. Es, junto a Practice Better, el referente europeo del sector.

Cubre gestión de clientes, planes de comidas, agenda, mensajería segura, telemedicina, evaluación dietética, seguimiento de progreso y app móvil para el paciente. Habla en marketing de "+10 000 alimentos" pero no documenta públicamente la fuente de su BD; las reseñas en Capterra y SelfDecode Labs sugieren BD propia/curada con quejas frecuentes ("la BD es escasa y consume tiempo"). En el mercado hispano probablemente complementen con BEDCA o tabla de Moreiras manualmente.

La componente de IA es ambigua. La web habla de "artificial intelligence tools for proactive monitoring", pero la reseña de SelfDecode Labs afirma sin matices que **Nutrium no ofrece coaching con IA**. La especulación razonable es que la "IA" se reduce a alertas automatizadas y detección de no-adherencia, no generación de planes — lejos de Foodzilla.

Pricing (febrero 2025): Meal Plan desde 28 USD/mes hasta 10 clientes activos, Follow-up desde 44 USD/mes, planes ilimitados desde 25-39 USD/mes facturados anuales.

Lección para NutriApp: tomar prestados el flujo de UX y la dualidad B2C (app del paciente con diario) + B2B (panel del nutri). Diferenciarse por integración nativa con BEDCA y particularidades del CGDN/AEDN.

### 4.2 Practice Better

Plataforma canadiense, sirve más de 50 000 profesionales, enfocada al mercado anglosajón (EE. UU., Canadá, Reino Unido). No es exclusiva de nutrición — atiende salud mental, medicina funcional, coaches, quiropráctica, etc.

Ofrece un EHR completo con agenda, telesalud, formularios, plantillas de notas, charting personalizable, protocolos, mensajería segura, portal de cliente, programas/cursos, journaling, ePrescribe, facturación con seguros, integraciones con Zoom, Stripe, Google Calendar, Fullscript, Rupa Health, wearables.

En modelado de planes nutricionales es **deliberadamente débil**: no tiene generador propio. Delega esa función a la integración con That Clean Life (otra suscripción separada). Reseñas de NutriAdmin lo confirman: "NutriAdmin tiene funcionalidades avanzadas en meal planning, recetas y generador de planes, áreas en las que Practice Better está flojo".

Lanzaron en 2024-2025 un *AI Charting Assistant* para dictado y resumen de notas clínicas (primeros 600 minutos gratis, después 0,60 USD/hora). **No hay generación de planes con IA**. Su IA es asistente clínico, no nutricional.

Es estricto en HIPAA compliance: TLS 1.2, AES-256, RBAC, auditoría completa de accesos a PHI, BAA firmable. La pista arquitectónica para NutriApp es el patrón de campos `created_by`, `accessed_by`, RBAC granular y logging extensivo, que para un TFG con foco en BD es académicamente exigible.

Pricing: Sprout (gratis, 3 clientes), Starter (35 USD/mes, 10 clientes), Professional (59 USD/mes, 300 clientes), Plus (89 USD/mes, ilimitado), Team (155 USD/mes).

### 4.3 Cronometer Pro

Cronometer arrancó en 2011 como app de tracking obsesionada con la **precisión micronutricional**. Su BD combina USDA FoodData Central, NCCDB (Nutrition Coordinating Center Database, Universidad de Minnesota) y bases internacionales. NCCDB es probablemente la BD más completa del mundo en micronutrientes (cubre más de 195 nutrientes vs. los aproximadamente 50 de USDA), de pago, usada en investigación clínica. Cronometer es uno de los pocos productos comerciales con licencia. Cronometer Pro analiza hasta 92 nutrientes y compuestos.

Permite recetas custom con cálculo nutricional automático, importador de recetas desde URLs (Gold) y "Oracle" que sugiere alimentos para cubrir déficits específicos. Es HIPAA compliant. Casos de uso: hospitales, instituciones de investigación, consultas que necesitan análisis dietético cuantitativo.

En la práctica Cronometer Pro **no es una herramienta de gestión de consulta**: no tiene agenda, ni facturación, ni planes prescriptivos cerrados. Es una herramienta de análisis que el nutri usa en paralelo a otra plataforma. Por eso muchos nutris lo emparejan con Practice Better. Su valor único es la BD.

Lección para NutriApp: la BD multifuente con verificación y la riqueza de micronutrientes. NCCDB no es accesible en el TFG (de pago), pero la combinación **USDA + BEDCA + INR AESAN-2019** cubre lo necesario y es completamente reproducible.

### 4.4 Foodzilla

Zilla Technologies Limited, Auckland (Nueva Zelanda), fundada en 2019. Más de 1 000 nutricionistas en 10+ países según cifras oficiales. Mucho más pequeño que los anteriores pero **el más interesante para el ángulo IA del TFG**.

Documentado en su blog y en reseñas de Promealplan: "genera un plan completo en menos de 60 segundos" tomando como inputs alergias, preferencias, macros objetivo, frecuencia de comidas y exclusiones. Permite intercambio inteligente de recetas manteniendo objetivos nutricionales y el cliente puede cambiar recetas dentro de límites definidos por el nutri.

Integran **seis BDs nacionales: USDA, CoFID (Reino Unido), NUTTAB (Australia), FSANZ (Australia/Nueva Zelanda), CNF (Canadá) y TCA (Turquía)**. 2 millones o más de alimentos verificados, 100 000 o más recetas (de las cuales aproximadamente 1 500 evaluadas por dietistas). Esta multifuente es **el patrón a copiar para una solución española**: agregar BEDCA + Moreiras + USDA con normalización de campos.

La inferencia técnica más interesante es que, por la velocidad (menos de 60 segundos), el tamaño de la base de recetas (100 K) y la naturaleza de los outputs (recetas existentes recombinadas, no recetas inventadas), **no usan un LLM generativo puro** sino un motor de búsqueda/optimización sobre la base de recetas: filtran por restricciones, optimizan por macros (problema tipo bin-packing/ILP), y diversifican. Posiblemente envuelven la salida con un LLM para generar texto explicativo. Esta hipótesis es coherente con la reseña que dice que el cliente "puede cambiar recetas dentro de límites" — implica un espacio finito de soluciones, no generación libre.

Esto **valida la apuesta arquitectónica del TFG**: RAG + solver + LLM cosmético + validador es el patrón que el competidor más avanzado del sector ya ha elegido.

Pricing: Lite 17/29 USD (solo personal), Starter 23/39 USD (5 clientes), Professional 35/59 USD (20 clientes). Económico vs. Practice Better. Reseñas mixtas: 4,8/5 en más de 150 reseñas pero algunas negativas cuando los updates rompen funcionalidad. Producto joven, deuda técnica, soporte limitado.

### 4.5 Tabla comparativa

| Criterio | Nutrium | Practice Better | Cronometer Pro | Foodzilla |
|---|---|---|---|---|
| Mercado/geografía | Europa+EE.UU., 90 países | Anglosajón (EE.UU./CA/UK) | EE.UU./Canadá | Anglosajón + AU/NZ |
| BD alimentos | ~10K propia, fuente no documentada | No tiene (vía TCL) | USDA + NCCDB, 1M+, 92 nutrientes | 6 BDs nacionales, 2M+ |
| Recetas | Plantillas + custom | Vía integración | Agregado calculado | 100K, 1,5K curadas |
| Generación de planes | Manual asistida | Manual (vía TCL) | No prescribe | IA sobre catálogo (<60s) |
| Personalización estilo nutri | Plantillas | Plantillas, branding portal | No aplica | Marca blanca app móvil |
| Compliance | RGPD | HIPAA + PIPEDA + RGPD | HIPAA | No documentado en detalle |
| Mensajería/cliente | App móvil + chat | Portal + app + chat seguro | App tracking en tiempo real | Portal + telehealth |
| Pricing entrada | 28 USD/mes | 0/35 USD/mes | ~25 USD/mes | 17 USD/mes |
| Móvil/web | Web + app cliente | Web + app | Web + app potente | Web + app white-label |
| Idiomas | 7 (incl. ES) | Inglés | Inglés | Inglés |

### 4.6 Lo que tomar prestado, dónde diferenciarse

- **De Nutrium**, el flujo de UX y la dualidad B2C+B2B (app del paciente con diario + panel del nutri). Modelo de paquetes por "clientes activos al mes" en vez de "totales" es un patrón aprovechable. Diferenciarse: integración nativa con BEDCA y particularidades del CGDN/AEDN.
- **De Practice Better**, su disciplina de auditoría y compliance: campos `created_by`, `accessed_by`, RBAC granular, logging extensivo. Diferenciarse: no copiar su EHR generalista; especializarse en nutrición.
- **De Cronometer Pro**, la BD multifuente con verificación y la riqueza de micronutrientes. La decisión correcta para el TFG es **USDA + BEDCA + INR AESAN-2019** fusionadas con normalización, replicando el patrón pero con foco español.
- **De Foodzilla**, la arquitectura del generador como **optimización con restricciones sobre catálogo curado + envoltorio LLM cosmético**. Defendible académicamente, validado por un competidor real.

Recomendación: triangular los anchors. Nutrium para UI/flujo y experiencia del paciente, Cronometer/Foodzilla para BD multifuente con micronutrientes, y Foodzilla para la arquitectura del generador IA. **La diferenciación genuina del TFG es el eje España**: BEDCA nativa, raciones de intercambio del modelo SEEN/SEEDO, alineación con CGDN/AEDN, y RGPD aplicado al contexto sanitario español. Ningún competidor cubre eso.

---

## 5. Estado del arte académico

### 5.1 Sistemas de recomendación dietética con IA

**Papastratis, Konstantinidis, Daras y Dimitropoulos (2024)** — *AI nutrition recommendation using a deep generative model and ChatGPT*, *Scientific Reports*, vol. 14, art. 14620. DOI: 10.1038/s41598-024-65438-x.

Los autores, del Centre for Research and Technology Hellas, proponen un sistema de recomendación nutricional que combina un autoencoder variacional (VAE) con ChatGPT. El VAE modela mediciones antropométricas y condiciones médicas en un espacio latente, y un optimizador ajusta cantidades de comida según los requerimientos energéticos del usuario. ChatGPT se usa solo en una capa final para diversificar recetas en distintas cocinas. La novedad es la introducción de funciones de pérdida sofisticadas que alinean explícitamente la red con guías nutricionales establecidas, atacando el problema de fiabilidad clínica que tienen los sistemas puramente basados en LLM.

Aplicabilidad NutriApp: respalda directamente la decisión arquitectónica de no dejar el plan en manos del LLM. Aquí el LLM es ornamental y la lógica nutricional la lleva un componente determinista, exactamente el patrón de NutriApp (solver kcal/macros + validador clínico + LLM para presentación).

**Chen, Wang, Liu et al. (2023)** — *Health-Aware Food Recommendation Based on Knowledge Graph and Multi-Task Learning*, *Foods*, vol. 12, núm. 10, art. 2079. DOI: 10.3390/foods12102079.

Construyen un Collaborative Recipe Knowledge Graph (CRKG) con millones de tripletes y entrenan FKGM, una red GCN con atención sobre el grafo combinada con aprendizaje multitarea: una rama predice preferencia y otra impacto en salud sobre cuatro nutrientes críticos (sodio, grasa, azúcar, grasa saturada). Evalúan con Recall@K, NDCG@K y un score de healthiness propio.

Aplicabilidad NutriApp: legitima académicamente la idea de modelar preferencias y salud como objetivos separados. En NutriApp, preferencia entra por RAG sobre histórico y salud por validador determinista — los dos objetivos van por carriles distintos, como en este paper.

### 5.2 Constraint-based meal planning

**Donkor, Otoo y Damptey (2023)** — *A Systematic Review of Linear Programming Techniques as Applied to Diet Optimisation and Opportunities for Improvement*, *Journal of Optimization*, vol. 2023, art. 1271115. DOI: 10.1155/2023/1271115.

Revisión sistemática de 280 publicaciones (56 retenidas tras filtrado, 2000-2023). Encuentra que la mayoría de modelos LP en dieta usan solo una o dos restricciones (típicamente nutrientes y/o aceptabilidad), y critica explícitamente que la formulación monoobjetivo no captura la realidad multiobjetivo de la dieta sostenible (coste, nutrición, sostenibilidad ambiental, palatabilidad). Recomiendan MILP, programación por metas y técnicas multiobjetivo.

Aplicabilidad NutriApp: da soporte académico fuerte para usar LP/MILP como pieza de reparto de kcal/macros. También avisa de su techo: NutriApp hace bien en delegar la "preferencia" al RAG y dejar al solver solo el reparto cuantitativo. Es justificación directa del split arquitectónico.

**Prajapati, Jain, Machiraju y Kaushik (2025)** — *Linear Optimization for the Perfect Meal: A Data-Driven Approach to Optimising the Perfect Meal Using Gurobi*. arXiv:2501.04143.

Implementación práctica con Gurobi sobre un dataset nutricional público. Función objetivo: minimizar coste; restricciones: rangos de macronutrientes y micronutrientes y pesos fraccionarios sobre porciones de alimentos. Reportan tiempos de resolución bajos y buena escalabilidad.

Aplicabilidad NutriApp: blueprint casi 1:1 para la pieza solver de NutriApp si se opta por OR-Tools / Gurobi / CBC. Limitación: paper de aplicación, no propone método novedoso, pero como referencia de implementación es valioso.

### 5.3 RAG y LLMs en contexto clínico

**Zakka, Chaurasia, Shad et al. (2024)** — *Almanac: Retrieval-Augmented Language Models for Clinical Medicine*, *NEJM AI*, vol. 1, núm. 2. DOI: 10.1056/AIoa2300068.

Es la referencia canónica de RAG en clínica publicada en *NEJM AI*. Almanac externaliza el conocimiento a un *browser*/repositorio curado y deja al LLM solo la generación. Evaluado por panel de 5 médicos board-certified sobre 130 escenarios clínicos. Resultado: +18 % absoluto en factualidad sobre ChatGPT (p<0,05), con mejoras en completitud y seguridad. Mitigación de alucinaciones por construcción: el modelo no responde si el retrieval no devuelve evidencia, y todas las respuestas llevan trazabilidad a la fuente recuperada.

Aplicabilidad NutriApp: sustento directísimo para el patrón. Si el TFG tiene que defender ante tribunal por qué un LLM "puede" usarse en contexto sanitario, **este paper en *NEJM AI* es la cita con más peso**. Refuerza además la decisión de un validador clínico determinista posterior al LLM como capa de seguridad que Almanac no tiene explícitamente.

**Wang et al. (2025)** — *MEGA-RAG: a retrieval-augmented generation framework with multi-evidence guided answer refinement for mitigating hallucinations of LLMs in public health*, *Frontiers in Public Health*, 2025.

Framework RAG con refinamiento guiado por múltiples evidencias. Reportan reducción de más del 40 % en tasas de alucinación frente a baseline. Mecanismo: cross-checking entre múltiples documentos recuperados antes de generar.

Aplicabilidad NutriApp: el patrón "exigir múltiple evidencia coherente antes de aceptar respuesta" puede traducirse a NutriApp como exigir consistencia entre lo que sugiere el RAG histórico y lo que valida el componente clínico determinista — si discrepan, se descarta esa pieza del plan.

### 5.4 Personalización por usuario sin fine-tuning

**Zhang, Rossi, Kveton et al. (2024)** — *Personalization of Large Language Models: A Survey*. arXiv:2411.00027.

Survey reciente y exhaustivo (21 autores, varios de Adobe Research) que formaliza el espacio de personalización de LLMs. Establece taxonomía explícita: granularidad (usuario, sesión, tarea), técnicas (prompt-based, retrieval-based, parameter-efficient tuning, full fine-tuning), datasets y métricas.

Aplicabilidad NutriApp: el survey documenta como categoría aceptada la rama "prompt-based + retrieval" — exactamente la elección del TFG — sin necesidad de fine-tuning, situándola como técnica de primer orden y no como atajo. **Es el paper que el TFG debería citar para justificar por qué se descarta fine-tuning** en un trabajo de grado: el estado del arte reconoce in-context + RAG como vía legítima y reproducible cuando el corpus por usuario es pequeño, dinámico y privado.

### 5.5 Posicionamiento de NutriApp en el estado del arte

El patrón "RAG + solver + LLM + validador" no aparece como tal nombrado en ningún paper localizado. Sí aparecen las piezas por separado: Almanac (RAG clínico), Donkor y Prajapati (LP para dieta), Papastratis (deep generative + LLM cosmético) y Chen (knowledge graph health-aware). NutriApp **integra cuatro piezas que la literatura ya ha validado por separado**, lo cual es defendible como aportación de ingeniería de software aplicada, no como contribución algorítmica.

Lo que aporta NutriApp: (i) el eje *per-nutricionista* (RAG sobre los planes históricos de un profesional concreto, no sobre un corpus general), que la literatura toca tangencialmente en el survey de Zhang et al. pero no aterriza en nutrición; (ii) la combinación de solver determinista + validador clínico determinista rodeando al LLM, más conservadora que Almanac y especialmente apropiada para el contexto regulatorio europeo.

Decisiones bien apoyadas por la literatura: LLM como generador final con lógica determinista alrededor (Papastratis 2024, Almanac 2024), solver LP/MILP para reparto kcal/macros (Donkor 2023, Prajapati 2025), RAG con trazabilidad y rechazo si no hay evidencia (Almanac 2024, MEGA-RAG 2025), no fine-tuning (Zhang et al. 2024).

Apuestas propias del TFG (sin paper que las respalde directamente): la fragmentación per-nutricionista del corpus RAG y el flujo concreto de orquestación entre las cuatro piezas. Hay que defenderlas por argumentación, no por cita.

Metodología de evaluación trasladable: Almanac (panel de expertos sobre N escenarios, métricas factualidad/completitud/seguridad) — pedir a 3-5 nutricionistas que evalúen N planes generados. Prajapati 2025 aporta benchmark cuantitativo de cumplimiento nutricional. Chen 2023 da Recall@K y NDCG@K si se mide la pieza RAG.

---

## 6. Síntesis transversal por temáticas

### 6.1 Granularidad: alimento, ingrediente, receta, plan

Todos los sistemas serios separan **alimento atómico de receta** (BEDCA, USDA, Cronometer, Foodzilla). Open Food Facts, Edamam y Spoonacular trabajan con productos envasados o recetas pero no con alimentos atómicos al estilo BEDCA. La auditoría externa concluyó que NutriApp necesita tres niveles más uno opcional (Alimento → Receta_Ingrediente → Receta → Plan_Comida_Item, más "esquema flexible" sin alimento concreto). La investigación lo confirma con mucha evidencia.

### 6.2 Crudo vs. cocinado

Es la decisión técnica más relevante del modelo. BEDCA opta por entradas separadas; USDA opta por *yield + retention factors* aplicados al crudo. La aproximación pragmática mixta (alimento crudo canónico + método de cocción a nivel de línea de receta + cálculo al vuelo con USDA + *fallback* a entrada cocinada BEDCA) es la única que combina lo mejor de ambos mundos y sostiene un capítulo de memoria académicamente rico.

### 6.3 Multi-fuente y reconciliación

Cronometer (USDA + NCCDB + internacionales) y Foodzilla (seis BDs nacionales) demuestran que el patrón multi-fuente con normalización es el estándar industrial. Para NutriApp, USDA + BEDCA + Open Food Facts cubren el espectro completo: USDA para alimentos atómicos con yield/retention, BEDCA para productos típicos españoles sin equivalente en USDA, OFF para productos envasados con código de barras. Tabla puente `external_food_mapping(source, external_id, food_id_canonical, confidence)` para reconciliar sin deduplicación destructiva.

### 6.4 Cobertura de micronutrientes clínicos

USDA y BEDCA cubren razonablemente macronutrientes y los principales micros. Hay limitaciones documentadas en hierro hemo vs. no hemo (USDA no diferencia, hay que estimar 40/60 en carne roja según AND/EFSA), yodo (irregular en USDA) y fibra soluble vs. insoluble (no en todos los ítems USDA). NCCDB es la única que cubre 195 nutrientes pero no es accesible para un TFG. La combinación USDA + BEDCA es suficiente para los casos clínicos del bloque 4 de la auditoría externa, con la salvedad de que hay que documentar las limitaciones honestamente.

### 6.5 Modelo de planes: cerrado vs. flexible

La nutricionista clínica de la auditoría externa exige soporte para "esquemas abiertos" del tipo plato de Harvard, además de "menús cerrados" tradicionales. Ningún competidor analizado modela bien los esquemas flexibles — son todos "menú cerrado por día" o "plantillas" con poca flexibilidad. Es una **diferenciación real de NutriApp** y un argumento académico fuerte.

### 6.6 IA: del marketing a la realidad

Nutrium habla de IA pero las reseñas la rebajan a alertas automatizadas. Practice Better solo tiene asistente clínico para charting. Cronometer no genera planes. **Foodzilla es el único competidor con generación IA real, y por su arquitectura (motor de optimización + LLM cosmético) valida la apuesta del TFG**. Los papers académicos (Papastratis 2024, Almanac 2024) refuerzan la decisión de no dejar el plan en manos del LLM.

### 6.7 Compliance regulatorio y trazabilidad

Practice Better (HIPAA) y Cronometer (HIPAA) tienen disciplina alta de auditoría: campos `created_by`, `accessed_by`, RBAC, logging extensivo. Para un TFG europeo, el equivalente es RGPD art. 9 (categoría especial), EIPD obligatoria, DPO, servidores en UE. NutriApp tiene que adoptar el patrón de Practice Better en cuanto a trazabilidad y traducirlo al marco RGPD/CGDN español.

---

## 7. Decisiones cerradas tras la investigación

Las quince decisiones de la auditoría externa quedan **confirmadas en su práctica totalidad**. La investigación añade tres ajustes técnicos y precisa cuatro detalles operativos.

### 7.1 Confirmadas sin cambios respecto a la auditoría

1. **Granularidad: tres niveles + uno opcional** (Alimento → Receta_Ingrediente → Receta → Plan_Comida_Item, más "esquema flexible"). Confirmado por todos los sistemas analizados y por los papers académicos.
2. **Validador clínico determinista no negociable**. Confirmado por Almanac 2024 y MEGA-RAG 2025.
3. **Doble representación del estilo del nutri** (vector + reglas declarativas editables). Confirmado por Zhang et al. 2024 (in-context + retrieval como técnica de primer orden) y por la inferencia arquitectónica sobre Foodzilla.
4. **Carga masiva de planes históricos: descartada**. Confirmado por la inviabilidad operativa documentada y por la ausencia de cualquier competidor que lo haga.
5. **Modelos predictivos: fuera del alcance del TFG**, mencionados como future work.
6. **Stack IA: RAG + solver + LLM + validador**. Confirmado por Foodzilla, Papastratis 2024, Donkor 2023, Almanac 2024.
7. **Multi-tenant con `nutricionista_id` + RLS de PostgreSQL**.
8. **Embeddings con pgvector dimensión 1536**.
9. **Soft-delete + versionado temporal**.
10. **Trazabilidad obligatoria** por plan generado. Confirmado por Almanac 2024.
11. **Compliance: servidores UE, ZDR en LLMs, EIPD, firma digital del nutri obligatoria, posicionamiento NO como "AI nutritionist" sino como "asistente de redacción para profesionales colegiados"**.
12. **Variables clínicas ampliadas** (CIE-10, medicación, bioquímica, ciclo, TCA, contexto vital).
13. **Soporte de "esquema abierto"** además de "menú cerrado".
14. **Evaluación experimental con A/B + nutris reales + IC bootstrap**.
15. **Validación con cinco nutricionistas colegiadas reales**.

### 7.2 Ajustes técnicos derivados de la investigación

16. **Modelado crudo↔cocinado con retention + yield USDA**, no por duplicación de entradas. Cargar las tablas USDA Release 6 (~290 alimentos × 26 nutrientes) y aplicarlas al vuelo con `nutriente_cocinado = nutriente_crudo × retention% / yield%`. *Fallback* a entrada cocinada BEDCA cuando exista.
17. **Capa de guardrails con AESAN INR 2019 y SENC 2016**. Tabla `nutrient_reference(group, sex, age_min, age_max, nutrient_id, value, unit)` cargada del PDF AESAN; tabla `food_group_servings(group_id, frequency_unit, min, max)` cargada de la pirámide SENC. Avisos automáticos cuando el plan se desvía.
18. **Tabla puente `external_food_mapping(source, external_id, food_id_canonical, confidence)`** para reconciliar fuentes sin deduplicación destructiva. Cuando un alimento existe en USDA y BEDCA, marcar el USDA como base y el BEDCA como override regional, exponiendo la fuente al nutricionista.

### 7.3 Detalles operativos precisados

19. **Datasets a cargar concretos**:
    - **USDA SR Legacy completo** (7 793 alimentos, snapshot 2018, estable, dominio público).
    - **USDA Foundation Foods** vía API con cron en abril/octubre.
    - **USDA Tablas de retention y yield** (Release 6 de 2007, descarga PDF y parseo).
    - **BEDCA subset español curado** (200-300 alimentos sin equivalente USDA: aceites de oliva, jamón ibérico, quesos, pescados del Cantábrico, embutidos, legumbres autóctonas), carga manual con cita académica.
    - **Open Food Facts dump Parquet** desde HuggingFace, filtrado inicial `countries_tags=en:spain` con *fallback* al global.
    - **AESAN INR 2019** parseo del PDF a tabla relacional.
    - **SENC 2016** parseo del PDF a tabla relacional.
20. **No cargar Branded Foods de USDA** (más de 368 000 ítems con calidad heterogénea, sin actualizaciones de Label Insight desde noviembre de 2023). Mete ruido y no aporta a un copiloto de prescripción.
21. **Solicitar FatSecret Premier Free** con email universitario @ucm.es. Si lo conceden en plazo, sustituye a Open Food Facts para productos españoles. Si no, OFF cubre el caso.
22. **Adapter por fuente** + entidad `Food` interna canónica. Argumentable como capítulo de memoria (eje académico de la BD).

---

## 8. Plan de la Fase B

La Fase A queda cerrada con este documento. La Fase B (diseño BD v0) se planifica para tres semanas con los siguientes hitos.

**Semana 1**: diagrama ER completo de las 18 tablas + 6-8 catálogos auxiliares (`Nutriente`, `Unidad`, `Alimento_Unidad_Factor`, `Alergeno`, `Alergeno_CrossReactividad`, `nutrient_reference`, `food_group_servings`, `external_food_mapping`). Decisión final de tipos, índices (GIN sobre tsvector para búsqueda de alimentos, HNSW sobre embeddings, BTree sobre claves de búsqueda), constraints (CHECK de exclusión mutua en `Plan_Comida_Item`, CHECK de rangos en `Alimento`), políticas RLS. Documento `bd-diseño-v0.md`.

**Semana 2**: script SQL completo de creación con migrations Alembic. Carga de los seeds: USDA SR Legacy completo, BEDCA subset curado, AESAN INR 2019, SENC 2016. Validación con un compañero del grado o un profesor sobre el modelo (auditor BD interno).

**Semana 3**: validación clínica con un nutricionista colegiado (no Jaime) sobre las variables del cliente, las restricciones soportadas y los guardrails AESAN/SENC. Iteración del modelo según feedback. Cierre de la Fase B con commit del script SQL definitivo y del `bd-diseño-v0.md` actualizado.

Entregables de la Fase B:
- `bd-diseño-v0.md` con diagrama ER, decisiones documentadas, y queries SQL del *test del nutricionista* del bloque 2.1.5 de la auditoría.
- Script SQL `migrations/0001_initial.sql` ejecutable contra Postgres 16 + pgvector + pg_trgm.
- Datasets seed en `data/seeds/` (USDA SR Legacy, BEDCA, AESAN, SENC).
- Acta firmada de la validación clínica del nutricionista colegiado.

### 8.1 Decisión de hosting abierta: Supabase frente a PostgreSQL self-hosted

Antes de arrancar Fase B queda por cerrar una decisión de infraestructura. Las decisiones de la auditoría se mantienen sin tocar (~32 tablas, RLS multi-tenant, pgvector, EAV de nutrientes, retention/yield USDA, INR AESAN como guardrails, etc.) porque Supabase **es PostgreSQL gestionado** — el modelo de datos es portable bit a bit. Lo que está en juego es solo la elección entre auto-hospedar Postgres en un VPS Hetzner o usar el BaaS.

**A favor de Supabase**: auth integrado (ahorro de 2-3 semanas), Storage S3-compatible para PDFs firmados, hosting EU sin DevOps, backups automáticos, tier free generoso, Studio web para defensa.

**En contra**: pausa de proyectos inactivos en tier free tras una semana (gestionable con keep-alive); lock-in moderado en auth si se migrara fuera; tuning fino limitado; vendor risk mitigable porque el core es open-source; argumento académico subjetivo de que un TFG con eje de BD "debería" instalar Postgres a mano (counter-argumento sólido: la complejidad académica está en el modelo y las queries, no en el binario que sirve la BD, y se libera tiempo para la pieza diferencial — el copiloto IA).

**Tabla completa de pros y contras** en `bd-resumen-diseño.md` sección 8. **Recomendación tentativa**: adoptar Supabase para el TFG y dejar registrada la decisión como ADR en la memoria. Pendiente de feedback del revisor externo y de los directores del TFG. La elección no afecta a Fase A ni invalida ninguna de las decisiones de la auditoría — solo cambia tres puntos de Fase B y posteriores: hosting, auth y storage.

---

## 9. Bibliografía consolidada

### Bases de datos oficiales y guías

- BEDCA — *Base Española de Datos de Composición de Alimentos*. https://www.bedca.net/
- AESAN — *Composición de alimentos: BEDCA*. https://www.aesan.gob.es/AECOSAN/web/seguridad_alimentaria/subseccion/composicion_alimentos_BD.htm
- B. Olmedilla-Alonso et al. *Tablas y bases de datos de composición de alimentos españolas*. *Endocrinol Diabetes Nutr*, 2018. https://www.elsevier.es/es-revista-endocrinologia-diabetes-nutricion-13-articulo-tablas-bases-datos-composicion-alimentos-S2530016418301046
- USDA FoodData Central. https://fdc.nal.usda.gov/ y https://fdc.nal.usda.gov/data-documentation/
- USDA — *API Guide*. https://fdc.nal.usda.gov/api-guide/
- USDA — *Table of Nutrient Retention Factors, Release 6* (2007). https://www.ars.usda.gov/ARSUserFiles/80400530/pdf/retn06.pdf
- USDA — *Table of Cooking Yields for Meat and Poultry, Release 2*. https://www.ars.usda.gov/ARSUserFiles/80400535/Data/retn/USDA_CookingYields_MeatPoultry02.pdf
- AESAN — *Ingestas Nutricionales de Referencia (INR) de minerales y vitaminas para la población española* (2019). https://ojs.sanidad.gob.es/index.php/resp/article/view/350
- SENC — *Guías alimentarias para la población española, 2016*. https://scielo.isciii.es/scielo.php?script=sci_arttext&pid=S0212-16112016001400001
- SENC — Tabla de raciones recomendadas (UCM). https://www.ucm.es/data/cont/docs/458-2017-01-29-Raciones-recomendadas-SENC-2016.pdf
- FESNAD — *Ingestas Dietéticas de Referencia para la población española* (2010). https://sennutricion.org/media/Docs_Consenso/4-IDR_Poblaci__n_Espa__ola-FESNAD_2010_C2-IDR.pdf
- K. McKillop et al. *USDA's FoodData Central: what is it and why is it needed today?* AJCN, 2022. https://pubmed.ncbi.nlm.nih.gov/34893796/
- Open Food Facts — API Documentation. https://openfoodfacts.github.io/openfoodfacts-server/api/
- Open Food Facts — Data, API and SDKs. https://world.openfoodfacts.org/data
- Open Food Facts — dataset Parquet en HuggingFace. https://huggingface.co/datasets/openfoodfacts/product-database
- Robotoff — Open Food Facts AI. https://openfoodfacts.github.io/robotoff/

### APIs comerciales

- Edamam Food Database API. https://developer.edamam.com/food-database-api
- Spoonacular Food API Pricing. https://spoonacular.com/food-api/pricing
- Nutritionix API for Business. https://www.nutritionix.com/business/api
- FatSecret Platform API Editions. https://platform.fatsecret.com/api-editions
- FatSecret Platform API overview. https://platform.fatsecret.com/platform-api

### Competidores

- Nutrium. https://nutrium.com/
- Nutrium — Crunchbase. https://www.crunchbase.com/organization/nutrium
- *Portuguese platform Nutrium raised €4.25M*. EU-Startups, 2020. https://www.eu-startups.com/2020/10/portuguese-nutrition-platform-nutrium-raised-e4-25-million-to-continue-its-expansion-across-europe-and-the-us/
- *Nutrium raises €10M to scale corporate nutrition*. Portugal Startup News, 2025. https://portugalstartupnews.com/2025/09/16/nutrium-raises-e10m-to-scale-corporate-nutrition-program-in-u-s/
- Nutrium Review — SelfDecode Labs. https://labs.selfdecode.com/blog/nutrium-review/
- Nutrium Reviews — Capterra. https://www.capterra.com/p/173803/Nutrium/reviews/
- Practice Better. https://practicebetter.io/
- Practice Better Pricing. https://practicebetter.io/pricing
- *Top Features of a HIPAA Compliant Telehealth Platform*. Practice Better blog. https://practicebetter.io/blog/top-features-of-a-hipaa-compliant-telehealth-platform-in-2025
- Practice Better Reviews — Capterra. https://www.capterra.com/p/159263/Better/reviews/
- Practice Better vs NutriAdmin Comparison. https://nutriadmin.com/blog/practicebetter-vs-nutriadmin-comparison/
- Cronometer. https://cronometer.com/
- Cronometer Data Sources. https://support.cronometer.com/hc/en-us/articles/360018239472-Data-Sources
- Foodzilla. https://foodzilla.com/
- *Foodzilla Review 2026*. Promealplan. https://www.promealplan.com/en/blog/foodzilla-review-2026
- Foodzilla Reviews — Capterra. https://www.capterra.com/p/206847/Foodzilla/reviews/

### Papers académicos

- I. Papastratis et al. *AI nutrition recommendation using a deep generative model and ChatGPT*. *Scientific Reports*, vol. 14, art. 14620, 2024. DOI: 10.1038/s41598-024-65438-x.
- Y. Chen et al. *Health-Aware Food Recommendation Based on Knowledge Graph and Multi-Task Learning*. *Foods*, vol. 12, núm. 10, art. 2079, 2023. DOI: 10.3390/foods12102079.
- E. Donkor, J. Otoo y K. Damptey. *A Systematic Review of Linear Programming Techniques as Applied to Diet Optimisation and Opportunities for Improvement*. *Journal of Optimization*, vol. 2023, art. 1271115. DOI: 10.1155/2023/1271115.
- U. Prajapati et al. *Linear Optimization for the Perfect Meal: A Data-Driven Approach to Optimising the Perfect Meal Using Gurobi*. arXiv:2501.04143, 2025.
- C. Zakka et al. *Almanac — Retrieval-Augmented Language Models for Clinical Medicine*. *NEJM AI*, vol. 1, núm. 2, 2024. DOI: 10.1056/AIoa2300068.
- H. Wang et al. *MEGA-RAG: a retrieval-augmented generation framework with multi-evidence guided answer refinement for mitigating hallucinations of LLMs in public health*. *Frontiers in Public Health*, 2025.
- Z. Zhang et al. *Personalization of Large Language Models: A Survey*. arXiv:2411.00027, 2024.

---

*Investigación realizada en junio de 2026, repartida en cuatro bloques temáticos trabajados por separado y con una síntesis posterior. Toda la bibliografía citada es verificable.*
