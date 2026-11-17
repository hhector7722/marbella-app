-- 2026-11-17: endurecimiento verificado de proyección semanal y auditoría IA.
-- Las proyecciones las persiste el Writer servidor; staff conserva SELECT propio.
DROP POLICY IF EXISTS weekly_snapshots_staff_write_own ON public.weekly_snapshots;
REVOKE TRUNCATE ON TABLE public.weekly_snapshots FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.weekly_snapshots FROM anon;

-- Los clientes solo pueden añadir y leer sus propios mensajes y sesiones.
DROP POLICY IF EXISTS "Users can only see and modify their own AI messages" ON public.ai_chat_messages;
DROP POLICY IF EXISTS "Users can only see and modify their own AI sessions" ON public.ai_chat_sessions;
CREATE POLICY ai_chat_messages_select_own ON public.ai_chat_messages FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY ai_chat_messages_insert_own ON public.ai_chat_messages FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY ai_chat_sessions_select_own ON public.ai_chat_sessions FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY ai_chat_sessions_insert_own ON public.ai_chat_sessions FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.ai_chat_messages FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.ai_chat_sessions FROM anon, authenticated;
REVOKE INSERT ON TABLE public.ai_chat_messages FROM anon;
REVOKE INSERT ON TABLE public.ai_chat_sessions FROM anon;
