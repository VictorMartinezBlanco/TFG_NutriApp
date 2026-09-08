# Diseño de la base de datos del copiloto NutriApp — resumen para revisión

**Mayo de 2026**

> Documento de trabajo del TFG NutriApp (Víctor Martínez Blanco, Doble Grado Ingeniería Informática + ADE, UCM). Resumen autocontenido del diseño de la base de datos previsto para el copiloto IA de generación de planes nutricionales. Si quieres entrar más a fondo, los dos documentos largos son `auditoria-bd-ia.md` (auditoría con tres perspectivas independientes) y `bd-investigacion.md` (estudio de fuentes oficiales, APIs, competidores y papers académicos).

---

## 1. Contexto en cuatro frases

- **Producto**: NutriApp, copiloto IA per-nutricionista que aprende del estilo clínico del profesional a partir de su uso en consulta y le genera borradores de planes nutricionales que él revisa antes de entregar al cliente.
- **Pipeline**: RAG (planes históricos del propio nutri) + solver de optimización (OR-Tools CP-SAT para reparto kcal/macros) + LLM (Claude Sonnet 4.6 con few-shot personalizado) + validador clínico determinista (alergias, fármaco-nutriente, rangos clínicos por patología). Sin fine-tuning, sin RLHF.
- **Stack persistencia**: PostgreSQL 16 + extensiones `pgvector` (HNSW para retrieval), `pg_trgm` (búsqueda fuzzy de alimentos), `unaccent` (normalización ES). Multi-tenant por nutricionista con Row-Level Security.
- **Cumplimiento**: RGPD art. 9 (datos de salud, categoría especial), servidores UE, LLMs con zero data retention activado, firma digital del nutri obligatoria, posicionamiento como "asistente de redacción para profesionales colegiados" — no como "AI nutritionist" para evitar invasión de profesión sanitaria reservada (Ley 44/2003).

---

## 2. Estructura general — alrededor de 32 tablas

El modelo se reparte en cinco bloques. Para cada tabla indico su función y de quién viene el dato (sistema en la carga inicial, nutricionista durante el uso, o cliente).

### 2.1 Espina dorsal del dominio (8 tablas)

Es el núcleo: alimentos, recetas y planes. Tres niveles de granularidad más uno opcional.


| Tabla               | Función                                                                                                                                                                                                                                          | Origen del dato                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `food`              | Alimento atómico canónico, normalmente en estado crudo o tal cual se compra                                                                                                                                                                      | Sistema (USDA + BEDCA) y nutri (custom) |
| `food_nutrient`     | Composición nutricional en patrón EAV (alimento × nutriente × valor + unidad)                                                                                                                                                                    | Sistema                                 |
| `recipe`            | Receta del nutri o del catálogo seed, con rendimiento (`yield_g`) y raciones                                                                                                                                                                     | Nutri y sistema (catálogo seed)         |
| `recipe_ingredient` | Ingredientes con cantidad, unidad y método de cocción aplicado                                                                                                                                                                                   | Nutri                                   |
| `plan`              | Plan nutricional asignado a un cliente. Incluye `embedding vector(1536)` para retrieval                                                                                                                                                          | Nutri (manual o vía copiloto)           |
| `plan_day`          | Día del plan (1-7)                                                                                                                                                                                                                               | Sistema                                 |
| `plan_meal`         | Comida del día (desayuno, comida, cena, snack)                                                                                                                                                                                                   | Sistema                                 |
| `plan_meal_item`    | Línea de la comida: receta o alimento + cantidad. Soporta también ítem de "esquema flexible" con descripción libre y criterio de macros sin alimento concreto, para los nutricionistas que trabajan con plato de Harvard u otras pautas abiertas | Nutri                                   |


La decisión de fondo es modelar `food` y `recipe` como entidades separadas con un nivel intermedio `recipe_ingredient` para soportar **métodos de cocción a nivel de línea**, no como atributo del alimento. Esto resuelve la pregunta de cómo guardar "pollo crudo" frente a "pollo asado" sin duplicar entradas: el pollo crudo se carga una vez como `food`, y el método de cocción es atributo de `recipe_ingredient`. Las macros del plato cocinado se calculan al vuelo aplicando los *retention factors* y *cooking yields* del USDA (ver sección 4 sobre importación). Si para algún alimento concreto existe entrada cocinada en BEDCA, se usa como *fallback* para mayor precisión.

