# Modelo de datos (v0)

Diagrama entidad-relación de las 16 tablas de NutriApp. El SQL de
`0001_initial.sql` se corresponde con este esquema.

Bloques:

- **Catálogos**: nutrient, tag, meal_type, unit (se cargan con el seed).
- **Personas**: nutritionist (ligado a Supabase Auth), client.
- **Alimentos**: food, food_nutrient, food_tag, recipe, recipe_ingredient,
  external_food_mapping.
- **Restricciones**: diet_constraint (el núcleo).
- **Plan**: plan, plan_meal_item.
- **Traza IA**: llm_translation.

```mermaid
erDiagram
    nutrient {
        serial id PK
        text code UK
        text name_es
        text name_en
        text unit_default
        text kind
        smallint tier
        boolean is_computed
    }
    tag {
        serial id PK
        text code UK
        text name_es
        text name_en
        tag_kind kind
        int parent_tag_id FK
    }
    meal_type {
        serial id PK
        text code UK
        text name_es
        text name_en
        smallint default_order
    }
    unit {
        serial id PK
        text code UK
        text name_es
        text name_en
        text system
    }
    nutritionist {
        uuid id PK
        text full_name
        text license_number
        text locale_default
    }
    client {
        serial id PK
        uuid nutritionist_id FK
        text full_name_pseudonym
        char sex
        date birth_date
        numeric height_cm
        numeric weight_kg
        text activity_level
        timestamptz deleted_at
    }
    food {
        serial id PK
        text name_es
        text name_en
        food_source source
        text source_id
        numeric typical_serving_g
        uuid nutritionist_id FK
        timestamptz deleted_at
    }
    food_nutrient {
        int food_id PK,FK
        int nutrient_id PK,FK
        numeric value_per_100g
    }
    food_tag {
        int food_id PK,FK
        int tag_id PK,FK
    }
    recipe {
        serial id PK
        text name_es
        text name_en
        numeric yield_g
        int servings
        uuid nutritionist_id FK
        timestamptz deleted_at
    }
    recipe_ingredient {
        int recipe_id PK,FK
        int food_id PK,FK
        numeric quantity_g
        text cooking_method
    }
    external_food_mapping {
        serial id PK
        food_source source
        text external_id
        int food_id_canonical FK
        numeric confidence
    }
    diet_constraint {
        serial id PK
        constraint_scope scope_type
        int scope_client_id FK
        uuid scope_nutritionist_id FK
        constraint_type type
        int target_food_id FK
        int target_tag_id FK
        int target_nutrient_id FK
        constraint_operator operator
        numeric value
        numeric value2
        int unit_id FK
        jsonb context
        constraint_priority priority
        smallint weight
        constraint_source source
        timestamptz deleted_at
    }
    plan {
        serial id PK
        uuid nutritionist_id FK
        int client_id FK
        date start_date
        int duration_days
        timestamptz approved_at
        uuid signed_by FK
        timestamptz deleted_at
    }
    plan_meal_item {
        serial id PK
        int plan_id FK
        smallint day_num
        int meal_type_id FK
        smallint item_order
        int food_id FK
        int recipe_id FK
        numeric quantity_g
        text description_free
    }
    llm_translation {
        serial id PK
        int plan_id FK
        text input_text
        jsonb output_constraints
        text model
        int tokens_input
        int tokens_output
        numeric cost_eur
        int latency_ms
        uuid created_by FK
    }

    tag ||--o{ tag : "parent_tag_id"
    nutritionist ||--o{ client : ""
    nutritionist ||--o{ food : ""
    nutritionist ||--o{ recipe : ""
    nutritionist ||--o{ plan : ""
    nutritionist ||--o{ llm_translation : ""
    food ||--o{ food_nutrient : ""
    nutrient ||--o{ food_nutrient : ""
    food ||--o{ food_tag : ""
    tag ||--o{ food_tag : ""
    food ||--o{ external_food_mapping : ""
    recipe ||--o{ recipe_ingredient : ""
    food ||--o{ recipe_ingredient : ""
    food ||--o{ diet_constraint : ""
    tag ||--o{ diet_constraint : ""
    nutrient ||--o{ diet_constraint : ""
    unit ||--o{ diet_constraint : ""
    client ||--o{ diet_constraint : ""
    nutritionist ||--o{ diet_constraint : ""
    client ||--o{ plan : ""
    plan ||--o{ plan_meal_item : ""
    meal_type ||--o{ plan_meal_item : ""
    food ||--o{ plan_meal_item : ""
    recipe ||--o{ plan_meal_item : ""
    plan ||--o{ llm_translation : ""
```

## Notas

- `nutritionist.id` es el mismo UUID que el usuario de Supabase Auth.
- `food.nutritionist_id` nulo = alimento del catálogo global; con valor = custom.
- `diet_constraint` tiene dos columnas de dueño (`scope_client_id` int y
  `scope_nutritionist_id` uuid) porque el dueño puede ser un cliente o un nutri,
  y un cliente usa id entero mientras que el nutri usa uuid. Un CHECK obliga a
  rellenar solo la que corresponde al `scope_type`.
- `plan_meal_item`: cada línea es un food, una recipe o texto libre (uno solo).
- Soft-delete (`deleted_at`) en food, recipe, plan, diet_constraint y client.
- La tabla se llama `diet_constraint` y no `constraint` porque esta última es
  palabra reservada en SQL.
