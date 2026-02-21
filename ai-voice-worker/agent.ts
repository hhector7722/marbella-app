import { WorkerOptions, cli, defineAgent, llm, pipeline } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import { restaurantTools } from './plugins/restaurantContext';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Definición de Sistema (Cerebro Operativo) según lo requerido
const SYSTEM_INSTRUCTION = `Eres la IA operativa in-house de Bar La Marbella. Respondes a empleados y dirección basándote EXCLUSIVAMENTE en la base de datos.
Reglas:
1. Respuestas ultracortas, directas y sin cortesía.
2. Para horarios/horas extra, usa la herramienta de turnos.
3. Para recetas/alérgenos, usa la herramienta de recetas. Lee cantidades exactas.
4. Si falta producto o piden añadir algo a la compra, usa la herramienta de pedidos para actualizar el borrador. NUNCA confirmes compras reales, solo actualiza el borrador.
5. Para facturación/cajas, usa la herramienta de ventas (solo si el usuario tiene rol 'admin').
6. Si no hay datos, di 'Dato no disponible'. No inventes.`;

// Contexto de Herramientas para LLM (Inyectadas al modelo OpenAI Realtime)
class RestaurantFunctionContext extends llm.FunctionContext {
    @llm.aiCallable({
        name: 'consultar_turnos_horas',
        description: 'Consulta información de turnos, horarios y horas extras de un empleado.',
        parameters: z.object({
            empleado_id: z.string().describe('ID del empleado (UUID) que pregunta. Si no te lo pasa, pregúntale su nombre y búscalo o dile que te indique quién es.'),
            tipo_consulta: z.enum(['horario_semanal', 'horas_extra', 'turno_hoy']).describe('Tipo de consulta a realizar')
        })
    })
    async consultarTurnos(params: z.infer<typeof this.consultarTurnos.parameters>) {
        console.log('[AGENT TOOL] Llamando a consultarTurnos', params);
        return await restaurantTools.consultar_turnos_horas(params);
    }

    @llm.aiCallable({
        name: 'consultar_receta',
        description: 'Consulta ingredientes, alérgenos o preparación de una receta del restaurante.',
        parameters: z.object({
            nombre_plato: z.string().describe('Nombre del plato o receta'),
            dato_requerido: z.enum(['ingredientes', 'alergenos', 'preparacion']).describe('Dato específico requerido')
        })
    })
    async consultarReceta(params: z.infer<typeof this.consultarReceta.parameters>) {
        console.log('[AGENT TOOL] Llamando a consultarReceta', params);
        return await restaurantTools.consultar_receta(params);
    }

    @llm.aiCallable({
        name: 'consultar_ventas',
        description: 'Consulta métricas financieras y de caja. (Asegúrate de comprobar si el usuario es admin antes de proveer datos sensitivos, validando su ID)',
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

        // Inicializar el Agente Multimodal Realtime de OpenAI
        const agent = new pipeline.VoicePipelineAgent(
            new silero.VAD.load(),
            new openai.STT(),
            new openai.realtime.RealtimeModel({
                instructions: SYSTEM_INSTRUCTION,
                voice: 'shimmer', // Voz operativa
                temperature: 0.6,
            }),
            new openai.TTS(),
            { fncCtx: fnContext }
        );

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
