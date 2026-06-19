import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Named = { code: string; name_es: string };
type Food = { id: number; name_es: string; source: string };

export default async function Home() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // todas estas lecturas pasan por la RLS con la sesion del nutri.
  // los catalogos son lectura publica para autenticados; los foods globales
  // (nutritionist_id null) los ve cualquier nutri logueado.
  const [nutrients, tags, mealTypes, units, foods] = await Promise.all([
    supabase.from("nutrient").select("code, name_es").order("id"),
    supabase.from("tag").select("code, name_es").order("id"),
    supabase.from("meal_type").select("code, name_es").order("default_order"),
    supabase.from("unit").select("code, name_es").order("id"),
    supabase
      .from("food")
      .select("id, name_es, source")
      .is("nutritionist_id", null)
      .is("deleted_at", null)
      .order("name_es"),
  ]);

  const profile = await supabase
    .from("nutritionist")
    .select("full_name")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <header className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold">NutriApp</h1>
          <p className="text-sm text-gray-500">
            {profile.data?.full_name ?? user.email} · sesión activa
          </p>
        </div>
        <form action={signOut}>
          <button className="rounded border border-gray-300 px-3 py-1.5 text-sm">
            Salir
          </button>
        </form>
      </header>

      <p className="text-sm text-gray-600">
        Datos leídos desde la base de datos con la clave pública, filtrados por
        la RLS según el nutricionista que ha iniciado sesión.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Nutrientes" value={nutrients.data?.length ?? 0} />
        <Stat label="Tags" value={tags.data?.length ?? 0} />
        <Stat label="Tipos de comida" value={mealTypes.data?.length ?? 0} />
        <Stat label="Unidades" value={units.data?.length ?? 0} />
      </div>

      <CatalogList title="Nutrientes" rows={nutrients.data ?? []} />
      <CatalogList title="Tipos de comida" rows={mealTypes.data ?? []} />

      <section>
        <h2 className="mb-2 text-lg font-medium">
          Alimentos del catálogo global ({foods.data?.length ?? 0})
        </h2>
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {(foods.data as Food[] | null)?.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between rounded border border-gray-200 px-3 py-1.5 text-sm"
            >
              <span>{f.name_es}</span>
              <span className="text-xs text-gray-400">{f.source}</span>
            </li>
          ))}
        </ul>
      </section>

      <FetchErrors
        results={{ nutrients, tags, mealTypes, units, foods, profile }}
      />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-gray-200 p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function CatalogList({ title, rows }: { title: string; rows: Named[] }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-medium">{title}</h2>
      <ul className="flex flex-wrap gap-2">
        {rows.map((r) => (
          <li
            key={r.code}
            className="rounded bg-gray-100 px-2 py-1 text-sm"
            title={r.code}
          >
            {r.name_es}
          </li>
        ))}
      </ul>
    </section>
  );
}

// si la RLS o la conexion fallan, supabase-js no lanza: devuelve error en el
// resultado. lo mostramos para no quedarnos con listas vacias en silencio.
function FetchErrors({
  results,
}: {
  results: Record<string, { error: { message: string } | null }>;
}) {
  const errors = Object.entries(results)
    .filter(([, r]) => r.error)
    .map(([k, r]) => `${k}: ${r.error!.message}`);

  if (errors.length === 0) return null;

  return (
    <section className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
      <p className="font-medium">Errores de lectura</p>
      <ul className="list-inside list-disc">
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </section>
  );
}
