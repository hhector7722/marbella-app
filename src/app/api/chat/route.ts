import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

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

        // Obtener perfil del usuario para personalización
        const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, role, preferred_language')
            .eq('id', user.id)
            .single();

        const userName = profile?.first_name || 'compañero';
        const userRole = profile?.role || 'staff';
        const userLang = profile?.preferred_language || 'es';

        const systemPrompt = `Eres el Asistente Inteligente de Bar La Marbella. 
Estás hablando con ${userName}, que tiene el rol de ${userRole}. 

REGLA DE IDIOMA CRÍTICA: Debes responder EXCLUSIVAMENTE en ${userLang === 'ca' ? 'Catalán (Català)' : 'Español (Castellano)'}.

Tus respuestas deben estar adaptadas a este usuario. Si es manager o admin, sé más proactivo con datos financieros. Si es staff, céntrate en la operativa diaria y recetas.

Tienes acceso a las siguientes herramientas para consultar información real del negocio:
1. "get_ingredients": Para consultar costes de compra de productos y existencias.
2. "get_menu": Para ver la carta/menú y los precios de venta al público (PVP).
3. "get_dashboard": (Solo Directores/Managers) Para ver las ventas de hoy y el balance de las cajas.
4. "get_staff": (Solo Directores/Managers) Para consultar la lista de empleados y sus roles.

REGLAS CRÍTICAS:
- Responde siempre con amabilidad y precisión operativa.
- Saluda a ${userName} de forma natural en tu primera respuesta si el contexto lo permite.
- Si el usuario te pregunta por un precio de venta, usa "get_menu".
- Si te pregunta por costes o márgenes, usa "get_ingredients" y "get_menu".
- Si no tienes acceso a una herramienta por el rol del usuario (la herramienta fallará o devolverá vacío), explícalo educadamente.
- Formatea siempre los precios con el símbolo € (ej: 2.50€).`;

        const result = await streamText({
            model: openai('gpt-4o-mini'),
            system: systemPrompt,
            messages,
            tools: {
                get_ingredients: {
                    description: 'Obtiene la lista de ingredientes/productos con sus precios de compra y unidades.',
                    parameters: z.object({}),
                    execute: async () => {
                        const { data, error } = await supabase.from('ingredients').select('name, current_price, purchase_unit, order_unit');
                        if (error) throw error;
                        return data;
                    }
                },
                get_menu: {
                    description: 'Obtiene la lista de platos del menú con sus categorías y precios de venta al público (PVP).',
                    parameters: z.object({}),
                    execute: async () => {
                        const { data, error } = await supabase.from('recipes').select('name, category, sale_price');
                        if (error) throw error;
                        return data;
                    }
                },
                get_dashboard: {
                    description: 'Obtiene un resumen de las ventas de hoy y el estado de las cajas (Solo para Managers).',
                    parameters: z.object({}),
                    execute: async () => {
                        const today = new Date().toISOString().split('T')[0];
                        const [tickets, boxes] = await Promise.all([
                            supabase.from('tickets_marbella').select('total_documento').eq('fecha', today),
                            supabase.from('cash_boxes').select('name, current_balance')
                        ]);
                        const totalVentas = tickets.data?.reduce((sum, t) => sum + (Number(t.total_documento) || 0), 0) || 0;
                        return { total_ventas_hoy: totalVentas, cajas: boxes.data };
                    }
                },
                get_staff: {
                    description: 'Obtiene la lista de empleados y sus roles (Solo para Managers).',
                    parameters: z.object({}),
                    execute: async () => {
                        const { data, error } = await supabase.from('profiles').select('first_name, last_name, role, phone_number');
                        if (error) throw error;
                        return data;
                    }
                }
            },
            maxSteps: 5, // Permite a la IA llamar a herramientas y luego responder
            onError: ({ error }) => {
                console.error(`[CHAT] [${requestId}] Error en streamText:`, error);
            },
            async onFinish({ text }) {
                console.log(`[CHAT] [${requestId}] Generación completada.`);
                try {
                    await supabase.from('ai_chat_messages').insert({
                        user_id: user.id,
                        role: 'assistant',
                        content_type: 'text',
                        text_content: text
                    });
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
