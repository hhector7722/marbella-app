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
    // Construcción segura de displayName / userName:
    // 1) Preferimos "first_name last_name" si existe.
    // 2) Luego intentamos user.user_metadata.full_name or name (supabase auth metadata).
    // 3) Finalmente fallback a la parte local del email o user.id.
    const profileFullName = profile
      ? `${(profile as any).first_name ?? ''} ${(profile as any).last_name ?? ''}`.trim()
      : '';

    const profileName =
      (profileFullName && profileFullName !== '') ? profileFullName :
      (user.user_metadata && ((user.user_metadata as any).full_name || (user.user_metadata as any).name)) ||
      (typeof user.email === 'string' ? user.email.split('@')[0] : undefined);

    const userName = profileName || user.email || user.id || 'Usuario';
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
