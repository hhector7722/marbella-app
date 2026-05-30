'use server';

import { createClient } from '@/utils/supabase/server';
import type { CashInventoryRow } from '@/lib/greedy-cash-breakdown';

async function requireAuthenticated() {
  const supabase = await createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.user) {
    return { ok: false as const, error: 'No autorizado' };
  }

  return { ok: true as const, supabase };
}

export async function getBoxInventoryForAutofill(
  boxId: string,
): Promise<{ ok: true; inventory: CashInventoryRow[] } | { ok: false; error: string }> {
  const trimmed = boxId?.trim();
  if (!trimmed) {
    return { ok: false, error: 'Caja no válida.' };
  }

  const auth = await requireAuthenticated();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data, error } = await auth.supabase
    .from('cash_box_inventory')
    .select('denomination, quantity')
    .eq('box_id', trimmed)
    .gt('quantity', 0)
    .order('denomination', { ascending: false });

  if (error) {
    console.error('[getBoxInventoryForAutofill]', error);
    return { ok: false, error: 'No se pudo cargar el inventario de la caja.' };
  }

  const inventory: CashInventoryRow[] = (data ?? []).map((row) => ({
    denomination: Number(row.denomination),
    quantity: Number(row.quantity) || 0,
  }));

  return { ok: true, inventory };
}
