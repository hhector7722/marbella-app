import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { resolveSessionUser } from '@/lib/auth/resolve-session-user';
import { isMasterDashboardUser } from '@/lib/master-dashboard';

export const dynamic = 'force-dynamic';
const CAMERA_ID = 'reolink-duo-3';
const APP_VIEWER_STALE_MS = 20_000;

export async function GET() {
  const supabase = await createClient();
  const user = await resolveSessionUser(supabase);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isMasterDashboardUser(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const admin = createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const staleBefore = new Date(Date.now() - APP_VIEWER_STALE_MS).toISOString();

  const { error: cleanupError } = await admin
    .from('camera_app_viewer_sessions')
    .update({ ended_at: staleBefore })
    .eq('camera_id', CAMERA_ID)
    .is('ended_at', null)
    .lt('last_seen_at', staleBefore);

  if (cleanupError) return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });

  const [externalResult, appResult] = await Promise.all([
    admin
      .from('camera_external_connection_sessions')
      .select('id, started_at, ended_at')
      .eq('camera_id', CAMERA_ID)
      .order('started_at', { ascending: false })
      .limit(200),
    admin
      .from('camera_app_viewer_sessions')
      .select('session_id, started_at, ended_at, last_seen_at')
      .eq('camera_id', CAMERA_ID)
      .order('started_at', { ascending: false })
      .limit(200),
  ]);

  if (externalResult.error || appResult.error) {
    return NextResponse.json({ error: 'Read failed' }, { status: 500 });
  }

  const externalRecords = (externalResult.data ?? []).map((row) => ({
    id: `reolink-${row.id}`,
    started_at: row.started_at,
    ended_at: row.ended_at,
    source: 'reolink' as const,
  }));

  const appRecords = (appResult.data ?? []).map((row) => ({
    id: `app-${row.session_id}`,
    started_at: row.started_at,
    ended_at: row.ended_at,
    source: 'marbella_app' as const,
  }));

  const records = [...externalRecords, ...appRecords]
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .slice(0, 200);

  return NextResponse.json({ records }, { headers: { 'Cache-Control': 'no-store' } });
}
