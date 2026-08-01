// Recorrido completo del ciclo nutricionista-cliente sobre la aplicacion
// SERVIDA, no sobre el build: un fallo de render no rompe la compilacion, asi
// que compilar limpio no prueba que las pantallas funcionen.
//
// Dos sesiones reales con la clave publica y un tarro de cookies a mano, que es
// lo que permite pedir el HTML como lo pediria el navegador de cada uno.
//
// Lo que recorre: las cuatro pantallas del cliente, que marcar una comida mueve
// el porcentaje de adherencia, que el profesional ve ESE MISMO porcentaje y la
// serie de peso declarada, que confirma una peticion de cita y el cliente la ve
// confirmada, y que el aviso de mensajes sin leer aparece y se limpia al abrir
// el hilo. Deshace todo lo que escribe.
//
// Uso (desde Repo/frontend, con la app servida en el puerto 3100):
//   npm run build && npx next start -p 3100
//   NUTRI1_PASSWORD=... CLIENT_DEMO_PASSWORD=... \
//     node --env-file=.env.local scripts/check-client-e2e.mjs
//
// Necesita el juego de datos de demostracion vigente: reaplicar antes
// 0013_seed_demo_refresh.sql.
import { createServerClient } from "@supabase/ssr";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3100";
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// clase que solo lleva el contador del sidebar
const BADGE_MARK = "min-w-5";

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

function section(t) {
  console.log(`\n=== ${t} ===`);
}

async function loginJar(email, password) {
  const jar = new Map();
  const sb = createServerClient(URL_SB, KEY, {
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach((c) => jar.set(c.name, c.value)),
    },
  });
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  const header = Array.from(jar, ([n, v]) => `${n}=${v}`).join("; ");
  return { sb, header };
}

// El porcentaje de la tarjeta de adherencia, no el primero que aparezca en el
// HTML: hay anchos en linea y macros que tambien llevan el simbolo.
// React separa {valor} y "%" en dos nodos de texto y mete un comentario entre
// ellos, asi que buscar "60%" literal no encuentra nada aunque se pinte bien.
function adherencePct(body) {
  const at = body.indexOf("Plan adherence");
  if (at < 0) return undefined;
  return body.slice(at).match(/>(\d+)(?:<!-- -->)?%/)?.[1];
}

