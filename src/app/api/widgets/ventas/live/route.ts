import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const reply = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: {
    'Cache-Control': 'private, no-store, max-age=0',
    'Vary': 'Authorization',
    'X-Content-Type-Options': 'nosniff',
  },
});

/**
 * Live read-only snapshot for the master Scriptable sales modal.
 * Never accepts cookies, never exposes the service-role key, and
 * validates the user's Supabase JWT before reading the same live
 * snapshot used by the main app.
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return reply({ error: 'Se requiere iniciar sesión' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return reply({ error: 'Servicio no disponible' }, 503);

  const auth = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let email: string | undefined;
  try {
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user) return reply({ error: 'Sesión no válida' }, 401);
    email = data.user.email;
  } catch {
    return reply({ error: 'No se pudo validar la sesión' }, 503);
  }
  if (!isMasterDashboardUser(email)) return reply({ error: 'Sin permiso' }, 403);

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return reply({ error: 'Live no configurado' }, 503);

  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.from('estado_sala')
      .select('radiografia_completa,ultima_actualizacion,mesas_activas')
      .eq('id', 1).maybeSingle();
    if (error) throw error;
    const mesas = Array.isArray(data?.radiografia_completa)
      ? data.radiografia_completa.slice(0, 100)
      : [];
    return reply({
      mesas,
      total: Number(data?.mesas_activas ?? 0),
      actualizacion: data?.ultima_actualizacion ?? null,
    });
  } catch (error) {
    console.error('Widget Live snapshot failed:', error);
    return reply({ error: 'Live no disponible' }, 503);
  }
}
