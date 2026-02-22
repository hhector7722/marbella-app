import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
    console.log('[DEBUG] [CHAT_ROUTE] INICIO');

    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error('[DEBUG] [CHAT_ROUTE] No user');
            return new Response('Unauthorized', { status: 401 });
        }

        const body = await req.json();
        const { messages } = body;

        console.log('[DEBUG] [CHAT_ROUTE] Mensajes recibidos:', messages?.length);

        const result = await streamText({
            model: openai('gpt-4o-mini'),
            messages: [
                { role: 'system', content: 'Eres el Agente de Texto de Bar La Marbella. Respuestas muy cortas.' },
                ...messages
            ],
            async onFinish({ text }) {
                console.log('[DEBUG] [CHAT_ROUTE] onFinish - Text length:', text.length);
                await supabase.from('ai_chat_messages').insert({
                    user_id: user.id,
                    role: 'assistant',
                    content_type: 'text',
                    text_content: text
                }).catch(e => console.error('[DEBUG] [CHAT_ROUTE] DB Error:', e));
            }
        });

        const encoder = new TextEncoder();

        // Usamos un generador asíncrono robusto para el protocolo v1
        const stream = new ReadableStream({
            async start(controller) {
                console.log('[DEBUG] [CHAT_ROUTE] Stream START');
                try {
                    for await (const chunk of result.textStream) {
                        // Formato v1: 0:"..."\n
                        const payload = `0:${JSON.stringify(chunk)}\n`;
                        controller.enqueue(encoder.encode(payload));
                    }
                    console.log('[DEBUG] [CHAT_ROUTE] Stream COMPLETO');
                } catch (err) {
                    console.error('[DEBUG] [CHAT_ROUTE] Stream ERROR:', err);
                    controller.error(err);
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'x-vercel-ai-stream-protocol': 'v1',
                'Cache-Control': 'no-cache',
            },
        });

    } catch (error: any) {
        console.error('[CHAT_ROUTE] FATAL:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
