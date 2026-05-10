import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { normalizeCopilotRole, canExecute, type RoleName } from "@/lib/copilot/permissions";
import { ACTION_SCHEMA, type CopilotAction } from "@/lib/copilot/actions";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = (normalizeCopilotRole(profileRow?.role) ?? "staff") as RoleName;

    const body = await req.json();
    const { toolName, args } = body;

    if (!toolName || !ACTION_SCHEMA[toolName as CopilotAction]) {
      return NextResponse.json({ error: "Herramienta no encontrada" }, { status: 404 });
    }

    const actionName = toolName as CopilotAction;
    const def = ACTION_SCHEMA[actionName];

    if (!def.rpc) {
      return NextResponse.json({ error: "Herramienta sin RPC definida" }, { status: 400 });
    }

    if (!canExecute(role, actionName)) {
      return NextResponse.json(
        { error: `Permiso denegado (${role}). No puedes usar "${actionName}".` },
        { status: 403 }
      );
    }

    // Sanitize args: OpenAI Realtime sometimes sends null for optional fields, 
    // which Zod might reject if they are expected to be undefined or string.
    const sanitizedArgs = args ? JSON.parse(JSON.stringify(args, (k, v) => (v === null ? undefined : v))) : {};

    const parsed = def.schema.safeParse(sanitizedArgs);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      console.error(`[Copiloto Tools] Validation Error in ${actionName}:`, msg, sanitizedArgs);
      return NextResponse.json({ error: "Parámetros inválidos", detail: msg, sent: sanitizedArgs }, { status: 400 });
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

    const { data: rpcResult, error: rpcErr } = await supabase.rpc(def.rpc as never, rpcPayload as never);
    
    let resultData: any;
    if (rpcErr) {
      console.error(`[Copiloto Tools] DB Error in ${actionName}:`, rpcErr);
      resultData = { error: `Error en base de datos: ${rpcErr.message}` };
    } else {
      resultData = { result: rpcResult ?? null };
    }

    // Log the call
    await supabase.from("ai_call_logs").insert({
      user_id: user.id,
      summary: JSON.stringify({
        copilot_tool: actionName,
        rpc: def.rpc,
        params: rpcPayload,
        result: resultData,
        mode: "voice"
      }),
      duration_seconds: 0,
    });

    return NextResponse.json(resultData);
  } catch (error: any) {
    console.error("[Copiloto Tools] Error:", error);
    return NextResponse.json({ error: "Error interno", detail: error.message }, { status: 500 });
  }
}
