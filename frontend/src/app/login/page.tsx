import { redirect } from "next/navigation";
import { signIn } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  // si ya hay sesion, no tiene sentido el login
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">NutriApp</h1>
        <p className="text-sm text-gray-500">Acceso para nutricionistas</p>
      </div>

      <form action={signIn} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Contraseña
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="mt-2 rounded bg-black px-3 py-2 text-white"
        >
          Entrar
        </button>
      </form>

      {searchParams.error ? (
        <p className="text-sm text-red-600">{searchParams.error}</p>
      ) : null}
    </main>
  );
}
