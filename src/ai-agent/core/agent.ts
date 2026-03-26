import { OllamaClient } from './ollama-client';
import { QueryParser } from './query-parser';
import { RBACValidator } from './rbac';
import { AgentRequest, AgentResponse, ParsedQuery } from './types';
import { fetchOvertimeHours, type LaborPeriod } from '../queries/labor';
import { fetchOperationalTreasury } from '../queries/treasury';
import { fetchOpenTables } from '../queries/tables';
import { fetchSalesSummary, fetchUnitsSoldByProduct, type SalesPeriod } from '../queries/sales';
import { fetchRecipeInfo } from '../queries/recipes';
import { updateOrderDraft } from '../queries/orders';

function sanitizeContextForPrompt(context: any): any {
  if (!context || typeof context !== 'object') return context;

  // Recortamos radar por tamaño de prompt (por seguridad contra respuestas enormes).
  if (Array.isArray(context.openTables)) {
    return {
      updatedAt: context.updatedAt ?? null,
      openTables: context.openTables.slice(0, 10).map((t: any) => ({
        mesa: t?.mesa ?? t?.id_ticket ?? null,
        total_provisional: t?.total_provisional ?? null,
        fecha_apertura: t?.fecha_apertura ?? null,
        productos: Array.isArray(t?.productos) ? t.productos.slice(0, 5) : [],
      })),
    };
  }

  return context;
}

export class AIAgent {
  private ollama: OllamaClient;
  private parser: QueryParser;
  private rbac: RBACValidator;

  constructor() {
    const baseUrl = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_API_URL || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || 'mistral';
    this.ollama = new OllamaClient(baseUrl, model);
    this.parser = new QueryParser();
    this.rbac = new RBACValidator();
  }

  async processQuery(request: AgentRequest): Promise<AgentResponse> {
    const start = Date.now();
    const parsed = this.parser.parse(request.query);

    // Detección simple de saludo: responder plantilla (sin LLM, sin preguntas personales)
    const isGreeting = /^\s*(hola|buenas|buenos días|buenas tardes|buenas noches|hi|hey)\b[\s!.,]*$/i.test(request.query);
    if (isGreeting) {
      const name = request.userName ?? 'Usuario';
      return {
        response: `Hola ${name}. ¿En qué puedo ayudarte?`,
        metadata: { processingTimeMs: Date.now() - start, queryType: 'greeting' },
      };
    }

    // Small-talk común: evitar LLM (especialmente útil si Ollama no está disponible)
    const isSmallTalk =
      /^\s*(qué tal|que tal|como estas|cómo estás|como va|cómo va|todo bien|todo ok|buenas)\b[\s!.,?]*$/i.test(
        request.query,
      );
    if (isSmallTalk) {
      const name = request.userName ?? 'Usuario';
      return {
        response: `¡Bien, ${name}! Dime qué necesitas y voy al grano.`,
        metadata: { processingTimeMs: Date.now() - start, queryType: 'smalltalk' },
      };
    }

    if (!this.rbac.validateAccess(request.userRole, parsed)) {
      return {
        response: 'No tienes permisos para eso, campeón. (RBAC dice que no)',
        metadata: {
          processingTimeMs: Date.now() - start,
          queryType: parsed.type,
        },
      };
    }

    try {
      // Si Ollama no está disponible, devolvemos un error operativo claro (sin "misterios").
      // Esto ocurre en producción/Vercel si no hay un Ollama remoto configurado.
      const healthy = await this.ollama.isHealthy();
      if (!healthy) {
        return {
          response:
            'IA offline: no puedo conectar con Ollama. ' +
            'Arranca Ollama o configura `OLLAMA_BASE_URL` a un endpoint accesible (no localhost en Vercel).',
          metadata: {
            processingTimeMs: Date.now() - start,
            queryType: parsed.type,
          },
        };
      }

      const { context, actionPerformed } = await this.fetchContextAndActions(parsed, request);
      const contextSanitized = sanitizeContextForPrompt(context);

      const systemPrompt = this.buildSystemPrompt(request.userRole, request.userName);
      const userPrompt = [
        `Pregunta: ${request.query}`,
        `Contexto verificado (usa SOLO esto):`,
        JSON.stringify(contextSanitized),
        actionPerformed ? `Acción realizada: ${actionPerformed.type} (${JSON.stringify(actionPerformed.details)})` : '',
        'Regla adicional: Si la entrada es solo un saludo, responde únicamente con un saludo corto dirigido al usuario y NO hagas preguntas personales ni seguimientos innecesarios.',
        'Responde en 2-3 líneas máximo. Sin rodeos. Si no hay datos, dilo explícitamente.',
      ].filter(Boolean).join('\n');

      const ollamaResponse = await this.ollama.generate(systemPrompt, userPrompt);

      return {
        response: ollamaResponse || 'No pude sacar nada en claro. Prueba otra frase, a ver si suena la flauta.',
        actionPerformed,
        metadata: {
          processingTimeMs: Date.now() - start,
          queryType: parsed.type,
        },
      };
    } catch (e: any) {
      // Anti-silent-failure: devolver el error de forma visible.
      return {
        response: `Algo falló al consultar/ejecutar. ${e?.message ? `(${e.message})` : ''}`,
        metadata: {
          processingTimeMs: Date.now() - start,
          queryType: parsed.type,
        },
      };
    }
  }