async function get(path, header) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: header },
    redirect: "manual",
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  const client = await loginJar(
    "maria.client@nutriapp.dev",
    process.env.CLIENT_DEMO_PASSWORD
  );
  const nutri = await loginJar(
    "nutri.test@nutriapp.dev",
    process.env.NUTRI1_PASSWORD
  );

  // El vigente, no el primero: la clienta tiene tambien un plan historico
  // firmado, y la adherencia del dashboard se mide sobre el que cubre hoy.
  const { data: plan } = await client.sb
    .from("plan")
    .select("id, start_date, duration_days")
    .not("approved_at", "is", null)
    .order("start_date", { ascending: false })
    .limit(1)
    .single();
  // Comida de un dia ya vivido que el juego de datos NO deja marcada, para que
  // el experimento mueva el porcentaje de verdad. Se busca sobre todos los dias
  // marcables (hasta hoy): con 4 comidas por dia el dia 1 puede venir completo.
  const dayMs = 86_400_000;
  const planStart = Math.floor(Date.parse(`${plan.start_date}T00:00:00Z`) / dayMs);
  const today = Math.floor(Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) / dayMs);
  const elapsedDays = Math.min(today - planStart + 1, plan.duration_days);
  const { data: livedMeals } = await client.sb
    .from("plan_meal_item")
    .select("day_num, meal_type_id")
    .eq("plan_id", plan.id)
    .lte("day_num", elapsedDays);
  const { data: livedChecks } = await client.sb
    .from("meal_check")
    .select("day_num, meal_type_id")
    .eq("plan_id", plan.id);
  const alreadyChecked = new Set(
    (livedChecks ?? []).map((c) => `${c.day_num}:${c.meal_type_id}`)
  );
  const freeMeal = (livedMeals ?? []).find(
    (m) => !alreadyChecked.has(`${m.day_num}:${m.meal_type_id}`)
  );
  const freeMealTypeId = freeMeal?.meal_type_id;
  const freeMealDay = freeMeal?.day_num;

  section("PANTALLAS DEL CLIENTE");

  const dash = await get("/my/dashboard", client.header);
  check("dashboard responde 200", dash.status === 200, `${dash.status}`);
  check("saluda por su nombre", dash.body.includes("Maria"));
  check("ensena las comidas de hoy", dash.body.includes("Today"));
  check("tiene el widget de adherencia", dash.body.includes("Plan adherence"));
  check("tiene el widget de peso", dash.body.includes("Weight"));
  check("ofrece marcar comidas", dash.body.includes("Mark done"));

  const planPage = await get("/my/plan", client.header);
  check("my plan responde 200", planPage.status === 200, `${planPage.status}`);
  check("con su adherencia", planPage.body.includes("Plan adherence"));
  check("y controles de marcado", planPage.body.includes("Mark done"));
  check(
    "los dias que no han llegado salen como Not yet",
    planPage.body.includes("Not yet")
  );

  const msgs = await get("/my/messages", client.header);
  check("messages responde 200", msgs.status === 200, `${msgs.status}`);
  check("ya no es un placeholder", msgs.body.includes("Write your message"));
  check("carga el hilo real", msgs.body.includes("Dra."));

  const appts = await get("/my/appointments", client.header);
  check("appointments responde 200", appts.status === 200, `${appts.status}`);
  check("puede pedir cita", appts.body.includes("Request appointment"));
  check("ve cuando puede reservar", appts.body.includes("When you can book"));

  section("MARCAR UNA COMIDA MUEVE LA ADHERENCIA");

  const before = adherencePct(dash.body);
  check("el dashboard trae un porcentaje", before !== undefined, `${before}`);
  check("y el juego de datos deja alguna comida sin marcar", freeMealTypeId != null);

  const { error: markErr } = await client.sb
    .from("meal_check")
    .insert({ plan_id: plan.id, day_num: freeMealDay, meal_type_id: freeMealTypeId });
  check("marca una comida pendiente de un dia vivido", !markErr, markErr?.message);

  const after = await get("/my/dashboard", client.header);
  const afterPct = adherencePct(after.body);
  check(
    `la adherencia sube de ${before}% a ${afterPct}%`,
    Number(afterPct) > Number(before),
    `${before} -> ${afterPct}`
  );

  await client.sb
    .from("meal_check")
    .delete()
    .eq("plan_id", plan.id)
    .eq("day_num", freeMealDay)
    .eq("meal_type_id", freeMealTypeId);

  const restored = await get("/my/dashboard", client.header);
  check(
    "y vuelve a bajar al desmarcarla",
    adherencePct(restored.body) === before
  );

  section("EL PROFESIONAL VE LO QUE SU CLIENTE APORTA");

  const { data: me } = await client.sb.from("client").select("id").single();

  const ficha = await get(`/clients/${me.id}`, nutri.header);
  check("la ficha responde 200", ficha.status === 200, `${ficha.status}`);
  check("tiene la adherencia", ficha.body.includes("Plan adherence"));
  check(
    "con el mismo porcentaje que ve el cliente",
    adherencePct(ficha.body) === before,
    `nutri ${adherencePct(ficha.body)} vs cliente ${before}`
  );
  check(
    "tiene la serie de peso declarada",
    ficha.body.includes("Weight reported by the client")
  );
  check(
    "y avisa de que no sustituye al peso de la ficha",
    ficha.body.includes("does not change the weight on file")
  );

  section("EL PROFESIONAL CONFIRMA LA PETICION");

  const { data: pending } = await client.sb
    .from("appointment")
    .select("id, status")
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  check("el cliente tiene una peticion pendiente", pending?.id > 0);

  const cal = await get("/calendar", nutri.header);
  check("el calendario responde 200", cal.status === 200, `${cal.status}`);
  check(
    "ensena la seccion de peticiones",
    cal.body.includes("Requests waiting for you")
  );
  check("con el boton de confirmar", cal.body.includes("Confirm"));

  await nutri.sb
    .from("appointment")
    .update({ status: "scheduled" })
    .eq("id", pending.id)
    .eq("status", "pending");

  const clientAppts = await get("/my/appointments", client.header);
  check(
    "tras confirmarla, el cliente la ve confirmada",
    clientAppts.body.includes("Confirmed")
  );

  await nutri.sb
    .from("appointment")
    .update({ status: "pending" })
    .eq("id", pending.id);

  section("EL BADGE DE NO LEIDOS SE LIMPIA AL LEER");

  const { data: reply } = await nutri.sb
    .from("message")
    .insert({
      nutritionist_id: (await nutri.sb.auth.getUser()).data.user.id,
      client_id: me.id,
      sender: "nutritionist",
      body: "Checked your week, the numbers look good.",
    })
    .select("id")
    .single();

  const withBadge = await get("/my/dashboard", client.header);
  check(
    "el sidebar del cliente ensena el aviso",
    withBadge.body.includes(BADGE_MARK),
    "no se encontro el contador"
  );

  await get("/my/messages", client.header);

  const cleared = await get("/my/dashboard", client.header);
  check(
    "y desaparece despues de abrir el hilo",
    !cleared.body.includes(BADGE_MARK)
  );

  await nutri.sb.from("message").delete().eq("id", reply.id);

  section("EL PANEL DEL PROFESIONAL SIGUE IGUAL");

  for (const path of ["/dashboard", "/clients", "/plans", "/calendar", "/messages"]) {
    const res = await get(path, nutri.header);
    check(`${path} responde 200`, res.status === 200, `${res.status}`);
  }

  const crossed = await get("/my/dashboard", nutri.header);
  check(
    "el profesional no entra al panel del cliente",
    crossed.status === 307 || crossed.status === 302,
    `${crossed.status}`
  );

  console.log(`\n==== ${passed} passed, ${failed} failed ====`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nERROR: ${e.message}`);
  process.exit(1);
});
