import { NextResponse } from 'next/server';
import { canAccessUsageAnalytics } from '@/lib/usage/access';
import { getUsageSessionDetails } from '@/lib/usage/queries';
import { createClient } from '@/utils/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles')
    .select('email').eq('id', user.id).maybeSingle();
  const email = profile?.email ?? user.email ?? '';
  if (!canAccessUsageAnalytics(email)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const profileId = params.get('usuario') ?? '';
  const usageSessionId = params.get('sesion') ?? '';
  if (!UUID.test(profileId) || !UUID.test(usageSessionId)) {
    return NextResponse.json({ error: 'Sesión no válida' }, { status: 400 });
  }

  try {
    const detail = await getUsageSessionDetails(profileId, usageSessionId);
    return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudo consultar la sesión' }, { status: 500 });
  }
}
