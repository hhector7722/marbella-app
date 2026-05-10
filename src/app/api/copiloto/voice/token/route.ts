import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { normalizeCopilotRole, canExecute, type RoleName } from "@/lib/copilot/permissions";
import { ACTION_SCHEMA, type CopilotAction } from "@/lib/copilot/actions";
import { zodToJsonSchema } from "zod-to-json-schema";

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

  const systemPrompt = `Eres Crack, el asistente operativo de voz de Bar La Marbella.
REGLA ABSOLUTA: PROHIBIDO INVENTAR. Si una herramienta devuelve que no hay ingredientes o datos, di exactamente eso: "La receta existe pero no tiene ingredientes registrados en la base de datos". 
JAMÁS digas "Generalmente lleva..." o recetas genéricas. Si no está en la base de datos, no existe.
Sé breve, seco y directo. Idioma: español. Texto plano.`;

// OpenAI Realtime requires strict JSON Schema objects. zodToJsonSchema v4 emits
// broken output for some schemas, so we build them manually.
function buildJsonSchema(zodShape: Record<string, any>): Record<string, any> {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(zodShape)) {
    const def = field?._def;
    const typeName = def?.typeName;
    let prop: Record<string, any> = { type: "string" };

    if (typeName === "ZodString") {
      prop = { type: "string" };
      if (def.description) prop.description = def.description;
    } else if (typeName === "ZodNumber") {
      prop = { type: "number" };
    } else if (typeName === "ZodEnum" || typeName === "ZodNativeEnum") {
      prop = { type: "string", enum: def.values ?? Object.values(def.entries ?? {}) };
      if (def.description) prop.description = def.description;
    } else if (typeName === "ZodArray") {
      prop = { type: "array", items: {} };
    } else if (typeName === "ZodObject") {
      prop = buildJsonSchema(def.shape?.() ?? {});
    } else if (typeName === "ZodRecord") {
      prop = { type: "object", additionalProperties: true };
    } else if (typeName === "ZodOptional" || typeName === "ZodDefault") {
      // Unwrap and recurse — treat inner type, mark not required
      const inner = def.innerType?._def;
      if (inner?.typeName === "ZodString") {
        prop = { type: "string" };
        if (inner.description) prop.description = inner.description;
      } else if (inner?.typeName === "ZodEnum") {
        prop = { type: "string", enum: inner.values };
      } else if (inner?.typeName === "ZodObject") {
        prop = buildJsonSchema(inner.shape?.() ?? {});
      } else {
        prop = { type: "string" };
      }
      // don't add to required
      if (def.description) prop.description = def.description;
      properties[key] = prop;
      continue;
    } else if (typeName === "ZodBoolean") {
      prop = { type: "boolean" };
    } else if (typeName === "ZodUnknown" || typeName === "ZodAny") {
      prop = {};
    }

    if (def?.description) prop.description = def.description;
    properties[key] = prop;
    required.push(key);
  }

  const schema: Record<string, any> = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

  const availableTools = (Object.entries(ACTION_SCHEMA) as [CopilotAction, any][])
    .filter(([actionName, def]) => def.rpc && canExecute(role, actionName))
    .map(([name, def]) => {
      const shape = def.schema?._def?.shape?.() ?? {};
      return {
        type: "function",
        name,
        description: def.description,
        parameters: buildJsonSchema(shape),
      };
    });

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
        tools: availableTools,
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[Crack Voice] OpenAI Realtime:", errBody);
      return NextResponse.json(
        { error: `Error OpenAI: ${errBody}` },
        { status: 502 }
      );
    }

    const data = (await response.json()) as {
      client_secret?: { value?: string };
    };
    const secret = data.client_secret?.value;
    if (!secret) {
      console.error("[Crack Voice] respuesta sin client_secret");
      return NextResponse.json(
        { error: "Respuesta OpenAI incompleta" },
        { status: 502 }
      );
    }

    return NextResponse.json({ client_secret: secret, role });
  } catch (e) {
    console.error("[Crack Voice]:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
