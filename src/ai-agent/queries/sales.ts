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

  // HOY EN CURSO: tickets live (tickets_marbella.total_documento) por fecha_negocio = hoy
  if (period === 'today') {
    const todayStr = toUTCDateString(new Date());

    const { data: tickets, error: tError } = await supabase
      .from('tickets_marbella')
      .select('total_documento, fecha_negocio')
      .eq('fecha_negocio', todayStr);

    if (tError) throw new Error(`Error consultando tickets_marbella: ${tError.message}`);

    const rows = tickets ?? [];
    const totalSales = rows.reduce((sum, t: any) => sum + (Number(t.total_documento) || 0), 0);
    const closureCount = rows.length; // aquí = nº tickets (no cierres)
    const avgTicket = closureCount > 0 ? totalSales / closureCount : 0;

    return {
      period,
      totalSales,
      closureCount,
      avgTicket,
      startDate: todayStr,
      endDate: todayStr,
    };
  }

  // HISTÓRICO (días cerrados): cash_closings.net_sales por closing_date
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

