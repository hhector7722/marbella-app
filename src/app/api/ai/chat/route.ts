import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { UnifiedToolset } from '@/lib/ai/tools';
import { createClient } from '@/utils/supabase/server';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response('No autorizado', { status: 401 });
    }

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

    const result = await streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages,
      tools: {
        get_labor_summary_tool: {
          description: 'Consulta horas trabajadas, extras y deudas del usuario o de un empleado si eres manager.',
          parameters: z.object({ targetEmployeeName: z.string().optional() }),
          execute: async ({ targetEmployeeName }) => await UnifiedToolset.getLaborSummary(undefined, targetEmployeeName),
        },
        get_financials_tool: {
          description: 'Consulta ventas y cierres de caja en un rango de fechas. Solo para Managers.',
          parameters: z.object({ startDate: z.string(), endDate: z.string() }),
          execute: async ({ startDate, endDate }) => await UnifiedToolset.getFinancials(undefined, startDate, endDate),
        },
        get_recipe_info_tool: {
          description: 'Consulta ingredientes y elaboración de un plato del menú.',
          parameters: z.object({ recipeName: z.string() }),
          execute: async ({ recipeName }) => await UnifiedToolset.getRecipeInfo(undefined, recipeName),
        },
        update_order_draft_tool: {
          description: 'Añadir, establecer o quitar productos del borrador de pedido (el carrito).',
          parameters: z.object({
            productName: z.string(),
            quantity: z.number(),
            action: z.enum(['add', 'set', 'remove'])
          }),
          execute: async ({ productName, quantity, action }) => 
            await UnifiedToolset.updateOrderDraft(undefined, productName, quantity, action),
        }
      },
      maxSteps: 5,
    });

    return result.toDataStreamResponse();
  } catch (error: any) {
    console.error('[CHAT_API_ERROR]', error);
    return new Response(error.message || 'Error interno', { status: 500 });
  }
}
