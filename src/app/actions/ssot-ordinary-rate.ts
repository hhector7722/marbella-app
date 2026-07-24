'use server';

import { createClient } from '@/utils/supabase/server';
import { ordinaryHourlyRateFromSsot } from '@/lib/hours-engine/ordinary-rate-ssot';
import { isMasterDashboardUser } from '@/lib/master-dashboard';

export async function getSsotOrdinaryHourlyRate(
  userId: string,
  onDate: string,
): Promise<{ success: true; rate: number } | { success: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isMasterDashboardUser(user.email)) {
    return { success: false, error: 'Acceso denegado' };
  }
  try {
    const rate = await ordinaryHourlyRateFromSsot(supabase, userId, onDate);
    return { success: true, rate };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Error tarifa SSOT',
    };
  }
}
