import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { after } from "next/server";
import ollama, { type Tool } from "ollama";
import type { CopilotAction } from "@/lib/copilot/actions";
import { ACTION_SCHEMA } from "@/lib/copilot/actions";
import {
  normalizeCopilotRole,
  type RoleName,
} from "@/lib/copilot/permissions";
import {
  executeCopilotTool,
  type CopilotSupabaseClient,
} from "@/lib/copilot/tool-runtime";
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

function buildOllamaTools() {
  const stringProperty = (description?: string) => ({
    type: "string" as const,
    ...(description ? { description } : {}),
  });

  const objectProperty = () => ({
    type: "object" as const,
  });

  const tools = [
    {
      type: "function" as const,
      function: {
        name: "gestionar_proveedores",
        description:
          "Consulta información de contacto de proveedores registrados. Usa listar para obtener todos los proveedores. Usa buscar para buscar por nombre.",
        parameters: {
          type: "object",
          properties: {
            p_accion: {
              type: "string",
              enum: ["buscar", "listar", "consultar"],
              description:
                "listar = todos los proveedores; buscar = proveedor por nombre; consultar = consultar un proveedor.",
            },
            p_datos: {
              type: "object",
              properties: {
                nombre: {
                  type: "string",
                  description: "Nombre del proveedor cuando corresponda.",
                },
              },
            },
          },
          required: ["p_accion"],
        },
      },
    },

    {
      type: "function" as const,
      function: {
        name: "gestionar_recetas",
        description:
          "Consulta recetas, ingredientes y costes de elaboración.",
        parameters: {
          type: "object",
          properties: {
            p_accion: {
              type: "string",
              enum: ["buscar", "listar", "consultar"],
            },
            p_datos: {
              type: "object",
              properties: {
                nombre: stringProperty("Nombre de la receta."),
              },
            },
          },
          required: ["p_accion"],
        },
      },
    },

    {
      type: "function" as const,
      function: {
        name: "gestionar_ingredientes",
        description:
          "Consulta el catálogo de ingredientes y precios de compra.",
        parameters: {
          type: "object",
          properties: {
            p_accion: {
              type: "string",
              enum: ["buscar", "listar", "consultar"],
            },
            p_datos: {
              type: "object",
              properties: {
                nombre: stringProperty("Nombre del ingrediente."),
              },
            },
          },
          required: ["p_accion"],
        },
      },
    },

    {
      type: "function" as const,
      function: {
        name: "gestionar_consumo_personal",
        description:
          "Consulta y registra consumo de personal.",
        parameters: {
          type: "object",
          properties: {
            p_accion: {
              type: "string",
              enum: ["buscar", "listar", "consultar"],
            },
            p_datos: {
              type: "object",
              properties: {
                nombre: stringProperty("Nombre del empleado."),
              },
            },
          },
          required: ["p_accion"],
        },
      },
    },

    {
      type: "function" as const,
      function: {
        name: "consultar_inventario",
        description:
          "Lista ingredientes con stock actual y unidad de medida.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },

    {
      type: "function" as const,
      function: {
        name: "consultar_pedidos_abiertos",
        description:
          "Obtiene las comandas activas y mesas con productos positivos.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },

    {
      type: "function" as const,
      function: {
        name: "consultar_metricas_basicas",
        description:
          "Consulta las métricas básicas de ventas del día actual.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },

    {
      type: "function" as const,
      function: {
        name: "generar_informe_diario",
        description:
          "Obtiene las ventas y métricas de una fecha concreta.",
        parameters: {
          type: "object",
          properties: {
            p_fecha: stringProperty("Fecha en formato YYYY-MM-DD."),
          },
          required: ["p_fecha"],
        },
      },
    },

    {
      type: "function" as const,
      function: {
        name: "generar_informe_semanal",
        description:
          "Agrega ventas diarias y resumen de caja para un rango de fechas.",
        parameters: {
          type: "object",
          properties: {
            p_fecha_inicio: stringProperty("Fecha inicial YYYY-MM-DD."),
            p_fecha_fin: stringProperty("Fecha final YYYY-MM-DD."),
          },
          required: ["p_fecha_inicio", "p_fecha_fin"],
        },
      },
    },

    {
      type: "function" as const,
      function: {
        name: "consultar_costes_mano_obra",
        description:
          "Consulta el coste laboral estimado entre dos fechas.",
        parameters: {
          type: "object",
          properties: {
            p_fecha_inicio: stringProperty("Fecha inicial YYYY-MM-DD."),
            p_fecha_fin: stringProperty("Fecha final YYYY-MM-DD."),
          },
          required: ["p_fecha_inicio", "p_fecha_fin"],
        },
      },
    },

    {
      type: "function" as const,
      function: {
        name: "consultar_registros_asistencia",
        description:
          "Consulta fichajes de un empleado entre dos fechas.",
        parameters: {
          type: "object",
          properties: {
            p_user_id: {
              type: "string",
              format: "uuid",
              description: "UUID del empleado.",
            },
            p_fecha_inicio: stringProperty("Fecha inicial YYYY-MM-DD."),
            p_fecha_fin: stringProperty("Fecha final YYYY-MM-DD."),
          },
          required: ["p_user_id", "p_fecha_inicio", "p_fecha_fin"],
        },
      },
    },

    {
      type: "function" as const,
      function: {
        name: "consultar_registros_horas_extras",
        description:
          "Consulta las horas extras de un empleado entre dos fechas.",
        parameters: {
          type: "object",
          properties: {
            p_user_id: {
              type: "string",
              format: "uuid",
              description: "UUID del empleado.",
            },
            p_fecha_inicio: stringProperty("Fecha inicial YYYY-MM-DD."),
            p_fecha_fin: stringProperty("Fecha final YYYY-MM-DD."),
          },
          required: ["p_user_id", "p_fecha_inicio", "p_fecha_fin"],
        },
      },
    },

    {
      type: "function" as const,
      function: {
        name: "consultar_usuarios",
        description:
          "Consulta usuarios y empleados. Permite buscar empleados por nombre.",
        parameters: {
          type: "object",
          properties: {
            p_filtros: objectProperty(),
          },
          required: [],
        },
      },
    },

    {
      type: "function" as const,
      function: {
        name: "consultar_reservas",
        description:
          "Consulta las reservas para una fecha concreta.",
        parameters: {
          type: "object",
          properties: {
            p_fecha: stringProperty("Fecha YYYY-MM-DD."),
          },
          required: ["p_fecha"],
        },
      },
    },

    {
      type: "function" as const,
      function: {
        name: "consultar_manuales",
        description:
          "Consulta los manuales y documentación del bar.",
        parameters: {
          type: "object",
          properties: {
            p_tema: stringProperty("Tema que se desea consultar."),
          },
          required: ["p_tema"],
        },
      },
    },
  ];

  return tools.filter((tool) => {
    const action = ACTION_SCHEMA[
      tool.function.name as CopilotAction
    ];

    return Boolean(action?.rpc);
  }) as unknown as Tool[];
}


type LocalRoute = {
  action: CopilotAction;
  arguments: Record<string, unknown>;
};

function routeLocal(text: string): LocalRoute | null {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const providerSearchMatch = normalized.match(
    /(?:busca|buscar|encuentra|encontrar)\s+(?:el\s+)?(?:proveedor\s+)?(.+)/
  );

  if (
    normalized.includes("proveedor") ||
    normalized.includes("proveedores") ||
    providerSearchMatch
  ) {
    if (providerSearchMatch?.[1]) {
      return {
        action: "gestionar_proveedores",
        arguments: {
          p_accion: "buscar",
          p_datos: {
            nombre: providerSearchMatch[1].trim(),
          },
        },
      };
    }

    return {
      action: "gestionar_proveedores",
      arguments: {
        p_accion: "listar",
      },
    };
  }

  if (
    normalized.includes("receta") ||
    normalized.includes("recetas")
  ) {
    return {
      action: "gestionar_recetas",
      arguments: {
        p_accion: "listar",
      },
    };
  }

  if (
    normalized.includes("ingrediente") ||
    normalized.includes("ingredientes")
  ) {
    return {
      action: "gestionar_ingredientes",
      arguments: {
        p_accion: "listar",
      },
    };
  }

  if (
    normalized.includes("stock") ||
    normalized.includes("inventario")
  ) {
    return {
      action: "consultar_inventario",
      arguments: {},
    };
  }

  if (
    normalized.includes("empleado") ||
    normalized.includes("empleados") ||
    normalized.includes("usuario") ||
    normalized.includes("usuarios")
  ) {
    return {
      action: "consultar_usuarios",
      arguments: {},
    };
  }

  if (
    normalized.includes("vendido") ||
    normalized.includes("vendimos") ||
    normalized.includes("ventas") ||
    normalized.includes("venta") ||
    normalized.includes("facturado") ||
    normalized.includes("facturacion")
  ) {
    const monthNames: Record<string, number> = {
      enero: 0,
      febrero: 1,
      marzo: 2,
      abril: 3,
      mayo: 4,
      junio: 5,
      julio: 6,
      agosto: 7,
      septiembre: 8,
      octubre: 9,
      noviembre: 10,
      diciembre: 11,
    };

    const requestedMonth = Object.keys(monthNames).find((month) =>
      normalized.includes(month)
    );

    if (requestedMonth) {
      const now = new Date();
      const year = now.getFullYear();
      const month = monthNames[requestedMonth];

      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);

      const formatDate = (date: Date) =>
        date.toISOString().split("T")[0];

      return {
        action: "generar_informe_semanal",
        arguments: {
          p_fecha_inicio: formatDate(start),
          p_fecha_fin: formatDate(end),
        },
      };
    }
    if (
      normalized.includes("semana") ||
      normalized.includes("semanal")
    ) {
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;

      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const formatDate = (date: Date) =>
        date.toISOString().split("T")[0];

      return {
        action: "generar_informe_semanal",
        arguments: {
          p_fecha_inicio: formatDate(monday),
          p_fecha_fin: formatDate(sunday),
        },
      };
    }

    if (
      normalized.includes("hoy") ||
      normalized.includes("dia de hoy")
    ) {
      return {
        action: "consultar_metricas_basicas",
        arguments: {},
      };
    }

    if (
      normalized.includes("ayer")
    ) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      return {
        action: "generar_informe_diario",
        arguments: {
          p_fecha: yesterday.toISOString().split("T")[0],
        },
      };
    }
  }

  return null;
}

export async function POST(req: Request) {
  let bodyJson: Record<string, unknown>;

  try {
    bodyJson = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "Cuerpo JSON invalido" },
      { status: 400 }
    );
  }

  const messages = bodyJson.messages as UIMessage[] | undefined;
  const sessionId = bodyJson.sessionId as string | null | undefined;

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: "Faltan mensajes" },
      { status: 400 }
    );
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
        {
          error: "No se pudo validar sesion IA",
          detail: selErr.message,
        },
        { status: 500 }
      );
    }

    if (!existing?.id) {
      return Response.json(
        { error: "Sesion no encontrada" },
        { status: 404 }
      );
    }
  } else {
    const { data: session, error: insErr } = await supabase
      .from("ai_chat_sessions")
      .insert({
        user_id: user.id,
        status: "active",
      })
      .select("id")
      .single();

    if (insErr || !session?.id) {
      console.error("[Crack] crear sesion:", insErr);

      return Response.json(
        {
          error: "No se pudo crear sesion IA",
          detail: insErr?.message ?? "",
        },
        { status: 500 }
      );
    }

    activeSessionId = session.id;
  }

  const userTextLogged = lastUserUiText(messages);

  if (!userTextLogged) {
    return Response.json(
      { error: "Ultimo mensaje de usuario vacio" },
      { status: 400 }
    );
  }

  const { error: msgUserErr } = await supabase
    .from("ai_chat_messages")
    .insert({
      session_id: activeSessionId,
      user_id: user.id,
      role: "user",
      content_type: "text",
      text_content: userTextLogged,
    });

  if (msgUserErr) {
    console.error("[Crack] insert usuario:", msgUserErr);

    return Response.json(
      {
        error: "No se pudo guardar el mensaje",
        detail: msgUserErr.message,
      },
      { status: 500 }
    );
  }

  const ollamaTools = buildOllamaTools();
  console.log("[Crack] Ollama tools:", JSON.stringify(ollamaTools, null, 2));

  const todayLabel = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const todayIso = new Date().toISOString().split("T")[0];

  const system = `Eres Crack, el asistente operativo de Bar La Marbella. Hoy es ${todayLabel}.
REGLA ABSOLUTA DE FORMATO: NUNCA uses simbolos Markdown. CERO asteriscos (*), CERO almohadillas (#), CERO guiones bajos (_). Texto plano siempre.
Para secciones usa MAYUSCULAS seguidas de dos puntos. Para listas usa numeracion simple.
REGLA FECHAS: La fecha actual es ${todayIso}. Usa esta fecha para calcular rangos. La semana actual va de lunes a domingo del calendario real. NUNCA uses fechas de 2023.
REGLA EMPLEADOS: NUNCA pidas un ID de usuario. Cuando el usuario mencione un nombre de empleado, usa consultar_usuarios con el nombre para obtener el UUID, luego usa ese UUID en consultas de horas/asistencia.
REGLA RECETAS: Confirma el nombre de la receta encontrada, presenta ingredientes en formato "Cantidad Unidad - Ingrediente" y nunca inventes ingredientes.
Rol: ${role}.`;

  const modelMessages = await convertToModelMessages(messages);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      console.log("[Crack] USER TEXT:", JSON.stringify(userTextLogged));

      const localRoute = routeLocal(userTextLogged);

      console.log(
        "[Crack] LOCAL ROUTE RESULT:",
        localRoute ? JSON.stringify(localRoute) : "NULL"
      );

      if (localRoute) {
        console.log(
          "[Crack] LOCAL ROUTE:",
          localRoute.action,
          JSON.stringify(localRoute.arguments)
        );

        const def = ACTION_SCHEMA[localRoute.action];

        if (def?.rpc) {
          const toolCallId =
            `${localRoute.action}-local-${Math.random().toString(36).slice(2, 10)}`;

          writer.write({
            type: "tool-input-start",
            toolCallId,
            toolName: localRoute.action,
          });

          writer.write({
            type: "tool-input-available",
            toolCallId,
            toolName: localRoute.action,
            input: localRoute.arguments,
          });

          const toolResult = await executeCopilotTool({
            supabase: supabase as unknown as CopilotSupabaseClient,
            role,
            userId: user.id,
            toolName: localRoute.action,
            args: localRoute.arguments,
            sessionId: activeSessionId,
            mode: "chat",
          });

          console.log(
            "[Crack] LOCAL TOOL RESULT:",
            localRoute.action,
            JSON.stringify(toolResult)
          );

          writer.write({
            type: "tool-output-available",
            toolCallId,
            output: toolResult,
          });

          const resultData =
            typeof toolResult === "object" &&
            toolResult !== null &&
            "data" in toolResult
              ? (toolResult as { data: unknown }).data
              : toolResult;

          let resultText: string;

          if (localRoute.action === "gestionar_proveedores") {
            const providers = Array.isArray(resultData)
              ? resultData
              : [];

            resultText =
              "PROVEEDORES REGISTRADOS:\n\n" +
              providers
                .map((provider, index) => {
                  const item = provider as {
                    name?: string;
                    phone?: string | null;
                  };

                  const phone = item.phone ? ` — ${item.phone}` : "";

                  return `${index + 1}. ${item.name ?? "Sin nombre"}${phone}`;
                })
                .join("\n");
          } else {
            resultText = JSON.stringify(resultData, null, 2);
          }

          writer.write({
            type: "text-start",
            id: "text-1",
          });

          writer.write({
            type: "text-delta",
            id: "text-1",
            delta: resultText,
          });

          writer.write({
            type: "text-end",
            id: "text-1",
          });

          return;
        }
      }

      let ollamaMessages: Array<Record<string, unknown>> = [
        {
          role: "system",
          content: system,
        },
        ...modelMessages.map((message) => ({
          role: message.role,
          content:
            typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content),
        })),
      ];

      const maxSteps = 10;

      for (let step = 0; step < maxSteps; step++) {
        console.log(`[Crack] Ollama step ${step + 1}/${maxSteps}`);

        const ollamaStart = Date.now();
        console.log(`[Crack] Ollama START step ${step + 1}`);
        console.log(`[Crack] Ollama input chars: ${JSON.stringify(ollamaMessages).length}`);
        console.log(`[Crack] Ollama tools chars: ${JSON.stringify(ollamaTools).length}`);

        const result = await ollama.chat({
          model: "qwen3:8b",
          messages:
            ollamaMessages as unknown as Parameters<
              typeof ollama.chat
            >[0]["messages"],
          tools: ollamaTools,
          think: false,
          stream: false,
        });

        const message = result.message;

        console.log(
          `[Crack] Ollama END step ${step + 1} (${((Date.now() - ollamaStart) / 1000).toFixed(1)}s)`
        );

        console.log(
          "[Crack] Ollama message:",
          JSON.stringify(message)
        );

        const toolCalls = message.tool_calls ?? [];

        if (toolCalls.length === 0) {
          if (message.content) {
            writer.write({
              type: "text-start",
              id: "text-1",
            });

            writer.write({
              type: "text-delta",
              id: "text-1",
              delta: message.content,
            });

            writer.write({
              type: "text-end",
              id: "text-1",
            });
          }

          break;
        }

        ollamaMessages.push({
          role: "assistant",
          content: message.content ?? "",
          tool_calls: toolCalls,
        });

        for (const call of toolCalls) {
          const toolName = call.function.name;
          const toolArgs = call.function.arguments;

          console.log(
            "[Crack] TOOL CALL:",
            toolName,
            JSON.stringify(toolArgs)
          );

          const actionName = toolName as CopilotAction;
          const def = ACTION_SCHEMA[actionName];

          const toolCallId =
            `${toolName}-${step}-${Math.random().toString(36).slice(2, 10)}`;
          const commandId =
            typeof (call as { id?: unknown }).id === "string"
              ? (call as unknown as { id: string }).id
              : toolCallId;

          if (!def?.rpc) {
            const toolError = {
              error: "Herramienta no encontrada",
            };

            ollamaMessages.push({
              role: "tool",
              content: JSON.stringify(toolError),
            });

            continue;
          }

          writer.write({
            type: "tool-input-start",
            toolCallId,
            toolName,
          });

          writer.write({
            type: "tool-input-available",
            toolCallId,
            toolName,
            input: toolArgs,
          });

          const toolResult = await executeCopilotTool({
            supabase: supabase as unknown as CopilotSupabaseClient,
            role,
            userId: user.id,
            toolName: actionName,
            args: toolArgs,
            sessionId: activeSessionId,
            commandId,
            mode: "chat",
          });

          console.log(
            "[Crack] TOOL RESULT:",
            toolName,
            JSON.stringify(toolResult)
          );

          writer.write({
            type: "tool-output-available",
            toolCallId,
            output: toolResult,
          });

          ollamaMessages.push({
            role: "tool",
            content: JSON.stringify(toolResult),
          });
        }
      }
    },
  });

  const response = createUIMessageStreamResponse({
    stream,
  });

  if (activeSessionId) {
    response.headers.set("X-Session-Id", activeSessionId);
  }

  const userId = user.id;
  const sessionForAfter = activeSessionId;

  after(async () => {
    try {
      if (!sessionForAfter) return;

      void userId;
    } catch (e) {
      console.error(
        "[copiloto] after() persist assistant:",
        e
      );
    }
  });

  return response;
}
