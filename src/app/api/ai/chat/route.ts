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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) throw new Error(profileError.message);

    const dbRole = (profile?.role as string) || 'staff';
    // Normalizamos a staff/manager para el agente.
    const userRole = dbRole === 'manager' || dbRole === 'supervisor' ? 'manager' : 'staff';

    const agent = new AIAgent();
    const userName = user.email || (user.user_metadata && (user.user_metadata as any).full_name) || user.id;
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
