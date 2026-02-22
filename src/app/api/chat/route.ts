import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[CHAT] [${requestId}] Petición recibida`);

    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error(`[CHAT] [${requestId}] Error Auth:`, authError);
            return new Response('Unauthorized', { status: 401 });
        }

        const { messages } = await req.json();

        if (!messages || !Array.isArray(messages)) {
            console.error(`[CHAT] [${requestId}] Mensajes inválidos`);
            return new Response('Invalid messages', { status: 400 });
        }

        // Validación de API Key
        const apiKey = process.env.OPENAI_API_KEY;
        console.log(`[CHAT] [${requestId}] API Key cargada: ${apiKey ? 'SI (largo: ' + apiKey.length + ')' : 'NO'}`);
        if (apiKey && apiKey.includes('your_api_key')) {
            console.error(`[CHAT] [${requestId}] ERROR: La API Key sigue siendo el marcador de posición.`);
        }

        const result = await streamText({
            model: openai('gpt-4o-mini'),
            messages,
            onError: ({ error }) => {
                console.error(`[CHAT] [${requestId}] Error en streamText:`, error);
            },
            async onFinish({ text }) {
                console.log(`[CHAT] [${requestId}] Generación completada.`);
                // Guardado asíncrono en BD con try-catch robusto
                try {
                    const { error: insertError } = await supabase.from('ai_chat_messages').insert({
                        user_id: user.id,
                        role: 'assistant',
                        content_type: 'text',
                        text_content: text
                    });
                    if (insertError) throw insertError;
                } catch (e: any) {
                    console.error(`[CHAT] [${requestId}] Error BD:`, e.message);
                }
            }
        });

        // toDataStreamResponse es compatible con @ai-sdk/react@3.0.99
        return result.toDataStreamResponse();

    } catch (error: any) {
        console.error(`[CHAT] [${requestId}] ERROR CRÍTICO:`, error.message);
        return new Response(JSON.stringify({
            error: 'Error interno',
            details: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
