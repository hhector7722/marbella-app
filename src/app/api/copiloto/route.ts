import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  type ToolSet,
  type UIMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { after } from "next/server";
import type { CopilotAction } from "@/lib/copilot/actions";
import { ACTION_SCHEMA } from "@/lib/copilot/actions";
import { normalizeCopilotRole, type RoleName } from "@/lib/copilot/permissions";
import { executeCopilotTool, type CopilotSupabaseClient } from "@/lib/copilot/tool-runtime";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 60;

function lastUserUiText(messages: UIMessage[]): string | null {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last?.parts?.length) return null;

  let out = "";
  for (const part of last.parts) {
    if (
      typeof part === "object" &&
      part !== null &&
      "type" in part &&
      (part as { type: string }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      out += (part as { text: string }).text;
    }
  }

  const text = out.trim();
  return text || null;
}

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "Falta OPENAI_API_KEY en el servidor." },
      { status: 503 }
    );
  }

  let bodyJson: Record<string, unknown>;
  try {
    bodyJson = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Cuerpo JSON invalido" }, { status: 400 });
  }

  const messages = bodyJson.messages as UIMessage[] | undefined;
  const sessionId = bodyJson.sessionId as string | null | undefined;

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "Faltan mensajes" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return new Response("No autorizado", { status: 401 });
  }

  const { data: profileRow, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileErr) {
    console.error("[Crack] perfil:", profileErr);
    return Response.json(
      { error: "No se pudo leer el perfil.", detail: profileErr.message },
      { status: 500 }
    );
  }

  const role = (normalizeCopilotRole(profileRow?.role) ?? "staff") as RoleName;
  let activeSessionId: string | null = sessionId ?? null;

  if (activeSessionId) {
    const { data: existing, error: selErr } = await supabase
      .from("ai_chat_sessions")
      .select("id")
      .eq("id", activeSessionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (selErr) {
      console.error("[Crack] session lookup:", selErr);
      return Response.json(
        { error: "No se pudo validar sesion IA", detail: selErr.message },
        { status: 500 }
      );
    }

    if (!existing?.id) {
      return Response.json({ error: "Sesion no encontrada" }, { status: 404 });
    }
  } else {
    const { data: session, error: insErr } = await supabase
      .from("ai_chat_sessions")
      .insert({ user_id: user.id, status: "active" })
      .select("id")
      .single();

    if (insErr || !session?.id) {
      console.error("[Crack] crear sesion:", insErr);
      return Response.json(
        { error: "No se pudo crear sesion IA", detail: insErr?.message ?? "" },
        { status: 500 }
      );
    }

    activeSessionId = session.id;
  }

  const userTextLogged = lastUserUiText(messages);
  if (!userTextLogged) {
    return Response.json({ error: "Ultimo mensaje de usuario vacio" }, { status: 400 });
  }

  const { error: msgUserErr } = await supabase.from("ai_chat_messages").insert({
    session_id: activeSessionId,
    user_id: user.id,
    role: "user",
    content_type: "text",
    text_content: userTextLogged,
  });

  if (msgUserErr) {
    console.error("[Crack] insert usuario:", msgUserErr);
    return Response.json(
      { error: "No se pudo guardar el mensaje", detail: msgUserErr.message },
      { status: 500 }
    );
  }

  const toolsObj: ToolSet = {};

  for (const [actionName, def] of Object.entries(ACTION_SCHEMA) as Array<
    [CopilotAction, (typeof ACTION_SCHEMA)[CopilotAction]]
  >) {
    if (!def.rpc) continue;

    toolsObj[actionName] = {
      description: def.description,
      inputSchema: def.schema,
      execute: async (inputUnknown: unknown) => {
        const result = await executeCopilotTool({
          supabase: supabase as unknown as CopilotSupabaseClient,
          role,
          userId: user.id,
          toolName: actionName,
          args: inputUnknown,
          sessionId: activeSessionId,
          mode: "chat",
        });

        if (!result.ok) {
          return { error: result.error, detail: result.detail, sent: result.sent };
        }

        return result.data;
      },
    };
  }

  const todayLabel = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const todayIso = new Date().toISOString().split("T")[0];

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: `Eres Crack, el asistente operativo de Bar La Marbella. Hoy es ${todayLabel}.
REGLA ABSOLUTA DE FORMATO: NUNCA uses simbolos Markdown. CERO asteriscos (*), CERO almohadillas (#), CERO guiones bajos (_). Texto plano siempre.
Para secciones usa MAYUSCULAS seguidas de dos puntos. Para listas usa numeracion simple.
REGLA FECHAS: La fecha actual es ${todayIso}. Usa esta fecha para calcular rangos. La semana actual va de lunes a domingo del calendario real. NUNCA uses fechas de 2023.
REGLA EMPLEADOS: NUNCA pidas un ID de usuario. Cuando el usuario mencione un nombre de empleado, usa consultar_usuarios({p_filtros: {search: "nombre"}}) primero para obtener el UUID, luego usa ese UUID en consultas de horas/asistencia.
REGLA RECETAS: Confirma el nombre de la receta encontrada, presenta ingredientes en formato "Cantidad Unidad - Ingrediente" y nunca inventes ingredientes.
Rol: ${role}.`,
    messages: await convertToModelMessages(messages),
    tools: toolsObj,
    stopWhen: stepCountIs(10),
  });

  const response = result.toUIMessageStreamResponse();
  if (activeSessionId) {
    response.headers.set("X-Session-Id", activeSessionId);
  }

  const userId = user.id;
  const sessionForAfter = activeSessionId;

  after(async () => {
    try {
      const txt = await result.text;
      if (!sessionForAfter || !txt.trim()) return;

      const sb = await createClient();
      const { error } = await sb.from("ai_chat_messages").insert({
        session_id: sessionForAfter,
        user_id: userId,
        role: "assistant",
        content_type: "text",
        text_content: txt.trim(),
      });

      if (error) {
        console.error("[copiloto] persist assistant message:", error);
      }
    } catch (e) {
      console.error("[copiloto] after() persist assistant:", e);
    }
  });

  return response;
}
