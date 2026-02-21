-- AI Chat and Voice Tables Schema
-- Requisito: db-supabase-master (RLS estricto y seguridad de auth.uid())

BEGIN;

-- 1. AI Chat Sessions (Agrupación lógica de conversaciones si fuera necesario, o para mantener un contexto)
CREATE TABLE IF NOT EXISTS public.ai_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AI Chat Messages (Historial unificado Vercel AI SDK + Textos extraídos de voz)
CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'data')),
    content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'audio_note', 'call_transcript')),
    text_content TEXT,
    media_url TEXT,
    voice_call_id UUID, -- Referencia a la llamada (puede ser null)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AI Call Logs (Auditoría específica de sesiones LiveKit)
CREATE TABLE IF NOT EXISTS public.ai_call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
    duration_seconds INTEGER DEFAULT 0,
    raw_transcript TEXT,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) - CRÍTICO
-- ==========================================

-- Habilitar RLS en todas las tablas AI
ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_call_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para ai_chat_sessions
CREATE POLICY "Users can only see and modify their own AI sessions" 
ON public.ai_chat_sessions
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Políticas para ai_chat_messages
CREATE POLICY "Users can only see and modify their own AI messages" 
ON public.ai_chat_messages
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Políticas para ai_call_logs
CREATE POLICY "Users can only see and modify their own AI call logs" 
ON public.ai_call_logs
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- ==========================================
-- STORAGE - BUCKET AI ASSETS
-- ==========================================
-- Si no existe el bucket, se debe crear en la consola. Aquí solo aseguramos las políticas.
-- Asumiendo bucket creado llamado 'ai_assets'
-- Insert policies directly to storage.objects if you want SQL based storage policies
INSERT INTO storage.buckets (id, name, public) VALUES ('ai_assets', 'ai_assets', true) ON CONFLICT DO NOTHING;

CREATE POLICY "Users can upload their own AI media" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'ai_assets' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view their own AI media" 
ON storage.objects FOR SELECT 
TO authenticated 
USING (bucket_id = 'ai_assets' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Service role can upload AI media (Worker)"
ON storage.objects FOR INSERT 
TO service_role 
WITH CHECK (bucket_id = 'ai_assets');

COMMIT;
