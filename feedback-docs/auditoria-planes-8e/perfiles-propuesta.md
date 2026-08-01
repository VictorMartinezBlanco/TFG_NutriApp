# Propuesta de perfiles de racion (fase 2 del Bloque 8e)

Borrador asistido para revision POR LOTES de Victor. Cada alimento lleva su
perfil de racion (minimo y maximo de gramos por aparicion en una comida, y
gramos por unidad si se sirve por piezas), su rol si lo tiene (condiment,
sweet) y sus franjas horarias permitidas (sin franjas = todas).

Criterios aplicados al borrador:

- Las cantidades se refieren al estado del catalogo (crudo/seco), igual que
  los nutrientes por 100 g. Ejemplo: 60-120 g de legumbre SECA son un plato
  normal una vez cocida.
- En los alimentos por unidades, el minimo es media pieza salvo excepciones
  (huevo y yogur van de 1 en 1: enteros, sin medias). grams_per_unit es par
  para que las medias unidades caigan en gramos enteros.
- Ningun minimo baja de 10 g, el suelo absoluto historico del modelo que el
  validador sigue auditando; el aceite queda en 10-20 g (una cucharada).
- condiment: nunca puede ir solo en una comida y computa en el tope diario de
  condimentos. Los frutos secos NO llevan el rol a proposito: 30 g de
  almendras como merienda es legitimo (auditoria S4); su sinsentido era la
  cantidad y lo corta el maximo.
- sweet: maximo uno por comida junto con la fruta (regla S6). Solo lo llevan
  los cereales azucarados; la fruta computa por su familia.
- Franjas: lista blanca. La verdura cruda sale de los desayunos (S5), el
  pescado y la carne quedan en comida y cena, el tomate es la unica verdura
  con desayuno (pan con tomate) y zanahoria/pepino admiten franjas de
  tentempie (crudites).

Para corregir un valor: decirlo sobre la tabla; se aplica en app/seed_foods.py
y se recarga con scripts/load_foods.py (idempotente, re-run actualiza).

### Lote 1. Frutas (15)

| Alimento | min g | max g | g/unidad | Rol | Franjas |
|---|---|---|---|---|---|
| Aguacate, crudo | 70 | 140 | 140 | - | todas |
| Arándano, crudo | 50 | 150 | - | - | todas |
| Ciruela, cruda | 60 | 180 | 60 | - | todas |
| Fresa, cruda | 100 | 250 | - | - | todas |
| Kiwi, crudo | 80 | 160 | 80 | - | todas |
| Mango, crudo | 100 | 250 | - | - | todas |
| Manzana, cruda | 75 | 300 | 150 | - | todas |
| Melocotón, crudo | 75 | 300 | 150 | - | todas |
| Melón, crudo | 150 | 300 | - | - | todas |
| Naranja, cruda | 75 | 300 | 150 | - | todas |
| Pera, cruda | 80 | 320 | 160 | - | todas |
| Piña, cruda | 100 | 250 | - | - | todas |
| Plátano, crudo | 60 | 240 | 120 | - | todas |
| Sandía, cruda | 150 | 300 | - | - | todas |
| Uva, cruda | 80 | 200 | - | - | todas |

### Lote 2. Grasas, aceites y frutos secos (9)

| Alimento | min g | max g | g/unidad | Rol | Franjas |
|---|---|---|---|---|---|
| Aceite de girasol | 10 | 20 | - | condiment | todas |
| Aceite de oliva virgen extra | 10 | 20 | - | condiment | todas |
| Aceituna verde | 20 | 60 | - | condiment | todas |
| Almendras, crudas | 15 | 40 | - | - | todas |
| Avellanas | 15 | 40 | - | - | todas |
| Crema de cacahuete | 10 | 40 | - | condiment | todas |
| Nueces | 15 | 40 | - | - | todas |
| Pistachos | 15 | 40 | - | - | todas |
| Semillas de girasol | 10 | 30 | - | - | todas |

### Lote 3. Verduras (19)

| Alimento | min g | max g | g/unidad | Rol | Franjas |
|---|---|---|---|---|---|
| Acelga, cruda | 100 | 250 | - | - | comida, cena |
| Berenjena, cruda | 100 | 250 | - | - | comida, cena |
| Brócoli, crudo | 100 | 250 | - | - | comida, cena |
| Calabacín, crudo | 100 | 250 | - | - | comida, cena |
| Cebolla, cruda | 30 | 100 | - | condiment | comida, cena |
| Champiñón, crudo | 100 | 250 | - | - | comida, cena |
| Coliflor, cruda | 100 | 250 | - | - | comida, cena |
| Espinacas, crudas | 100 | 250 | - | - | comida, cena |
| Espárrago verde, crudo | 100 | 250 | - | - | comida, cena |
| Guisantes, crudos | 100 | 250 | - | - | comida, cena |
| Judía verde, cruda | 100 | 250 | - | - | comida, cena |
| Lechuga, cruda | 30 | 150 | - | - | comida, cena |
| Pepino, crudo | 50 | 200 | - | - | media manana, comida, merienda, cena |
| Pimiento rojo, crudo | 50 | 200 | - | - | comida, cena |
| Puerro, crudo | 50 | 200 | - | - | comida, cena |
| Remolacha, cruda | 50 | 200 | - | - | comida, cena |
| Repollo, crudo | 100 | 250 | - | - | comida, cena |
| Tomate, crudo | 50 | 250 | - | - | desayuno, media manana, comida, merienda, cena |
| Zanahoria, cruda | 50 | 200 | - | - | media manana, comida, merienda, cena |