  private async fetchContextAndActions(parsed: ParsedQuery, request: AgentRequest): Promise<{
    context: any;
    actionPerformed?: AgentResponse['actionPerformed'];
  }> {
    switch (parsed.type) {
      case 'sales': {
        const period = (parsed.parameters.period as SalesPeriod) || 'today';
        const productName = typeof (parsed.parameters as any)?.productName === 'string' ? String((parsed.parameters as any).productName) : '';
        if (productName) {
          const context = await fetchUnitsSoldByProduct({ period, productName });
          return { context };
        }

        const context = await fetchSalesSummary(period);
        return { context };
      }
      case 'labor': {
        const period = (parsed.parameters.period as LaborPeriod) || 'today';
        const context = await fetchOvertimeHours(period);
        return { context };
      }
      case 'order': {
        const productName = String((parsed.parameters.productName as any) ?? '');
        const quantity = Number((parsed.parameters.quantity as any) ?? 1);

        const actionType = parsed.action === 'add_to_order' ? 'add' : 'add';
        const result = await updateOrderDraft({
          productName,
          quantity,
          action: actionType,
        });

        return {
          context: { orderDraft: result },
          actionPerformed: { type: 'order_draft_update', details: result },
        };
      }
      case 'recipe': {
        const recipeName = String(parsed.parameters.recipeName ?? '');
        const context = await fetchRecipeInfo(recipeName);
        return { context };
      }
      case 'table': {
        const context = await fetchOpenTables();
        return { context };
      }
      case 'treasury': {
        const context = await fetchOperationalTreasury();
        return { context };
      }
      default:
        return { context: { hint: 'No detecté intención clara para esta consulta.' } };
    }
  }

  private buildSystemPrompt(userRole: 'staff' | 'manager', userName?: string): string {
    return `Eres la IA operativa de Bar La Marbella.
Tono: DIRECTO, SARCÁSTICO y SIN RODEOS.
Idioma: Español.
Reglas IMPORTANTES:
- RESPONDE basándote SOLO en los datos del Contexto provisto.
- NUNCA pidas datos personales (dirección, ubicación precisa, documentos). Si el usuario no los ha dado, no los solicites.
- Si la entrada es únicamente un saludo corto (p.ej. "hola", "buenos días"), responde con un saludo corto dirigido al usuario y NO hagas preguntas de seguimiento innecesarias.
- Máximo 2-3 líneas por respuesta. Nada de explicaciones internas.
Información del usuario:
- Nombre para mostrar: ${userName ?? 'Usuario'}
- Rol: ${userRole}.
`;
  }
}

