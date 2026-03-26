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

  // Si el periodo es 'today' usamos tickets_marbella (total por ticket)
  if (period === 'today') {
    const { data: tickets, error: ticketsError } = await supabase
      .from('tickets_marbella')
      .select('total_documento, fecha')
      .gte('fecha', startDate)
      .lte('fecha', endDate);

    if (ticketsError) throw new Error(`Error consultando tickets_marbella: ${ticketsError.message}`);

    const rowsTickets = tickets ?? [];
    const totalSales = rowsTickets.reduce((sum: number, t: any) => sum + (Number(t.total_documento) || 0), 0);
    const closureCount = rowsTickets.length;
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

  // Para consultas por producto (p.e. "¿cuánto café se ha vendido hoy?") usar ticket_lines_marbella filtrando por fecha_negocio y articulo_id;
  // esa consulta puede implementarse posteriormente donde se detecte intención de producto.

  // Para last_week/month seguimos usando cash_closings (histórico)
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

export async function fetchUnitsSoldByProduct(params: {
  period: SalesPeriod;
  productName: string;
}): Promise<{
  period: SalesPeriod;
  productName: string;
  units: number;
  startDate: string;
  endDate: string;
}> {
  await verifyUserAction('view_financials');
  const supabase = await createClient();

  const { period, productName } = params;
  const { startDate, endDate } = computePeriodRangeUTC(period);

  // MVP: contamos unidades desde ticket_lines_marbella por fecha_negocio (y filtro por articulo_id via mapeo)
  // 1) Resolver articulo_id desde bdp_articulos (si existe) por nombre aproximado.
  const { data: art, error: artError } = await supabase
    .from('bdp_articulos')
    .select('id, nombre')
    .ilike('nombre', `%${productName}%`)
    .limit(1)
    .maybeSingle();

  if (artError) throw new Error(`Error consultando bdp_articulos: ${artError.message}`);
  if (!art?.id) {
    throw new Error(`No encontré el artículo "${productName}" en bdp_articulos (no puedo mapear articulo_id).`);
  }

  const articuloId = Number((art as any).id);
  if (!Number.isFinite(articuloId)) {
    throw new Error(`articulo_id inválido para "${productName}".`);
  }

  const { data: lines, error: linesError } = await supabase
    .from('ticket_lines_marbella')
    .select('unidades, fecha_negocio, articulo_id')
    .eq('articulo_id', articuloId)
    .gte('fecha_negocio', startDate)
    .lte('fecha_negocio', endDate);

  if (linesError) throw new Error(`Error consultando ticket_lines_marbella: ${linesError.message}`);

  const units = (lines ?? []).reduce((s: number, l: any) => s + (Number(l.unidades) || 0), 0);

  return {
    period,
    productName: String((art as any).nombre ?? productName),
    units,
    startDate,
    endDate,
  };
}


