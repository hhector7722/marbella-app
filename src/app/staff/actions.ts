'use server';

import { createClient } from '@/utils/supabase/server';

export type ConsumptionItem = { recipe_id: string; quantity: number; is_half: boolean };

export async function submitPersonalConsumption(items: ConsumptionItem[]) {
  if (items.length === 0) return { success: true as const };

  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return { success: false as const, message: 'Usuario no autenticado' };

  const { error } = await supabase.rpc('process_staff_consumption', {
    p_employee_id: user.id,
    p_items: items,
  });

  if (error) return { success: false as const, message: `Error guardando consumo: ${error.message}` };

  return { success: true as const };
}

export async function getConsumptionRecipes() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('recipes')
    .select('id, name, category, photo_url')
    .order('name', { ascending: true });
  return data ?? [];
}
