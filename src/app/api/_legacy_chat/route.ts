import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { getInventoryTool } from '@/lib/ai/tools/inventory';

export const maxDuration = 30;

function getBCNTime() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
}

export async function POST(req: NextRequest) {
    const requestId = Math.random().toString(36).substring(7);
    const todayStr = getBCNTime().toISOString().split('T')[0];

    const authHeader = req.headers.get('Authorization');
    const supabaseAccessToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : '';

    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return new Response('Unauthorized', { status: 401 });

        const { messages } = await req.json();
        const { data: profile } = await supabase.from('profiles').select('first_name, role').eq('id', user.id).single();

        const systemPrompt = `Eres el Asistente de Bar La Marbella. Hoy es ${todayStr}.
REGLA DE ORO: PROHIBIDO INTERPRETAR O CORREGIR LA BD. Si la herramienta dice que un empleado tiene 8h extras, dilo, aunque su balance sea positivo. 

FUENTES DE DATOS:
1. VENTAS: Usa EXCLUSIVAMENTE 'cash_closings'. Ignora cualquier otro dato de tickets o facturación externa.
2. HORAS: Usa SIEMPRE 'horas_extra' y 'deuda_total' crudos de la herramienta. 
3. FORMATO: NO uses asteriscos (**) en títulos. Tablas Markdown para recetas. Sé contundente y breve.`;

        const result = await streamText({
            model: openai('gpt-4o-mini'),
            system: systemPrompt,
            messages,
            tools: {
                get_inventory: getInventoryTool(supabaseAccessToken),
                get_dashboard: {
                    description: 'Suma las ventas reales de los cierres de caja (net_sales).',
                    parameters: z.object({ startDate: z.string(), endDate: z.string() }),
                    execute: async ({ startDate, endDate }) => {
                        const { data: cls, error } = await supabase
                            .from('cash_closings')
                            .select('net_sales')
                            .gte('closing_date', startDate)
                            .lte('closing_date', endDate);

                        if (error) throw error;

                        const totalReal = cls?.reduce((sum, c) => sum + (Number(c.net_sales) || 0), 0) || 0;
                        return {
                            periodo: `${startDate} al ${endDate}`,
                            ventas_reales_cierres: totalReal.toFixed(2),
                            cierres_contabilizados: cls?.length || 0
                        };
                    }
                },
                get_staff_work_info: {
                    description: 'Consulta deuda y horas crudas de la BD.',
                    parameters: z.object({ employeeName: z.string().optional(), targetDate: z.string().optional() }),
                    execute: async ({ employeeName, targetDate }) => {
                        let tId = user.id;
                        if (employeeName) {
                            const { data: p } = await supabase.from('profiles').select('id').ilike('first_name', `%${employeeName}%`).maybeSingle();
                            if (p) tId = p.id;
                        }
                        const d = new Date(targetDate || todayStr);
                        const mon = new Date(d.setDate(d.getDate() - (d.getDay() || 7) + 1)).toISOString().split('T')[0];

                        const { data: snap } = await supabase.from('weekly_snapshots').select('*').eq('user_id', tId).eq('week_start', mon).maybeSingle();
                        const { data: last } = await supabase.from('weekly_snapshots').select('final_balance').eq('user_id', tId).order('week_start', { ascending: false }).limit(1).maybeSingle();

                        return {
                            empleado: employeeName || 'Tú',
                            semana: mon,
                            horas_extra: snap?.extra_hours || 0,
                            balance_semanal: snap?.balance_hours || 0,
                            deuda_final_de_esta_semana: snap?.final_balance || 0,
                            deuda_total_acumulada: last?.final_balance || 0
                        };
                    }
                },
                get_recipe_details: {
                    description: 'Receta con quantity_gross.',
                    parameters: z.object({ recipeName: z.string() }),
                    execute: async ({ recipeName }) => {
                        const { data: r } = await supabase.from('recipes').select('*').ilike('name', `%${recipeName}%`).maybeSingle();
                        if (!r) return { error: "No existe." };
                        const { data: ing } = await supabase.from('recipe_ingredients').select('*, ingredients(name)').eq('recipe_id', r.id);
                        return { plato: r.name, ingredientes: ing?.map(i => ({ i: i.ingredients?.name, c: i.quantity_gross || 0, u: i.unit })) || [] };
                    }
                }
            },
            maxSteps: 5,
            onFinish({ text }) {
                supabase.from('ai_chat_messages').insert({ user_id: user.id, role: 'assistant', text_content: text }).then();
            }
        });

        return result.toDataStreamResponse();
    } catch (e: any) { return new Response(e.message, { status: 500 }); }
}