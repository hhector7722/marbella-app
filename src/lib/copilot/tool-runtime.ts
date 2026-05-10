import { z } from "zod";
import { ACTION_SCHEMA, type CopilotAction } from "./actions";
import { canExecute, type RoleName } from "./permissions";

export type CopilotToolResult =
  | { ok: true; actionName: CopilotAction; rpc: string; params: Record<string, unknown>; data: unknown }
  | {
      ok: false;
      actionName?: CopilotAction;
      rpc?: string;
      params?: Record<string, unknown>;
      status: number;
      error: string;
      detail?: string;
      sent?: unknown;
    };

export type CopilotSupabaseClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (table: "ai_call_logs") => {
    insert: (values: unknown) => Promise<{ error: { message: string } | null }>;
  };
};

export function sanitizeRealtimeArgs(args: unknown): unknown {
  if (args == null) return {};
  return JSON.parse(JSON.stringify(args, (_key, value) => (value === null ? undefined : value)));
}

export function buildCopilotRpcPayload(
  actionName: CopilotAction,
  parsedData: unknown,
  role: RoleName,
  userId: string
): Record<string, unknown> {
  let rpcPayload: Record<string, unknown> = {
    ...((parsedData ?? {}) as Record<string, unknown>),
  };

  if (actionName === "consultar_usuarios" && rpcPayload.p_filtros === undefined) {
    rpcPayload = { ...rpcPayload, p_filtros: {} };
  }

  if (
    role === "staff" &&
    (actionName === "consultar_registros_asistencia" ||
      actionName === "consultar_registros_horas_extras")
  ) {
    rpcPayload = { ...rpcPayload, p_user_id: userId };
  }

  return rpcPayload;
}

export async function executeCopilotTool(params: {
  supabase: CopilotSupabaseClient;
  role: RoleName;
  userId: string;
  toolName: unknown;
  args: unknown;
  sessionId?: string | null;
  mode: "chat" | "voice";
}): Promise<CopilotToolResult> {
  const { supabase, role, userId, toolName, args, sessionId = null, mode } = params;

  if (typeof toolName !== "string" || !ACTION_SCHEMA[toolName as CopilotAction]) {
    return { ok: false, status: 404, error: "Herramienta no encontrada" };
  }

  const actionName = toolName as CopilotAction;
  const def = ACTION_SCHEMA[actionName];

  if (!def.rpc) {
    return { ok: false, actionName, status: 400, error: "Herramienta sin RPC definida" };
  }

  if (!canExecute(role, actionName)) {
    return {
      ok: false,
      actionName,
      rpc: def.rpc,
      status: 403,
      error: `Permiso denegado (${role}). No puedes usar "${actionName}".`,
    };
  }

  const sanitizedArgs = sanitizeRealtimeArgs(args);
  const parsed = def.schema.safeParse(sanitizedArgs);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => i.message).join("; ");
    return {
      ok: false,
      actionName,
      rpc: def.rpc,
      status: 400,
      error: "Parametros invalidos",
      detail,
      sent: sanitizedArgs,
    };
  }

  const rpcPayload = buildCopilotRpcPayload(actionName, parsed.data, role, userId);
  const { data: rpcResult, error: rpcErr } = await supabase.rpc(def.rpc, rpcPayload);
  const resultData = rpcErr ? { error: `Error en base de datos: ${rpcErr.message}` } : rpcResult;

  const { error: logErr } = await supabase.from("ai_call_logs").insert({
    user_id: userId,
    session_id: sessionId,
    summary: JSON.stringify({
      copilot_tool: actionName,
      rpc: def.rpc,
      params: rpcPayload,
      result: resultData,
      mode,
    }),
    duration_seconds: 0,
  });
  if (logErr) {
    console.error("[Copiloto Tools] ai_call_logs:", logErr);
  }

  if (rpcErr) {
    return {
      ok: false,
      actionName,
      rpc: def.rpc,
      params: rpcPayload,
      status: 200,
      error: `Error en base de datos: ${rpcErr.message}`,
    };
  }

  return { ok: true, actionName, rpc: def.rpc, params: rpcPayload, data: rpcResult ?? null };
}

function stripSchemaMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSchemaMetadata);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "$schema" || key === "default") continue;
    out[key] = stripSchemaMetadata(child);
  }
  return out;
}

export function zodInputToRealtimeSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema, { io: "input" });
  const clean = stripSchemaMetadata(jsonSchema) as Record<string, unknown>;

  if (clean.type !== "object") {
    return {
      type: "object",
      properties: { p_data: clean },
      required: ["p_data"],
    };
  }

  if (!clean.properties) {
    clean.properties = {};
  }

  return clean;
}
