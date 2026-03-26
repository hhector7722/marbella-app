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

  if (period === 'month') {
    // Para mes: sumar weekly_snapshots.extra_hours cuyo week_start cae dentro del mes
    // Calculamos monthStart/monthEnd desde startDate/endDate si computeLaborRangeUTC no da mes exacto.
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const monthEndDate = new Date(Date.UTC(y, m + 1, 0));
    const monthEnd = monthEndDate.toISOString().slice(0, 10);

    const { data: weeksRows, error: weeksError } = await supabase
      .from('weekly_snapshots')
      .select('week_start, extra_hours')
      .eq('user_id', userId)
      .gte('week_start', monthStart)
      .lte('week_start', monthEnd);

    if (weeksError) throw new Error(`Error consultando weekly_snapshots: ${weeksError.message}`);

    const extraHoursForMonth = (weeksRows ?? []).reduce((s: number, w: any) => s + (Number(w.extra_hours) || 0), 0);

    return {
      period,
      overtimeHours: extraHoursForMonth,
      weekStart: monthStart,
      weekEnd: monthEnd,
    };
  }

  // Si no es 'month' usamos la RPC existente (semana/ etc.)
  const { data, error } = await supabase.rpc('get_weekly_worker_stats', {
    p_start_date: startDate,
    p_end_date: endDate,
    p_user_id: userId,
  });

  if (error) throw new Error(`Error en RPC get_weekly_worker_stats: ${error.message}`);

  const weeks = Array.isArray((data as any)?.weeksResult) ? (data as any).weeksResult : [];
  const staff = weeks.flatMap((w: any) => (Array.isArray(w.staff) ? w.staff : []));
  const target = staff.find((s: any) => s.id === userId) ?? staff[0];
  const overtimeHours = Number(target?.overtimeHours) || 0;

  return {
    period,
    overtimeHours,
    weekStart: startDate,
    weekEnd: endDate,
  };
}

