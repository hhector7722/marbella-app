-- ==============================================================================
-- PROFILES: Permitir que cualquier usuario autenticado actualice su propia fila
-- Necesario para que el avatar (y otros campos editables por el usuario) se guarden.
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: ya suele existir política de lectura para authenticated; si no hay ninguna, permitir leer todos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_authenticated'
    ) THEN
        CREATE POLICY "profiles_select_authenticated"
            ON public.profiles FOR SELECT TO authenticated
            USING (true);
    END IF;
END $$;

-- UPDATE: cada usuario solo puede actualizar su propia fila (id = auth.uid())
DROP POLICY IF EXISTS "profiles_own_update" ON public.profiles;
CREATE POLICY "profiles_own_update"
    ON public.profiles FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

COMMENT ON POLICY "profiles_own_update" ON public.profiles IS 'Usuario autenticado puede actualizar solo su propio perfil (avatar, preferencias, etc.).';
