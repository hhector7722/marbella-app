import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

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
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role;

  // Redirección basada en rol
  if (role === "manager") {
    redirect("/dashboard");
  } else {
    // Por defecto redirigir a staff dashboard (para staff, supervisor y otros roles)
    redirect("/staff/dashboard");
  }
}