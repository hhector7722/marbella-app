import assert from "node:assert/strict";
import { test } from "node:test";
import { tryDirectSalesAnswer } from "./direct-sales.ts";
import type { createClient } from "@/utils/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;
function mock() {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const supabase = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "get_full_period_ticket_sales_detail") return {
        data: { summary: { count: 173 }, products: [
          { nombre_articulo: "Cafe con leche", cantidad_total: 9, total_ingresos: 15 },
          { nombre_articulo: "Cortado", cantidad_total: 6, total_ingresos: 9 },
          { nombre_articulo: "Coca Cola", cantidad_total: 24, total_ingresos: 48 },
          { nombre_articulo: "PATATES BRAVES", cantidad_total: 8, total_ingresos: 41.60 },
        ] }, error: null,
      };
      return { data: { total_ventas: 817, recuento_tickets: 173, ticket_medio: 817 / 173 }, error: null };
    },
  } as unknown as Client;
  return { calls, supabase };
}

test("propietario: ventas reales hoy devuelven importe y tickets, no solo tickets", async () => {
  const m = mock();
  const text = await tryDirectSalesAnswer("¿Cuánto hemos vendido hoy?", {
    supabase: m.supabase, role: "manager", today: "2026-11-12",
  });
  assert.match(text ?? "", /817,00\s?€/);
  assert.match(text ?? "", /173 tickets/);
  assert.deepEqual(m.calls[0], {
    fn: "get_daily_sales_stats", args: { target_date: "2026-11-12" },
  });
});

test("ayer consulta su fecha y no confunde ventas brutas con netas", async () => {
  const m = mock();
  const text = await tryDirectSalesAnswer("¿Cuánto vendimos ayer?", {
    supabase: m.supabase, role: "admin", today: "2026-11-12",
  });
  assert.match(text ?? "", /2026-11-11/);
  assert.equal(m.calls[0].args.target_date, "2026-11-11");
  assert.equal(await tryDirectSalesAnswer("¿Cuál fue la venta neta ayer?", {
    supabase: m.supabase, role: "admin", today: "2026-11-12",
  }), null);
});

test("personal y responsables sin permisos nunca consultan importes del TPV", async () => {
  for (const role of ["staff", "supervisor", "chef"] as const) {
    const m = mock();
    const answer = await tryDirectSalesAnswer("¿Cuánto hemos vendido hoy?", {
      supabase: m.supabase, role, today: "2026-11-12",
    });
    assert.match(answer ?? "", /no tiene permiso/);
    assert.equal(m.calls.length, 0);
  }
});

test("una pregunta de productos no recibe cifras del total de ventas", async () => {
  const m = mock();
  const answer = await tryDirectSalesAnswer("¿Cuántos cafés hemos vendido hoy?", {
    supabase: m.supabase, role: "manager", today: "2026-11-12",
  });
  assert.match(answer ?? "", /15 unidades/);
  assert.match(answer ?? "", /Cafe con leche: 9 ud/);
  assert.match(answer ?? "", /Cortado: 6 ud/);
  assert.doesNotMatch(answer ?? "", /Coca Cola/);
  assert.equal(m.calls[0].fn, "get_full_period_ticket_sales_detail");
});

test("patatas bravas se corresponde con PATATES BRAVES del TPV",async()=>{
  const m=mock();
  const result=await tryDirectSalesAnswer("Cuanto han vendido ayer las patatas bravas?",{
    supabase:m.supabase,role:"manager",today:"2026-11-12",
  });
  assert.match(result??"",/8 unidades/);
  assert.match(result??"",/41,60\s?€/);
  assert.equal(m.calls[0].fn,"get_full_period_ticket_sales_detail");
  assert.equal(m.calls[0].args.p_start_date,"2026-11-11");
});
test("staff no puede consultar las ventas de bravas",async()=>{
  const m=mock();
  const result=await tryDirectSalesAnswer("Cuantas patatas bravas se vendieron ayer?",{
    supabase:m.supabase,role:"staff",today:"2026-11-12",
  });
  assert.match(result??"",/no tiene permiso/);
  assert.equal(m.calls.length,0);
});
