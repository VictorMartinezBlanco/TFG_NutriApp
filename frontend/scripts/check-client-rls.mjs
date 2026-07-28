// Verificacion empirica del aislamiento con los dos roles de la aplicacion.
//
// Tres actores reales, cada uno con su sesion y la clave publica (nunca la de
// servicio, que se salta la RLS): el cliente de demostracion, su nutricionista y
// un segundo nutricionista ajeno. Lo que se comprueba no es que la interfaz
// oculte cosas, sino que la base de datos no las entregue.
//
// El escenario se monta y se deshace desde las propias sesiones de los
// nutricionistas, con sus permisos: crean un alimento a medida, lo meten en el
// plan del cliente y crean un borrador para el. Asi el borrador invisible y el
// alimento a medida visible se prueban sobre datos creados en la propia pasada,
// no sobre supuestos del seed.
//
// Uso (desde Repo/frontend, contrasenas en .test-user.local.md):
//   CLIENT_DEMO_PASSWORD=... NUTRI1_PASSWORD=... NUTRI2_PASSWORD=... \
//     node --env-file=.env.local scripts/check-client-rls.mjs

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const CLIENT_EMAIL = "maria.client@nutriapp.dev";
const NUTRI1_EMAIL = "nutri.test@nutriapp.dev";
const NUTRI2_EMAIL = "nutri2.test@nutriapp.dev";

let passed = 0;
let failed = 0;

