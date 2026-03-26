import { createClient } from '@/utils/supabase/server';
import { verifyUserAction } from '@/lib/ai/rbac';
import { getISOWeekEndUTC, getISOWeekStartUTC, toUTCDateString } from '@/lib/date-utils';

export type SalesPeriod = 'today' | 'last_week' | 'month';

function computePeriodRangeUTC(period: SalesPeriod): { startDate: string; endDate: string } {
  const now = new Date();

  if (period === 'last_week') {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - 7);
    return {
      startDate: getISOWeekStartUTC(d),
      endDate: getISOWeekEndUTC(d),
    };
  }

  if (period === 'month') {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth(); // 0-11
    const startDate = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    return { startDate, endDate: toUTCDateString(now) };
  }

  // today
  return { startDate: toUTCDateString(now), endDate: toUTCDateString(now) };
}

export async function fetchSalesSummary(period: SalesPeriod): Promise<{
  period: SalesPeriod;
  totalSales: number;
  closureCount: number;
  avgTicket: number;
  startDate: string;
  endDate: string;
}> {
  // RBAC: solo manager/supervisor puede ver financieros vía la acción existente en BD.
  await verifyUserAction('view_financials');

  const supabase = await createClient();
  const { startDate, endDate } = computePeriodRangeUTC(period);

  const { data: cls, error } = await supabase
    .from('cash_closings')
    .select('net_sales, closing_date')
    .gte('closing_date', startDate)
    .lte('closing_date', endDate);

  if (error) throw new Error(`Error consultando cash_closings: ${error.message}`);

  const rows = cls ?? [];
  const totalSales = rows.reduce((sum, c: any) => sum + (Number(c.net_sales) || 0), 0);
  const closureCount = rows.length;
  const avgTicket = closureCount > 0 ? totalSales / closureCount : 0;

  return {
    period,
    totalSales,
    closureCount,
    avgTicket,
    startDate,
    endDate,
  };
}

