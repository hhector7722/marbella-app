import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeCopilotTool, type CopilotSupabaseClient } from "./tool-runtime.ts";

function clientWith(result: { data: unknown; error: { message: string } | null }) {
  const logs: unknown[] = [];
  const supabase: CopilotSupabaseClient = {
    rpc: async () => result,
    from: () => ({
      insert: async (values: unknown) => {
        logs.push(values);
        return { error: null };
      },
    }),
  };
  return { supabase, logs };
}

async function run(result: { data: unknown; error: { message: string } | null }) {
  const { supabase, logs } = clientWith(result);
  const outcome = await executeCopilotTool({
    supabase, role: "admin", userId: "unit-test",
    toolName: "consultar_metricas_basicas", args: {}, mode: "chat",
  });
  return { outcome, logs };
}

describe("Copiloto: el resultado de la RPC no puede fingir éxito", () => {
  it("rechaza el resultado no_implementada aunque Supabase no dé error SQL", async () => {
    const { outcome, logs } = await run({ data: { error: "no_implementada" }, error: null });
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.status, 501);
    assert.equal(logs.length, 1);
  });

  it("devuelve un error 502 cuando Supabase devuelve un error SQL", async () => {
    const { outcome } = await run({ data: null, error: { message: "RPC failed" } });
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.status, 502);
  });

  it("mantiene la respuesta correcta cuando la RPC sí funciona", async () => {
    const data = { ventas: 20 };
    const { outcome } = await run({ data, error: null });
    assert.equal(outcome.ok, true);
    if (outcome.ok) assert.deepEqual(outcome.data, data);
  });
});
