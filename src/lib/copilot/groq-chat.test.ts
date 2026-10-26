import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  completeGroqChat, GroqApiError, selectGroqTools, GROQ_MODEL,
} from "./groq-chat.ts";
import type { GroqTool } from "./groq-chat.ts";

const tool = (name: string): GroqTool => ({
  type: "function",
  function: { name, description: name, parameters: { type: "object", properties: {} } },
});
const catalog = [
  tool("consultar_metricas_basicas"),
  tool("generar_informe_diario"),
  tool("generar_informe_semanal"),
  tool("gestionar_proveedores"),
  tool("gestionar_ingredientes"),
  tool("consultar_usuarios"),
  tool("consultar_registros_asistencia"),
  tool("consultar_registros_horas_extras"),
  tool("consultar_costes_mano_obra"),
  tool("consultar_inventario"),
  tool("gestionar_recetas"),
];

test("una comparación de proveedores no se interpreta como mero listado", () => {
  const names = selectGroqTools("¿Qué proveedor me ha subido más los precios?", catalog)
    .map((x) => x.function.name);
  assert.ok(names.includes("gestionar_proveedores"));
  assert.ok(names.includes("gestionar_ingredientes"));
});

test("la consulta de horas incluye resolución de usuarios antes de los registros", () => {
  const names = selectGroqTools("¿Cuántas horas extras hizo Fernando?", catalog)
    .map((x) => x.function.name);
  assert.ok(names.includes("consultar_usuarios"));
  assert.ok(names.includes("consultar_registros_horas_extras"));
});

test("no hay proveedor de pago ni llamadas extra en un error 429", async () => {
  const calls: Array<{url:string; body: Record<string,unknown>}> = [];
  const mock = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({error:{message:"Rate limit"}}), {status:429});
  };
  await assert.rejects(
    completeGroqChat([{role:"user",content:"ventas"}], catalog.slice(0,1),
      {apiKey:"test-key",fetcher:mock as typeof fetch}),
    (error: unknown) => error instanceof GroqApiError && error.status===429,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(calls[0].body.model, GROQ_MODEL);
  assert.equal(calls[0].body.parallel_tool_calls, false);
});

test("interpreta las tool calls según el protocolo de Groq", async () => {
  const mock = async () => new Response(JSON.stringify({
    choices: [{ message: {
      content: null,
      tool_calls: [{id:"call_123",type:"function",function:{
        name:"consultar_inventario",arguments:"{}",
      }}],
    }}],
  }), {status:200});
  const result = await completeGroqChat([{role:"user",content:"inventario"}],
    [tool("consultar_inventario")], {apiKey:"test-key",fetcher:mock as typeof fetch});
  assert.equal(result.toolCalls[0].function.name, "consultar_inventario");
  assert.equal(result.content, "");
});
