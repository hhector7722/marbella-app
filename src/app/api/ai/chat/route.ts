import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { UnifiedToolset } from '@/lib/ai/tools';
import { createClient } from '@/utils/supabase/server';

export const maxDuration = 30;

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  console.log('[CHAT_API] Request received. API Key present:', !!apiKey);
  
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Falta la API Key en el servidor (OPENAI_API_KEY)' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const openai = createOpenAI({ apiKey });
  
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[CHAT_API] Auth error:', authError);
      return new Response('No autorizado', { status: 401 });
    }
    console.log('[CHAT_API] User identified:', user.id);

    const { messages } = await req.json();
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, role, preferred_language, ai_greeting_style')
      .eq('id', user.id)
      .single();

    const userName = profile?.first_name || 'compañero';
    const userRole = profile?.role || 'staff';
    const userLang = profile?.preferred_language || 'es';
    const userStyle = profile?.ai_greeting_style || 'profesional';

    const systemPrompt = `Eres la IA operativa de Bar La Marbella.
Contexto: Usuario ${userName} (${userRole}). Idioma: ${userLang}. Estilo: ${userStyle}.
REGLA DE ORO: Responde basándote EXCLUSIVAMENTE en las herramientas.
REGLA DE ESTILO: Sé extremadamente directo y breve. Máximo 2 frases por respuesta.
REGLA DE SEGURIDAD: Nunca menciones datos de otros usuarios a menos que seas manager.
Formato: Usa Markdown para tablas de recetas. No uses asteriscos en los títulos.`;

    console.log('[CHAT_API] Starting simplified streamText');
    const result = await streamText({
      model: openai('gpt-4o-mini'),
      messages,
      system: 'SISTEMA ACTIVO: Responde de forma muy breve confirmando recepción.',
    });

    return result.toDataStreamResponse();
  } catch (error: any) {
    console.error('[CHAT_API_ERROR]', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error desconocido',
      type: error.name
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
