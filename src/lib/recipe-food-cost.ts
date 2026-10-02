import { recipeLineCost, type IngredientPackBridgeContext } from './recipe-cost.ts';

/** Estados de food cost alineados con getHealthIndicator en ficha de receta. */
export type FoodCostStatus = 'optimal' | 'alert' | 'critical';

export const FOOD_COST_FILTER_OPTIONS: Array<{
  status: FoodCostStatus;
  label: string;
  colorClass: string;
}> = [
  { status: 'optimal', label: 'Óptimo', colorClass: 'text-green-600' },
  { status: 'alert', label: 'Alerta', colorClass: 'text-amber-500' },
  { status: 'critical', label: 'Crítico', colorClass: 'text-red-600' },
];

export type CanonicalListCost = {
  ok?: boolean;
  total_cost_eur?: number | null;
  components?: { kind?: string }[] | null;
};

export type RecipeFoodCostInput = {
  sale_price?: number | null;
  recipe_subrecipes?: { id: string }[] | null;
  canonical_cost?: CanonicalListCost | null;
  recipe_ingredients?:
    | {
        quantity_gross: number;
        unit: string | null;
        ingredients:
          | {
              current_price: number;
              purchase_unit?: string;
              pack_unit_size_qty?: number | null;
              pack_unit_size_unit?: string | null;
              density_g_per_ml?: number | null;
            }
          | {
              current_price: number;
              purchase_unit?: string;
              pack_unit_size_qty?: number | null;
              pack_unit_size_unit?: string | null;
              density_g_per_ml?: number | null;
            }[]
          | null;
      }[]
    | null;
};

export function parseFoodCostFilterParam(param: string | null | undefined): FoodCostStatus | null {
  if (param === 'optimal' || param === 'alert' || param === 'critical') return param;
  return null;
}

function statusFromTotal(salePrice: number | null | undefined, totalCost: number): FoodCostStatus | null {
  if (salePrice == null || !(salePrice > 0) || !Number.isFinite(totalCost)) return null;
  const basePrice = salePrice / 1.1;
  if (!(basePrice > 0)) return null;
  const foodCost = (totalCost / basePrice) * 100;
  if (foodCost < 30) return 'optimal';
  if (foodCost < 35) return 'alert';
  return 'critical';
}

export function canonicalListCostHasBasis(payload: CanonicalListCost | null | undefined): boolean {
  if (!payload || payload.ok !== true) return false;
  if (typeof payload.total_cost_eur !== 'number' || !Number.isFinite(payload.total_cost_eur)) return false;
  return (payload.components ?? []).some((component) => component.kind === 'ingredient');
}

const LIST_COST_CONCURRENCY = 8;

export async function attachCanonicalListCosts<T extends { id: string; recipe_subrecipes?: { id: string }[] | null }>(
  recipes: T[],
  loadCost: (recipeId: string) => Promise<CanonicalListCost | null>,
): Promise<(T & { canonical_cost: CanonicalListCost | null })[]> {
  const parents = recipes.filter((recipe) => (recipe.recipe_subrecipes?.length ?? 0) > 0);
  const costs = new Map<string, CanonicalListCost | null>();
  let next = 0;
  const workers = Array.from({ length: Math.min(LIST_COST_CONCURRENCY, parents.length) }, async () => {
    while (next < parents.length) {
      const index = next;
      next += 1;
      const recipe = parents[index];
      if (!recipe) continue;
      try {
        costs.set(recipe.id, await loadCost(recipe.id));
      } catch {
        costs.set(recipe.id, null);
      }
    }
  });
  await Promise.all(workers);
  return recipes.map((recipe) => ({
    ...recipe,
    canonical_cost: (recipe.recipe_subrecipes?.length ?? 0) > 0 ? (costs.get(recipe.id) ?? null) : null,
  }));
}

export function getRecipeFoodCostStatus(recipe: RecipeFoodCostInput): FoodCostStatus | null {
  if ((recipe.recipe_subrecipes?.length ?? 0) > 0) {
    if (!canonicalListCostHasBasis(recipe.canonical_cost)) return null;
    return statusFromTotal(recipe.sale_price, recipe.canonical_cost?.total_cost_eur ?? Number.NaN);
  }
  if (!recipe.recipe_ingredients || !recipe.sale_price) return null;
  const totalCost = recipe.recipe_ingredients.reduce((sum, item) => {
    const ingredient = Array.isArray(item.ingredients) ? item.ingredients[0] : item.ingredients;
    const price = ingredient?.current_price ?? 0;
    const purchaseUnit = ingredient?.purchase_unit ?? 'kg';
    const recipeUnit = item.unit ?? 'kg';
    const pack: IngredientPackBridgeContext | undefined = ingredient
      ? {
          pack_unit_size_qty: ingredient.pack_unit_size_qty,
          pack_unit_size_unit: ingredient.pack_unit_size_unit,
          density_g_per_ml: ingredient.density_g_per_ml,
        }
      : undefined;
    return sum + recipeLineCost(item.quantity_gross, recipeUnit, purchaseUnit, price, pack);
  }, 0);
  return statusFromTotal(recipe.sale_price, totalCost);
}

/** Select mínimo para calcular food cost en listados / navegación entre fichas. */
export const RECIPE_FOOD_COST_SELECT =
  'id, name, category, menu_category_id, sale_price, is_sellable, recipe_ingredients (quantity_gross, unit, ingredients (current_price, purchase_unit, pack_unit_size_qty, pack_unit_size_unit, density_g_per_ml)), recipe_subrecipes!recipe_subrecipes_parent_recipe_id_fkey(id)' as const;
