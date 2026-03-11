-- ==============================================================================
-- FIX: Avatar y actualización de perfil propio
-- 1) Recrear política profiles_own_update por si hay conflicto con "Edición Segura"
-- 2) RPC para actualizar solo avatar_url del usuario actual (bypass RLS si hace falta)
-- ==============================================================================

-- 1. Asegurar RLS y política explícita de actualización propia
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_own_update" ON public.profiles;
CREATE POLICY "profiles_own_update"
    ON public.profiles FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

COMMENT ON POLICY "profiles_own_update" ON public.profiles IS 'Usuario autenticado puede actualizar solo su propio perfil (avatar, preferencias).';

-- 2. RPC: actualizar avatar_url del usuario actual.
--    SECURITY DEFINER = ejecuta como owner y evita bloqueos por otras políticas UPDATE en profiles.
--    Solo actualiza la fila donde id = auth.uid(), así que es seguro.
CREATE OR REPLACE FUNCTION public.update_own_avatar_url(new_avatar_url text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    out_url text;
BEGIN
    UPDATE profiles
    SET avatar_url = new_avatar_url,
        updated_at = now()
    WHERE id = auth.uid()
    RETURNING avatar_url INTO out_url;
    RETURN out_url;
END;
$$;

COMMENT ON FUNCTION public.update_own_avatar_url(text) IS 'Actualiza avatar_url del usuario autenticado. Bypass RLS para evitar conflicto con otras políticas.';

GRANT EXECUTE ON FUNCTION public.update_own_avatar_url(text) TO authenticated;
