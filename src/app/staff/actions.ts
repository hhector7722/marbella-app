'use server';

import { createClient } from '@/utils/supabase/server';

export type ConsumptionItem = { recipe_id: string; quantity: number; is_half: boolean };

export type ConsumptionSubmitResult =
  | { success: true }
  | {
      success: false;
      code: 'EMPTY_CART' | 'NO_FOOD' | 'AUTH' | 'RPC';
      message: string;
    };

type ProcessConsumptionResult = {
  ok: boolean;
  code?: string;
  reference_doc?: string;
  stock_written_count?: number;
  error_count?: number;
};

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
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return {
      success: false,
      code: 'AUTH',
      message: 'Usuario no autenticado',
    };
  }

  const { data, error } = await supabase.rpc('process_staff_consumption', {
    p_employee_id: user.id,
    p_items: items,
  });

  if (error) {
    console.error('[Consumption] RPC failed:', error);
    return {
      success: false,
      code: 'RPC',
      message: 'No se pudo registrar el consumo. Inténtalo de nuevo.',
    };
  }

  const result = data as ProcessConsumptionResult | null;

  if (!result?.ok) {
    if (result?.code === 'NO_FOOD') {
      return {
        success: false,
        code: 'NO_FOOD',
        message: 'Debes apuntar al menos una comida antes de fichar la salida.',
      };
    }
    return {
      success: false,
      code: 'EMPTY_CART',
      message: 'Debes apuntar tu consumo antes de fichar la salida.',
    };
  }

  const errorCount = Number(result.error_count ?? 0);
  if (errorCount > 0) {
    console.error('[Consumption] Errores técnicos (silencioso para staff):', {
      employeeId: user.id,
      referenceDoc: result.reference_doc,
      errorCount,
      stockWrittenCount: result.stock_written_count ?? 0,
      itemsCount: items.length,
    });
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
