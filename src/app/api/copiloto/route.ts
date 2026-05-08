import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  type UIMessage,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { after } from "next/server";
import type { CopilotAction } from "@/lib/copilot/actions";
import { ACTION_SCHEMA } from "@/lib/copilot/actions";
import {
  canExecute,
  normalizeCopilotRole,
  type RoleName,
} from "@/lib/copilot/permissions";
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
  const t = out.trim();
  return t || null;
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
    return Response.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
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
      {
        error: "No se pudo leer el perfil.",
        detail: profileErr.message,
      },
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
        { error: "No se pudo validar sesión IA", detail: selErr.message },
        { status: 500 }
      );
    }
    if (!existing?.id) {
      return Response.json({ error: "Sesión no encontrada" }, { status: 404 });
    }
  } else {
    const { data: session, error: insErr } = await supabase
      .from("ai_chat_sessions")
      .insert({ user_id: user.id, status: "active" })
      .select("id")
      .single();
    if (insErr || !session?.id) {
      console.error("[Crack] crear sesión:", insErr);
      return Response.json(
        {
          error: "No se pudo crear sesión IA",
          detail: insErr?.message ?? "",
        },
        { status: 500 }
      );
    }
    activeSessionId = session.id;
  }

  const userTextLogged = lastUserUiText(messages);
  if (!userTextLogged) {
    return Response.json({ error: "Último mensaje de usuario vacío" }, {
      status: 400,
    });
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

  const toolsObj: Record<
    string,
    {
      description: string;
      inputSchema: typeof ACTION_SCHEMA[CopilotAction]["schema"];
      execute: (input: unknown) => Promise<unknown>;
    }
  > = {};

  for (const [name, definition] of Object.entries(ACTION_SCHEMA) as Array<
    [CopilotAction, (typeof ACTION_SCHEMA)[CopilotAction]]
  >) {
    const actionName = name;
    const def = definition;
    if (!def.rpc) continue;

    toolsObj[actionName] = {
      description: def.description,
      inputSchema: def.schema,
      execute: async (inputUnknown: unknown) => {
        if (!canExecute(role, actionName)) {
          return {
            error: `Permiso denegado (${role}). No puedes usar "${actionName}".`,
          };
        }

        const parsed = def.schema.safeParse(inputUnknown);
        if (!parsed.success) {
          const msg = parsed.error.issues.map((i) => i.message).join("; ");
          return { error: "Parámetros inválidos", detail: msg };
        }

        const rawParams = parsed.data as Record<string, unknown>;
        let rpcPayload: Record<string, unknown> = { ...rawParams };

        if (actionName === "consultar_usuarios" && rpcPayload.p_filtros === undefined) {
          rpcPayload = { ...rpcPayload, p_filtros: {} };
        }

        if (
          role === "staff" &&
          (actionName === "consultar_registros_asistencia" ||
            actionName === "consultar_registros_horas_extras")
        ) {
          rpcPayload = { ...rpcPayload, p_user_id: user.id };
        }

        console.log(`[Crack Tool] Executing ${actionName}`, rpcPayload);
        const { data: rpcResult, error: rpcErr } = await supabase.rpc(def.rpc as never, rpcPayload as never);
        let resultData: unknown;
        if (rpcErr) {
          console.error(`[Crack Tool] DB Error in ${actionName}:`, rpcErr);
          resultData = {
            error: `Error en base de datos: ${rpcErr.message}`,
          };
        } else {
          console.log(`[Crack Tool] ${actionName} Result:`, rpcResult);
          resultData = rpcResult;
        }

        const summarySer = JSON.stringify({
          copilot_tool: actionName,
          rpc: def.rpc,
          params: rpcPayload,
          result: resultData,
        });

        const { error: logErr } = await supabase.from("ai_call_logs").insert({
          user_id: user.id,
          session_id: activeSessionId,
          summary: summarySer,
          duration_seconds: 0,
        });
        if (logErr) {
          console.error("[Crack] ai_call_logs:", logErr);
        }

        return resultData;
      },
    };
  }

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: `Eres Crack, el asistente operativo de Bar La Marbella (Barcelona).
Hoy es: ${new Date().toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "full" })}.
Responde de forma profesional, directa y sin rodeos. Idioma: español.
NUNCA uses formato markdown (como **texto** o asteriscos), responde siempre en texto plano simple.

REGLA DE ORO: Para CUALQUIER pregunta sobre precios, ingredientes, recetas (ej: sangría, tapas), personal, inventario, proveedores o métricas, DEBES usar las herramientas (herramientas). 
No digas "no tengo acceso" o "consulta al personal" sin haber intentado usar la herramienta correspondiente primero. 
Si una herramienta no devuelve el resultado esperado, informa que no se encontró en la base de datos, pero SIEMPRE inténtalo.
Si te preguntan por algo que "ofrecemos", búscalo en la carta o en las recetas.

El rol efectivo es: ${role}.
Usa las herramientas para consultas y mutaciones de datos antes de afirmaciones operativas.
Si una herramienta devuelve un objeto con clave "error", explícale al usuario qué falló.
Los valores numéricos 0 en datos resumidos se muestran como un espacio " " cuando presentes texto al usuario.
Las fechas de herramientas en formato YYYY-MM-DD.`,
    messages: await convertToModelMessages(messages),
    // Tipado: toolsObj es dinámico; forzamos a any para evitar inferencia TOOLS=never.
    tools: toolsObj as any,
    stopWhen: stepCountIs(6) as any,
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
