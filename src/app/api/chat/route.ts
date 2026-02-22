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
            .select('first_name, role, preferred_language, ai_greeting_style')
            .eq('id', user.id)
            .single();

        const userName = profile?.first_name || 'compañero';
        const userRole = profile?.role || 'staff';
        const userLang = profile?.preferred_language || 'es';
        const userStyle = profile?.ai_greeting_style || 'profesional';

        // Mapeo de estilos a instrucciones (Ultra-Directos)
        const styles: Record<string, string> = {
            jefe: `Tono: "Hola ${userName}.". Sé extremadamente escueto y directo. Saluda así.`,
            sarcastico: `Tono: "Dime crack.". Sé irónico pero muy breve. Saluda así. No fuerces bromas largas.`,
            natural: `Tono: "Dime ${userName}.". Coloquial, directo y muy corto. Saluda así.`
        };

        const systemPrompt = `Eres el Asistente de Bar La Marbella. 
Estás hablando con ${userName} (${userRole}). 

REGLA DE ORO: Sé ultra-directo y breve. Máximo 1 o 2 frases por respuesta. No des explicaciones innecesarias ni fuerces la personalidad.

REGLA DE IDIOMA: Responde en ${userLang === 'ca' ? 'Catalán (Català)' : 'Español (Castellano)'}.

ESTILO: ${styles[userStyle] || styles.natural}

Herramientas:
1. get_ingredients: Costes compra y stock.
2. get_menu: Platos y PVP.
3. get_my_hours: Tus horas trabajadas esta semana (fichajes).
4. get_dashboard/get_staff: Solo Managers.

REGLAS:
- Precios siempre con €.
- Si no sabes algo, dilo breve.`;

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
                },
                get_my_hours: {
                    description: 'Obtiene el total de horas trabajadas por el usuario actual en la semana en curso.',
                    parameters: z.object({}),
                    execute: async () => {
                        const startOfWeek = new Date();
                        const day = startOfWeek.getDay() || 7;
                        if (day !== 1) startOfWeek.setHours(-24 * (day - 1));
                        startOfWeek.setHours(0, 0, 0, 0);

                        const { data, error } = await supabase
                            .from('time_logs')
                            .select('total_hours')
                            .eq('user_id', user.id)
                            .gte('clock_in', startOfWeek.toISOString())
                            .not('total_hours', 'is', null);

                        if (error) throw error;
                        const total = data.reduce((sum, log) => sum + (log.total_hours || 0), 0);
                        return { total_horas_esta_semana: total.toFixed(2) };
                    }
                }
            },
            maxSteps: 5, // Permite a la IA llamar a herramientas y luego responder
            onError: ({ error }) => {
                console.error(`[CHAT][${requestId}] Error en streamText: `, error);
            },
            async onFinish({ text }) {
                console.log(`[CHAT][${requestId}] Generación completada.`);
                try {
                    await supabase.from('ai_chat_messages').insert({
                        user_id: user.id,
                        role: 'assistant',
                        content_type: 'text',
                        text_content: text
                    });
                } catch (e: any) {
                    console.error(`[CHAT][${requestId}] Error BD: `, e.message);
                }
            }
        });

        // toDataStreamResponse es compatible con @ai-sdk/react@3.0.99
        return result.toDataStreamResponse();

    } catch (error: any) {
        console.error(`[CHAT][${requestId}] ERROR CRÍTICO: `, error.message);
        return new Response(JSON.stringify({
            error: 'Error interno',
            details: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
