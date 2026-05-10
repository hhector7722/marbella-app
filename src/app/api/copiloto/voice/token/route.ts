import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { normalizeCopilotRole, canExecute, type RoleName } from "@/lib/copilot/permissions";
import { ACTION_SCHEMA, type CopilotAction } from "@/lib/copilot/actions";
import { z } from "zod";

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
// OpenAI Realtime requires strict JSON Schema objects.
function buildJsonSchema(zodType: any): Record<string, any> {
  if (zodType instanceof z.ZodObject) {
    const shape = zodType.shape;
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const propSchema = buildJsonSchema(value);
      properties[key] = propSchema;
      
      const isOptional = value instanceof z.ZodOptional || (value as any)._def?.typeName === "ZodOptional";
      const isDefault = value instanceof z.ZodDefault || (value as any)._def?.typeName === "ZodDefault";
      
      if (!isOptional && !isDefault) {
        required.push(key);
      }
    }

    const res: Record<string, any> = { type: "object", properties };
    if (required.length > 0) res.required = required;
    if (zodType.description) res.description = zodType.description;
    return res;
  }

  if (zodType instanceof z.ZodString) {
    const res: Record<string, any> = { type: "string" };
    if (zodType.description) res.description = zodType.description;
    return res;
  }

  if (zodType instanceof z.ZodNumber) {
    const res: Record<string, any> = { type: "number" };
    if (zodType.description) res.description = zodType.description;
    return res;
  }

  if (zodType instanceof z.ZodBoolean) {
    const res: Record<string, any> = { type: "boolean" };
    if (zodType.description) res.description = zodType.description;
    return res;
  }

  if (zodType instanceof z.ZodEnum || zodType instanceof z.ZodNativeEnum) {
    const def = (zodType as any)._def;
    const values = def.values ?? Object.values(def.entries ?? {});
    const res: Record<string, any> = { type: "string", enum: values };
    if (zodType.description) res.description = zodType.description;
    return res;
  }

  if (zodType instanceof z.ZodArray) {
    const res: Record<string, any> = { 
      type: "array", 
      items: buildJsonSchema((zodType as any)._def.type) 
    };
    if (zodType.description) res.description = zodType.description;
    return res;
  }

  if (zodType instanceof z.ZodOptional || zodType instanceof z.ZodDefault) {
    return buildJsonSchema((zodType as any)._def.innerType);
  }

  if (zodType instanceof z.ZodRecord) {
    return { type: "object", additionalProperties: true };
  }

  // Handle unknown/any as generic object or string to avoid OpenAI errors
  if (zodType instanceof z.ZodUnknown || zodType instanceof z.ZodAny) {
    return { type: "string", description: "Cualquier dato (serializado como string)" };
  }

  // Fallback
  return { type: "string" };
}

  const availableTools = (Object.entries(ACTION_SCHEMA) as [CopilotAction, any][])
    .filter(([actionName, def]) => def.rpc && canExecute(role, actionName))
    .map(([name, def]) => {
      let params = buildJsonSchema(def.schema);
      if (params.type !== "object") {
        params = { type: "object", properties: { p_data: params }, required: ["p_data"] };
      }
      return {
        type: "function",
        name,
        description: def.description,
        parameters: params,
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
