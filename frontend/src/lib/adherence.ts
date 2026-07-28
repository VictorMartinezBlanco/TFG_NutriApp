// Adherencia al plan: comidas cumplidas sobre comidas exigibles. Se calcula, no
// se guarda. Un porcentaje almacenado quedaria obsoleto en cuanto el
// profesional cambia el plan o pasa un dia mas.
//
// Este fichero es la unica formula del proyecto: la consumen el panel del
// cliente y la ficha del profesional, para que los dos ensenen el mismo numero.

export type PlannedMeal = { day_num: number; meal_type_id: number };
export type MealCheckRow = { day_num: number; meal_type_id: number };

export type Adherence = {
  // null cuando todavia no hay nada exigible: sin ese caso, un plan que empieza
  // manana ensenaria un 0% que parece un incumplimiento y no lo es.
  pct: number | null;
  checked: number;
  planned: number;
  daysCounted: number;
};

export function mealKey(dayNum: number, mealTypeId: number): string {
  return `${dayNum}:${mealTypeId}`;
}

// El denominador son las COMIDAS de los dias ya transcurridos, no los alimentos:
// un desayuno de tres items sigue siendo un desayuno, y por eso las claves van a
// un Set. El numerador solo cuenta marcas que siguen correspondiendo a una
// comida exigible, asi que una marca huerfana (el profesional quito esa comida
// del plan despues) no infla el resultado.
export function computeAdherence(
  planned: PlannedMeal[],
  checks: MealCheckRow[],
  daysElapsed: number
): Adherence {
  const due = new Set(
    planned
      .filter((m) => m.day_num <= daysElapsed)
      .map((m) => mealKey(m.day_num, m.meal_type_id))
  );

  let checked = 0;
  for (const c of checks) {
    if (due.has(mealKey(c.day_num, c.meal_type_id))) checked += 1;
  }

  return {
    pct: due.size === 0 ? null : Math.round((checked / due.size) * 100),
    checked,
    planned: due.size,
    daysCounted: daysElapsed,
  };
}

// Los cortes son de presentacion, no clinicos: sirven para que el color diga
// algo de un vistazo, no para juzgar al cliente.
export function adherenceVariant(pct: number): "success" | "warning" | "critical" {
  if (pct >= 80) return "success";
  if (pct >= 50) return "warning";
  return "critical";
}
