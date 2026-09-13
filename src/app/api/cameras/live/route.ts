import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { resolveSessionUser } from '@/lib/auth/resolve-session-user';
import { canAccessCameras, CAMERA_LIVE_URL } from '@/lib/cameras/access';

export async function GET() {
  const supabase = await createClient();
  const user = await resolveSessionUser(supabase);

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allowed = await canAccessCameras(supabase, user.id);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(
    {
      url: CAMERA_LIVE_URL,
      camera: 'reolink-duo-3',
      mode: 'external-web-stream',
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
