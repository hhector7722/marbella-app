import type { createClient } from "@/utils/supabase/server";
import type { RoleName } from "./permissions";

type Client = Awaited<ReturnType<typeof createClient>>;

function dateShift(date: string, days: number): string {
  const d = new Date(date + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function eur(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency", currency: "EUR", minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Respuesta de ventas TPV: datos verificados en Supabase sin inferencia LLM. */
export async function tryDirectSalesAnswer(
  question: string,
  ctx: { supabase: Client; role: RoleName; today: string },
): Promise<string | null> {
  const normalized = question.toLocaleLowerCase("es").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const period = /\bhoy\b/.test(normalized)
    ? "hoy"
    : /\bayer\b/.test(normalized) ? "ayer" : null;
  if (!period) return null;
  const salesIntent = /(?:cuanto|total|importe|facturacion|ventas|recaudacion|hemos vendido|vendimos|vendido)/.test(normalized)
    && /(?:vend|venta|factur|recaud|ingreso|ticket|caja)/.test(normalized);
  if (!salesIntent || /(?:producto|articulo|unidades|cafe|croissant|bocadillo|bravas|sangria|ticket medio|venta neta|margen|rentab|compar|por hora)/.test(normalized))
    return null;
  if (ctx.role !== "manager" && ctx.role !== "admin") {
    return "Tu perfil no tiene permiso para consultar los importes de ventas.";
  }
  const date = period === "hoy" ? ctx.today : dateShift(ctx.today, -1);
  const { data, error } = await ctx.supabase.rpc("get_daily_sales_stats", { target_date: date });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return "No he podido consultar las ventas reales del TPV para esa fecha.";
  }
  const row = data as Record<string, unknown>;
  const amount = Number(row.total_ventas);
  const tickets = Number(row.recuento_tickets);
  const mean = Number(row.ticket_medio);
  if (!Number.isFinite(amount) || !Number.isFinite(tickets) || amount < 0 || tickets < 0) {
    return "Los datos del TPV son incompletos; no puedo dar un importe fiable.";
  }
  const intro = period === "hoy" ? "Hoy" : "Ayer";
  const avg = Number.isFinite(mean) && mean >= 0 ? " El ticket medio fue " + eur(mean) + "." : "";
  return intro + " (" + date + ") se han registrado " + eur(amount) +
    " de ventas brutas en el TPV y " + tickets + " tickets." + avg;
}
