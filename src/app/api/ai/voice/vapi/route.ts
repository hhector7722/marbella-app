import { NextResponse } from 'next/server';
import { UnifiedToolset } from '@/lib/ai/tools';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const { message } = payload;

    // Vapi envía "tool_calls" dentro del mensaje
    if (message?.type === 'tool-calls') {
      const toolCalls = message.toolCalls;
      const results = [];
      
      // Extraer el userId de las variables del asistente enviadas por el frontend
      const userId = message.call?.assistant?.variableValues?.userId;

      if (!userId) {
        console.error('[VAPI_WEBHOOK] No userId provided in call context.');
      }

      for (const call of toolCalls) {
        const { name, args } = call.function;
        let result;

        console.log(`[VAPI_TOOL_CALL] Executing: ${name}`, args, 'for User:', userId);

        switch (name) {
          case 'get_labor_summary_tool':
            result = await UnifiedToolset.getLaborSummary(userId, args.targetEmployeeName);
            break;
          case 'get_financials_tool':
            result = await UnifiedToolset.getFinancials(userId, args.startDate, args.endDate);
            break;
          case 'get_recipe_info_tool':
            result = await UnifiedToolset.getRecipeInfo(userId, args.recipeName);
            break;
          case 'update_order_draft_tool':
            result = await UnifiedToolset.updateOrderDraft(userId, args.productName, args.quantity, args.action);
            break;
          default:
            result = `Tool ${name} not found.`;
        }

        results.push({
          toolCallId: call.id,
          result: typeof result === 'string' ? result : JSON.stringify(result)
        });
      }

      return NextResponse.json({ results });
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error: any) {
    console.error('[VAPI_WEBHOOK_ERROR]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
