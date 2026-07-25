"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { type ConstraintFormState } from "./_actions";
import {
  CONSTRAINT_TYPES,
  CONSTRAINT_INTENTS,
  constraintMeta,
} from "@/lib/constraints";
import { FoodPicker } from "./food-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TagOption = { id: number; name: string };
type TagGroup = { group: string; options: TagOption[] };
type NutrientOption = { id: number; name_en: string; unit_default: string };
type UnitOption = { id: number; name_en: string };
type MealSplit = { code: string; label: string };

type ConstraintAction = (
  prev: ConstraintFormState,
  formData: FormData
) => Promise<ConstraintFormState>;

const initialState: ConstraintFormState = { error: null };

// Formulario de alta de restriccion reutilizable por el ambito cliente y el de
// estilo del nutri. El scope entra como campo oculto (scopeField) y la accion de
// servidor como prop. El selector agrupa por intencion en lenguaje del nutri; el
// tipo interno se mantiene detras de cada opcion.
export function ConstraintForm({
  action,
  scopeField,
  cancelHref,
  tagGroups,
  nutrients,
  macros,
  units,
  mealSplit,
}: {
  action: ConstraintAction;
  scopeField: ReactNode;
  cancelHref: string;
  tagGroups: TagGroup[];
  nutrients: NutrientOption[];
  macros: NutrientOption[];
  units: UnitOption[];
  mealSplit: MealSplit[];
}) {
  const [state, formAction] = useFormState(action, initialState);
  const [type, setType] = useState(CONSTRAINT_TYPES[0].type);
  const [termKind, setTermKind] = useState<"food" | "tag">("food");
  const [partnerKind, setPartnerKind] = useState<"food" | "tag">("food");

  const meta = useMemo(() => constraintMeta(type), [type]);

  if (!meta) return null;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {scopeField}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="type">What do you want to set?</Label>
        <select
          id="type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-10 rounded-control border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {CONSTRAINT_INTENTS.map((group) => (
            <optgroup key={group.intent} label={group.intent}>
              {group.options.map((o) => (
                <option key={o.type} value={o.type}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{meta.hint}</p>
      </div>

      {/* target: tag */}
      {meta.target === "tag" && (
        <TagSelect groups={tagGroups} name="target_tag_id" label="Tag" />
      )}

      {/* target: food */}
      {meta.target === "food" && (
        <FoodPicker name="target_food_id" label="Food" />
      )}

      {/* target: nutrient (min/max/ratio numerator) */}
      {meta.target === "nutrient" && (
        <NutrientSelect
          nutrients={nutrients}
          name="target_nutrient_id"
          label={type === "nutrient_ratio" ? "Numerator nutrient" : "Nutrient"}
        />
      )}

      {/* target: macro */}
      {meta.target === "macro" && (
        <NutrientSelect
          nutrients={macros}
          name="target_nutrient_id"
          label="Macronutrient"
        />
      )}

      {/* target: food_or_tag (max_servings, forbid_combination first term) */}
      {meta.target === "food_or_tag" && (
        <div className="flex flex-col gap-3">
          <KindToggle
            name="term_kind"
            value={termKind}
            onChange={setTermKind}
            label={type === "forbid_combination" ? "First item" : "Item"}
          />
          {termKind === "food" ? (
            <FoodPicker name="target_food_id" label="Food" />
          ) : (
            <TagSelect groups={tagGroups} name="target_tag_id" label="Tag" />
          )}
        </div>
      )}

      {/* ratio denominator */}
      {type === "nutrient_ratio" && (
        <>
          <NutrientSelect
            nutrients={nutrients}
            name="denominator_nutrient_id"
            label="Denominator nutrient"
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ratio_bound">Bound</Label>
            <select
              id="ratio_bound"
              name="ratio_bound"
              defaultValue="max"
              className="h-10 max-w-[16rem] rounded-control border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="max">At most</option>
              <option value="min">At least</option>
            </select>
          </div>
        </>
      )}

      {/* forbid_combination second term */}
      {type === "forbid_combination" && (
        <div className="flex flex-col gap-3">
          <KindToggle
            name="partner_kind"
            value={partnerKind}
            onChange={setPartnerKind}
            label="Second item"
          />
          {partnerKind === "food" ? (
            <FoodPicker name="partner_food_id" label="Second food" />
          ) : (
            <TagSelect
              groups={tagGroups}
              name="partner_tag_id"
              label="Second tag"
            />
          )}
        </div>
      )}

      {/* numeric value */}
      {meta.needsValue && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="value">{valueLabel(type)}</Label>
            <Input
              id="value"
              name="value"
              type="number"
              step="any"
              min="0"
              required
              className="max-w-[16rem]"
            />
          </div>
          {meta.needsUnit && units.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unit_id">Unit</Label>
              <select
                id="unit_id"
                name="unit_id"
                defaultValue=""
                className="h-10 rounded-control border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Default</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name_en}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* max_servings window */}
      {type === "max_servings_per_period" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="window_days">Window (days)</Label>
          <Input
            id="window_days"
            name="window_days"
            type="number"
            min="1"
            step="1"
            defaultValue="7"
            required
            className="max-w-[10rem]"
          />
        </div>
      )}

      {/* no_repeat granularity */}
      {type === "no_repeat_food" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="granularity">Applies to</Label>
          <select
            id="granularity"
            name="granularity"
            defaultValue="day"
            className="h-10 max-w-[16rem] rounded-control border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="day">Whole day</option>
            <option value="meal">Same meal type</option>
          </select>
        </div>
      )}

      {/* prefer meal_type */}
      {(type === "prefer_food" || type === "prefer_tag") &&
        mealSplit.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meal_type">Meal (optional)</Label>
            <select
              id="meal_type"
              name="meal_type"
              defaultValue=""
              className="h-10 max-w-[16rem] rounded-control border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Any meal</option>
              {mealSplit.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}

      {/* meal_kcal_ratio split */}
      {type === "meal_kcal_ratio" && (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Calorie share per meal (%)</legend>
          <p className="text-xs text-muted-foreground">
            Leave a meal empty to skip it. The shares should add up to about 100.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {mealSplit.map((m) => (
              <div key={m.code} className="flex flex-col gap-1.5">
                <Label htmlFor={`split_${m.code}`}>{m.label}</Label>
                <Input
                  id={`split_${m.code}`}
                  name={`split_${m.code}`}
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        </fieldset>
      )}

      {/* priority */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">How strict is this?</span>
        {meta.priorityLocked ? (
          <>
            <input type="hidden" name="priority" value={meta.defaultPriority} />
            <p className="text-sm text-muted-foreground">
              {meta.defaultPriority === "hard"
                ? "This one always holds without exception."
                : "This one is a goal the plan tries to meet."}
            </p>
          </>
        ) : (
          <div className="flex gap-4">
            <PriorityRadio
              value="hard"
              defaultChecked={meta.defaultPriority === "hard"}
              label="Must always hold"
              // key fuerza el re-render del default al cambiar de tipo
              key={`hard-${type}`}
            />
            <PriorityRadio
              value="soft"
              defaultChecked={meta.defaultPriority === "soft"}
              label="Prefer, but flexible"
              key={`soft-${type}`}
            />
          </div>
        )}
      </div>

      {/* weight */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="weight">How much does it matter? (1-10)</Label>
        <Input
          id="weight"
          name="weight"
          type="number"
          min="1"
          max="10"
          step="1"
          defaultValue="5"
          className="max-w-[10rem]"
        />
        <p className="text-xs text-muted-foreground">
          When a preference is flexible, this sets how much it weighs against the
          others.
        </p>
      </div>

      {state.error && (
        <p className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton />
        <a
          href={cancelHref}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}

function valueLabel(type: string): string {
  switch (type) {
    case "kcal_target":
      return "Calories per day (kcal)";
    case "macro_target":
      return "Grams per day";
    case "nutrient_min":
      return "Minimum per day";
    case "nutrient_max":
      return "Maximum per day";
    case "nutrient_ratio":
      return "Ratio value";
    case "max_servings_per_period":
      return "Max servings";
    case "no_repeat_food":
      return "Minimum gap (days)";
    default:
      return "Value";
  }
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save constraint"}
    </Button>
  );
}

function TagSelect({
  groups,
  name,
  label,
}: {
  groups: TagGroup[];
  name: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>
        {label}
        <span className="text-danger"> *</span>
      </Label>
      <select
        id={name}
        name={name}
        defaultValue=""
        className="h-10 rounded-control border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="" disabled>
          Select a tag
        </option>
        {groups.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

function NutrientSelect({
  nutrients,
  name,
  label,
}: {
  nutrients: NutrientOption[];
  name: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>
        {label}
        <span className="text-danger"> *</span>
      </Label>
      <select
        id={name}
        name={name}
        defaultValue=""
        className="h-10 rounded-control border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="" disabled>
          Select a nutrient
        </option>
        {nutrients.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name_en} ({n.unit_default})
          </option>
        ))}
      </select>
    </div>
  );
}

function KindToggle({
  name,
  value,
  onChange,
  label,
}: {
  name: string;
  value: "food" | "tag";
  onChange: (v: "food" | "tag") => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input type="hidden" name={name} value={value} />
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={value === "food"}
            onChange={() => onChange("food")}
            className="size-4 accent-brand"
          />
          A food
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={value === "tag"}
            onChange={() => onChange("tag")}
            className="size-4 accent-brand"
          />
          A tag
        </label>
      </div>
    </div>
  );
}

function PriorityRadio({
  value,
  defaultChecked,
  label,
}: {
  value: string;
  defaultChecked: boolean;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="radio"
        name="priority"
        value={value}
        defaultChecked={defaultChecked}
        className="size-4 accent-brand"
      />
      {label}
    </label>
  );
}
