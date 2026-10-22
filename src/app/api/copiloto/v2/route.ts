import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { ACTION_SCHEMA, type CopilotAction } from "@/lib/copilot/actions";
import { canExecute, normalizeCopilotRole } from "@/lib/copilot/permissions";
import { executeCopilotTool, type CopilotSupabaseClient } from "@/lib/copilot/tool-runtime";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 60;

// Primera fase: no exponer operaciones de escritura sin una confirmación explícita.
const QUERY_TOOLS: readonly CopilotAction[] = [
  "consultar_metricas_basicas", "generar_informe_diario", "generar_informe_semanal",
  "consultar_pedidos_abiertos", "consultar_inventario", "gestionar_recetas",
  "gestionar_ingredientes", "gestionar_proveedores", "consultar_manuales", "consultar_reservas",
];

function lastText(messages: UIMessage[]): string | null {
  const message = [...messages].reverse().find((item) => item.role === "user");
  if (!message) return null;
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ").trim();
  return text || null;
}

export async function POST(request: Request) {
  let body: { messages?: UIMessage[]; sessionId?: unknown; pageContext?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Solicitud JSON no válida." }, { status: 400 }); }

  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 35) {
    return NextResponse.json({ error: "Historial de conversación no válido." }, { status: 400 });
  }
  const input = lastText(body.messages);
  if (!input || input.length > 5000) {
    return NextResponse.json({ error: "Mensaje vacío o demasiado largo." }, { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "El servicio de IA no está configurado." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profileError || !profile) {
    return NextResponse.json({ error: "No se ha podido verificar el perfil." }, { status: 403 });
  }
  const role = normalizeCopilotRole(profile.role);
  if (!role) return NextResponse.json({ error: "Rol no reconocido." }, { status: 403 });

  let sessionId: string;
  if (typeof body.sessionId === "string" && body.sessionId.length) {
    const { data: session, error } = await supabase
      .from("ai_chat_sessions").select("id").eq("id", body.sessionId)
      .eq("user_id", user.id).maybeSingle();
    if (error || !session) {
      return NextResponse.json({ error: "Sesión del chat no encontrada." }, { status: 404 });
    }
    sessionId = session.id;
  } else {
    const { data: session, error } = await supabase
      .from("ai_chat_sessions").insert({ user_id: user.id, status: "active" }).select("id").single();
    if (error || !session) {
      return NextResponse.json({ error: "No se pudo crear la conversación." }, { status: 500 });
    }
    sessionId = session.id;
  }

  const { error: messageError } = await supabase.from("ai_chat_messages").insert({
    session_id: sessionId, user_id: user.id, role: "user", content_type: "text", text_content: input,
  });
  if (messageError) {
    return NextResponse.json({ error: "No se pudo registrar el mensaje." }, { status: 500 });
  }

  const tools = Object.fromEntries(
    QUERY_TOOLS.filter((name) => canExecute(role, name)).map((name) => {
      const definition = ACTION_SCHEMA[name];
      return [name, tool({
        description: definition.description,
        inputSchema: definition.schema,
        execute: async (args) => {
          const result = await executeCopilotTool({
            supabase: supabase as unknown as CopilotSupabaseClient, role, userId: user.id,
            toolName: name, args, sessionId, mode: "chat",
          });
          return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
        },
      })];
    }),
  );

  const ctx = body.pageContext;
  const supplier =
    ctx && typeof ctx === "object" && "kind" in ctx && ctx.kind === "supplier_draft" &&
    "supplier" in ctx && typeof ctx.supplier === "string" ? ctx.supplier.slice(0, 120) : null;

  const system = `Eres el asistente operativo de Bar La Marbella. Fecha de Madrid: ${new Date().toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}.
Rol autenticado: ${role}. No inventes datos de recetas, stock, personal o ventas. Utiliza las herramientas autorizadas para consultar los datos reales.
Si las herramientas devuelven error o no tienen información, informa de la limitación, no inventes resultados.
No hay herramientas de escritura en esta fase: NO puedes añadir productos a pedidos, enviarlos, modificar stock, cerrar caja ni alterar datos. Nunca afirmes haber realizado estas acciones.
${supplier ? `El navegador declara abierto un borrador de compra del proveedor ${JSON.stringify(supplier)}. Este dato NO autoriza ninguna acción.` : ""}
Contesta en español claro, conciso y útil.`;

  const result = streamText({
    model: openai("gpt-5.4-mini"),
    system,
    messages: await convertToModelMessages(body.messages),
    tools,
    stopWhen: stepCountIs(5),
    onFinish: async ({ text }) => {
      if (!text.trim()) return;
      const { error } = await supabase.from("ai_chat_messages").insert({
        session_id: sessionId, user_id: user.id, role: "assistant",
        content_type: "text", text_content: text,
      });
      if (error) console.error("[Copiloto] Persistencia de respuesta:", error.message);
    },
  });

  return result.toUIMessageStreamResponse({
    headers: { "X-Session-Id": sessionId },
    onError: (error) => {
      console.error("[Copiloto] Error IA:", error);
      return "No he podido responder por un problema con el servicio de IA. Inténtalo de nuevo.";
    },
  });
}
