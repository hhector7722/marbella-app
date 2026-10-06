import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { resolveSessionUser } from '@/lib/auth/resolve-session-user';
import { MASTER_DASHBOARD_EMAIL } from '@/lib/master-dashboard';
import { canAccessCameras } from '@/lib/cameras/access';

export const dynamic = 'force-dynamic';
const CAMERA_ID = 'reolink-duo-3';
const APP_VIEWER_STALE_MS = 20_000;

export async function GET() {
  const supabase = await createClient();
  const user = await resolveSessionUser(supabase);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await canAccessCameras(supabase, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const admin = createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const staleBefore = new Date(Date.now() - APP_VIEWER_STALE_MS).toISOString();

  const [{ data, error }, { data: appViewerRows, error: appViewerError }] = await Promise.all([
    admin
      .from('camera_external_viewer_status')
      .select('external_connections, external_online, checked_at')
      .eq('camera_id', CAMERA_ID)
      .maybeSingle(),
    admin
      .from('camera_app_viewer_sessions')
      .select('session_id, viewer_email')
      .eq('camera_id', CAMERA_ID)
      .is('ended_at', null)
      .gte('last_seen_at', staleBefore),
  ]);

  if (error || appViewerError) return NextResponse.json({ error: 'Read failed' }, { status: 500 });

  const activeAppViewers = appViewerRows ?? [];
  const hectorAppConnections = activeAppViewers.filter(
    (row) => String(row.viewer_email ?? '').trim().toLowerCase() === MASTER_DASHBOARD_EMAIL,
  ).length;
  const marbellaAppConnections = activeAppViewers.length - hectorAppConnections;

  const reolinkConnections = data?.external_connections ?? 0;
  const reolinkFresh = data?.checked_at
    ? Date.now() - new Date(data.checked_at).getTime() <= APP_VIEWER_STALE_MS
    : false;
  const freshReolinkConnections = data?.external_online && reolinkFresh ? reolinkConnections : 0;

  // El indicador LIVE representa a otra persona viendo la cámara, no a Héctor.
  // Las conexiones de go2rtc no llevan identidad, así que descontamos las
  // sesiones activas de Héctor que sí conocemos desde la app. Tomamos el
  // máximo para no contar dos veces al mismo espectador (app + stream).
  const nonHectorReolinkConnections = Math.max(0, freshReolinkConnections - hectorAppConnections);
  const externalConnections = Math.max(marbellaAppConnections, nonHectorReolinkConnections);
  const externalOnline = externalConnections > 0;

  return NextResponse.json({
    externalConnections,
    externalOnline,
    checkedAt: externalOnline ? new Date().toISOString() : data?.checked_at ?? null,
    reolinkConnections,
    marbellaAppConnections,
    hectorAppConnections,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
