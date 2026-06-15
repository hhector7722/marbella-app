import { NextResponse } from 'next/server';
import { canAccessUsageAnalytics } from '@/lib/usage/access';
import { getUsageRecentEventsPage, parseUsageDashboardFilters } from '@/lib/usage/queries';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .maybeSingle();

  const email = profile?.email ?? user.email ?? '';
  if (!canAccessUsageAnalytics(email)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const url = new URL(request.url);
  const filters = parseUsageDashboardFilters({
    dia: url.searchParams.get('dia') ?? undefined,
    usuario: url.searchParams.get('usuario') ?? undefined,
    usuarios: url.searchParams.get('usuarios') ?? undefined,
  });

  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0') || 0);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '40') || 40));

  try {
    const { events, hasMore } = await getUsageRecentEventsPage(filters, offset, limit);
    return NextResponse.json({ events, hasMore });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al cargar actividad';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
