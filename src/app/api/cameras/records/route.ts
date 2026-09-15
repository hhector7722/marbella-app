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
  const { data, error } = await admin
    .from('camera_external_connection_sessions')
    .select('id, started_at, ended_at')
    .eq('camera_id', CAMERA_ID)
    .order('started_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: 'Read failed' }, { status: 500 });
  return NextResponse.json({ records: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