### 2.2 Entidades de gestión (4 tablas)


| Tabla                | Función                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nutritionist`       | Datos del profesional: número de colegiada, idioma de trabajo (`locale_default`), preferencias                                                                             |
| `client`             | Cliente pseudonimizado (UUID, no DNI), antropometría (peso, altura, % grasa, perímetros), códigos ICD-10 de patologías relevantes, idioma del cliente (`locale_preferred`) |
| `client_restriction` | Tabla unificada de alergias, intolerancias, patologías, preferencias dietéticas y objetivos. Tipo enum + código + severidad + notas                                        |
| `client_biochem`     | Bioquímica clínica longitudinal (HbA1c, ferritina, B12, vit. D, TSH, T4L, lípidos, ácido úrico, creatinina, FG, etc.) con fecha y unidad                                   |


### 2.3 Trazabilidad y feedback IA (3 tablas)


| Tabla                | Función                                                                                                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai_generation`      | Log de cada generación del copiloto: prompt_hash, modelo, tokens, latencia, planes recuperados (FK array a `plan`), reglas activadas, output JSON del solver, resultado del validador. Es el activo de explicabilidad                                 |
| `plan_edit`          | Diff JSONB entre la versión IA inicial del plan y la versión final firmada por el nutri. Es el dataset de retroalimentación                                                                                                                           |
| `nutritionist_style` | Doble representación del estilo clínico del nutri: vector centroide para retrieval blando + documento de reglas declarativas (JSONB) editables por el profesional ("nunca lácteos en cenas", "ratio P/C/G típico 30/40/30 en pérdida de grasa", etc.) |


### 2.4 Compliance y auditoría (3 tablas)


| Tabla        | Función                                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `consent`    | Consentimientos RGPD del cliente: uso de IA, almacenamiento, compartir con LLM externo. Versionado                                                 |
| `audit_log`  | Acceso y modificación de PHI (`created_by`, `accessed_by`, `action`, `timestamp`, `entity_type`, `entity_id`). Patrón inspirado en Practice Better |
| `attachment` | PDFs firmados digitalmente por el nutri y entregados al cliente (con membrete, número colegiada y firma)                                           |


### 2.5 Catálogos auxiliares (14 tablas)

Soportan el dominio. Se cargan en el seed inicial.


