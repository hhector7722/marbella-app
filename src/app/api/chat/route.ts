import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { streamText } from 'ai';
import { google } from '@ai-sdk/google';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
    // GUARD: Verificación temprana de API Key antes de cualquier operación
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        console.error('[CHAT_ROUTE] FATAL: Falta GOOGLE_GENERATIVE_AI_API_KEY en las variables de entorno del servidor.');
        return new Response(JSON.stringify({ error: 'Configuración de servidor incompleta: Falta GOOGLE_GENERATIVE_AI_API_KEY.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return new Response('Unauthorized', { status: 401 });
        }

        const { messages } = await req.json();
        const latestMessage = messages[messages.length - 1];

        // Obtener o crear sesión de chat
        let sessionId: string | null = null;
        const { data: activeSession } = await supabase
            .from('ai_chat_sessions')
            .select('id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (activeSession) {
            sessionId = activeSession.id;
        } else {
            const { data: newSession, error: sError } = await supabase
                .from('ai_chat_sessions')
                .insert({ user_id: user.id })
                .select('id')
                .single();
            if (sError) {
                console.error('[CHAT_ROUTE] Error creando sesión de chat:', sError);
                throw sError;
            }
            sessionId = newSession.id;
        }

        // Guardar mensaje del usuario en BD
        await supabase.from('ai_chat_messages').insert({
            session_id: sessionId,
            user_id: user.id,
            role: 'user',
            content_type: 'text',
            text_content: latestMessage.content
        });

        // Llamar al modelo y streamear respuesta (Gemini 1.5 Flash)
        const result = await streamText({
            model: google('gemini-1.5-flash'),
            messages: [
                { role: 'system', content: 'Eres el Agente de Texto de Bar La Marbella. Respuestas cortas, directas y operativas.' },
                ...messages
            ],
            async onFinish({ text }) {
                await supabase.from('ai_chat_messages').insert({
                    session_id: sessionId,
                    user_id: user.id,
                    role: 'assistant',
                    content_type: 'text',
                    text_content: text
                });
            },
        });

        return result.toDataStreamResponse();

    } catch (error: unknown) {
        console.error('[CHAT_ROUTE] Fallo letal en Chat Route:', error);
        const msg = error instanceof Error ? error.message : 'Error interno desconocido';
        return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
