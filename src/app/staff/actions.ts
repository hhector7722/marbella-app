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

export async function getConsumptionRecipes() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('recipes')
    .select('id, name, category, photo_url')
    .order('name', { ascending: true });
  return data ?? [];
}
