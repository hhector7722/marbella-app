import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { normalizeCopilotRole, type RoleName } from "@/lib/copilot/permissions";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role, first_name, last_name")
    .eq("id", user.id)
    .single();

  if (profileErr) {
    console.error("[copiloto voice] perfil:", profileErr);
    return NextResponse.json(
      { error: "No se pudo leer perfil." },
      { status: 500 }
    );
  }

  const role = (normalizeCopilotRole(profile?.role ?? null) ?? "staff") as RoleName;

  const fullName =
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "Usuario";

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Falta OPENAI_API_KEY en el servidor." },
      { status: 503 }
    );
  }

  const systemPrompt = `Eres el asistente operativo de voz de Bar La Marbella (Barcelona).
Hoy es: ${new Date().toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "full" })}.
Responde breve y claro en español. El usuario es ${fullName}; rol efectivo copiloto: ${role}.
No inventes datos de negocio. Para operaciones que requieran herramientas/consultas a base de datos, indica que debe usar el copiloto de texto en pantalla.`;

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "verse",
        instructions: systemPrompt,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[copiloto voice] OpenAI Realtime:", errBody);
      return NextResponse.json(
        { error: "Fallo al preparar sesión de voz" },
        { status: 502 }
      );
    }

    const data = (await response.json()) as {
      client_secret?: { value?: string };
    };
    const secret = data.client_secret?.value;
    if (!secret) {
      console.error("[copiloto voice] respuesta sin client_secret");
      return NextResponse.json(
        { error: "Respuesta OpenAI incompleta" },
        { status: 502 }
      );
    }

    return NextResponse.json({ client_secret: secret, role });
  } catch (e) {
    console.error("[copiloto voice]:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
