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
DIFERENCIACIÓN LABORAL: "Horarios" = los turnos teóricos asignados para trabajar. "Horas trabajadas" = la realidad fichada en la máquina. Nunca los confundas.

REGLA DE IDIOMA: Responde en ${userLang === 'ca' ? 'Catalán (Català)' : 'Español (Castellano)'}.

ESTILO: ${styles[userStyle] || styles.natural}

Herramientas:
1. get_ingredients: Costes compra y stock.
2. get_menu: Platos y PVP.
3. get_staff_work_info: Info laboral propia o de otros (si eres manager). Horas reales, extras y horarios. Parámetro: weekStart (YYYY-MM-DD, lunes de la semana). Por defecto: semana actual.
4. get_dashboard/get_staff: Módulo Financiero (Solo Managers). Usa esto para consultar VENTAS acumuladas y CIERRES de caja de HOY o de DÍAS ANTERIORES.
6. get_recipe_details: Obtiene la RECETA EXACTA (Ingredientes y Elaboración) de un plato.

REGLAS:
- Precios siempre con €.
- Si te preguntan "qué llevan los calamares" o "cómo se hace X", usa get_recipe_details.
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
                    description: 'Obtiene un resumen de la FACTURACIÓN (Ventas Totales) y el saldo de CIERRES de cajas para una fecha específica (Solo Managers). Sirve para preguntar cuánto se vendió ayer, hoy o el jueves pasado.',
                    parameters: z.object({
                        dateStr: z.string().optional().describe('Fecha específica a consultar en formato YYYY-MM-DD. Si no se provee, asume el día de hoy.')
                    }),
                    execute: async ({ dateStr }) => {
                        const targetDateStr = dateStr || new Date().toISOString().split('T')[0];
                        const targetDateStart = new Date(targetDateStr);
                        targetDateStart.setHours(0, 0, 0, 0);
                        const targetDateEnd = new Date(targetDateStart);
                        targetDateEnd.setDate(targetDateEnd.getDate() + 1);

                        const [tickets, boxes, closings] = await Promise.all([
                            supabase.from('tickets_marbella').select('total_documento').eq('fecha', targetDateStr),
                            supabase.from('cash_boxes').select('name, current_balance'),
                            supabase.from('cash_closings').select('box_name, expected_amount, actual_amount, difference').gte('closed_at', targetDateStart.toISOString()).lt('closed_at', targetDateEnd.toISOString())
                        ]);

                        const totalVentas = tickets.data?.reduce((sum, t) => sum + (Number(t.total_documento) || 0), 0) || 0;
                        const isToday = targetDateStr === new Date().toISOString().split('T')[0];

                        return {
                            fecha_consulta: targetDateStr,
                            facturacion_total_euros: totalVentas,
                            estado_cajas_actual: isToday ? boxes.data : 'Solo disponible para el día de hoy',
                            cierres_de_caja_realizados: closings.data || []
                        };
                    }
                },
                get_recipe_details: {
                    description: 'Obtiene los INGREDIENTES EXACTOS y la ELABORACIÓN de un plato del menú.',
                    parameters: z.object({
                        recipeName: z.string().describe('El nombre del plato a buscar (ej. "calamares").')
                    }),
                    execute: async ({ recipeName }) => {
                        const { data: recipe } = await supabase.from('recipes').select('id, name, elaboration, presentation').ilike('name', `%${recipeName}%`).limit(1).maybeSingle();
                        if (!recipe) return { error: `No se encontró la receta de ${recipeName}.` };

                        const { data: ingredientsData } = await supabase
                            .from('recipe_ingredients')
                            .select(`
                                quantity,
                                unit,
                                ingredients ( name )
                            `)
                            .eq('recipe_id', recipe.id);

                        const ingredients = ingredientsData?.map((ing: any) => `${ing.quantity} ${ing.unit} de ${ing.ingredients?.name}`) || [];

                        return {
                            plato: recipe.name,
                            ingredientes: ingredients.length > 0 ? ingredients : 'No hay ingredientes listados.',
                            elaboracion: recipe.elaboration || 'Sin instrucciones especificas.',
                            presentacion: recipe.presentation || 'Sin presentación específica.'
                        };
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
                    status: 'deprecated', // Reemplazado por get_staff_work_info
                    parameters: z.object({}),
                    execute: async () => {
                        return { error: 'Usa get_staff_work_info en su lugar.' };
                    }
                },
                get_staff_work_info: {
                    description: 'Obtiene el HORARIO PROGRAMADO (teoricio) y las HORAS TRABAJADAS REALES (fichajes) de un usuario para una semana específica. Usa esto para cualquier pregunta sobre horarios o horas.',
                    parameters: z.object({
                        weekStart: z.string().optional().describe('Fecha del lunes de la semana a consultar (YYYY-MM-DD).'),
                        employeeNameOrId: z.string().optional().describe('Nombre, apellido o ID del usuario (opcional, por defecto el tuyo propio).')
                    }),
                    execute: async ({ weekStart, employeeNameOrId }) => {
                        let targetUserId = user.id;

                        // Si han enviado un nombre o ID y el que pregunta es manager
                        if (employeeNameOrId && userRole === 'manager') {
                            // Detectar si parece un UUID
                            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(employeeNameOrId);

                            if (isUUID) {
                                targetUserId = employeeNameOrId;
                            } else {
                                // Buscar por nombre real en public.profiles
                                const { data: profileMatch } = await supabase
                                    .from('profiles')
                                    .select('id, first_name')
                                    .ilike('first_name', `%${employeeNameOrId}%`)
                                    .limit(1)
                                    .maybeSingle();

                                if (profileMatch) {
                                    targetUserId = profileMatch.id;
                                    console.log(`[AI Chat] Resuelto el nombre '${employeeNameOrId}' al ID: ${targetUserId}`);
                                } else {
                                    return { error: `No encontré a ningún empleado llamado "${employeeNameOrId}". Por favor dile al usuario que verifique el nombre.` };
                                }
                            }
                        }

                        // Lógica de fecha (Lunes de la semana)
                        const date = weekStart ? new Date(weekStart) : new Date();
                        const day = date.getDay() || 7;
                        if (day !== 1) date.setHours(-24 * (day - 1));
                        date.setHours(0, 0, 0, 0);
                        const mondayStr = date.toISOString().split('T')[0];
                        const sunday = new Date(date);
                        sunday.setDate(date.getDate() + 7);
                        const sundayStr = sunday.toISOString().split('T')[0];

                        const [logs, snapshot, shifts] = await Promise.all([
                            supabase.from('time_logs').select('total_hours, clock_in').eq('user_id', targetUserId).gte('clock_in', mondayStr).lt('clock_in', sundayStr).not('total_hours', 'is', null),
                            supabase.from('weekly_snapshots').select('*').eq('user_id', targetUserId).eq('week_start', mondayStr).maybeSingle(),
                            supabase.from('shifts').select('*').eq('user_id', targetUserId).gte('start_time', mondayStr).lt('start_time', sundayStr).eq('is_published', true)
                        ]);

                        const totalHoursReal = logs.data?.reduce((sum, l) => sum + (l.total_hours || 0), 0) || 0;
                        const overtime = snapshot.data?.balance_hours || 0;
                        const horarios = shifts.data?.map(s => ({
                            dia: new Date(s.start_time).toLocaleDateString('es-ES', { weekday: 'long' }),
                            entrada: new Date(s.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                            salida: new Date(s.end_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                            actividad: s.activity
                        })) || [];

                        return {
                            semana: mondayStr,
                            horas_reales: totalHoursReal.toFixed(2),
                            horas_extras_balance: overtime.toFixed(2),
                            pagado: snapshot.data?.is_paid || false,
                            horarios_programados: horarios
                        };
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
