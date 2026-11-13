import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { normalizeCopilotRole } from '@/lib/copilot/permissions';
import { usageDeviceFromUserAgent } from '@/lib/usage/device';
import { recordAppUsageEventWithClient } from '@/lib/usage/record';

export const runtime = 'nodejs';

/** Una apertura = una sesión con su evento de uso; nunca se envía texto del chat a analytics. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (profileError || !normalizeCopilotRole(profile?.role)) {
    return NextResponse.json({ error: 'Rol no autorizado' }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => ({}));
  const possiblePath = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as { path?: unknown }).path : null;
  const path = typeof possiblePath === 'string' && possiblePath.startsWith('/')
    && possiblePath.length <= 512 ? possiblePath : '/dashboard';

  const { data: session, error } = await supabase.from('ai_chat_sessions')
    .insert({ user_id: user.id, status: 'active' }).select('id').single();
  if (error || !session?.id) return NextResponse.json({ error: 'No se pudo abrir la sesión' }, { status: 500 });

  const deviceType = usageDeviceFromUserAgent(request.headers.get('user-agent'));
  await recordAppUsageEventWithClient(supabase, user.id, {
    eventType: 'action',
    path,
    label: 'Chat IA',
    metadata: {
      action: 'chat_open',
      sessionId: session.id,
      source: 'server',
      ...(deviceType ? { deviceType } : {}),
    },
  });

  return NextResponse.json({ sessionId: session.id }, { headers: { 'Cache-Control': 'no-store' } });
}
