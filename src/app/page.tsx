import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getHomeHrefForUser, isMasterDashboardUser } from "@/lib/master-dashboard";
import { withTimeout } from "@/lib/with-timeout";

/** Respaldo si el proxy no redirigió `/` (p. ej. entorno sin proxy). */
export default async function HomePage() {
  const supabase = await createClient();

  const sessionResult = await withTimeout(
    supabase.auth.getSession(),
    1500,
    { data: { session: null }, error: null }
  );
  const user = sessionResult.data.session?.user ?? null;

  if (!user) {
    redirect("/login");
  }

  const emailFromJwt = user.email ?? "";
  // Master: home sin round-trip a profiles (mismo criterio que proxy).
  if (isMasterDashboardUser(emailFromJwt)) {
    redirect(getHomeHrefForUser(emailFromJwt));
  }

  const profileResult = await withTimeout(
    (async () => {
      try {
        return await supabase
          .from("profiles")
          .select("role, email")
          .eq("id", user.id)
          .maybeSingle();
      } catch {
        return { data: null, error: null };
      }
    })(),
    1500,
    { data: null, error: null }
  );

  const role = profileResult.data?.role;
  const email = profileResult.data?.email ?? emailFromJwt;

  redirect(getHomeHrefForUser(email, role ?? "staff"));
}
