// Verificacion empirica del aislamiento con los dos roles de la aplicacion.
//
// Tres actores reales, cada uno con su sesion y la clave publica (nunca la de
// servicio, que se salta la RLS): el cliente de demostracion, su nutricionista y
// un segundo nutricionista ajeno. Lo que se comprueba no es que la interfaz
// oculte cosas, sino que la base de datos no las entregue.
//
// Cubre las dos mitades del acceso del cliente: lo que puede leer, y lo que
// puede escribir. De la escritura interesan sobre todo los limites, porque son
// lo que separa aportar informacion de alterar el trabajo del profesional:
// marcar solo comidas planificadas de un plan firmado suyo y no futuras,
// registrar solo su peso, no poder firmar un mensaje como su nutricionista, no
// poder darse una cita por confirmada, y no poder tocar por la via directa las
// columnas que solo las funciones saben cambiar.
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

  // El vigente, no el primero: la clienta de demostracion tiene tambien un plan
  // historico firmado, y los calculos de dias de mas abajo solo tienen sentido
  // sobre el plan que cubre hoy, que es el que la aplicacion mide.
  const { data: signedPlan } = await nutri1.sb
    .from("plan")
    .select("id, start_date, duration_days")
    .eq("client_id", clientId)
    .not("approved_at", "is", null)
    .is("deleted_at", null)
    .order("start_date", { ascending: false })
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

  // Comida del catalogo que el plan de demostracion no usa, para probar que no
  // se puede marcar algo que no esta planificado.
  const { data: lateSnack } = await nutri1.sb
    .from("meal_type")
    .select("id")
    .eq("code", "late_snack")
    .single();

  // Otro cliente del mismo nutricionista: sirve de objetivo ajeno sin salir de
  // la consulta, que es el caso realmente peligroso.
  const { data: otherPlan } = await nutri1.sb
    .from("plan")
    .select("id, client_id")
    .neq("client_id", clientId)
    .not("approved_at", "is", null)
    .is("deleted_at", null)
    .limit(1)
    .single();
  check("hay un segundo cliente con plan firmado en la consulta", otherPlan?.id > 0);

  const { data: otherAppointment } = await nutri1.sb
    .from("appointment")
    .select("id, client_id, status")
    .neq("client_id", clientId)
    .eq("status", "scheduled")
    .is("deleted_at", null)
    .limit(1)
    .single();
  check("y una cita suya que el cliente no debe poder tocar", otherAppointment?.id > 0);

  const created = {
    food1: null,
    food2: null,
    item: null,
    draft: null,
    draftItem: null,
    msgClient: null,
    msgNutri: null,
    appointment: null,
    weightDay: null,
    weightRestore: null,
    checkDay: null,
    checkMealType: null,
  };

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

    section("EL MATERIAL DEL PROFESIONAL SIGUE FUERA DE SU ALCANCE");

    const writes = [
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
    check("no puede marcar mensajes como leidos por la via directa", readMsg?.length === 0);

    // ---------- comidas cumplidas ----------
    section("MARCA COMIDAS, Y SOLO LAS QUE PUEDE MARCAR");

    // Comida de un dia ya vivido que el juego de datos no deja marcada. Se
    // busca en caliente sobre todos los dias que la policy permite marcar
    // (hasta hoy), para que la pasada no dependa de cuanto lleve marcado la
    // demostracion (con 4 comidas por dia el dia 1 puede venir completo), y al
    // limpiar solo se borra esta.
    const dayMsCheck = 86_400_000;
    const planStartDay = Math.floor(Date.parse(`${signedPlan.start_date}T00:00:00Z`) / dayMsCheck);
    const nowDay = Math.floor(Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) / dayMsCheck);
    const elapsedDays = Math.min(nowDay - planStartDay + 1, signedPlan.duration_days);
    const { data: allPlanned } = await nutri1.sb
      .from("plan_meal_item")
      .select("day_num, meal_type_id")
      .eq("plan_id", signedPlan.id)
      .lte("day_num", elapsedDays);
    const { data: allChecked } = await client.sb
      .from("meal_check")
      .select("day_num, meal_type_id")
      .eq("plan_id", signedPlan.id);
    const takenPairs = new Set((allChecked ?? []).map((c) => `${c.day_num}:${c.meal_type_id}`));
    const free = (allPlanned ?? []).find(
      (m) => !takenPairs.has(`${m.day_num}:${m.meal_type_id}`)
    );
    created.checkDay = free?.day_num ?? null;
    created.checkMealType = free?.meal_type_id ?? null;
    check("hay una comida ya vivida sin marcar", created.checkMealType != null);

    const { error: checkErr } = await client.sb
      .from("meal_check")
      .insert({
        plan_id: signedPlan.id,
        day_num: created.checkDay,
        meal_type_id: created.checkMealType,
      });
    check("marca una comida de su plan firmado", !checkErr, checkErr?.message);

    const { data: ownChecks } = await client.sb
      .from("meal_check")
      .select("plan_id, day_num, meal_type_id")
      .eq("plan_id", signedPlan.id)
      .eq("day_num", created.checkDay)
      .eq("meal_type_id", created.checkMealType);
    check("y la relee", ownChecks?.length === 1, `${ownChecks?.length}`);

    const { error: dupErr } = await client.sb
      .from("meal_check")
      .insert({
        plan_id: signedPlan.id,
        day_num: created.checkDay,
        meal_type_id: created.checkMealType,
      });
    check("la misma comida no se marca dos veces", Boolean(dupErr));

    // Dia del plan que todavia no ha llegado, calculado de su fecha de inicio
    // para no depender de cuando se sembro la demostracion.
    const dayMs = 86_400_000;
    const startDay = Math.floor(Date.parse(`${signedPlan.start_date}T00:00:00Z`) / dayMs);
    const todayDay = Math.floor(Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) / dayMs);
    const futureDay = todayDay - startDay + 2;
    check(
      `el plan llega hasta el dia ${futureDay}, que es futuro`,
      futureDay > 1 && futureDay <= signedPlan.duration_days,
      `duracion ${signedPlan.duration_days}`
    );

    const { data: futurePlanned } = await nutri1.sb
      .from("plan_meal_item")
      .select("id")
      .eq("plan_id", signedPlan.id)
      .eq("day_num", futureDay)
      .eq("meal_type_id", mealType.id)
      .limit(1);
    check("y esa comida si esta planificada ese dia", futurePlanned?.length === 1);

    const { error: futureErr } = await client.sb
      .from("meal_check")
      .insert({ plan_id: signedPlan.id, day_num: futureDay, meal_type_id: mealType.id });
    check("aun asi no puede marcar un dia que no ha llegado", Boolean(futureErr));

    const { data: lateInPlan } = await nutri1.sb
      .from("plan_meal_item")
      .select("id")
      .eq("plan_id", signedPlan.id)
      .eq("meal_type_id", lateSnack.id)
      .limit(1);
    check("el plan no tiene late_snack ningun dia", (lateInPlan?.length ?? 0) === 0);

    const { error: unplannedErr } = await client.sb
      .from("meal_check")
      .insert({ plan_id: signedPlan.id, day_num: 1, meal_type_id: lateSnack.id });
    check("no puede marcar una comida que no esta en el plan", Boolean(unplannedErr));

    const { error: draftCheckErr } = await client.sb
      .from("meal_check")
      .insert({ plan_id: created.draft, day_num: 1, meal_type_id: mealType.id });
    check("no puede marcar en un borrador", Boolean(draftCheckErr));

    const { error: otherCheckErr } = await client.sb
      .from("meal_check")
      .insert({ plan_id: otherPlan.id, day_num: 1, meal_type_id: mealType.id });
    check("no puede marcar en el plan de otro cliente", Boolean(otherCheckErr));

    const { error: nutriCheckErr } = await nutri1.sb
      .from("meal_check")
      .insert({ plan_id: signedPlan.id, day_num: 1, meal_type_id: lateSnack.id });
    check("el profesional no marca en su lugar", Boolean(nutriCheckErr));

    const { data: n1Checks } = await nutri1.sb
      .from("meal_check")
      .select("plan_id, day_num, meal_type_id")
      .eq("plan_id", signedPlan.id)
      .eq("day_num", created.checkDay)
      .eq("meal_type_id", created.checkMealType);
    check("pero si ve lo que su cliente marco", n1Checks?.length === 1, `${n1Checks?.length}`);

    // El segundo profesional tiene cartera propia con sus marcas desde el juego
    // de datos ampliado, asi que el cero se comprueba sobre el plan de ESTA
    // clienta, no sobre la tabla entera.
    const { data: n2Checks } = await nutri2.sb
      .from("meal_check")
      .select("plan_id")
      .eq("plan_id", signedPlan.id);
    check("y el otro profesional no ve ninguna marca de ella", (n2Checks?.length ?? 0) === 0);

    const { data: undone } = await client.sb
      .from("meal_check")
      .delete()
      .eq("plan_id", signedPlan.id)
      .eq("day_num", created.checkDay)
      .eq("meal_type_id", created.checkMealType)
      .select("plan_id");
    check("desmarca lo que habia marcado", undone?.length === 1);
    created.checkMealType = null;

    // ---------- peso ----------
    section("REGISTRA SU PESO SIN TOCAR EL DE LA FICHA");

    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + dayMs).toISOString().slice(0, 10);
    // El juego de datos de demostracion siembra el peso de hoy. Se guarda para
    // devolverlo al final, que si no la pasada lo dejaria borrado.
    const { data: seededToday } = await client.sb
      .from("weight_entry")
      .select("weight_kg")
      .eq("measured_on", today)
      .maybeSingle();
    created.weightRestore = seededToday ? Number(seededToday.weight_kg) : null;
    await client.sb.from("weight_entry").delete().eq("measured_on", today);

    const { data: weightBefore } = await nutri1.sb
      .from("client")
      .select("weight_kg")
      .eq("id", clientId)
      .single();

    const { error: wErr } = await client.sb
      .from("weight_entry")
      .insert({ client_id: clientId, measured_on: today, weight_kg: 68.4 });
    check("registra su peso de hoy", !wErr, wErr?.message);
    created.weightDay = wErr ? null : today;

    const { error: upErr } = await client.sb
      .from("weight_entry")
      .upsert(
        { client_id: clientId, measured_on: today, weight_kg: 67.9 },
        { onConflict: "client_id,measured_on" }
      );
    check("volver a enviarlo el mismo dia pisa el valor", !upErr, upErr?.message);

    const { data: wRows } = await client.sb
      .from("weight_entry")
      .select("measured_on, weight_kg")
      .eq("measured_on", today);
    check(
      "y queda un solo registro, con el valor nuevo",
      wRows?.length === 1 && Number(wRows[0].weight_kg) === 67.9,
      JSON.stringify(wRows)
    );

    const { error: wFutureErr } = await client.sb
      .from("weight_entry")
      .insert({ client_id: clientId, measured_on: tomorrow, weight_kg: 67 });
    check("no puede registrar un peso con fecha futura", Boolean(wFutureErr));

    const { error: wOtherErr } = await client.sb
      .from("weight_entry")
      .insert({ client_id: otherPlan.client_id, measured_on: today, weight_kg: 80 });
    check("no puede registrar el peso de otro cliente", Boolean(wOtherErr));

    const { data: wMoved } = await client.sb
      .from("weight_entry")
      .update({ client_id: otherPlan.client_id })
      .eq("measured_on", today)
      .select("measured_on");
    check("ni mover su registro a otra ficha", (wMoved?.length ?? 0) === 0);

    const { data: weightAfter } = await nutri1.sb
      .from("client")
      .select("weight_kg")
      .eq("id", clientId)
      .single();
    check(
      "el peso declarado NO cambia client.weight_kg, que alimenta al solver",
      String(weightBefore?.weight_kg) === String(weightAfter?.weight_kg),
      `${weightBefore?.weight_kg} -> ${weightAfter?.weight_kg}`
    );

    const { data: n1Weights } = await nutri1.sb
      .from("weight_entry")
      .select("client_id")
      .eq("client_id", clientId);
    check("el profesional ve la serie de su cliente", (n1Weights?.length ?? 0) >= 1);

    // Mismo motivo que con las marcas: el cero es sobre esta clienta.
    const { data: n2Weights } = await nutri2.sb
      .from("weight_entry")
      .select("client_id")
      .eq("client_id", clientId);
    check("y el otro profesional no ve ningun peso de ella", (n2Weights?.length ?? 0) === 0);

    // ---------- mensajes ----------
    section("ESCRIBE MENSAJES, PERO NO EN NOMBRE AJENO");

    const { data: sentMsg, error: sendErr } = await client.sb
      .from("message")
      .insert({
        nutritionist_id: nutri1.uid,
        client_id: clientId,
        sender: "client",
        body: "Mensaje de prueba del cliente",
      })
      .select("id")
      .single();
    check("envia un mensaje suyo", !sendErr, sendErr?.message);
    created.msgClient = sentMsg?.id;

    const { error: impersonateErr } = await client.sb.from("message").insert({
      nutritionist_id: nutri1.uid,
      client_id: clientId,
      sender: "nutritionist",
      body: "Esto lo tendria que haber escrito el profesional",
    });
    check("no puede firmar un mensaje como su nutricionista", Boolean(impersonateErr));

    const { error: msgOtherErr } = await client.sb.from("message").insert({
      nutritionist_id: nutri1.uid,
      client_id: otherPlan.client_id,
      sender: "client",
      body: "En el hilo de otro",
    });
    check("no puede escribir en el hilo de otro cliente", Boolean(msgOtherErr));

    const NUTRI_BODY = "Respuesta del profesional, sin leer";
    const { data: fromNutri } = await nutri1.sb
      .from("message")
      .insert({
        nutritionist_id: nutri1.uid,
        client_id: clientId,
        sender: "nutritionist",
        body: NUTRI_BODY,
      })
      .select("id")
      .single();
    created.msgNutri = fromNutri?.id;

    const { data: directRead } = await client.sb
      .from("message")
      .update({ read_at: new Date().toISOString() })
      .eq("id", created.msgNutri)
      .select("id");
    check("no lo marca leido con un update directo", (directRead?.length ?? 0) === 0);

    const { data: markedCount, error: rpcReadErr } = await client.sb.rpc(
      "client_mark_thread_read"
    );
    check(
      "la funcion si se lo marca leido",
      !rpcReadErr && markedCount >= 1,
      rpcReadErr?.message ?? `${markedCount}`
    );

    const { data: afterRpc } = await client.sb
      .from("message")
      .select("id, body, read_at")
      .eq("id", created.msgNutri)
      .single();
    check("el mensaje queda leido", afterRpc?.read_at !== null);
    check("y la funcion no ha tocado el cuerpo", afterRpc?.body === NUTRI_BODY);

    const { data: bodyEdit } = await client.sb
      .from("message")
      .update({ body: "reescrito por el cliente" })
      .eq("id", created.msgNutri)
      .select("id");
    check("que tampoco puede reescribir por su cuenta", (bodyEdit?.length ?? 0) === 0);

    // ---------- citas ----------
    section("PIDE CITA, Y ES EL PROFESIONAL QUIEN LA CONFIRMA");

    const whenIso = new Date(Date.now() + 3 * dayMs).toISOString();
    const pastIso = new Date(Date.now() - dayMs).toISOString();

    const { data: reqAppt, error: reqErr } = await client.sb
      .from("appointment")
      .insert({
        nutritionist_id: nutri1.uid,
        client_id: clientId,
        scheduled_at: whenIso,
        duration_min: 30,
        status: "pending",
      })
      .select("id, status, scheduled_at")
      .single();
    check("pide una cita y queda pendiente", !reqErr && reqAppt?.status === "pending", reqErr?.message);
    created.appointment = reqAppt?.id;

    const { error: selfConfirmErr } = await client.sb.from("appointment").insert({
      nutritionist_id: nutri1.uid,
      client_id: clientId,
      scheduled_at: whenIso,
      duration_min: 30,
      status: "scheduled",
    });
    check("no puede darse una cita ya confirmada", Boolean(selfConfirmErr));

    const { error: pastApptErr } = await client.sb.from("appointment").insert({
      nutritionist_id: nutri1.uid,
      client_id: clientId,
      scheduled_at: pastIso,
      duration_min: 30,
      status: "pending",
    });
    check("no puede pedir cita en el pasado", Boolean(pastApptErr));

    const { error: apptOtherErr } = await client.sb.from("appointment").insert({
      nutritionist_id: nutri1.uid,
      client_id: otherPlan.client_id,
      scheduled_at: whenIso,
      duration_min: 30,
      status: "pending",
    });
    check("no puede pedir cita para otro cliente", Boolean(apptOtherErr));

    const { data: movedAppt } = await client.sb
      .from("appointment")
      .update({ scheduled_at: pastIso })
      .eq("id", created.appointment)
      .select("id");
    check("no puede mover la fecha de su cita", (movedAppt?.length ?? 0) === 0);

    const { data: directCancel } = await client.sb
      .from("appointment")
      .update({ status: "cancelled" })
      .eq("id", created.appointment)
      .select("id");
    check("ni cancelarla con un update directo", (directCancel?.length ?? 0) === 0);

    const { data: confirmed, error: confirmErr } = await nutri1.sb
      .from("appointment")
      .update({ status: "scheduled" })
      .eq("id", created.appointment)
      .select("id, status");
    check(
      "el profesional la confirma con la policy que ya tenia",
      !confirmErr && confirmed?.[0]?.status === "scheduled",
      confirmErr?.message
    );

    const { data: seenByClient } = await client.sb
      .from("appointment")
      .select("id, status")
      .eq("id", created.appointment)
      .single();
    check("y el cliente la ve confirmada", seenByClient?.status === "scheduled");

    const { data: cancelOther, error: cancelOtherErr } = await client.sb.rpc(
      "client_cancel_appointment",
      { p_appointment_id: otherAppointment.id }
    );
    check(
      "la funcion no cancela la cita de otro cliente",
      !cancelOtherErr && cancelOther === false,
      cancelOtherErr?.message ?? `${cancelOther}`
    );

    const { data: otherStill } = await nutri1.sb
      .from("appointment")
      .select("status")
      .eq("id", otherAppointment.id)
      .single();
    check("que sigue en su estado", otherStill?.status === otherAppointment.status);

    const { data: cancelledOk, error: cancelErr } = await client.sb.rpc(
      "client_cancel_appointment",
      { p_appointment_id: created.appointment }
    );
    check("cancela la suya por la funcion", !cancelErr && cancelledOk === true, cancelErr?.message);

    const { data: afterCancel } = await client.sb
      .from("appointment")
      .select("status, scheduled_at")
      .eq("id", created.appointment)
      .single();
    check("queda cancelada", afterCancel?.status === "cancelled");
    check(
      "y la funcion no ha movido la fecha",
      Date.parse(afterCancel?.scheduled_at) === Date.parse(reqAppt.scheduled_at)
    );

    const { data: cancelTwice } = await client.sb.rpc("client_cancel_appointment", {
      p_appointment_id: created.appointment,
    });
    check("cancelar dos veces ya no cambia nada", cancelTwice === false);

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
    // lo que escribio el cliente lo deshace el cliente, salvo los mensajes y la
    // cita, que solo el profesional puede borrar. Se borra SOLO la marca de
    // esta pasada: las del juego de datos de demostracion se quedan.
    if (created.checkMealType != null)
      await client.sb
        .from("meal_check")
        .delete()
        .eq("plan_id", signedPlan.id)
        .eq("day_num", created.checkDay)
        .eq("meal_type_id", created.checkMealType);
    if (created.weightDay) {
      await client.sb.from("weight_entry").delete().eq("measured_on", created.weightDay);
      if (created.weightRestore != null)
        await client.sb.from("weight_entry").insert({
          client_id: clientId,
          measured_on: created.weightDay,
          weight_kg: created.weightRestore,
        });
    }
    if (created.msgClient) await nutri1.sb.from("message").delete().eq("id", created.msgClient);
    if (created.msgNutri) await nutri1.sb.from("message").delete().eq("id", created.msgNutri);
    if (created.appointment)
      await nutri1.sb.from("appointment").delete().eq("id", created.appointment);
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
