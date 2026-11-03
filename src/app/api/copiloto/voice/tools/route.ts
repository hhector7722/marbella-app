import { createClient } from '@/utils/supabase/server';
import { normalizeCopilotRole } from '@/lib/copilot/permissions';
import {
  KNOWLEDGE_TOOL_DEFS, madridDate, runKnowledgeTool, toolEnabled, type KnowledgeToolName,
} from '@/lib/copilot/knowledge-tools';
import { runAppDataTool } from '@/lib/copilot/app-data-catalog';

export const runtime = 'nodejs';

/** Herramientas de voz: solo lecturas que respeta RLS y rol, nunca RPC de escritura. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const input: unknown = await req.json().catch(() => null);
  if (!input || typeof input !== 'object') return Response.json({ error: 'Petición inválida.' }, { status: 400 });
  const payload = input as { sessionId?: unknown; toolName?: unknown; args?: unknown };
  const sid = payload.sessionId;
  if (typeof sid !== 'string' || !/^[0-9a-f-]{36}$/i.test(sid)) {
    return Response.json({ error: 'Sesión inválida.' }, { status: 400 });
  }
  const { data: owned, error: sessionError } = await supabase.from('ai_chat_sessions')
    .select('id').eq('id', sid).eq('user_id', user.id).maybeSingle();
  if (sessionError || !owned) return Response.json({ error: 'Sesión no autorizada.' }, { status: 403 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = normalizeCopilotRole(profile?.role);
  if (!role || role !== 'admin') return Response.json({ error: 'Permiso denegado.' }, { status: 403 });

  const name = payload.toolName;
  const allowed = typeof name === 'string' && (
    (name === 'consultar_datos_aplicacion') ||
    (name in KNOWLEDGE_TOOL_DEFS && toolEnabled(role, name as KnowledgeToolName))
  );
  if (!allowed) return Response.json({ error: 'Herramienta no permitida.' }, { status: 403 });

  const args = payload.args && typeof payload.args === 'object' && !Array.isArray(payload.args) ? payload.args : {};
  try {
    const context = { supabase, role, userId: user.id, today: madridDate() };
    const result = name === 'consultar_datos_aplicacion'
      ? await runAppDataTool(args, context)
      : await runKnowledgeTool(name as KnowledgeToolName, args, context);
    const json = JSON.stringify(result);
    return Response.json({
      result: json.length > 9500
        ? { truncated: true, preview: json.slice(0, 9000) }
        : result,
    });
  } catch {
    return Response.json({ error: 'No se pudo consultar la fuente solicitada.' }, { status: 502 });
  }
}
