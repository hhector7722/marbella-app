import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { resolveSessionUser } from '@/lib/auth/resolve-session-user';
import { isMasterDashboardUser } from '@/lib/master-dashboard';

export const dynamic = 'force-dynamic';
const CAMERA_ID = 'reolink-duo-3';

export async function GET() {
  const supabase = await createClient();
  const user = await resolveSessionUser(supabase);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isMasterDashboardUser(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const admin = createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.from('camera_external_viewer_status').select('external_connections, external_online, checked_at').eq('camera_id', CAMERA_ID).maybeSingle();
  if (error) return NextResponse.json({ error: 'Read failed' }, { status: 500 });

  return NextResponse.json({
    externalConnections: data?.external_connections ?? 0,
    externalOnline: data?.external_online ?? false,
    checkedAt: data?.checked_at ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
