import { NextResponse } from 'next/server';
import { canAccessUsageAnalytics } from '@/lib/usage/access';
import { getUsageTimelinePage, parseUsageDashboardFilters } from '@/lib/usage/queries';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles')
    .select('email').eq('id', user.id).maybeSingle();
  if (!canAccessUsageAnalytics(profile?.email ?? user.email ?? '')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const search = new URL(request.url).searchParams;
  const deviceRaw = search.get('dispositivo') || 'all';
  const devices = ['all', 'smartphone', 'desktop', 'tablet', 'unknown'] as const;
  if (!devices.some((value) => value === deviceRaw)) {
    return NextResponse.json({ error: 'Filtro no válido' }, { status: 400 });
  }
  const device = deviceRaw as typeof devices[number];
  const filters = parseUsageDashboardFilters({
    dia: search.get('dia') ?? undefined,
    usuarios: search.get('usuarios') ?? undefined,
    usuario: search.get('usuario') ?? undefined,
  });
  const cursor = search.get('cursor');
  try {
    const page = await getUsageTimelinePage(filters, device, cursor, 150);
    return NextResponse.json(page, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error && error.message === 'Cursor de paginación no válido'
        ? error.message : 'No se pudo obtener la actividad',
    }, { status: 500 });
  }
}
