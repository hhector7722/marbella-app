'use server';

import { createClient } from '@/utils/supabase/server';

export type ConsumptionItem = { recipe_id: string; quantity: number; is_half: boolean };

export type ConsumptionSubmitResult =
  | { success: true; consumptionSkipped?: boolean }
  | { success: false; code: 'EMPTY_CART' | 'AUTH'; message: string };

export async function submitPersonalConsumption(
  items: ConsumptionItem[],
): Promise<ConsumptionSubmitResult> {
  if (items.length === 0) {
    return {
      success: false,
      code: 'EMPTY_CART',
      message: 'Debes apuntar tu consumo antes de fichar la salida.',
    };
  }

  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return { success: false, code: 'AUTH', message: 'Usuario no autenticado' };
  }

  console.log('[Consumption] Submitting:', { employeeId: user.id, itemsCount: items.length });

  const { error } = await supabase.rpc('process_staff_consumption', {
    p_employee_id: user.id,
    p_items: items,
  });

  if (error) {
    console.error('[Consumption] RPC failed, allowing clock-out:', error);
    return { success: true, consumptionSkipped: true };
  }

  return { success: true };
}

export type ConsumptionModalRecipe = {
  id: string;
  name: string;
  category: string | null;
  photo_url: string | null;
  sort_order: number;
  usage_count: number;
};

export async function getConsumptionRecipes(): Promise<ConsumptionModalRecipe[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_consumption_modal_recipes');

  if (error) {
    console.error('[Consumption] get_consumption_modal_recipes failed:', error);
    const { data: fallback } = await supabase
      .from('recipes')
      .select('id, name, category, photo_url')
      .order('name', { ascending: true });
    return (fallback ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      photo_url: r.photo_url,
      sort_order: 999999,
      usage_count: 0,
    }));
  }

  type RpcRow = {
    id: string;
    name: string;
    category: string | null;
    photo_url: string | null;
    sort_order: number | null;
    usage_count: number | null;
  };

  return ((data ?? []) as RpcRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category ?? null,
    photo_url: row.photo_url ?? null,
    sort_order: Number(row.sort_order ?? 999999),
    usage_count: Number(row.usage_count ?? 0),
  }));
}
