import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';

const CAMERA_ID = 'reolink-duo-3';

function secretMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const ingestSecret = process.env.CAMERA_STATUS_INGEST_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!ingestSecret || !supabaseUrl || !serviceRoleKey) {
    console.error('Camera status ingest is not configured');
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  if (!secretMatches(request.headers.get('x-camera-status-secret'), ingestSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const payload = body as { externalConnections?: unknown; externalOnline?: unknown; checkedAt?: unknown };
  if (!Number.isInteger(payload.externalConnections) || (payload.externalConnections as number) < 0 || typeof payload.externalOnline !== 'boolean' || typeof payload.checkedAt !== 'string' || Number.isNaN(Date.parse(payload.checkedAt))) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const externalConnections = payload.externalConnections as number;
  if (payload.externalOnline !== (externalConnections > 0)) {
    return NextResponse.json({ error: 'Inconsistent payload' }, { status: 400 });
  }

  const checkedAt = new Date(payload.checkedAt).toISOString();
  const now = new Date();
  if (Math.abs(now.getTime() - new Date(checkedAt).getTime()) > 5 * 60 * 1000) {
    return NextResponse.json({ error: 'Stale payload' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: previous, error: previousError } = await supabase
    .from('camera_external_viewer_status')
    .select('external_online')
    .eq('camera_id', CAMERA_ID)
    .maybeSingle();

  if (previousError) {
    console.error('Camera status previous-state read failed:', previousError.message);
    return NextResponse.json({ error: 'Persistence failed' }, { status: 500 });
  }

  const wasOnline = previous?.external_online === true;
  const isOnline = payload.externalOnline;

  if (!wasOnline && isOnline) {
    const { error } = await supabase.from('camera_external_connection_sessions').insert({ camera_id: CAMERA_ID, started_at: checkedAt });
    if (error && error.code !== '23505') {
      console.error('Camera session start failed:', error.message);
      return NextResponse.json({ error: 'Persistence failed' }, { status: 500 });
    }
  } else if (wasOnline && !isOnline) {
    const { error } = await supabase
      .from('camera_external_connection_sessions')
      .update({ ended_at: checkedAt })
      .eq('camera_id', CAMERA_ID)
      .is('ended_at', null);
    if (error) {
      console.error('Camera session end failed:', error.message);
      return NextResponse.json({ error: 'Persistence failed' }, { status: 500 });
    }
  }

  const { error } = await supabase.from('camera_external_viewer_status').upsert({
    camera_id: CAMERA_ID,
    external_connections: externalConnections,
    external_online: isOnline,
    checked_at: checkedAt,
    updated_at: now.toISOString(),
  }, { onConflict: 'camera_id' });

  if (error) {
    console.error('Camera status ingest failed:', error.message);
    return NextResponse.json({ error: 'Persistence failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
