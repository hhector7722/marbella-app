import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { AIAgent } from '@/ai-agent/core/agent';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const queryFromBody = typeof body?.query === 'string' ? body.query : '';

    const lastUserMessage =
      messages
        .slice()
        .reverse()
        .find((m: any) => m?.role === 'user' && typeof m?.content === 'string')?.content ?? '';

    const query = (queryFromBody || lastUserMessage).trim();
    if (!query) {
      return NextResponse.json(
        { response: 'Escribe una pregunta antes de pedirme magia, ¿vale?' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ response: 'No autorizado' }, { status: 401 });
    }

    // Intentamos leer role y nombre desde profiles (first_name/last_name). Usamos maybeSingle para no lanzar si no hay fila.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, first_name, last_name')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      // No bloqueamos la petición por un problema con la consulta de perfil.
      // Optional: log para debugging en servidor (no lanzamos error al cliente).
      console.warn('Profile query returned error:', profileError.message);
    }

    const dbRole = (profile?.role as string) || 'staff';
    // Normalizamos a staff/manager para el agente.
    const userRole = dbRole === 'manager' || dbRole === 'supervisor' ? 'manager' : 'staff';

    const agent = new AIAgent();
    // Preferimos el first_name de profiles (solo nombre de pila).
    // Si no existe, intentamos extraer la primera palabra de user.user_metadata.full_name o name.
    // Si tampoco hay metadata, usamos la parte local del email (antes del @) como fallback.
    const profileFirstName = (profile && (profile as any).first_name && String((profile as any).first_name).trim()) || undefined;

    const metaFullName = user.user_metadata && ((user.user_metadata as any).full_name || (user.user_metadata as any).name);
    const metaFirstName = metaFullName ? String(metaFullName).trim().split(/\s+/)[0] : undefined;

    const emailLocalPart = typeof user.email === 'string' ? String(user.email).split('@')[0] : undefined;
    const emailFirstToken = emailLocalPart ? String(emailLocalPart).split(/[\._\-+]/)[0] : undefined;

    // Construimos userName priorizando first_name, luego metadata first token, luego email local token.
    const userName = profileFirstName || metaFirstName || emailFirstToken || user.id || 'Usuario';
    const result = await agent.processQuery({
      query,
      userId: user.id,
      userName,
      userRole,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      {
        response: error?.message ? `Error en /api/ai/chat: ${error.message}` : 'Error en /api/ai/chat',
        metadata: { processingTimeMs: 0, queryType: 'error' },
      },
      { status: 500 },
    );
  }
}