| Tabla                                      | Contenido                                                                                                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nutrient` + `nutrient_locale`             | Aproximadamente 60 nutrientes (energía, macros, fibra, 13 vitaminas, 9 minerales, índice glucémico, sodio, potasio, fósforo). Bilingüe                                                       |
| `unit` + `unit_locale`                     | Gramos, mililitros, taza, cucharada, ración, pieza. Bilingüe                                                                                                                                 |
| `food_unit_factor`                         | Factor a gramos por (alimento, unidad). "Una manzana mediana = 180 g"                                                                                                                        |
| `food_group` + `food_group_locale`         | Grupos de alimentos (lácteos, cereales, legumbres, etc.). Bilingüe                                                                                                                           |
| `cooking_method` + `cooking_method_locale` | Métodos de cocción (crudo, hervido, asado, frito, plancha, vapor, microondas). Bilingüe                                                                                                      |
| `nutrient_retention`                       | USDA *Table of Nutrient Retention Factors, Release 6* (2007): retention% por (alimento_o_grupo × método × nutriente)                                                                         |
| `cooking_yield`                            | USDA *Table of Cooking Yields*: rendimiento de cocción por (alimento × método)                                                                                                               |
| `allergen` + `allergen_locale`             | 14 alérgenos UE oficiales más algunos extendidos. Bilingüe                                                                                                                                   |
| `allergen_cross_reactivity`                | Cross-reactividad (látex↔aguacate, abedul↔manzana, ácaros↔marisco, etc.)                                                                                                                     |
| `nutrient_reference`                       | INR AESAN 2019 estructuradas: (sexo × edad × nutriente → valor)                                                                                                                              |
| `food_group_servings`                      | Pirámide SENC 2016: (grupo × frecuencia min/max). Para emitir avisos automáticos cuando un plan se aleja de las recomendaciones                                                              |
| `external_food_mapping`                    | Tabla puente para reconciliar fuentes: (`source`, `external_id`, `food_id_canonical`, `confidence`). Permite tener un alimento canónico al que apuntan a la vez USDA, BEDCA y OFF            |
| `pathology` + `pathology_locale`           | Patologías con código CIE-10 y restricciones nutricionales asociadas (ERC: limitar K/P; HTA: limitar sodio; DM2: limitar IG; etc.). Bilingüe                                                 |
| `medication` + `medication_locale`         | Catálogo de medicamentos comunes con interacciones nutriente conocidas (anticoagulantes ↔ vitamina K; metformina ↔ B12; IBP ↔ B12, hierro, magnesio; levotiroxina ↔ calcio/hierro). Bilingüe |


Total: **alrededor de 32 tablas** entre dominio y catálogos. Es un número grande pero **bien justificado** académicamente para un TFG con eje "Ampliación de bases de datos": Row-Level Security multi-tenant, EAV controlado para micros, versionado temporal con `valid_from`/`valid_to`, exclusión mutua con `CHECK` en `plan_meal_item` (FK a receta o a alimento, no ambas), índices parciales por nutricionista, índice GIN sobre `tsvector` para búsqueda de alimentos, índice HNSW sobre embeddings, soft-delete obligatorio en `food`, `recipe`, `plan` para preservar trazabilidad clínica.

---

## 3. Resumen del esquema en una vista

```
                  CATÁLOGOS                    DOMINIO
              (bilingües, seed)         (multi-tenant por nutri)

     nutrient ─────────┐              ┌─── nutritionist ─── nutritionist_style
     unit              │              │           │
     food_group        ├── food ──────┤           ├── client ── client_restriction
     cooking_method    │   food_nutr  │           │       └── client_biochem
     allergen          │   external_  │           │
     pathology         │   mapping    │           ├── recipe ─── recipe_ingredient
     medication        │              │           │              (con cooking_method)
     nutrient_retention│              │           │
     cooking_yield     │              │           └── plan ── plan_day ── plan_meal
     nutrient_reference│              │                                    └── plan_meal_item
     food_group_servings              │                                          (ítem libre o → recipe / food)
                                      │
                                      │              ai_generation
                                      │              plan_edit
                                      │              audit_log
                                      │              consent
                                      │              attachment