### Lote 4. Cereales y feculas (17)

| Alimento | min g | max g | g/unidad | Rol | Franjas |
|---|---|---|---|---|---|
| Arroz blanco, crudo | 50 | 120 | - | - | comida, cena |
| Arroz integral, crudo | 50 | 120 | - | - | comida, cena |
| Boniato, crudo | 100 | 300 | - | - | comida, cena |
| Bulgur, crudo | 50 | 100 | - | - | comida, cena |
| Cereales de desayuno azucarados | 30 | 60 | - | sweet | desayuno, media manana, merienda |
| Copos de avena | 30 | 80 | - | - | desayuno, media manana, merienda |
| Cuscús, crudo | 50 | 100 | - | - | comida, cena |
| Maíz dulce, en conserva | 40 | 140 | - | - | comida, cena |
| Mijo, crudo | 40 | 90 | - | - | desayuno, comida, cena |
| Pan blanco de trigo | 30 | 120 | - | - | todas |
| Pan de centeno | 30 | 120 | - | - | todas |
| Pan integral de trigo | 30 | 120 | - | - | todas |
| Pasta de trigo, cruda | 60 | 125 | - | - | comida, cena |
| Pasta integral, cruda | 60 | 125 | - | - | comida, cena |
| Patata, cruda | 100 | 300 | - | - | comida, cena |
| Quinoa, cruda | 50 | 100 | - | - | comida, cena |
| Tortitas de arroz | 15 | 45 | - | - | desayuno, media manana, merienda |

### Lote 5. Legumbres (8)

| Alimento | min g | max g | g/unidad | Rol | Franjas |
|---|---|---|---|---|---|
| Alubia blanca, seca | 60 | 120 | - | - | comida, cena |
| Alubia pinta, seca | 60 | 120 | - | - | comida, cena |
| Edamame | 50 | 150 | - | - | comida, merienda, cena |
| Garbanzos, secos | 60 | 120 | - | - | comida, cena |
| Guisante seco, partido | 60 | 120 | - | - | comida, cena |
| Haba seca | 60 | 120 | - | - | comida, cena |
| Lenteja roja, seca | 60 | 120 | - | - | comida, cena |
| Lentejas, secas | 60 | 120 | - | - | comida, cena |

### Lote 6. Lacteos (12)

| Alimento | min g | max g | g/unidad | Rol | Franjas |
|---|---|---|---|---|---|
| Kéfir | 100 | 250 | - | - | todas |
| Leche de vaca, desnatada | 100 | 300 | - | - | todas |
| Leche de vaca, entera | 100 | 300 | - | - | todas |
| Leche de vaca, semidesnatada | 100 | 300 | - | - | todas |
| Mozzarella | 30 | 125 | - | - | todas |
| Queso azul | 15 | 40 | - | condiment | todas |
| Queso curado | 20 | 60 | - | - | todas |
| Queso de cabra | 20 | 60 | - | - | todas |
| Queso fresco batido desnatado | 100 | 250 | - | - | todas |
| Requesón | 50 | 150 | - | - | todas |
| Yogur griego | 125 | 250 | 125 | - | todas |
| Yogur natural | 125 | 250 | 125 | - | todas |

### Lote 7. Carne, huevo y derivados (9)

| Alimento | min g | max g | g/unidad | Rol | Franjas |
|---|---|---|---|---|---|
| Clara de huevo | 30 | 200 | - | - | desayuno, comida, cena |
| Huevo de gallina, entero | 60 | 180 | 60 | - | todas |
| Jamón cocido | 30 | 120 | - | - | todas |
| Lomo de cerdo, crudo | 100 | 200 | - | - | comida, cena |
| Muslo de pollo, crudo | 100 | 250 | - | - | comida, cena |
| Pechuga de pavo, cruda | 100 | 200 | - | - | comida, cena |
| Pechuga de pollo, cruda | 100 | 200 | - | - | comida, cena |
| Pierna de cordero, cruda | 100 | 250 | - | - | comida, cena |
| Ternera magra, cruda | 100 | 200 | - | - | comida, cena |

### Lote 8. Pescado y marisco (9)

| Alimento | min g | max g | g/unidad | Rol | Franjas |
|---|---|---|---|---|---|
| Atún en conserva al natural | 60 | 120 | 60 | - | media manana, comida, merienda, cena |
| Bacalao, crudo | 100 | 250 | - | - | comida, cena |
| Caballa, cruda | 100 | 200 | - | - | comida, cena |
| Calamar, crudo | 100 | 250 | - | - | comida, cena |
| Gambas, crudas | 60 | 200 | - | - | comida, cena |
| Mejillón, crudo | 60 | 200 | - | - | comida, cena |
| Merluza, cruda | 100 | 250 | - | - | comida, cena |
| Salmón, crudo | 100 | 200 | - | - | comida, cena |
| Sardina en conserva | 40 | 120 | - | - | media manana, comida, merienda, cena |

### Lote 9. Proteina vegetal (2)

| Alimento | min g | max g | g/unidad | Rol | Franjas |
|---|---|---|---|---|---|
| Tempeh | 80 | 200 | - | - | comida, cena |
| Tofu firme | 80 | 200 | - | - | comida, cena |

