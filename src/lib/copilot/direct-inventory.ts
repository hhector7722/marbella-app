import type { createClient } from "@/utils/supabase/server";
import type { RoleName } from "./permissions.ts";
import { canExecute } from "./permissions.ts";

type Client = Awaited<ReturnType<typeof createClient>>;
type StockRow = { name: string; stock_current: number | string | null; unit: string | null };

const format = (value: number) => new Intl.NumberFormat("es-ES", {maximumFractionDigits: 3}).format(value);
function normal(text: string): string {
  return text.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(de|del|la|el|los|las|producto|productos|unidad|unidades)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Consulta exclusivamente el stock contabilizado; nunca infiere el físico. */
export async function tryDirectInventoryAnswer(
  question: string, ctx: {supabase: Client; role: RoleName},
): Promise<string | null> {
  const q = question.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const broad = /(?:que|cuales)\s+productos?.*(?:stock|inventario)/.test(q);
  const exact = q.match(/cuant[oa]s?\s+(?:unidades?\s+)?(?:de\s+)?(.+?)\s+(?:tenemos|quedan|hay)(?:\b|[?!.])/)
    ?? q.match(/(?:stock|existencias?)\s+(?:nos\s+)?(?:queda\s+)?(?:de\s+)?(.+?)(?:[?!.]|$)/);
  if (!broad && !exact) return null;
  if (!canExecute(ctx.role, "consultar_inventario")) return "No tienes permiso para consultar el inventario.";
  const {data, error} = await ctx.supabase.from("ingredients")
    .select("name,stock_current,unit").order("name").limit(500);
  if (error || !data) return "No se ha podido consultar el inventario real.";
  const rows = data.filter((r): r is StockRow => typeof r.name === "string");
  if (broad) {
    const positive = rows.filter(r => Number(r.stock_current) > 0);
    const negative = rows.filter(r => Number(r.stock_current) < 0);
    const zero = rows.filter(r => Number(r.stock_current) === 0);
    const example = positive.slice(0, 15).map(r =>
      r.name + ": " + format(Number(r.stock_current)) + " " + (r.unit??"")
    ).join("; ");
    return "El inventario registra " + positive.length + " productos con saldo positivo, " +
      zero.length + " a cero y " + negative.length + " con saldo negativo." +
      (example ? " Ejemplos positivos: " + example + "." : "") +
      (rows.length === 500 ? " Hay más registros fuera del límite de consulta." : "") +
      " Son saldos registrados, no un recuento físico verificado.";
  }
  const key = normal(exact?.[1] ?? "");
  if (key.length < 3) return null;
  const matches = rows.filter(r => {
    const product = normal(r.name);
    return product === key || product.includes(key) || key.includes(product);
  });
  if (matches.length > 1) return "Hay varios productos que coinciden: " +
    matches.slice(0,10).map(r => r.name).join(", ") + ". Especifica cuál.";
  if (!matches.length) return rows.length === 500
    ? "La búsqueda llegó al límite del catálogo. No puedo descartar que exista el producto."
    : "No encuentro una referencia del producto solicitado en el catálogo de inventario.";
  const r = matches[0];
  const n = r.stock_current === null ? NaN : Number(r.stock_current);
  if (!Number.isFinite(n)) return r.name + ": no tiene un saldo de stock verificable.";
  return r.name + ": saldo registrado " + format(n) + " " + (r.unit??"") + "." +
    (n < 0 ? " Es un saldo negativo y no representa unidades físicamente disponibles. Requiere revisión del inventario."
      : " Es una cifra contable; no confirma por sí sola el recuento físico.");
}
