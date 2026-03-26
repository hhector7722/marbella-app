import { createClient } from '@/utils/supabase/server';
import { verifyUserAction } from '@/lib/ai/rbac';
import { getISOWeekEndUTC, getISOWeekStartUTC } from '@/lib/date-utils';

export type LaborPeriod = 'today' | 'last_week' | 'month';

function computeLaborRangeUTC(period: LaborPeriod): { startDate: string; endDate: string } {
  const now = new Date();

  if (period === 'last_week') {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - 7);
    return {
      startDate: getISOWeekStartUTC(d),
      endDate: getISOWeekEndUTC(d),
    };
  }

  // Como el sistema en BD trabaja por semanas en la RPC, usamos una aproximación:
  // - today -> week con el día actual
  // - month -> semana actual como fallback (si pides mes, el modelo igual lo sabrá)
  return {
    startDate: getISOWeekStartUTC(now),
    endDate: getISOWeekEndUTC(now),
  };
}

export async function fetchOvertimeHours(period: LaborPeriod): Promise<{
  period: LaborPeriod;
  overtimeHours: number;
  weekStart: string;
  weekEnd: string;
}> {
  const { userId } = await verifyUserAction('view_own_labor');
  const supabase = await createClient();

  const { startDate, endDate } = computeLaborRangeUTC(period);

  const { data, error } = await supabase.rpc('get_weekly_worker_stats', {
    p_start_date: startDate,
    p_end_date: endDate,
    p_user_id: userId,
  });

  if (error) throw new Error(`Error en RPC get_weekly_worker_stats: ${error.message}`);

  const weeks = Array.isArray((data as any)?.weeksResult) ? (data as any).weeksResult : [];
  const staff = weeks.flatMap((w: any) => (Array.isArray(w.staff) ? w.staff : []));

  // Si la RPC devuelve solo el usuario solicitado, basta con leer overtimeHours.
  const target = staff.find((s: any) => s.id === userId) ?? staff[0];
  const overtimeHours = Number(target?.overtimeHours) || 0;

  return {
    period,
    overtimeHours,
    weekStart: startDate,
    weekEnd: endDate,
  };
}

