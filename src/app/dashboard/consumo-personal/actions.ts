'use server';

import { createClient } from '@/utils/supabase/server';
import {
  buildDefaultConsumptionRecipeOrder,
  type ConsumptionRecipeRow,
} from '@/lib/staff-consumption-display';
import { isMasterDashboardUser } from '@/lib/master-dashboard';

export type ConsumptionRecipeForOrder = ConsumptionRecipeRow & {
  usage_count: number;
  sort_order: number;
};

const HECTOR_ORDER_DENIED = 'Solo Hector puede modificar el orden de productos.' as const;

async function requireHectorOrderEditor() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return { supabase, error: 'Sesión no válida' as const };
  }

  if (isMasterDashboardUser(user.email)) {
    return { supabase, error: null };
  }

  const { data: prof, error: profErr } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .maybeSingle();

  if (profErr) {
    return { supabase, error: 'No se pudo verificar el perfil' as const };
  }

  if (!isMasterDashboardUser(prof?.email)) {
    return { supabase, error: HECTOR_ORDER_DENIED };
  }

  return { supabase, error: null };
}

export async function getConsumptionRecipesForOrderEditor(): Promise<
  | { success: true; recipes: ConsumptionRecipeForOrder[]; hasSavedOrder: boolean }
  | { success: false; message: string }
> {
  const gate = await requireHectorOrderEditor();
  if (gate.error) return { success: false, message: gate.error };

  const [recipesRes, orderRes] = await Promise.all([
    gate.supabase.rpc('get_consumption_modal_recipes'),
    gate.supabase.from('staff_consumption_recipe_display_order').select('recipe_id', { count: 'exact', head: true }),
  ]);

  if (recipesRes.error) {
    console.error(recipesRes.error);
    return { success: false, message: 'No se pudieron cargar los productos.' };
  }

  const recipes = (recipesRes.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    category: (row.category as string | null) ?? null,
    photo_url: (row.photo_url as string | null) ?? null,
    sort_order: Number(row.sort_order ?? 999999),
    usage_count: Number(row.usage_count ?? 0),
  }));

  return {
    success: true,
    recipes,
    hasSavedOrder: (orderRes.count ?? 0) > 0,
  };
}

export async function seedDefaultConsumptionRecipeOrder(): Promise<
  { success: true } | { success: false; message: string }
> {
  const gate = await requireHectorOrderEditor();
  if (gate.error) return { success: false, message: gate.error };

  const { data: recipes, error } = await gate.supabase
    .from('recipes')
    .select('id, name, category, photo_url')
    .order('name');

  if (error || !recipes) {
    console.error(error);
    return { success: false, message: 'No se pudieron cargar las recetas.' };
  }

  const orderedIds = buildDefaultConsumptionRecipeOrder(recipes);
  const { error: saveErr } = await gate.supabase.rpc('save_staff_consumption_recipe_display_order', {
    p_ordered_recipe_ids: orderedIds,
  });

  if (saveErr) {
    console.error(saveErr);
    return { success: false, message: saveErr.message || 'No se pudo guardar el orden inicial.' };
  }

  return { success: true };
}

export async function saveConsumptionRecipeDisplayOrder(
  orderedRecipeIds: string[],
): Promise<{ success: true } | { success: false; message: string }> {
  const gate = await requireHectorOrderEditor();
  if (gate.error) return { success: false, message: gate.error };

  if (orderedRecipeIds.length === 0) {
    return { success: false, message: 'La lista de productos no puede estar vacía.' };
  }

  const { error } = await gate.supabase.rpc('save_staff_consumption_recipe_display_order', {
    p_ordered_recipe_ids: orderedRecipeIds,
  });

  if (error) {
    console.error(error);
    return { success: false, message: error.message || 'No se pudo guardar el orden.' };
  }

  return { success: true };
}
