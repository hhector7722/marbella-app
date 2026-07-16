import { recipeLineCost, type IngredientPackBridgeContext } from '@/lib/recipe-cost';

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

export type RecipeFoodCostInput = {
  sale_price?: number | null;
  recipe_ingredients?:
    | {
        quantity_gross: number;
        unit: string | null;
        ingredients:
          | {
              current_price: number;
              purchase_unit?: string;
              supplier_pricing_mode?: string;
              pack_unit_size_qty?: number | null;
              pack_unit_size_unit?: string | null;
            }
          | {
              current_price: number;
              purchase_unit?: string;
              supplier_pricing_mode?: string;
              pack_unit_size_qty?: number | null;
              pack_unit_size_unit?: string | null;
            }[]
          | null;
      }[]
    | null;
};

export function parseFoodCostFilterParam(param: string | null | undefined): FoodCostStatus | null {
  if (param === 'optimal' || param === 'alert' || param === 'critical') return param;
  return null;
}

export function getRecipeFoodCostStatus(recipe: RecipeFoodCostInput): FoodCostStatus | null {
  if (!recipe.recipe_ingredients || !recipe.sale_price) return null;
  const totalCost = recipe.recipe_ingredients.reduce((sum, item) => {
    const ingredient = Array.isArray(item.ingredients) ? item.ingredients[0] : item.ingredients;
    const price = ingredient?.current_price ?? 0;
    const purchaseUnit = ingredient?.purchase_unit ?? 'kg';
    const recipeUnit = item.unit ?? 'kg';
    const pack: IngredientPackBridgeContext | undefined = ingredient
      ? {
          supplier_pricing_mode: ingredient.supplier_pricing_mode,
          pack_unit_size_qty: ingredient.pack_unit_size_qty,
          pack_unit_size_unit: ingredient.pack_unit_size_unit,
        }
      : undefined;
    return sum + recipeLineCost(item.quantity_gross, recipeUnit, purchaseUnit, price, pack);
  }, 0);
  const basePrice = recipe.sale_price / 1.1;
  const foodCost = basePrice > 0 ? (totalCost / basePrice) * 100 : 0;
  if (foodCost < 30) return 'optimal';
  if (foodCost < 35) return 'alert';
  return 'critical';
}

/** Select mínimo para calcular food cost en listados / navegación entre fichas. */
export const RECIPE_FOOD_COST_SELECT =
  'id, name, category, menu_category_id, sale_price, recipe_ingredients (quantity_gross, unit, ingredients (current_price, purchase_unit, supplier_pricing_mode, pack_unit_size_qty, pack_unit_size_unit))' as const;
