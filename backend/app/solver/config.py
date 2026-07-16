"""Constantes y pesos del modelo del solver.

Valores por defecto del modelo formal: dominios, suelos fisiologicos, factores de
actividad, cotas estructurales y pesos del objetivo. Todo aqui para tocarlo en un
solo sitio.
"""

from __future__ import annotations

from dataclasses import dataclass

# gramos por alimento y comida. cota generosa para cualquier ingesta normal.
GRAMS_MAX = 300

# gramos minimos cuando un alimento esta presente en una comida. evita que el
# solver meta alimentos a 1 g solo para cumplir presencia o variedad barata.
MIN_GRAMS_PRESENT = 10

# los nutrientes de food_nutrient vienen con hasta 4 decimales; se escalan a
# enteros multiplicando por esta constante para no meter reales en CP-SAT.
NUTRIENT_SCALE = 10

MAX_ITEMS_PER_MEAL = 4
MIN_DISTINCT_PER_WEEK = 10

# reglas de sentido comun para que los planes tengan logica nutricional y no
# concentren un alimento ni rellenen al azar. son estructurales, se aplican
# siempre, no vienen de diet_constraint.
# veces que un mismo alimento puede aparecer en las comidas de un mismo dia.
MAX_SAME_FOOD_PER_DAY = 2
# alimentos distintos minimos por dia (acotado al tamano del pool).
MIN_DISTINCT_PER_DAY = 4
# tope blando de apariciones de un alimento en todo el plan, por dia de plan.
# 0.6 deja unas 4 apariciones en una semana antes de penalizar el reparto.
MAX_APPEARANCES_PER_DAY_RATIO = 0.6

# suelo calorico absoluto por sexo por debajo del cual una dieta deja de ser
# segura sin supervision.
FLOOR_KCAL = {"F": 1200, "M": 1500, "X": 1200}

# Mifflin-St Jeor x factor de actividad -> gasto total.
ACTIVITY_FACTOR = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}
DEFAULT_ACTIVITY = "sedentary"

# rangos humanos de macronutrientes, duros y estructurales.
PROTEIN_G_PER_KG = (0.8, 2.2)   # gramos de proteina por kg de peso y dia
FAT_MIN_PCT_ENERGY = 15         # grasa minima como % de la energia diaria

# perfil por defecto cuando faltan datos antropometricos.
DEFAULT_WEIGHT_KG = 70.0
DEFAULT_HEIGHT_CM = 170.0
DEFAULT_AGE = 40
DEFAULT_SEX = "F"

# tiempo maximo de resolucion. holgado sobre el target de 5s del diseno; si
# expira con una solucion factible se devuelve esa. el margen alto cubre el
# hardware limitado del hosting gratuito, donde los casos mas pesados (kcal
# exacto + reparto por comida sobre la semana) tardan mas que en local. subido a
# 90s tras ampliar el catalogo a ~58 alimentos: mas variables por comida hacen
# que refinar el objetivo calorico exacto tarde mas en la CPU limitada del free
# tier. los casos mas duros (objetivo calorico exacto combinado con preferencia
# o reparto por comida sobre la semana) rozan los 33s en local y superan los 60s
# en Render; 90s les da margen para bajar del 5% de desviacion.
SOLVE_TIME_LIMIT_S = 90.0

# el solver para al llegar a este gap relativo respecto a la cota inferior. un
# borrador editable no necesita el optimo demostrado; un 2% es de sobra para el
# profesional y evita agotar el tiempo probando optimalidad.
SOLVE_RELATIVE_GAP = 0.02


@dataclass(frozen=True)
class ObjectiveWeights:
    w_kcal: int = 10
    w_protein: int = 8
    w_carb: int = 6
    w_fat: int = 6
    w_prefer: int = 4
    w_no_repeat: int = 5
    w_variety: int = 5
    w_spread: int = 4


DEFAULT_WEIGHTS = ObjectiveWeights()

# codes de nutriente que el modelo usa por nombre.
KCAL_CODE = "energy_kcal"
PROTEIN_CODE = "protein_g"
CARB_CODE = "carb_g"
FAT_CODE = "fat_g"

# kcal por gramo de cada macro, para objetivos porcentuales.
KCAL_PER_G = {PROTEIN_CODE: 4, CARB_CODE: 4, FAT_CODE: 9}
