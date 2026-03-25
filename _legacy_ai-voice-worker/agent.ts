// @ts-nocheck
// Este archivo es un worker Node.js independiente. No es parte del bundle de Next.js.
import { WorkerOptions, cli, defineAgent, llm, multimodal } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import { restaurantTools } from './plugins/restaurantContext';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Definición de Sistema (Cerebro Operativo) según lo requerido
const SYSTEM_INSTRUCTION = `Eres la IA operativa in-house de Bar La Marbella. Respondes a empleados y dirección basándote EXCLUSIVamente en la base de datos.
Reglas:
1. Respuestas ultracortas, directas y sin cortesía.
2. Para consultas de horas reales o extras trabajadas, usa "consultar_info_laboral". Si no se especifica semana, asume la actual. 
DIFERENCIACIÓN LABORAL: Habla solo de las "horas trabajadas" (fichajes reales) y "horas extras". Olvida los turnos teóricos, céntrate en la realidad.
3. Para recetas/alérgenos, usa la herramienta "consultar_receta". Lee elaboraciones y cantidades de ingredientes con exactitud.
4. Si falta producto o piden añadir algo a la compra, usa la herramienta de pedidos para actualizar el borrador. NUNCA confirmes compras reales, solo actualiza el borrador.
5. Para facturación/cajas, usa la herramienta de "ventas" (solo si el usuario tiene rol 'manager').
6. Si no hay datos, di 'Dato no disponible'. No inventes.`;

// Contexto de Herramientas para LLM (Inyectadas al modelo OpenAI)
class RestaurantFunctionContext extends llm.FunctionContext {
    @llm.aiCallable({
        name: 'consultar_info_laboral',
        description: 'Consulta las HORAS TRABAJADAS REALES y extras de un empleado.',
        parameters: z.object({
            empleado_nombre_o_id: z.string().describe('Nombre, apellido o ID (UUID) del empleado que pregunta u otro si es manager.'),
            semana_iso: z.string().optional().describe('Fecha (YYYY-MM-DD) opcional indicando el lunes de la semana a consultar. Por defecto es la semana actual.')
        })
    })
    async consultarInfoLaboral(params: z.infer<typeof this.consultarInfoLaboral.parameters>) {
        console.log('[AGENT TOOL] Llamando a consultar_info_laboral', params);
        return await restaurantTools.consultar_info_laboral(params);
    }

    @llm.aiCallable({
        name: 'consultar_receta',
        description: 'Obtiene los INGREDIENTES EXACTOS y la ELABORACIÓN de un plato del menú (ej. calamares, bravas).',
        parameters: z.object({
            nombre_plato: z.string().describe('El nombre general del plato a buscar (ej. "calamares").')
        })
    })
    async consultarReceta(params: z.infer<typeof this.consultarReceta.parameters>) {
        console.log('[AGENT TOOL] Llamando a consultarReceta', params);
        return await restaurantTools.consultar_receta(params);
    }

    @llm.aiCallable({
        name: 'consultar_ventas',
        description: 'Consulta métricas financieras y de caja. (Asegúrate de comprobar si el usuario es manager antes de proveer datos sensitivos, validando su ID)',
        parameters: z.object({
            metrica: z.enum(['caja_actual', 'ticket_medio', 'facturacion_dia']).describe('Métrica financiera a consultar')
        })
    })
    async consultarVentas(params: z.infer<typeof this.consultarVentas.parameters>) {
        console.log('[AGENT TOOL] Llamando a consultarVentas', params);
        return await restaurantTools.consultar_ventas(params);
    }

    @llm.aiCallable({
        name: 'modificar_borrador_pedido',
        description: 'Agrega, establece o elimina ingredientes en el borrador de pedido actual.',
        parameters: z.object({
            producto_normalizado: z.string().describe('Nombre del ingrediente a agregar/eliminar (e.g. "Coca Cola")'),
            cantidad: z.number().describe('Cantidad a modificar'),
            accion: z.enum(['añadir', 'establecer', 'eliminar']).describe('Acción a realizar en el borrador de pedido (el carrito de la compra)'),
            user_id: z.string().describe('ID del usuario autenticado en la sesión (el UUID del frontend)')
        })
    })
    async modificarBorrador(params: z.infer<typeof this.modificarBorrador.parameters>) {
        console.log('[AGENT TOOL] Llamando a modificarBorrador', params);
        return await restaurantTools.modificar_borrador_pedido(params);
    }
}

export default defineAgent({
    entry: async (ctx) => {
        await ctx.connect();
        console.log('Room connected');

        // Mapear funciones herramientas al contexto del LLM
        const fnContext = new RestaurantFunctionContext();

        // Esperar a que el humano se conecte para saber quién es
        const participant = await ctx.waitForParticipant();
        const userId = participant.identity; // El token de LiveKit lleva el user.id de Supabase

        // Obtener perfil del usuario desde Supabase
        const { data: profile } = await restaurantTools.supabase
            .from('profiles')
            .select('first_name, role, preferred_language, ai_greeting_style')
            .eq('id', userId)
            .single();

        const userName = profile?.first_name || 'compañero';
        const userRole = profile?.role || 'staff';
        const userLang = profile?.preferred_language || 'es';
        const userStyle = profile?.ai_greeting_style || 'profesional';

        // Mapeo de estilos a instrucciones (Ultra-Directos)
        const styles: Record<string, string> = {
            jefe: `Tono: "Dime jefe.". Sé extremadamente escueto y corto.`,
            sarcastico: `Tono: "Dime crack.". Sé irónico pero muy breve. No fuerces bromas largas.`,
            natural: `Tono: "Dime ${userName}.". Coloquial, directo y muy corto.`
        };

        const dynamicInstructions = `${SYSTEM_INSTRUCTION}
Estás hablando con ${userName} (${userRole}).
REGLA DE ORO: Sé ultra-directo. Máximo 1 frase por respuesta. No des explicaciones.
REGLA DE IDIOMA: Responde en ${userLang === 'ca' ? 'Catalán' : 'Español'}.
ESTILO: ${styles[userStyle] || styles.natural}
Saluda de forma ultra-breve según tu estilo e idioma.`;

        // Inicializar el Agente Multimodal Realtime con OpenAI
        const agent = new multimodal.MultimodalAgent({
            model: new openai.realtime.RealtimeModel({
                model: 'gpt-4o-realtime-preview',
                instructions: dynamicInstructions,
            }),
            fncCtx: fnContext,
        });

        agent.start(ctx.room);


        agent.on('agent_speech_committed', (msg) => {
            // Log local para debug de respuestas de voz
            console.log('Mensaje del Agente:', msg);
        });

        ctx.room.on('participant_disconnected', async () => {
            console.log('Participante desconectado. Finalizando sesión de IA en BD...');
            // Aquí puedes realizar volcado de la transcripción almacenada.
        });
    }
});

cli.runApp(new WorkerOptions({ agent: 'agent.ts' }));
