import type { createClient } from "@/utils/supabase/server";
import type { RoleName } from "./permissions";
import { runKnowledgeTool } from "./knowledge-tools.ts";

type Client = Awaited<ReturnType<typeof createClient>>;
type RecipeData = {
  nombre: string;
  elaboracion?: string | null;
  presentacion?: string | null;
  rendimiento?: number | null;
  unidad_rendimiento?: string | null;
  ingredientes?: Array<{
    nombre: string;
    cantidad_bruta?: number | null;
    cantidad_neta?: number | null;
    unidad?: string | null;
  }>;
  error?: string;
};

function normalized(text: string): string {
  return text.toLocaleLowerCase("es").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").trim();
}

function quantity(number: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }).format(number);
}

// Reads only permitted recipe fields, with no AI inference and no writes.
export async function tryDirectRecipeAnswer(
  question: string,
  ctx: { supabase: Client; role: RoleName; userId: string; today: string },
): Promise<string | null> {
  const query = normalized(question);
  const directIntent = /(?:que.*(?:ingredientes|lleva)|ingredientes de|como se prepara|elaboracion de|preparar \d+|cantidades.*preparar|cuantos? gramos|cuantas? (?:unidades|raciones) lleva)/.test(query);
  if (!directIntent || /(?:que recetas|cuales recetas|comprar|stock|inventario|precio|coste|margen|rentab|mas de precio|han subido)/.test(query)) return null;
  const { data, error } = await ctx.supabase.from("recipes").select("name").order("name").limit(1000);
  if (error || !Array.isArray(data)) return null;
  const candidates = data
    .filter((row): row is { name: string } => typeof row?.name === "string")
    .map(row => ({ name: row.name, key: normalized(row.name) }))
    .filter(row => query.includes(row.key) ||
      row.key.split(/\s+/).some(word => word.length >= 5 &&
        !["plato", "preparado", "racion", "grande", "medio"].includes(word) &&
        query.includes(word)))
    .sort((a, b) => b.key.length - a.key.length);
  if (!candidates.length) return null;
  const matching = candidates.filter(c => candidates[0].key.includes(c.key) || c.key.includes(candidates[0].key));
  if (matching.length !== candidates.length && !query.includes(candidates[0].key)) {
    return "Hay varias recetas que podrían coincidir: " +
      candidates.slice(0, 6).map(c => c.name).join(", ") +
      ". Indica cuál necesitas.";
  }
  const found = await runKnowledgeTool("consultar_receta_detallada",
    { nombre: candidates[0].name }, ctx) as RecipeData;
  if (found.error || !found.nombre || !Array.isArray(found.ingredientes)) return null;

  const scaleMatch = query.match(/(?:preparar|para)\s+(\d{1,3})\s+(?:sangrias?|raciones?|porciones?|unidades?|platos?)/);
  const count = scaleMatch ? Number(scaleMatch[1]) : null;
  const yieldValue = Number(found.rendimiento);
  const multiplier = count !== null && Number.isFinite(yieldValue) && yieldValue > 0
    ? count / yieldValue : null;
  const wantPreparation = /(?:como se prepara|elaboracion|como elaborar)/.test(query);
  const gramsOnly = /cuantos? gramos/.test(query);

  let lines: string[] = [];
  if (count !== null) {
    if (multiplier === null) {
      return "La receta " + found.nombre +
        " no tiene un rendimiento verificable registrado; no puedo calcular exactamente " + count + " raciones.";
    }
    lines.push("Ingredientes para " + count + " " +
      ((found.unidad_rendimiento === "ración" && count > 1) ? "raciones" : (found.unidad_rendimiento || "elaboraciones")) + " de " + found.nombre + ":");
  } else {
    lines.push("Ingredientes de " + found.nombre + ":");
  }
  const ingredients = gramsOnly
    ? found.ingredientes.filter(p => /^(?:g|gr|gramos|kg)$/i.test((p.unidad ?? "").trim()))
    : found.ingredientes;
  if (!ingredients.length) {
    return "La receta " + found.nombre + " no tiene cantidades en gramos verificables.";
  }
  for (const ingredient of ingredients) {
    const net = Number(ingredient.cantidad_neta);
    const gross = Number(ingredient.cantidad_bruta);
    const hasNet = ingredient.cantidad_neta !== null &&
      ingredient.cantidad_neta !== undefined && Number.isFinite(net);
    const hasGross = ingredient.cantidad_bruta !== null &&
      ingredient.cantidad_bruta !== undefined && Number.isFinite(gross);
    const value = hasNet ? net : hasGross ? gross : null;
    lines.push("• " + ingredient.nombre +
      (value === null ? " — cantidad no registrada" :
        " — " + quantity(value * (multiplier ?? 1)) + " " + (ingredient.unidad || "")));
  }
  if (wantPreparation && found.elaboracion?.trim()) {
    lines.push("Elaboración: " + found.elaboracion.trim());
  }
  if (count !== null) lines.push("Cálculo basado en el rendimiento registrado de la receta; no descuenta existencias.");
  return lines.join("\n");
}