function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ""}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function login(email, password) {
  if (!password) throw new Error(`falta la contrasena de ${email}`);
  const sb = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // el plan free limita los intentos de login por IP: un reintento con pausa
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error) return { sb, uid: data.user.id, email };
    if (attempt === 2) throw new Error(`login ${email}: ${error.message}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function count(sb, table) {
  const { count: n, error } = await sb
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) return { n: null, error: error.message };
  return { n, error: null };
}

async function main() {
  if (!URL || !KEY) throw new Error("faltan NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY");

  const nutri1 = await login(NUTRI1_EMAIL, process.env.NUTRI1_PASSWORD);
  const nutri2 = await login(NUTRI2_EMAIL, process.env.NUTRI2_PASSWORD);
  const client = await login(CLIENT_EMAIL, process.env.CLIENT_DEMO_PASSWORD);

  // ---------- escenario ----------
  section("MONTAJE (con los permisos de cada nutricionista)");

  const { data: demoClient } = await nutri1.sb
    .from("client")
    .select("id, full_name_pseudonym, auth_user_id")
    .eq("auth_user_id", client.uid)
    .single();
  check("el nutricionista ve el vinculo de su cliente", demoClient?.id > 0);
  const clientId = demoClient.id;

  const { data: signedPlan } = await nutri1.sb
    .from("plan")
    .select("id, start_date, duration_days")
    .eq("client_id", clientId)
    .not("approved_at", "is", null)
    .is("deleted_at", null)
    .limit(1)
    .single();
  check("el cliente de demostracion tiene un plan firmado", signedPlan?.id > 0);

  const { data: mealType } = await nutri1.sb
    .from("meal_type")
    .select("id")
    .eq("code", "breakfast")
    .single();
  const { data: globalFood } = await nutri1.sb
    .from("food")
    .select("id")
    .is("nutritionist_id", null)
    .limit(1)
    .single();
  const { data: kcal } = await nutri1.sb
    .from("nutrient")
    .select("id")
    .eq("code", "energy_kcal")
    .single();

  const created = { food1: null, food2: null, item: null, draft: null, draftItem: null };

  try {
    const { data: food1, error: food1Err } = await nutri1.sb
      .from("food")
      .insert({
        name_es: "Alimento de prueba RLS",
        name_en: "RLS probe food",
        source: "custom",
        nutritionist_id: nutri1.uid,
      })
      .select("id")
      .single();
    check("el nutricionista crea un alimento a medida", !food1Err, food1Err?.message);
    created.food1 = food1?.id;

    await nutri1.sb
      .from("food_nutrient")
      .insert({ food_id: created.food1, nutrient_id: kcal.id, value_per_100g: 123 });

    const { data: item, error: itemErr } = await nutri1.sb
      .from("plan_meal_item")
      .insert({
        plan_id: signedPlan.id,
        day_num: 1,
        meal_type_id: mealType.id,
        item_order: 99,
        food_id: created.food1,
        quantity_g: 50,
      })
      .select("id")
      .single();
    check("mete ese alimento en el plan firmado del cliente", !itemErr, itemErr?.message);
    created.item = item?.id;

    const { data: draft, error: draftErr } = await nutri1.sb
      .from("plan")
      .insert({
        nutritionist_id: nutri1.uid,
        client_id: clientId,
        start_date: signedPlan.start_date,
        duration_days: 1,
      })
      .select("id, approved_at")
      .single();
    check("crea un borrador para el mismo cliente", !draftErr && draft.approved_at === null);
    created.draft = draft?.id;

    const { data: draftItem } = await nutri1.sb
      .from("plan_meal_item")
      .insert({
        plan_id: created.draft,
        day_num: 1,
        meal_type_id: mealType.id,
        item_order: 1,
        food_id: globalFood.id,
        quantity_g: 100,
      })
      .select("id")
      .single();
    created.draftItem = draftItem?.id;

    const { data: food2 } = await nutri2.sb
      .from("food")
      .insert({
        name_es: "Alimento del otro nutri",
        name_en: "Other practice food",
        source: "custom",
        nutritionist_id: nutri2.uid,
      })
      .select("id")
      .single();
    created.food2 = food2?.id;
    check("el segundo nutricionista crea el suyo", created.food2 > 0);

    // ---------- el cliente ----------
    section("EL CLIENTE VE LO SUYO Y SOLO LO SUYO");

    const { data: ownClient } = await client.sb.from("client").select("id, full_name_pseudonym");
    check("ve exactamente una ficha de cliente", ownClient?.length === 1, `${ownClient?.length}`);
    check("y es la suya", ownClient?.[0]?.id === clientId);

    const { data: plans } = await client.sb.from("plan").select("id, approved_at, client_id");
    check(
      "solo ve planes firmados",
      plans?.length > 0 && plans.every((p) => p.approved_at !== null),
      JSON.stringify(plans?.map((p) => [p.id, p.approved_at !== null]))
    );
    check("todos sus planes son de su ficha", plans.every((p) => p.client_id === clientId));
    check("el borrador de su nutricionista es invisible", !plans.some((p) => p.id === created.draft));

    const { data: draftById } = await client.sb
      .from("plan")
      .select("id")
      .eq("id", created.draft);
    check("y sigue invisible pidiendolo por su id", draftById?.length === 0);

    const { data: draftItems } = await client.sb
      .from("plan_meal_item")
      .select("id")
      .eq("plan_id", created.draft);
    check("las comidas del borrador tampoco se ven", draftItems?.length === 0);

    const { data: signedItems } = await client.sb
      .from("plan_meal_item")
      .select("id, food:food_id (id, name_en)")
      .eq("plan_id", signedPlan.id);
    check("las comidas del plan firmado si", signedItems?.length > 0);
    const custom = signedItems?.find((i) => i.food?.id === created.food1);
    check(
      "y el alimento a medida de su nutricionista se resuelve con su nombre",
      custom?.food?.name_en === "RLS probe food",
      JSON.stringify(custom)
    );

    const { data: foodsSeen } = await client.sb
      .from("food")
      .select("id, nutritionist_id")
      .eq("id", created.food2);
    check("no ve los alimentos del otro nutricionista", foodsSeen?.length === 0);

    const { data: fnSeen } = await client.sb
      .from("food_nutrient")
      .select("value_per_100g")
      .eq("food_id", created.food1);
    check("ve la composicion del alimento a medida", fnSeen?.length === 1);

    const { data: nutris } = await client.sb.from("nutritionist").select("id, full_name");
    check("ve un solo nutricionista", nutris?.length === 1, `${nutris?.length}`);
    check("y es el suyo", nutris?.[0]?.id === nutri1.uid);

    const { data: messages } = await client.sb.from("message").select("id, client_id");
    check("ve sus mensajes", messages?.length > 0);
    check("y ninguno de otro cliente", messages.every((m) => m.client_id === clientId));

    const { data: appointments } = await client.sb.from("appointment").select("id, client_id");
    check("ve sus citas", appointments?.length > 0);
    check("y ninguna de otro cliente", appointments.every((a) => a.client_id === clientId));

    const { data: avail } = await client.sb
      .from("availability")
      .select("id, nutritionist_id");
    check("ve la disponibilidad de su nutricionista", avail?.length > 0);
    check("y solo la suya", avail.every((a) => a.nutritionist_id === nutri1.uid));

    for (const [table, expected] of [
      ["nutrient", 12],
      ["meal_type", 6],
      ["unit", 7],
    ]) {
      const { n } = await count(client.sb, table);
      check(`lee el catalogo ${table} (${expected})`, n === expected, `${n}`);
    }

    for (const table of ["diet_constraint", "generation_task", "llm_translation", "recipe"]) {
      const { n } = await count(client.sb, table);
      check(`no ve ${table}, que no tiene policy de cliente`, n === 0, `${n}`);
    }

    section("EL CLIENTE NO ESCRIBE NADA");

    const writes = [
      [
        "no puede escribir un mensaje",
        () =>
          client.sb
            .from("message")
            .insert({
              nutritionist_id: nutri1.uid,
              client_id: clientId,
              sender: "client",
              body: "intento de escritura",
            }),
      ],
      [
        "no puede pedir cita",
        () =>
          client.sb.from("appointment").insert({
            nutritionist_id: nutri1.uid,
            client_id: clientId,
            scheduled_at: new Date().toISOString(),
            duration_min: 30,
          }),
      ],
      [
        "no puede crear un plan",
        () =>
          client.sb.from("plan").insert({
            nutritionist_id: nutri1.uid,
            client_id: clientId,
            start_date: "2026-01-01",
            duration_days: 1,
          }),
      ],
      [
        "no puede crear un cliente",
        () =>
          client.sb.from("client").insert({
            nutritionist_id: nutri1.uid,
            full_name_pseudonym: "Cliente inventado",
          }),
      ],
      [
        "no puede crear un alimento",
        () =>
          client.sb
            .from("food")
            .insert({ name_es: "x", name_en: "x", source: "custom", nutritionist_id: nutri1.uid }),
      ],
    ];
    for (const [label, run] of writes) {
      const { error } = await run();
      check(label, Boolean(error), error ? "" : "el insert paso");
    }

    const { data: updatedClient } = await client.sb
      .from("client")
      .update({ weight_kg: 999 })
      .eq("id", clientId)
      .select("id");
    check("no puede editar su propia ficha", updatedClient?.length === 0);

    const { data: updatedPlan } = await client.sb
      .from("plan")
      .update({ approved_at: null })
      .eq("id", signedPlan.id)
      .select("id");
    check("no puede desfirmar su plan", updatedPlan?.length === 0);

    const { data: deletedItem } = await client.sb
      .from("plan_meal_item")
      .delete()
      .eq("id", created.item)
      .select("id");
    check("no puede borrar una comida de su plan", deletedItem?.length === 0);

    const { data: readMsg } = await client.sb
      .from("message")
      .update({ read_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .select("id");
    check("no puede marcar mensajes como leidos", readMsg?.length === 0);

    // ---------- la firma es lo que decide ----------
    section("LA FIRMA ES LO QUE ABRE EL PLAN");

    await nutri1.sb
      .from("plan")
      .update({ approved_at: new Date().toISOString(), signed_by: nutri1.uid })
      .eq("id", created.draft);

    const { data: nowVisible } = await client.sb
      .from("plan")
      .select("id")
      .eq("id", created.draft);
    check("firmado por su nutricionista, el mismo plan aparece", nowVisible?.length === 1);

    const { data: nowItems } = await client.sb
      .from("plan_meal_item")
      .select("id")
      .eq("plan_id", created.draft);
    check("y con el sus comidas", nowItems?.length === 1);

    await nutri1.sb.from("plan").update({ approved_at: null, signed_by: null }).eq("id", created.draft);
    const { data: hiddenAgain } = await client.sb
      .from("plan")
      .select("id")
      .eq("id", created.draft);
    check("al retirar la firma vuelve a desaparecer", hiddenAgain?.length === 0);

    // ---------- los dos nutricionistas siguen igual ----------
    section("SIN REGRESION EN EL PANEL DEL PROFESIONAL");

    const { data: n1Plans } = await nutri1.sb
      .from("plan")
      .select("id, approved_at, nutritionist_id")
      .is("deleted_at", null);
    check("el nutricionista sigue viendo sus planes", n1Plans?.length > 0, `${n1Plans?.length}`);
    check(
      "incluidos los borradores",
      n1Plans.some((p) => p.approved_at === null)
    );
    check("y ninguno ajeno", n1Plans.every((p) => p.nutritionist_id === nutri1.uid));

    const { data: n1Clients } = await nutri1.sb
      .from("client")
      .select("id, nutritionist_id")
      .is("deleted_at", null);
    check("ve sus clientes", n1Clients?.length > 0, `${n1Clients?.length}`);
    check("y ninguno ajeno", n1Clients.every((c) => c.nutritionist_id === nutri1.uid));

    const { data: n1Foods } = await nutri1.sb
      .from("food")
      .select("id, nutritionist_id")
      .is("deleted_at", null);
    check(
      "ve los globales y sus propios alimentos",
      n1Foods.some((f) => f.nutritionist_id === null) &&
        n1Foods.some((f) => f.nutritionist_id === nutri1.uid)
    );
    check(
      "y ninguno del otro nutricionista",
      !n1Foods.some((f) => f.nutritionist_id === nutri2.uid)
    );

    for (const table of ["client", "plan", "appointment", "message", "availability"]) {
      const { data, error } = await nutri2.sb.from(table).select("id, nutritionist_id");
      const leaked = (data ?? []).filter((r) => r.nutritionist_id !== nutri2.uid);
      check(
        `en ${table} el segundo nutricionista no alcanza filas del primero`,
        !error && leaked.length === 0,
        error?.message ?? JSON.stringify(leaked)
      );
    }

    const { data: n2Clients } = await nutri2.sb
      .from("client")
      .select("id, nutritionist_id, auth_user_id");
    check(
      "no alcanza el vinculo del cliente ajeno",
      !n2Clients.some((c) => c.auth_user_id === client.uid)
    );
    check(
      "y solo ve los suyos",
      n2Clients.every((c) => c.nutritionist_id === nutri2.uid)
    );

    const { data: n2Nutris } = await nutri2.sb.from("nutritionist").select("id");
    check("solo se ve a si mismo en nutritionist", n2Nutris?.length === 1 && n2Nutris[0].id === nutri2.uid);
  } finally {
    section("LIMPIEZA");
    if (created.draftItem)
      await nutri1.sb.from("plan_meal_item").delete().eq("id", created.draftItem);
    if (created.draft) await nutri1.sb.from("plan").delete().eq("id", created.draft);
    if (created.item) await nutri1.sb.from("plan_meal_item").delete().eq("id", created.item);
    if (created.food1) await nutri1.sb.from("food").delete().eq("id", created.food1);
    if (created.food2) await nutri2.sb.from("food").delete().eq("id", created.food2);

    const { data: leftovers } = await nutri1.sb
      .from("plan")
      .select("id")
      .eq("id", created.draft ?? -1);
    check("el escenario temporal queda deshecho", (leftovers?.length ?? 0) === 0);
  }

  console.log(`\n==== ${passed} passed, ${failed} failed ====`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
});
