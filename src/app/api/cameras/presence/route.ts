import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { resolveSessionUser } from '@/lib/auth/resolve-session-user';
import { canAccessCameras } from '@/lib/cameras/access';

export const dynamic = 'force-dynamic';
const CAMERA_ID = 'reolink-duo-3';
const STALE_MS = 20_000;

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authorize() {
  const supabase = await createClient();
  const user = await resolveSessionUser(supabase);
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!(await canAccessCameras(supabase, user.id))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user };
}

export async function POST(request: NextRequest) {
  const auth = await authorize();
  if ('error' in auth) return auth.error;

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const body = await request.json().catch(() => null) as { sessionId?: unknown } | null;
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!sessionId || sessionId.length > 100) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 400 });
  }

  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_MS).toISOString();

  await admin
    .from('camera_app_viewer_sessions')
    .update({ ended_at: now.toISOString() })
    .eq('camera_id', CAMERA_ID)
    .is('ended_at', null)
    .lt('last_seen_at', staleBefore);

  const { data: existing, error: readError } = await admin
    .from('camera_app_viewer_sessions')
    .select('session_id, ended_at')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: 'Read failed' }, { status: 500 });

  if (existing?.ended_at) {
    return NextResponse.json({ error: 'Session ended' }, { status: 409 });
  }

  const payload = {
    session_id: sessionId,
    camera_id: CAMERA_ID,
    user_id: auth.user.id,
    viewer_email: auth.user.email?.trim().toLowerCase() ?? null,
    last_seen_at: now.toISOString(),
  };

  const { error } = existing
    ? await admin
        .from('camera_app_viewer_sessions')
        .update({ last_seen_at: payload.last_seen_at, viewer_email: payload.viewer_email })
        .eq('session_id', sessionId)
    : await admin.from('camera_app_viewer_sessions').insert(payload);

  if (error) return NextResponse.json({ error: 'Write failed' }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize();
  if ('error' in auth) return auth.error;

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const body = await request.json().catch(() => null) as { sessionId?: unknown } | null;
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!sessionId) return NextResponse.json({ error: 'Invalid session' }, { status: 400 });

  const now = new Date().toISOString();
  const { error } = await admin
    .from('camera_app_viewer_sessions')
    .update({ ended_at: now, last_seen_at: now })
    .eq('session_id', sessionId)
    .eq('user_id', auth.user.id)
    .is('ended_at', null);

  if (error) return NextResponse.json({ error: 'Write failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
