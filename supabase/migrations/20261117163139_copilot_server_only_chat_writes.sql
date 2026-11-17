-- Aplicado en Supabase producción el 17-11-2026.
-- Escritura exclusiva de las rutas de servidor autenticadas usando service_role.
-- Los usuarios autenticados mantienen SELECT de sus propios mensajes y sesiones.
DROP POLICY IF EXISTS ai_chat_messages_insert_own ON public.ai_chat_messages;
DROP POLICY IF EXISTS ai_chat_sessions_insert_own ON public.ai_chat_sessions;
REVOKE INSERT ON TABLE public.ai_chat_messages FROM authenticated, anon;
REVOKE INSERT ON TABLE public.ai_chat_sessions FROM authenticated, anon;
