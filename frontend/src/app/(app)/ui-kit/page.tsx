import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { KitOverlays } from "./overlays";

export const dynamic = "force-dynamic";

type Named = { code: string; name_es: string };

export default async function UiKitPage() {
  const supabase = createClient();

  // misma lectura del bloque 3: catalogos + foods globales bajo rls.
  // sirve de prueba de que la conexion sigue viva con la sesion del nutri.
  const [nutrients, tags, mealTypes, units, foods] = await Promise.all([
    supabase.from("nutrient").select("code, name_es").order("id"),
    supabase.from("tag").select("code, name_es").order("id"),
    supabase.from("meal_type").select("code, name_es").order("default_order"),
    supabase.from("unit").select("code, name_es").order("id"),
    supabase
      .from("food")
      .select("id")
      .is("nutritionist_id", null)
      .is("deleted_at", null),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">UI kit</h1>
        <p className="text-sm text-muted-foreground">
          Componentes base y lectura de catálogos bajo la RLS del nutri.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Componentes</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">Active</Badge>
            <Badge variant="critical">Critical</Badge>
            <Badge variant="warning">Review</Badge>
            <Badge variant="info">Info</Badge>
            <Badge variant="neutral">Draft</Badge>
          </div>
          <Input placeholder="Input de ejemplo" className="max-w-xs" />
          <KitOverlays />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catálogos (lectura real)</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Nutrientes" value={nutrients.data?.length ?? 0} />
          <Stat label="Tags" value={tags.data?.length ?? 0} />
          <Stat label="Tipos comida" value={mealTypes.data?.length ?? 0} />
          <Stat label="Unidades" value={units.data?.length ?? 0} />
          <Stat label="Alimentos" value={foods.data?.length ?? 0} />
        </div>
        <CatalogList title="Nutrientes" rows={nutrients.data ?? []} />
        <CatalogList title="Tipos de comida" rows={mealTypes.data ?? []} />
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-control border border-border p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function CatalogList({ title, rows }: { title: string; rows: Named[] }) {
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="flex flex-wrap gap-2">
        {rows.map((r) => (
          <li
            key={r.code}
            className="rounded-control bg-muted px-2 py-1 text-sm"
            title={r.code}
          >
            {r.name_es}
          </li>
        ))}
      </ul>
    </div>
  );
}
