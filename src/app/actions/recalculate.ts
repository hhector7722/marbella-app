'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { recalculateAllBalancesAndPersist } from '@/lib/hours-engine/recalculate-and-persist-all';

/**
 * Regenera proyección global vía Writer único (writeWeeklyProjection).
 */
export async function recalculateAllBalances() {
  const supabase = await createClient();

  try {
    const result = await recalculateAllBalancesAndPersist(supabase);

    revalidatePath('/dashboard/labor');
    revalidatePath('/staff/history');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Writer global: ${result.weeksPersisted} semanas en ${result.employeeCount} empleados.`,
      data: result.rpcData,
    };
  } catch (err) {
    console.error('Error al recalcular balances:', err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}
