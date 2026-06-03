-- ==============================================================================
-- Historial de reparto de propinas confirmado (cabecera + líneas por empleado)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Tablas
-- ------------------------------------------------------------------------------
CREATE TABLE public.tip_distribution_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    period_start date NOT NULL,
    period_end date NOT NULL,
    weekday_total numeric NOT NULL DEFAULT 0,
    weekend_total numeric NOT NULL DEFAULT 0,
    confirmed_by uuid NOT NULL REFERENCES auth.users(id),
    confirmed_at timestamptz NOT NULL DEFAULT now(),
    notes text
);

CREATE TABLE public.tip_distribution_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    distribution_id uuid NOT NULL REFERENCES public.tip_distribution_history(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    weekday_hours numeric NOT NULL DEFAULT 0,
    weekend_hours numeric NOT NULL DEFAULT 0,
    jornadas_totales int NOT NULL DEFAULT 0,
    jornadas_con_olvido int NOT NULL DEFAULT 0,
    tji_pct numeric NOT NULL DEFAULT 0,
    penalizacion_pct int NOT NULL DEFAULT 0,
    weekday_hours_effective numeric NOT NULL DEFAULT 0,
    weekend_hours_effective numeric NOT NULL DEFAULT 0,
    weekday_amount numeric NOT NULL DEFAULT 0,
    weekend_amount numeric NOT NULL DEFAULT 0,
    total_amount numeric NOT NULL DEFAULT 0,
    weekday_bonus numeric NOT NULL DEFAULT 0,
    weekend_bonus numeric NOT NULL DEFAULT 0,
    is_sanctioned boolean NOT NULL DEFAULT false
);

-- ------------------------------------------------------------------------------
-- 2) Índices
-- ------------------------------------------------------------------------------
CREATE INDEX tip_distribution_history_confirmed_at_idx
    ON public.tip_distribution_history (confirmed_at DESC);

CREATE INDEX tip_distribution_lines_distribution_id_idx
    ON public.tip_distribution_lines (distribution_id);

CREATE INDEX tip_distribution_lines_user_id_idx
    ON public.tip_distribution_lines (user_id);

-- ------------------------------------------------------------------------------
-- 3) RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.tip_distribution_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tip_distribution_lines ENABLE ROW LEVEL SECURITY;

-- tip_distribution_history: lectura para authenticated
DROP POLICY IF EXISTS "tip_distribution_history_select_authenticated" ON public.tip_distribution_history;
CREATE POLICY "tip_distribution_history_select_authenticated"
    ON public.tip_distribution_history
    FOR SELECT
    TO authenticated
    USING (true);

-- tip_distribution_history: INSERT/UPDATE solo manager/admin
DROP POLICY IF EXISTS "tip_distribution_history_insert_managers" ON public.tip_distribution_history;
CREATE POLICY "tip_distribution_history_insert_managers"
    ON public.tip_distribution_history
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_manager_or_admin());

DROP POLICY IF EXISTS "tip_distribution_history_update_managers" ON public.tip_distribution_history;
CREATE POLICY "tip_distribution_history_update_managers"
    ON public.tip_distribution_history
    FOR UPDATE
    TO authenticated
    USING (public.is_manager_or_admin())
    WITH CHECK (public.is_manager_or_admin());

-- tip_distribution_lines: lectura para authenticated (sin INSERT/UPDATE directo)
DROP POLICY IF EXISTS "tip_distribution_lines_select_authenticated" ON public.tip_distribution_lines;
CREATE POLICY "tip_distribution_lines_select_authenticated"
    ON public.tip_distribution_lines
    FOR SELECT
    TO authenticated
    USING (true);

-- Sin políticas INSERT/UPDATE/DELETE en tip_distribution_lines:
-- las líneas se insertan solo vía RPC SECURITY DEFINER (futura confirmación de reparto).
