import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { isMasterDashboardUser } from "@/lib/master-dashboard";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Obtener rol del usuario
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .single();

  const role = profile?.role;
  const email = profile?.email ?? user.email ?? "";

  if (isMasterDashboardUser(email)) {
    redirect("/master/dashboard");
  }

  if (role === "manager") {
    redirect("/dashboard");
  }

  redirect("/staff/dashboard");
}