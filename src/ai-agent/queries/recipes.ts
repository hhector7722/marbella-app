import { createClient } from '@/utils/supabase/server';
import { verifyUserAction } from '@/lib/ai/rbac';

export async function fetchRecipeInfo(recipeName: string): Promise<{
  recipeName: string;
  found: boolean;
  elaboration?: string;
  presentation?: string;
  ingredients?: Array<{ quantity: number; unit: string; ingredientName: string }>;
}> {
  await verifyUserAction('view_recipes');
  const supabase = await createClient();

  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .select('id, name, elaboration, presentation')
    .ilike('name', `%${recipeName}%`)
    .limit(1)
    .maybeSingle();

  if (recipeError) throw new Error(`Error consultando receta: ${recipeError.message}`);
  if (!recipe) {
    return { recipeName, found: false };
  }

  const { data: ingredientsRows, error: ingError } = await supabase
    .from('recipe_ingredients')
    .select('quantity_gross, quantity_net, unit, ingredients(name)')
    .eq('recipe_id', recipe.id);

  if (ingError) throw new Error(`Error consultando ingredientes: ${ingError.message}`);

  const ingredients =
    ingredientsRows?.map((ing: any) => ({
      // quantity principal: use quantity_gross (cantidad bruta)
      quantity: Number(ing.quantity_gross) || 0,
      quantity_net: Number(ing.quantity_net) || null,
      unit: String(ing.unit ?? ''),
      ingredientName: String(ing.ingredients?.name ?? ''),
    })) ?? [];

  return {
    recipeName: recipe.name,
    found: true,
    elaboration: recipe.elaboration ?? undefined,
    presentation: recipe.presentation ?? undefined,
    ingredients,
  };
}

