import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

/** Lee estado_sala para los roles autorizados del dashboard sin desactivar RLS. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Sesión no válida' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('role').eq('id', user.id).maybeSingle();
  if (profileError || !['manager', 'admin'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Sin permisos de acceso a sala' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Estado de sala no configurado' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const admin = createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.from('estado_sala')
    .select('radiografia_completa,ultima_actualizacion,mesas_activas').eq('id', 1).maybeSingle();
  if (error) {
    return NextResponse.json({ error: 'No se pudo consultar el estado de sala' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({
    mesas: Array.isArray(data?.radiografia_completa) ? data.radiografia_completa : [],
    actualizacion: data?.ultima_actualizacion ?? null,
    total: Number(data?.mesas_activas ?? 0),
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
