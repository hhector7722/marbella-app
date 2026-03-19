-- ==============================================================================
-- tip_pool_editors_only_pool
-- Permite editar botes de propinas (cantidades/desgloses) sin permitir editar
-- overrides por empleado (horas/importe por trabajador).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Tabla: tip_pool_editors
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'tip_pool_editors'
    ) THEN
        CREATE TABLE public.tip_pool_editors (
            user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now()
        );
    END IF;
END $$;

ALTER TABLE public.tip_pool_editors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tip_pool_editors_select_own" ON public.tip_pool_editors;
CREATE POLICY "tip_pool_editors_select_own"
    ON public.tip_pool_editors
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "tip_pool_editors_mutate_managers" ON public.tip_pool_editors;
CREATE POLICY "tip_pool_editors_mutate_managers"
    ON public.tip_pool_editors
    FOR ALL
    TO authenticated
    USING (public.is_manager_or_admin())
    WITH CHECK (public.is_manager_or_admin());

-- ------------------------------------------------------------------------------
-- 2) RLS tip_pools: permitir mutar si es manager/admin o está en tip_pool_editors
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "tip_pools_mutate_managers" ON public.tip_pools;
CREATE POLICY "tip_pools_mutate_managers"
    ON public.tip_pools
    FOR ALL
    TO authenticated
    USING (
        public.is_manager_or_admin()
        OR EXISTS (
            SELECT 1
            FROM public.tip_pool_editors e
            WHERE e.user_id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_manager_or_admin()
        OR EXISTS (
            SELECT 1
            FROM public.tip_pool_editors e
            WHERE e.user_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- 3) RPC upsert_tip_pool: permitir mutar también a tip_pool_editors
--    (firma atemporal: p_pool_type + cash_total + cash_breakdown + notes)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_tip_pool(
    p_pool_type text,
    p_cash_total numeric,
    p_cash_breakdown jsonb DEFAULT '{}'::jsonb,
    p_notes text DEFAULT NULL
)
RETURNS public.tip_pools
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row public.tip_pools;
BEGIN
    IF NOT (
        public.is_manager_or_admin()
        OR EXISTS (
            SELECT 1
            FROM public.tip_pool_editors e
            WHERE e.user_id = auth.uid()
        )
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: only manager/admin or tip_pool_editors can upsert tip pools';
    END IF;

    IF p_pool_type NOT IN ('weekday', 'weekend') THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: pool_type must be weekday|weekend';
    END IF;

    IF COALESCE(p_cash_total, 0) < 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: cash_total must be >= 0';
    END IF;

    INSERT INTO public.tip_pools (pool_type, cash_total, cash_breakdown, notes, created_by)
    VALUES (p_pool_type, COALESCE(p_cash_total, 0), COALESCE(p_cash_breakdown, '{}'::jsonb), p_notes, auth.uid())
    ON CONFLICT (pool_type)
    DO UPDATE SET
        cash_total = EXCLUDED.cash_total,
        cash_breakdown = EXCLUDED.cash_breakdown,
        notes = EXCLUDED.notes,
        updated_at = now()
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4) Seed (seguro): conceder editor de botes a hernang6799@gmail.com
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_uid uuid;
BEGIN
    SELECT p.id INTO v_uid
    FROM public.profiles p
    WHERE lower(p.email) = lower('hernang6799@gmail.com')
    LIMIT 1;

    IF v_uid IS NOT NULL THEN
        INSERT INTO public.tip_pool_editors (user_id)
        VALUES (v_uid)
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
END;
$$;

