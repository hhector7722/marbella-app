import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export const maxDuration = 30; // 30s max para serverless Vercel if needed

export async function POST(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return new Response('Unauthorized', { status: 401 });
        }

        const { messages } = await req.json();

        // 1. EXTRAER EL ÚLTIMO MENSAJE DEL USUARIO
        const latestMessage = messages[messages.length - 1];

        // 2. VALIDAR O CREAR SESIÓN DE CHAT ASÍNCRONO
        let sessionId = null;
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
            if (sError) throw sError;
            sessionId = newSession.id;
        }

        // 3. GUARDAR EL MENSAJE DEL USUARIO EN BD
        await supabase.from('ai_chat_messages').insert({
            session_id: sessionId,
            user_id: user.id,
            role: 'user',
            content_type: 'text', // Simplificado para este ejemplo inicial (podría ser image)
            text_content: latestMessage.content
        });

        // 4. LLAMAR AL MODELO LLM DE OPENAI (Via AI SDK)
        const result = streamText({
            model: openai('gpt-4o-mini'),
            messages: [{ role: 'system', content: 'Eres el Agente de Texto de Bar La Marbella. Tu propósito es ayudar por chat.' }, ...messages],
            async onFinish({ text }) {
                // 5. GUARDAR LA RESPUESTA DEL ASISTENTE EN BD UNA VEZ TERMINA DE STREAMEAR
                await supabase.from('ai_chat_messages').insert({
                    session_id: sessionId,
                    user_id: user.id,
                    role: 'assistant',
                    content_type: 'text',
                    text_content: text
                });
            },
        });

        // Devolver el stream de texto al cliente
        return result.toDataStreamResponse();

    } catch (error: any) {
        console.error('[CHAT_API_ERROR]', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
