import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createCookieClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { BUSINESS_HOURS } from '@/lib/constants';
import { liveNetSales } from '@/lib/live-sales-net';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TIME_ZONE = 'Europe/Madrid';

function madridToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function madridHour(): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  return Number(hour);
}

function validYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() + 1 === month
    && parsed.getUTCDate() === day;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Vary': 'Authorization, Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

type HourlySale = { hora: number | string | null; total: number | string | null };
type RankingProduct = {
  nombre_articulo: string | null;
  cantidad_total: number | string | null;
  total_ingresos: number | string | null;
};
type HourUnit = { hora: number | string; unidades: number | string | null };

/**
 * Datos reales para el widget iOS de Ventas.
 * - Cookie de sesión: navegador autenticado.
 * - Authorization: Bearer <Supabase access_token>: Scriptable.
 * Ambos accesos se validan contra Supabase Auth y se restringen al usuario master.
 * El cliente PostgREST usa el JWT del usuario y respeta RLS; nunca service_role.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
  if (authHeader && !bearer) return json({ error: 'Autorización no válida' }, 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return json({ error: 'Servicio no disponible' }, 503);

  const supabase = bearer
    ? createSupabaseClient(url, anonKey, {
        accessToken: async () => bearer,
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : await createCookieClient();

  // No utilizar auth.getUser() en un cliente creado con accessToken:
  // @supabase/supabase-js deshabilita supabase.auth en ese modo.
  // Un cliente independiente verifica el JWT con GoTrue; el cliente de
  // consultas mantiene el JWT del usuario, respetando RLS.
  const authClient = bearer
    ? createSupabaseClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : supabase;
  let user: { id: string; email?: string | null } | null = null;
  try {
    const { data, error: authError } = await authClient.auth.getUser(bearer ?? undefined);
    if (authError || !data.user) return json({ error: 'Sesión no válida' }, 401);
    user = data.user;
  } catch (error) {
    console.error('Error validando sesión del widget:', error);
    return json({ error: 'No se pudo validar la sesión' }, 503);
  }
  if (!isMasterDashboardUser(user.email)) return json({ error: 'Sin permiso' }, 403);

  const today = madridToday();
  const requested = request.nextUrl.searchParams.get('date');
  if (requested !== null && (!validYmd(requested) || requested > today)) {
    return json({ error: 'Fecha no válida' }, 400);
  }

  try {
    let date = requested ?? today;
    let { data: stats, error: statsError } = await supabase.rpc('get_daily_sales_stats', {
      target_date: date,
    });
    if (statsError) throw statsError;

    // Igual que el widget de inicio: si no se elige fecha y hoy no hay ventas,
    // mostrar la última jornada con ventas (sin etiquetarla como "hoy").
    if (!requested && Number(stats?.total_ventas ?? 0) <= 0) {
      const { data: previous, error: previousError } = await supabase
        .from('tickets_marbella')
        .select('fecha')
        .lt('fecha', today)
        .gt('total_documento', 0)
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previousError) throw previousError;
      const lastDate = previous?.fecha ? String(previous.fecha).slice(0, 10) : null;
      if (lastDate && validYmd(lastDate)) {
        date = lastDate;
        const result = await supabase.rpc('get_daily_sales_stats', { target_date: date });
        if (result.error) throw result.error;
        stats = result.data;
      }
    }

    const [hourlyResult, rankingResult, closingResult] = await Promise.all([
      supabase.rpc('get_hourly_sales', { p_start_date: date, p_end_date: date }),
      supabase.rpc('get_product_sales_ranking', {
        p_start_date: date,
        p_end_date: date,
        p_start_time: null,
        p_end_time: null,
      }).order('total_ingresos', { ascending: false }).limit(3),
      supabase.from('cash_closings').select('closing_date')
        .eq('closing_date', date).limit(1).maybeSingle(),
    ]);
    if (hourlyResult.error) throw hourlyResult.error;
    if (rankingResult.error) throw rankingResult.error;
    if (closingResult.error) throw closingResult.error;

    const sales = Number(stats?.total_ventas ?? 0);
    const tickets = Number(stats?.recuento_tickets ?? 0);
    const fullHourly = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0 }));
    for (const record of (hourlyResult.data ?? []) as HourlySale[]) {
      const hour = Number(record.hora);
      if (Number.isInteger(hour) && hour >= 0 && hour < 24) {
        fullHourly[hour].total = Number(record.total ?? 0);
      }
    }
    const hours = fullHourly.slice(BUSINESS_HOURS.start, BUSINESS_HOURS.end + 1);

    const currentHour = date === today && !closingResult.data
      ? madridHour() : null;
    const inBusinessHours = currentHour !== null
      && currentHour >= BUSINESS_HOURS.start
      && currentHour <= BUSINESS_HOURS.end;
    const bestHours = hours
      .filter(item => item.hour !== currentHour && item.total > 0)
      .sort((a, b) => b.total - a.total || a.hour - b.hour);
    const selectedHours = inBusinessHours && currentHour !== null
      ? [fullHourly[currentHour], ...bestHours.slice(0, 2)]
      : bestHours.slice(0, 3);

    const units: Record<number, number> = {};
    if (selectedHours.length > 0) {
      const { data, error } = await supabase.rpc('get_home_sales_visible_hour_units', {
        p_date: date,
        p_hours: selectedHours.map(item => item.hour),
      });
      if (error) throw error;
      for (const row of (data ?? []) as HourUnit[]) {
        units[Number(row.hora)] = Number(row.unidades ?? 0);
      }
    }

    return json({
      date,
      timeZone: TIME_ZONE,
      updatedAt: new Date().toISOString(),
      isToday: date === today,
      isDayClosed: Boolean(closingResult.data),
      summary: {
        sales,
        netSales: liveNetSales(sales),
        tickets,
        averageTicket: tickets > 0 ? sales / tickets : 0,
      },
      hours,
      topHours: selectedHours.map(item => ({
        hour: item.hour,
        total: item.total,
        units: units[item.hour] ?? 0,
        isCurrentHour: inBusinessHours && item.hour === currentHour,
      })),
      topProducts: ((rankingResult.data ?? []) as RankingProduct[]).map(item => ({
        name: String(item.nombre_articulo ?? 'Producto'),
        quantity: Number(item.cantidad_total ?? 0),
        revenue: Number(item.total_ingresos ?? 0),
      })),
    });
  } catch (error) {
    console.error('Error al consultar el widget iOS de Ventas:', error);
    return json({ error: 'No se pudieron consultar las ventas' }, 503);
  }
}
