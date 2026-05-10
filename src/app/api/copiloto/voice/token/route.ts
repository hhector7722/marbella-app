import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { normalizeCopilotRole, canExecute, type RoleName } from "@/lib/copilot/permissions";
import { ACTION_SCHEMA, type CopilotAction } from "@/lib/copilot/actions";
import { zodInputToRealtimeSchema } from "@/lib/copilot/tool-runtime";

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
    console.error("[Crack Voice] perfil:", profileErr);
    return NextResponse.json({ error: "No se pudo leer perfil." }, { status: 500 });
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

  const { data: session, error: sessionErr } = await supabase
    .from("ai_chat_sessions")
    .insert({ user_id: user.id, status: "active" })
    .select("id")
    .single();

  if (sessionErr || !session?.id) {
    console.error("[Crack Voice] crear sesion:", sessionErr);
    return NextResponse.json(
      { error: "No se pudo crear sesion IA de voz." },
      { status: 500 }
    );
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const isoDate = now.toISOString().split("T")[0];

  const systemPrompt = `Eres Crack, el asistente operativo de voz de Bar La Marbella. Hoy es ${dateStr}.
Usuario actual: ${fullName}. Rol: ${role}.
REGLA ABSOLUTA: PROHIBIDO INVENTAR. Si una herramienta devuelve que no hay ingredientes o datos, di exactamente eso: "La receta existe pero no tiene ingredientes registrados en la base de datos".
JAMAS digas "Generalmente lleva..." o recetas genericas. Si no esta en la base de datos, no existe.
REGLA FECHAS: La fecha actual es ${isoDate}. Usa esta fecha para calcular rangos. NUNCA uses fechas de 2023.
REGLA EMPLEADOS: NUNCA pidas un ID de usuario.
1. Si mencionan un nombre (ej: "Fernando"), PRIMERO llama a consultar_usuarios({p_filtros: {search: "nombre"}}).
2. Del resultado, obten el UUID del campo "id".
3. SOLO ENTONCES llama a la consulta de horas/asistencia usando ese UUID.
REGLA RECETAS:
1. Para buscar una receta, usa gestionar_recetas({p_accion: "buscar", p_datos: {nombre: "nombre"}}).
2. Confirma el nombre de la receta encontrada (ej: "RECETA: SANGRIA DE CAVA").
3. Presenta ingredientes en formato "Cantidad Unidad de Ingrediente".
Se breve, seco y directo. Idioma: espanol. Texto plano (sin Markdown).`;

  const availableTools = (Object.entries(ACTION_SCHEMA) as Array<
    [CopilotAction, (typeof ACTION_SCHEMA)[CopilotAction]]
  >)
    .filter(([actionName, def]) => def.rpc && canExecute(role, actionName))
    .map(([name, def]) => ({
      type: "function",
      name,
      description: def.description,
      parameters: zodInputToRealtimeSchema(def.schema),
    }));

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "shimmer",
        instructions: systemPrompt,
        tools: availableTools,
        tool_choice: "auto",
        turn_detection: {
          type: "server_vad",
          threshold: 0.8,
          prefix_padding_ms: 300,
          silence_duration_ms: 800,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[Crack Voice] OpenAI Realtime:", errBody);
      return NextResponse.json({ error: `Error OpenAI: ${errBody}` }, { status: 502 });
    }

    const data = (await response.json()) as {
      client_secret?: { value?: string };
    };
    const secret = data.client_secret?.value;
    if (!secret) {
      console.error("[Crack Voice] respuesta sin client_secret");
      return NextResponse.json({ error: "Respuesta OpenAI incompleta" }, { status: 502 });
    }

    return NextResponse.json({ client_secret: secret, role, session_id: session.id });
  } catch (e) {
    console.error("[Crack Voice]:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