```

---

## 4. Importación de datos por fuente


| Fuente                                       | Qué se importa                                                                                                                                                                                 | Cómo                                                                                             | Cuándo                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| **USDA SR Legacy**                           | 7 793 alimentos atómicos completos, snapshot 2018, dominio público (CC0)                                                                                                                       | Descarga CSV/JSON desde fdc.nal.usda.gov, script Python con `COPY` directo a Postgres            | Una vez en setup                         |
| **USDA Foundation Foods**                    | Alimentos con muestras y metadatos                                                                                                                                                             | API REST con API key gratuita                                                                    | Cron cada 6 meses (abril/octubre)        |
| **USDA Retention Factors (Release 6, 2007)** | ~290 alimentos × 24 nutrientes con factor de retención por método de cocción                                                                                                                   | Descarga PDF, parseo con Tabula/Camelot a CSV, import a `nutrient_retention`                     | Una vez                                  |
| **USDA Cooking Yields (Release 2)**          | Rendimiento de cocción por alimento × método                                                                                                                                                   | Idem, a `cooking_yield`                                                                          | Una vez                                  |
| **BEDCA subset**                             | 200-300 alimentos típicos españoles sin equivalente USDA: aceite oliva virgen extra, jamón ibérico, manchego DOP, sardinas, garbanzos secos, lentejas pardinas, etc.                           | Carga manual desde web BEDCA + script Python con `psycopg2`. Cita académica                      | Una vez                                  |
| **Open Food Facts**                          | Productos envasados con código de barras de España (decenas de miles)                                                                                                                          | Dump Parquet desde HuggingFace, filtrado `countries_tags=en:spain` con DuckDB, import a Postgres | Una vez + refresh trimestral si interesa |
| **AESAN INR 2019**                           | Ingestas Nutricionales de Referencia (sexo × edad × nutriente)                                                                                                                                 | Parseo PDF → CSV → tabla `nutrient_reference`                                                    | Una vez                                  |
| **SENC 2016**                                | Pirámide de la Alimentación Saludable, raciones por grupo y frecuencia                                                                                                                         | Parseo PDF → CSV → tabla `food_group_servings`                                                   | Una vez                                  |
| **FatSecret Premier Free** (si lo conceden)  | BD comercial española con marcas locales y NLP castellano nativo                                                                                                                               | API REST con verificación email UCM. Sync incremental                                            | Continuo en producción                   |
| **CIE-10**                                   | Subset de clase E (endocrino, metabólicas), K (digestivas), N (renales), F50 (TCA)                                                                                                             | Catálogo oficial OMS + curado manual con un nutri                                                | Una vez                                  |
| **Vademécum subset**                         | Medicamentos comunes con interacciones nutrientes                                                                                                                                              | Curado manual con un nutri                                                                       | Una vez                                  |
| **Catálogos auxiliares**                     | Nutrientes, unidades, métodos de cocción, alérgenos, grupos                                                                                                                                    | Seeds en `data/seeds/*.yaml`                                                                     | Una vez                                  |
| **Planes seed (cold start)**                 | 20-30 planes patrón cubriendo 8 perfiles (pérdida peso, hipertrofia, mantenimiento, DM2, embarazo, vegetariano, deportivo, mayores). Marcados como "plantillas educativas, no consejo clínico" | Curados con un nutri colegiado                                                                   | Una vez                                  |
| **Cuestionario de estilo del nutri**         | 12 preguntas obligatorias + 30 extendidas para el onboarding del profesional, sustituye a la "carga masiva de planes históricos" que la auditoría descartó por inviable                        | Co-diseño con un nutri colegiado. YAML                                                           | Una vez                                  |


**Orden de carga obligatorio** (por las foreign keys):

1. Catálogos auxiliares (`nutrient`, `unit`, `food_group`, `cooking_method`, `allergen`, `pathology`, `medication`).
2. USDA SR Legacy (alimenta `food` + `food_nutrient`).
3. USDA retention/yield (apuntan a alimentos USDA ya cargados).
4. BEDCA subset (`food` + `food_nutrient` + `external_food_mapping`).
5. Open Food Facts (`food` + `food_nutrient` + `external_food_mapping`).
6. AESAN INR + SENC (`nutrient_reference` + `food_group_servings`).
7. Cuestionario y planes seed.

Todo orquestado con **Alembic** (migrations) y **scripts Python idempotentes** en `data/seeds/`. Reproducible: `make seed` levanta una BD limpia idéntica en cualquier máquina, lo cual es un argumento académico defendible (reproducibilidad de la investigación).

---

## 5. Estrategia bilingüe ES/EN

Hay tres tipos de contenido y se tratan por separado.

### 5.1 Catálogos del sistema — bilingüe forzado, oficial

Patrón estándar de tablas de traducción:

```sql
CREATE TABLE nutrient (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL  -- ej: "VITD", "FE", "PROT"
);

CREATE TABLE nutrient_locale (
  nutrient_id INT REFERENCES nutrient(id) ON DELETE CASCADE,
  locale CHAR(2) NOT NULL,  -- 'es' | 'en'
  name VARCHAR(120) NOT NULL,
  description TEXT,
  PRIMARY KEY (nutrient_id, locale)
);
```

Mismo patrón para `unit_locale`, `food_group_locale`, `cooking_method_locale`, `allergen_locale`, `pathology_locale`, `medication_locale`. Carga obligatoria en ambos idiomas en el seed con curación manual u oficial. Los 14 alérgenos UE tienen nombre normativo en cada idioma de la unión, así que ahí no hay ambigüedad.

### 5.2 Alimentos importados — bilingüe asistido por origen

Cada alimento tiene un nombre original en su idioma de origen más una traducción al otro idioma:

```sql
CREATE TABLE food_locale (
  food_id INT REFERENCES food(id) ON DELETE CASCADE,
  locale CHAR(2) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  source VARCHAR(20) NOT NULL,  -- 'original' | 'translated_llm' | 'translated_manual'
  PRIMARY KEY (food_id, locale)
);
```

Estrategia por fuente:

- **USDA**: original en EN. ES se genera con LLM (`gpt-4o-mini` o equivalente), prompt con contexto nutricional ("chicken breast, raw" → "pechuga de pollo, cruda"). Coste estimado para los 7 793 alimentos: alrededor de 5 €. Post-edición manual del nutri opcional, marcando `source = 'translated_manual'`.
- **BEDCA**: original en ES. EN se genera con LLM. Coste insignificante (200-300 alimentos).
- **Open Food Facts**: ya es multi-idioma nativo. Se cargan directamente `product_name_es` y `product_name_en` cuando existen; si solo está uno disponible, se traduce el otro con LLM.
- **Alimentos custom del nutri**: en su idioma de trabajo, sin traducción automática.

### 5.3 Contenido del usuario — en su idioma, sin traducción automática

- **Recetas custom del nutri**: en su idioma de trabajo (configurable en su perfil). No hay traducción automática porque la receta es propiedad intelectual del profesional.
- **Planes para clientes**: se generan en el idioma preferido del cliente (configurable en su ficha). Si el nutri trabaja en ES y el cliente quiere EN, el sistema usa los `name` EN de los alimentos del catálogo al exportar el plan.
- **Notas privadas del nutri**: idioma libre.

### 5.4 Resolución de idioma con `COALESCE` y *fallback*

Patrón habitual en cada query que pinte un alimento:

```sql
SELECT
  f.id,
  COALESCE(loc_pref.name, loc_en.name, loc_orig.name) AS name
FROM food f
LEFT JOIN food_locale loc_pref ON f.id = loc_pref.food_id
                              AND loc_pref.locale = $1   -- idioma del nutri
LEFT JOIN food_locale loc_en   ON f.id = loc_en.food_id
                              AND loc_en.locale = 'en'
LEFT JOIN food_locale loc_orig ON f.id = loc_orig.food_id
                              AND loc_orig.source = 'original'
WHERE f.deleted_at IS NULL;
```

Índice compuesto `(food_id, locale)` y caché en aplicación para evitar el coste del *join* en lecturas calientes.

### 5.5 Por qué tabla de traducciones y no columnas duplicadas


| Aspecto                                        | Columnas `name_es`, `name_en` | Tabla `food_locale`         |
| ---------------------------------------------- | ----------------------------- | --------------------------- |
| Añadir un idioma nuevo                         | Migration con `ALTER TABLE`   | Solo `INSERT`s              |
| Trackear procedencia (original / LLM / manual) | Columna extra por idioma      | Atributo natural de la fila |
| Coste de lectura                               | 0 *joins*                     | 1 *join* indexado           |
| Coste de escritura                             | Bajo                          | Bajo                        |
| Argumento académico                            | Pobre                         | Estándar i18n, defendible   |


La penalización del *join* en lectura es asumible y queda compensada por la flexibilidad. Es además un capítulo natural en la memoria del TFG sobre internacionalización en bases de datos.

---

## 6. Cosas no triviales que conviene revisar

Algunas decisiones que pueden ser controvertidas o donde una segunda opinión externa aporta:

1. **Patrón EAV para nutrientes** (`food_nutrient` con filas alimento × nutriente × valor) frente a columnas planas (60 columnas en `food` directamente). El EAV se eligió por flexibilidad (añadir un nutriente nuevo sin migration y manejar fuentes con coberturas distintas) y porque `food_nutrient` se filtra y se agrega constantemente. ¿Sería mejor un híbrido (10-12 columnas planas para macros + EAV para micros)?
2. **Cálculo de macros cocinadas al vuelo con USDA retention/yield** frente a duplicar entradas crudo/cocinado al estilo BEDCA. El cálculo al vuelo es más elegante pero implica tener que aplicar las fórmulas en cada lectura; la duplicación es más rápida pero infla el catálogo y obliga a sincronización manual cuando USDA actualiza un valor crudo. La elección actual es **mixta**: cálculo al vuelo por defecto con *fallback* a entrada cocinada explícita en BEDCA cuando exista. ¿Es la decisión correcta?
3. **Soporte de "esquema flexible"** en `plan_meal_item` (con `description` libre y `macros_criteria` JSONB sin alimento concreto). Es una concesión a los nutricionistas que trabajan con plato de Harvard u otras pautas abiertas. Implica que el solver tiene que tolerar ítems sin alimento durante el reparto kcal/macros. ¿Cómo se modela el solver para que respete los ítems flexibles sin colapsar?
4. **Multi-tenant por Row-Level Security en una sola BD** frente a *schema per tenant* o BD por tenant. Una sola BD con RLS es operativamente la opción simple y suficiente para un TFG; *schema per tenant* es más aislado pero impide queries cross-tenant del propio sistema (analítica del operador). ¿Hay alguna razón que se me escape para preferir uno u otro a esta escala?
5. **Tabla puente `external_food_mapping*`* en lugar de deduplicación destructiva. Permite que un mismo "huevo" tenga apuntando a la vez su entrada USDA y la BEDCA, y que el nutri vea cuál es la fuente. ¿Sería mejor deduplicar y mantener un único `food` con `source` enum? El argumento a favor de la tabla puente es que un día USDA y BEDCA pueden discrepar en macros y el sistema necesita tener ambos para auditarlo.
6. **Tabla de traducciones para todo lo que es "diccionario" del sistema** (nutrientes, unidades, alérgenos, etc.). Patrón estándar i18n pero con coste de *joins*. ¿Hay patrones más modernos (JSONB con clave por idioma) que valgan más la pena?
7. `**audit_log` con copia íntegra del estado anterior frente a delta**. La copia íntegra es trivial de revertir y de auditar; el delta es eficiente en almacenamiento pero exige replay para reconstruir un estado pasado. Para datos de salud (RGPD art. 9 + colegial), la copia íntegra parece más defensiva. ¿Excesivo?
8. **Precarga de planes seed como "plantillas educativas, no consejo clínico"** para resolver el cold start del sistema. La auditoría externa de la nutricionista colegiada lo veía con riesgo legal alto si no estaba auditada. La mitigación propuesta es curar los 20-30 planes con un nutri colegiado real, marcarlos como educativos y exigir una validación clínica firmada antes de exponerlos. ¿Es razonable o estoy minimizando el riesgo?

---

## 7. Lo que ya está cerrado y no es discusión

Para no perder tiempo en lo que ya está decidido tras una auditoría con tres perspectivas independientes (un arquitecto/a de BD, un ingeniero/a de IA y una nutricionista clínica colegiada):

- **Stack Postgres 16 + pgvector + pg_trgm**, con RLS multi-tenant.
- **Pipeline RAG + solver + LLM + validador determinista**. Sin fine-tuning, sin RLHF.
- **Cuestionario de estilo del nutri en lugar de carga masiva de planes históricos** (operativamente inviable y bloqueado por RGPD).
- **Modelos predictivos: future work**, no producción en TFG.
- **Doble representación del estilo**: vector centroide + reglas declarativas editables.
- **Validador clínico hard-fail**: alergias, prohibidos, rangos macros, fármaco-nutriente, restricciones por patología.
- **Posicionamiento legal**: "asistente de redacción para profesionales colegiados", no "AI nutritionist".

Si tu opinión sobre alguno de estos también difiere mucho, dímelo igualmente — pero con argumento, porque ya pasaron auditoría.

---

## 8. Decisión de hosting abierta: Supabase frente a PostgreSQL self-hosted

Tras cerrar la auditoría externa quedó una decisión de infraestructura todavía sin resolver y que conviene revisar antes de empezar Fase B porque condiciona la operativa del proyecto. Es elegir entre **PostgreSQL auto-hospedado** (típicamente en un VPS Hetzner en Alemania) o **Supabase**, que es PostgreSQL gestionado con servicios alrededor (auth, storage, API autogenerada, Studio web).

### 8.1 Lo que NO cambia con Supabase

Esto es lo importante de entender primero. Supabase es PostgreSQL puro por debajo, así que **el modelo de datos no cambia ni una sola tabla**. En particular, todo esto se preserva idéntico:

- Las ~32 tablas, con sus tipos, foreign keys, CHECKs, triggers, índices y políticas RLS.
- Las extensiones `pgvector` (HNSW para retrieval), `pg_trgm` (búsqueda fuzzy), `unaccent` (normalización ES) están preinstaladas.
- El esquema EAV de `food_nutrient`, el versionado temporal de `food` y `recipe`, la exclusión mutua con CHECK en `plan_meal_item`, la tabla puente `external_food_mapping`, el patrón i18n con tablas `*_locale`.
- La importación de USDA SR Legacy, BEDCA, Open Food Facts, AESAN INR 2019 y SENC 2016 se hace exactamente igual (`COPY` directo a Postgres con scripts Python). Las migraciones con Alembic siguen funcionando.
- El pipeline IA del copiloto (RAG + solver OR-Tools + LLM + validador) corre en un backend Python/FastAPI separado que se conecta al Postgres de Supabase como a cualquier Postgres con `psycopg2` o `asyncpg`.
- Las queries SQL del *test del nutricionista* y todas las consultas académicas defendibles del bloque 2.1.5 de la auditoría son idénticas.
- El argumento académico de "ampliación de bases de datos" se mantiene intacto: RLS multi-tenant, pgvector con HNSW, EAV controlado, versionado, índices parciales, GIN sobre tsvector, JSONB para diffs.

### 8.2 Lo que sí ganas con Supabase

1. **Auth resuelto**. Tabla `auth.users` integrada con JWT y políticas RLS basadas en `auth.uid()`. Tu tabla `nutritionist` pasa a ser un perfil que referencia `auth.users(id)`. Te ahorras 2-3 semanas de implementar bcrypt + email confirmation + reset password + sesiones + rate limiting.
2. **RLS más natural**. Las policies se escriben con `auth.uid() = nutritionist_id`, que es el patrón estándar Supabase, y la documentación es muy buena. Cualquier código de cliente que llegue con un JWT de la auth se filtra automáticamente al tenant correcto.
3. **Storage S3-compatible integrado**. Para los PDFs firmados que el nutri entrega al cliente y, si en el futuro recuperáramos las fotos de progreso, se sube a Supabase Storage sin tener que configurar S3 ni MinIO.
4. **Hosting EU sin esfuerzo**. Frankfurt o Dublín, RGPD y AEPD cubiertos. Cero DevOps de infraestructura.
5. **Backups automáticos diarios** con retención de 7 días en el plan gratuito y 14 días en Pro.
6. **Tier free generoso para TFG**: 500 MB de BD, 5 GB de Storage, 50 K MAU de auth, 2 GB de bandwidth. Sobra holgadamente para la demo y los tests con 5 nutris reales.
7. **Studio web**. UI moderna tipo phpMyAdmin que permite enseñar el modelo en la defensa (esquema, datos, RLS, queries SQL ad-hoc) sin tener que abrir DBeaver o pgAdmin.

### 8.3 Lo que Supabase NO resuelve (sigue siendo trabajo propio)

Esto es importante porque a veces se piensa que Supabase reemplaza al backend, y no es así para un sistema con lógica IA:

- **Pipeline RAG, solver OR-Tools, llamadas al LLM, validador clínico determinista, extracción de reglas declarativas, auto-repair loop**: todo eso vive en un **backend Python (FastAPI) separado**. Supabase no lo cubre.
- Las **Edge Functions** de Supabase (Deno, timeout de 30 s en free, 150 s en Pro) podrían ejecutar trozos pequeños pero **no son suficientes para el pipeline completo**, que con auto-repair y solver puede tardar 60-90 s.
- La **API auto-generada** por PostgREST está bien para CRUD trivial pero choca con el patrón "asistente de redacción" donde quieres lógica antes y después de escribir. La decisión razonable es **ignorar PostgREST** y exponer el dominio a través del FastAPI propio.

### 8.4 Desventajas reales (las honestas para los profesores)

| Desventaja | Magnitud | Aplica al TFG | Mitigación |
|---|---|---|---|
| **Lock-in en auth**: si migras fuera, hay que reescribir el sistema de login | Moderada | Bajo (TFG no migrará) | El esquema BD es 100 % portable con `pg_dump` |
| **Pausa de proyectos inactivos en tier free** tras una semana sin actividad: tarda 1-2 minutos en re-arrancar | Importante | Sí (defensa) | Hacer un `SELECT 1` programado cada 3-4 días o subir a Pro durante la semana de la defensa |
| **Tuning fino limitado**: no tienes acceso a `postgresql.conf` ni puedes cambiar `work_mem`, `shared_buffers`, etc. | Baja | Bajo (TFG no necesita tuning extremo) | Si pasara a producción a escala, migrar a self-hosted con `pg_dump` |
| **Solo extensiones aprobadas**: no puedes instalar cualquier extensión Postgres | Baja | Ninguno (las que necesitamos están todas) | — |
| **Vendor risk**: Supabase es startup, podría ser adquirida o cerrar | Moderada | Bajo (Supabase es open-source y self-hosteable) | El core es open-source. Si la empresa cerrara, se puede migrar a Supabase self-hosted o a Postgres puro |
| **Coste a escala**: tier Pro empieza en 25 USD/mes, Team en 599 USD/mes | Alta a largo plazo | Ninguno (tier free sobra para TFG y demo) | A escala se compara coste con un VPS Hetzner + DevOps. Decisión de producto, no académica |
| **Latencia desde Madrid**: 30-50 ms a Frankfurt | Despreciable | Ninguno | — |
| **Connection pooling con límites**: en free hay 60 conexiones directas + Supavisor (pooler) | Baja | Ninguno (TFG no exige más) | Usar `asyncpg` con pool propio + Supavisor |
| **Logs y observabilidad limitados en free**: solo accesibles desde Studio | Baja | Bajo | Pro incluye logs completos. Para evaluación experimental basta con logging del backend FastAPI |
| **Defensa académica del BaaS**: hay quien argumentaría que en un TFG con eje de BD se debería montar Postgres a mano para "demostrar" | Subjetiva | Posible | Defensa en memoria como ADR: la elección de BaaS libera 4-6 semanas de auth y operaciones para invertir en el copiloto IA, que es el diferencial. La complejidad académica de la BD se demuestra igual con el modelo, los índices, las queries y RLS — no por instalar Postgres a pelo |

**Resumen honesto**: las desventajas reales que afectan al TFG son la **pausa en tier free** (gestionable manualmente) y la **defensa académica del BaaS** (gestionable con un ADR sólido). Las otras o no aplican o tienen mitigación trivial.

### 8.5 Ajustes concretos al plan

Si aceptamos Supabase, el plan queda igual salvo por estos tres puntos puntuales:

1. **Hosting**: ya no Hetzner Postgres self-hosted, sino Supabase con proyecto en Frankfurt y plan free durante el desarrollo, posiblemente Pro la semana de la defensa para evitar pausas.
2. **Auth**: la tabla `nutritionist` (y por extensión `client`, aunque éste es pseudónimo) referencia a `auth.users(id)` de Supabase en lugar de implementar login propio con bcrypt y JWT manuales. RLS policies usan `auth.uid()`.
3. **Storage**: PDFs firmados, attachments y eventuales fotos de progreso a Supabase Storage en lugar de bucket propio. Tabla `attachment` cambia para guardar la URL del Storage de Supabase en lugar del path del bucket S3.

Todo lo demás del plan no se toca.

### 8.6 Recomendación

**Adoptar Supabase para el TFG**. Las desventajas reales son menores y todas mitigables, y los beneficios (ahorro de tiempo en auth y operaciones, hosting EU listo, Storage integrado, Studio para la defensa) son sustantivos. El argumento académico se mantiene porque toda la complejidad de "ampliación de bases de datos" está en el modelo, no en el binario que sirve la BD.

La decisión de fondo a defender ante el tribunal: **se elige Supabase para concentrar el esfuerzo del TFG en la pieza diferencial (el copiloto IA) y delegar a un BaaS estable y open-source-friendly los componentes accesorios (auth, storage, hosting), sin perder ni una sola decisión de modelo de datos**.

---

## 9. Lo que viene después

Tras este resumen, el siguiente entregable del TFG es el documento **`bd-diseño-v0.md`** con el diagrama ER completo, el script SQL de creación (Alembic 0001), las queries SQL del *test del nutricionista* (las consultas que el modelo tiene que poder responder con SQL puro, como "planes de pérdida de peso para mujeres entre 45 y 60 años con menopausia de este nutricionista") y la validación con un nutri colegiado distinto al primero. Tres semanas de trabajo previstas.

Cualquier crítica antes de cerrar la Fase B se incorpora antes del diagrama ER. Después se vuelve más caro cambiar.

Gracias por leer y por el rato.