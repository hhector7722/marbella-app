/**
 * Adaptador del chat operativo a la API pública compatible OpenAI de Groq.
 * Solo servidor. La clave nunca debe llegar al cliente.
 */
export const GROQ_MODEL = "openai/gpt-oss-120b";

export type GroqTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type GroqChatMessage =
  | { role: "system" | "user" | "assistant"; content: string | null; tool_calls?: GroqToolCall[] }
  | { role: "tool"; tool_call_id: string; name?: string; content: string };

export type GroqToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export class GroqApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GroqApiError";
  }
}

/**
 * Selecciona las herramientas relevantes. No muestra herramientas de
 * escritura ni acciones de alto impacto a un modelo alojado externamente.
 * No filtra permisos: esos se comprueban en executeCopilotTool/RPC.
 */
export function selectGroqTools(
  question: string,
  tools: GroqTool[],
): GroqTool[] {
  const q = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const selected = new Set<string>();
  const include = (...names: string[]) => names.forEach((name) => selected.add(name));

  if (/venta|vend|factura|facturac|ingreso|ticket|caja|recaudac|importe|reporte|informe|resumen|compar|producto|articulo|cafe|cafes|cortado|bebida|bocadillo|brava/.test(q)) {
    include("consultar_ventas_productos", "consultar_metricas_basicas", "generar_informe_diario", "generar_informe_semanal");
  }
  if (/efectivo|monedas|cambio de caja|cambio entre cajas|tesoreria|retirada de caja|arqueo/.test(q)) {
    include("consultar_flujos_caja_efectivo", "consultar_cambios_entre_cajas");
  }
  if (/proveedor|compra|precio|albaran|pedido a|pedir a|costo|coste/.test(q)) {
    include("gestionar_proveedores", "gestionar_ingredientes");
  }
  if (/inventario|stock|existencia|caduc|faltan|reponer/.test(q)) {
    include("consultar_inventario", "gestionar_ingredientes");
  }
  if (/receta|elaborac|carta|plato|sangria|ingrediente|escandallo/.test(q)) {
    include("consultar_receta_detallada", "gestionar_recetas", "gestionar_ingredientes");
  }
  if (/emplead|personal|usuario|turno|horario|fichaj|asistencia|horas?|trabaj|nomina|extra/.test(q)) {
    include("consultar_horas_trabajadas", "consultar_registros_asistencia", "consultar_registros_horas_extras");
    if (/coste|costo|mano de obra|nomina/.test(q)) include("consultar_costes_mano_obra");
  }
  if (/pedido|comanda|mesa|cocina|sala/.test(q)) include("consultar_pedidos_abiertos");
  if (/reserv/.test(q)) include("consultar_reservas");
  if (/manual|documentac|instrucc|protocolo/.test(q)) include("consultar_manuales");
  if (/consumo personal|consumido por|consumiciones del personal/.test(q)) include("gestionar_consumo_personal");

  // En una pregunta imprecisa ofrecemos solo un conjunto muy pequeño.
  if (!selected.size) {
    include("consultar_metricas_basicas", "consultar_inventario", "consultar_receta_detallada", "gestionar_proveedores");
  }

  // Las preguntas de las capturas tienen una fuente inequívoca.
  // No ofrecer estadísticas de tickets como alternativa a unidades de artículos,
  // ni una receta resumida que omita sus ingredientes físicos.
  const exact = (name: string) => tools.filter((t) => t.function.name === name);
  if (/cafe|cafes|cortado|brava|bocadillo|refresco|sangria/.test(q)
      && /vend|venta|cuant|unidades|factur/.test(q)) {
    return exact("consultar_ventas_productos");
  }
  if (/(que lleva|ingredientes de|como se prepara|receta de)/.test(q)) {
    const recipe = exact("consultar_receta_detallada");
    if (recipe.length) return recipe;
  }
  if (/horas?/.test(q) && /trabaj|hizo|ficho|fichado/.test(q) && !/extra/.test(q)) {
    return exact("consultar_horas_trabajadas");
  }
  return tools.filter(({ function: { name } }) => selected.has(name)).slice(0, 9);
}

export async function completeGroqChat(
  messages: GroqChatMessage[],
  tools: GroqTool[],
  options: { apiKey: string; fetcher?: typeof fetch; timeoutMs?: number; toolChoice?: "auto" | "required" },
): Promise<{ content: string; toolCalls: GroqToolCall[] }> {
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  const response = await (options.fetcher ?? fetch)(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? (options.toolChoice ?? "auto") : undefined,
      parallel_tool_calls: false,
      reasoning_effort: "low",
      max_completion_tokens: 1400,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 18000),
    cache: "no-store",
  });

  if (!response.ok) {
    // No introducir datos ni detalles del proveedor en errores visibles o logs.
    const errorText = response.status === 429
      ? "Límite del plan gratuito de Groq alcanzado. Inténtalo más tarde."
      : response.status === 401 || response.status === 403
        ? "La clave de Groq no está autorizada."
        : "Groq no ha podido procesar la consulta.";
    throw new GroqApiError(response.status, errorText);
  }
  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: GroqToolCall[];
      };
    }>;
  };
  const message = payload.choices?.[0]?.message;
  if (!message) throw new GroqApiError(502, "Groq devolvió una respuesta inválida.");
  const toolCalls = (message.tool_calls ?? []).filter(
    (call) => typeof call.id === "string"
      && call.type === "function"
      && typeof call.function?.name === "string"
      && typeof call.function?.arguments === "string",
  );
  return { content: message.content ?? "", toolCalls };
}
