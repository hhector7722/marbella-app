/** Reglas compartidas: modal consumo personal (staff) y editor de orden (dashboard). */

export type ConsumptionRecipeRow = {
  id: string;
  name: string;
  photo_url: string | null;
  category: string | null;
  sort_order?: number;
  usage_count?: number;
};

/** Subcadenas para orden inicial (coincidencia en nombre de receta). */
export const CONSUMPTION_QUICK_DRINK_ITEMS = [
  'agua',
  'café',
  'cafe',
  'cortado',
  'café con leche',
  'cafe con leche',
  'coca cola',
  'coca cola zero',
  'nestea',
  'red bull',
] as const;

export const CONSUMPTION_QUICK_FOOD_ITEMS = [
  'croissant',
  'croissant chocolate',
  'bacon con queso',
  'bikini',
  'jamón serrano',
  'jamon serrano',
  'longaniza',
  'tortilla de patatas',
  'jamón dulce',
  'jamon dulce',
  'chips ahoy',
  'kinder bueno',
  'oreo',
  'butifarra blanca',
  'pollo bocadillo',
  'manchego',
  'patatas bravas',
  'pechuga de pollo',
  'pincho de tortilla',
] as const;

const EXCLUDED_QUICK_NAMES = new Set([
  'agua con gas malavella',
  'café americano',
  'café doble',
  'tortilla de patatas entera',
  'preparación patatas bravas',
  'preparacion patatas bravas',
  'sup manchego',
  'tabla de manchego',
  'oreo helado',
  'oreo palo',
]);

export function normalizeConsumptionRecipeName(name: string): string {
  return name.trim().toLowerCase();
}

export function isDrinkConsumptionRecipe(recipe: { name: string; category: string | null }): boolean {
  const name = normalizeConsumptionRecipeName(recipe.name);
  const cat = recipe.category?.toLowerCase() ?? '';

  if (cat.includes('bebid')) return true;
  if (cat.includes('refresc')) return true;
  if (cat.includes('cervez')) return true;
  if (cat.includes('vino')) return true;
  if (cat.includes('café') || cat.includes('cafe')) return true;

  const drinkNeedles = [
    'agua',
    'café',
    'cafe',
    'cortado',
    'coca cola',
    'nestea',
    'red bull',
    'zumo',
    'cerveza',
    'vino',
    'tónica',
    'tonica',
    'fanta',
    'sprite',
    'kas',
  ];
  return drinkNeedles.some((n) => name.includes(n));
}

function quickPriorityIndex(
  recipe: { name: string },
  needles: readonly string[],
): number | null {
  if (EXCLUDED_QUICK_NAMES.has(normalizeConsumptionRecipeName(recipe.name))) {
    return null;
  }
  const lower = recipe.name.toLowerCase();
  for (let i = 0; i < needles.length; i++) {
    if (lower.includes(needles[i]!.toLowerCase())) return i;
  }
  return null;
}

/** Orden manual por defecto: acceso rápido bebidas → comida → resto A-Z. */
export function buildDefaultConsumptionRecipeOrder(recipes: ConsumptionRecipeRow[]): string[] {
  const drinks = recipes.filter((r) => isDrinkConsumptionRecipe(r));
  const foods = recipes.filter((r) => !isDrinkConsumptionRecipe(r));

  const sortBucket = (list: ConsumptionRecipeRow[], needles: readonly string[]) =>
    [...list].sort((a, b) => {
      const pa = quickPriorityIndex(a, needles);
      const pb = quickPriorityIndex(b, needles);
      if (pa !== null && pb !== null && pa !== pb) return pa - pb;
      if (pa !== null && pb === null) return -1;
      if (pa === null && pb !== null) return 1;
      return a.name.localeCompare(b.name, 'es');
    });

  const orderedDrinks = sortBucket(drinks, CONSUMPTION_QUICK_DRINK_ITEMS);
  const orderedFoods = sortBucket(foods, CONSUMPTION_QUICK_FOOD_ITEMS);

  return [...orderedDrinks, ...orderedFoods].map((r) => r.id);
}

/** Cuántas posiciones sube un producto por cada fichaje con consumo (máx. acumulable). */
export const CONSUMPTION_USAGE_BOOST_PER_COUNT = 3;
export const CONSUMPTION_USAGE_BOOST_MAX = 80;

/**
 * Posición efectiva en el grid (menor = más arriba).
 * Orden manual de Hector (global) es la base; el uso solo acerca productos populares.
 * Misma fórmula en `get_consumption_modal_recipes()` para todo el staff.
 */
export function consumptionRecipeDisplayRank(
  recipe: Pick<ConsumptionRecipeRow, 'sort_order' | 'usage_count'>,
): number {
  const base = recipe.sort_order ?? 999999;
  const usage = Math.min(Math.max(0, recipe.usage_count ?? 0), CONSUMPTION_USAGE_BOOST_MAX);
  return base - usage * CONSUMPTION_USAGE_BOOST_PER_COUNT;
}

export function sortConsumptionRecipesForModal<T extends ConsumptionRecipeRow>(recipes: T[]): T[] {
  return [...recipes].sort((a, b) => {
    const rankA = consumptionRecipeDisplayRank(a);
    const rankB = consumptionRecipeDisplayRank(b);
    if (rankA !== rankB) return rankA - rankB;
    return a.name.localeCompare(b.name, 'es');
  });
}
