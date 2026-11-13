import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { canAccessUsageAnalytics } from '@/lib/usage/access';

export const runtime = 'nodejs';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Solo la cuenta autorizada a Uso app puede abrir la transcripción.
 * RLS sigue restringiendo los mensajes propios de cada empleado; el acceso
 * cruzado se realiza exclusivamente desde este servidor, con doble comprobación
 * de evento -> propietario -> sesión -> mensajes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  if (!UUID_RE.test(eventId)) return NextResponse.json({ error: 'Evento inválido' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('email').eq('id', user.id).maybeSingle();
  if (profileError || !canAccessUsageAnalytics(profile?.email ?? user.email ?? '')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Configuración incompleta' }, { status: 503 });

  const admin = createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: event, error: eventError } = await admin.from('app_usage_events')
    .select('profile_id,event_type,metadata').eq('id', eventId).maybeSingle();
  const metadata = event?.metadata as Record<string, unknown> | null | undefined;
  const sessionId = metadata?.sessionId;
  if (eventError || !event || event.event_type !== 'action'
    || metadata?.action !== 'chat_open'
    || typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
  }

  const { data: session, error: sessionError } = await admin.from('ai_chat_sessions')
    .select('user_id').eq('id', sessionId).maybeSingle();
  if (sessionError || !session || session.user_id !== event.profile_id) {
    return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
  }

  const { data: messages, error: messagesError } = await admin.from('ai_chat_messages')
    .select('id,role,text_content,created_at')
    .eq('session_id', sessionId)
    .eq('user_id', event.profile_id)
    .eq('content_type', 'text')
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true })
    .limit(201);

  if (messagesError) return NextResponse.json({ error: 'Error al consultar la conversación' }, { status: 500 });
  const list = (messages ?? []).slice(0, 200).map((message) => ({
    id: message.id,
    role: message.role,
    text: message.text_content ?? '',
    createdAt: message.created_at,
  }));
  return NextResponse.json({ messages: list, truncated: (messages?.length ?? 0) > 200 }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}
