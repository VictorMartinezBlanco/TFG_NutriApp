// Helpers para la lista y la ficha de planes. Solo lectura.
// El estado del plan se deriva de approved_at: no hay columna status en v0.

export type PlanStatus = "signed" | "draft";

export function planStatus(approvedAt: string | null): PlanStatus {
  return approvedAt ? "signed" : "draft";
}

export function planStatusLabel(status: PlanStatus): string {
  return status === "signed" ? "Signed" : "Draft";
}

const MEAL_TYPE_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  mid_morning: "Mid-morning",
  lunch: "Lunch",
  snack: "Afternoon snack",
  dinner: "Dinner",
  late_snack: "Late snack",
};

export function mealTypeLabel(code: string, fallback: string): string {
  return MEAL_TYPE_LABEL[code] ?? fallback;
}

// Fila plana tal como llega de plan_meal_item con sus joins embebidos. El food
// puede traer sus nutrientes por 100 g cuando la consulta pide el join, para
// agregar los macros del plan.
export type MealItemFoodNutrient = {
  value_per_100g: number;
  nutrient: { code: string } | null;
};

export type MealItemRow = {
  id: number;
  day_num: number;
  item_order: number;
  quantity_g: number | null;
  description_free: string | null;
  meal_type: { code: string; name_en: string; default_order: number } | null;
  food: { name_en: string; food_nutrient?: MealItemFoodNutrient[] } | null;
};

export type PlanMeal = {
  code: string;
  label: string;
  order: number;
  items: MealItemRow[];
};

export type PlanDay = {
  dayNum: number;
  meals: PlanMeal[];
};

// Agrupa los items por dia y, dentro de cada dia, por comida. Ordena las comidas
// por el default_order del meal_type y los items por item_order.
export function groupItemsByDay(items: MealItemRow[]): PlanDay[] {
  const byDay = new Map<number, Map<string, PlanMeal>>();

  for (const item of items) {
    const code = item.meal_type?.code ?? "unknown";
    const meals = byDay.get(item.day_num) ?? new Map<string, PlanMeal>();
    const meal =
      meals.get(code) ??
      ({
        code,
        label: mealTypeLabel(code, item.meal_type?.name_en ?? code),
        order: item.meal_type?.default_order ?? 99,
        items: [],
      } satisfies PlanMeal);
    meal.items.push(item);
    meals.set(code, meal);
    byDay.set(item.day_num, meals);
  }

  return Array.from(byDay.keys())
    .sort((a, b) => a - b)
    .map((dayNum) => {
      const meals = Array.from(byDay.get(dayNum)!.values()).sort(
        (a, b) => a.order - b.order
      );
      for (const meal of meals) {
        meal.items.sort((a, b) => a.item_order - b.item_order);
      }
      return { dayNum, meals };
    });
}

// Texto de un item: el alimento con sus gramos, o el texto libre del plan flexible.
export function mealItemText(item: MealItemRow): string {
  if (item.food) {
    return item.quantity_g != null
      ? `${item.food.name_en}, ${item.quantity_g} g`
      : item.food.name_en;
  }
  return item.description_free ?? "Item";
}

// Fecha del dia n contando desde start_date (dia 1 = start_date).
export function dayLabel(startDate: string, dayNum: number): string {
  const d = new Date(startDate);
  if (Number.isNaN(d.getTime())) return `Day ${dayNum}`;
  d.setDate(d.getDate() + dayNum - 1);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Dias transcurridos desde una fecha en formato YYYY-MM-DD hasta hoy, contando
// por dia natural. Se compara sobre el mismo eje (dia del calendario) para que
// el desplazamiento horario no mueva de dia el plan.
const MS_PER_DAY = 86_400_000;

function calendarDay(iso: string): number | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

function calendarDayOf(date: Date): number {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY
  );
}

// Dia del plan que le toca a una fecha, o null si cae fuera del rango.
export function planDayNumFor(
  startDate: string,
  durationDays: number,
  on: Date
): number | null {
  const start = calendarDay(startDate);
  if (start === null) return null;
  const offset = calendarDayOf(on) - start;
  return offset >= 0 && offset < durationDays ? offset + 1 : null;
}

// Plan en curso del cliente: el que cubre la fecha dada, y si ninguno la cubre,
// el mas reciente por fecha de inicio.
export function pickActivePlan<
  T extends { start_date: string; duration_days: number }
>(plans: T[], on: Date): T | null {
  if (plans.length === 0) return null;
  const covering = plans.find(
    (p) => planDayNumFor(p.start_date, p.duration_days, on) !== null
  );
  if (covering) return covering;
  return [...plans].sort((a, b) =>
    a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0
  )[0];
}

export function planDateRange(startDate: string, durationDays: number): string {
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start);
  end.setDate(end.getDate() + durationDays - 1);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(start)} - ${fmt(end)}`;
}

// Macros agregados de un plan como media diaria, sin comparar contra nada. El
// chequeo contra las restricciones del cliente es cosa del validador clinico.
export type PlanMacros = {
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  // dias entre los que se reparte la suma (la duracion declarada del plan).
  days: number;
  // items con comida y gramos que si contaron.
  countedItems: number;
  // items sin datos nutricionales (texto libre, sin gramos, o food sin macros).
  skippedItems: number;
};

// Los cuatro macros core de food_nutrient (mismos codes que CORE_MACRO_CODES).
const MACRO_FIELD: Record<string, keyof Pick<PlanMacros, "kcal" | "protein" | "carb" | "fat">> = {
  energy_kcal: "kcal",
  protein_g: "protein",
  carb_g: "carb",
  fat_g: "fat",
};

// Lo minimo que necesita el agregado de macros: gramos, dia y el food con sus
// nutrientes. Encaja tanto con MealItemRow como con el select recortado de la
// lista de planes.
export type MacroItem = {
  day_num: number;
  quantity_g: number | null;
  food: { food_nutrient?: MealItemFoodNutrient[] } | null;
};

// Suma cada item = value_per_100g * quantity_g / 100 sobre los cuatro macros
// core y reparte el total entre los dias del plan. Un item cuenta como saltado
// si es texto libre, no tiene gramos, o su alimento no trae ningun macro core.
export function aggregatePlanMacros(
  items: MacroItem[],
  durationDays: number
): PlanMacros {
  const total = { kcal: 0, protein: 0, carb: 0, fat: 0 };
  let countedItems = 0;
  let skippedItems = 0;

  for (const item of items) {
    const nutrients = item.food?.food_nutrient;
    if (!item.food || item.quantity_g == null || !nutrients?.length) {
      skippedItems += 1;
      continue;
    }

    const factor = item.quantity_g / 100;
    let contributed = false;
    for (const row of nutrients) {
      const code = row.nutrient?.code;
      const field = code ? MACRO_FIELD[code] : undefined;
      if (!field) continue;
      total[field] += row.value_per_100g * factor;
      contributed = true;
    }

    if (contributed) countedItems += 1;
    else skippedItems += 1;
  }

  const days = durationDays > 0 ? durationDays : dayCount(items) || 1;
  const perDay = (v: number) => Math.round(v / days);

  return {
    kcal: perDay(total.kcal),
    protein: perDay(total.protein),
    carb: perDay(total.carb),
    fat: perDay(total.fat),
    days,
    countedItems,
    skippedItems,
  };
}

function dayCount(items: MacroItem[]): number {
  return new Set(items.map((i) => i.day_num)).size;
}
