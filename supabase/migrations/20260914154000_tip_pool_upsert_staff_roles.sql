-- ==============================================================================
-- tip_pool_upsert_staff_roles
-- Quien puede abrir /staff/propinas también puede guardar botes (weekday/weekend)
-- vía upsert_tip_pool. tip_pool_editors sigue siendo una vía adicional.
-- Overrides y confirmación de reparto no cambian.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.can_upsert_tip_pool()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (
            SELECT p.role
            FROM public.profiles p
            WHERE p.id = auth.uid()
        ) IN ('staff', 'supervisor', 'chef', 'manager', 'admin')
        OR EXISTS (
            SELECT 1
            FROM public.tip_pool_editors e
            WHERE e.user_id = auth.uid()
        ),
        false
    );
$$;

COMMENT ON FUNCTION public.can_upsert_tip_pool() IS
  'True si el usuario puede mutar tip_pools / upsert_tip_pool (roles de /staff/propinas o tip_pool_editors).';

GRANT EXECUTE ON FUNCTION public.can_upsert_tip_pool() TO authenticated;

DROP POLICY IF EXISTS "tip_pools_mutate_managers" ON public.tip_pools;
CREATE POLICY "tip_pools_mutate_managers"
    ON public.tip_pools
    FOR ALL
    TO authenticated
    USING (public.can_upsert_tip_pool())
    WITH CHECK (public.can_upsert_tip_pool());

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
    IF NOT public.can_upsert_tip_pool() THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: only staff/supervisor/chef/manager/admin or tip_pool_editors can upsert tip pools';
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
