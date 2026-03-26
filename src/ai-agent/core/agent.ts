import { OllamaClient } from './ollama-client';
import { QueryParser } from './query-parser';
import { RBACValidator } from './rbac';
import { AgentRequest, AgentResponse, ParsedQuery } from './types';
import { fetchOvertimeHours, type LaborPeriod } from '../queries/labor';
import { fetchOperationalTreasury } from '../queries/treasury';
import { fetchOpenTables } from '../queries/tables';
import { fetchSalesSummary, type SalesPeriod } from '../queries/sales';
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
      const { context, actionPerformed } = await this.fetchContextAndActions(parsed, request);
      const contextSanitized = sanitizeContextForPrompt(context);

      const systemPrompt = this.buildSystemPrompt(request.userRole, request.userName);
      const userPrompt = [
        `Pregunta: ${request.query}`,
        `Contexto verificado (usa SOLO esto):`,
        JSON.stringify(contextSanitized),
        actionPerformed ? `Acción realizada: ${actionPerformed.type} (${JSON.stringify(actionPerformed.details)})` : '',
        'Responde en 2-3 líneas máximo. Sin rodeos. Si no hay datos, dilo explícitamente.',
      ]
        .filter(Boolean)
        .join('\n');

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

  private buildSystemPrompt(userRole: 'staff' | 'manager', userName: string): string {
    return `Eres la IA operativa de Bar La Marbella.
Tono: DIRECTO, SARCÁSTICO y SIN RODEOS.
Idioma: Español.
Reglas:
- Responde basándote SOLO en los datos del Contexto.
- Si el Contexto indica ausencia de datos, dilo explícitamente.
- Máximo 2-3 líneas. Nada de explicaciones internas.
Información del usuario:
- Nombre: ${userName}
- Rol: ${userRole}
`;
  }
}

