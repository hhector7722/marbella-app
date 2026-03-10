-- ==============================================================================
-- BOTES ATEMPORALES: desglose y total de cada bote no dependen del rango de fechas.
-- El filtro de fechas solo afecta al cálculo de horas para el reparto.
-- ==============================================================================

-- 1) Guardar datos existentes (si hay) para migrar
CREATE TEMP TABLE _tip_pools_backup AS
SELECT DISTINCT ON (pool_type) pool_type, cash_total, cash_breakdown, notes
FROM public.tip_pools
ORDER BY pool_type, cash_total DESC NULLS LAST;

-- 2) Eliminar tablas en orden (overrides referencia tip_pools)
DROP TABLE IF EXISTS public.tip_pool_overrides CASCADE;
DROP TABLE IF EXISTS public.tip_pools CASCADE;

-- 4) Crear tabla atemporal (solo pool_type, sin fechas)
CREATE TABLE public.tip_pools (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_type text NOT NULL UNIQUE CHECK (pool_type IN ('weekday', 'weekend')),
    cash_total numeric(12,2) NOT NULL DEFAULT 0,
    cash_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
    notes text,
    created_by uuid NOT NULL DEFAULT auth.uid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trigger_tip_pools_updated_at
BEFORE UPDATE ON public.tip_pools
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Recrear tip_pool_overrides
CREATE TABLE public.tip_pool_overrides (
    pool_id uuid NOT NULL REFERENCES public.tip_pools(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    override_hours numeric(10,2),
    override_amount numeric(12,2),
    notes text,
    created_by uuid NOT NULL DEFAULT auth.uid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (pool_id, user_id),
    CONSTRAINT tip_override_non_negative_check CHECK (
        (override_hours IS NULL OR override_hours >= 0)
        AND (override_amount IS NULL OR override_amount >= 0)
    )
);

CREATE INDEX tip_pool_overrides_user_idx ON public.tip_pool_overrides (user_id);

CREATE TRIGGER trigger_tip_pool_overrides_updated_at
BEFORE UPDATE ON public.tip_pool_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) RLS
ALTER TABLE public.tip_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tip_pool_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tip_pools_select_authenticated" ON public.tip_pools;
CREATE POLICY "tip_pools_select_authenticated" ON public.tip_pools FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tip_pool_overrides_select_authenticated" ON public.tip_pool_overrides;
CREATE POLICY "tip_pool_overrides_select_authenticated" ON public.tip_pool_overrides FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tip_pools_mutate_managers" ON public.tip_pools;
CREATE POLICY "tip_pools_mutate_managers" ON public.tip_pools FOR ALL TO authenticated
    USING (public.is_manager_or_admin()) WITH CHECK (public.is_manager_or_admin());

DROP POLICY IF EXISTS "tip_pool_overrides_mutate_managers" ON public.tip_pool_overrides;
CREATE POLICY "tip_pool_overrides_mutate_managers" ON public.tip_pool_overrides FOR ALL TO authenticated
    USING (public.is_manager_or_admin()) WITH CHECK (public.is_manager_or_admin());

-- 7) Insertar los 2 botes (migrar datos si existían en backup)
-- created_by: auth.uid() es NULL en SQL Editor; usar primer admin/manager o primer perfil
INSERT INTO public.tip_pools (pool_type, cash_total, cash_breakdown, notes, created_by)
SELECT pool_type, cash_total, cash_breakdown, notes,
  COALESCE(auth.uid(), (SELECT id FROM public.profiles WHERE role IN ('admin','manager') LIMIT 1), (SELECT id FROM public.profiles LIMIT 1), '00000000-0000-0000-0000-000000000000'::uuid)
FROM _tip_pools_backup
WHERE pool_type IN ('weekday', 'weekend')
ON CONFLICT (pool_type) DO NOTHING;

-- Asegurar que existan ambos botes (por defecto 0 si no había backup)
INSERT INTO public.tip_pools (pool_type, cash_total, cash_breakdown, notes, created_by)
VALUES ('weekday', 0, '{}'::jsonb, NULL,
  COALESCE(auth.uid(), (SELECT id FROM public.profiles WHERE role IN ('admin','manager') LIMIT 1), (SELECT id FROM public.profiles LIMIT 1), '00000000-0000-0000-0000-000000000000'::uuid))
ON CONFLICT (pool_type) DO NOTHING;

INSERT INTO public.tip_pools (pool_type, cash_total, cash_breakdown, notes, created_by)
VALUES ('weekend', 0, '{}'::jsonb, NULL,
  COALESCE(auth.uid(), (SELECT id FROM public.profiles WHERE role IN ('admin','manager') LIMIT 1), (SELECT id FROM public.profiles LIMIT 1), '00000000-0000-0000-0000-000000000000'::uuid))
ON CONFLICT (pool_type) DO NOTHING;

-- 8) RPC upsert_tip_pool (sin fechas)
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
    IF NOT public.is_manager_or_admin() THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: only manager/admin can upsert tip pools';
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

-- 9) RPC get_tip_pool_preview: botes atemporales, horas según rango
CREATE OR REPLACE FUNCTION public.get_tip_pool_preview(
    p_start_date date,
    p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: start_date and end_date are required';
    END IF;
    IF p_end_date < p_start_date THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: end_date must be >= start_date';
    END IF;

    WITH
    pool_weekday AS (
        SELECT id AS pool_id, cash_total, cash_breakdown, notes
        FROM public.tip_pools WHERE pool_type = 'weekday' LIMIT 1
    ),
    pool_weekend AS (
        SELECT id AS pool_id, cash_total, cash_breakdown, notes
        FROM public.tip_pools WHERE pool_type = 'weekend' LIMIT 1
    ),
    staff AS (
        SELECT id, first_name, last_name, role
        FROM public.profiles
        WHERE role IN ('staff', 'manager', 'supervisor')
    ),
    logs AS (
        SELECT
            tl.user_id,
            (tl.clock_in AT TIME ZONE 'Europe/Madrid')::date AS local_day,
            EXTRACT(ISODOW FROM (tl.clock_in AT TIME ZONE 'Europe/Madrid'))::int AS isodow,
            public.fn_round_marbella_hours(COALESCE(tl.total_hours, 0)) AS rounded_hours
        FROM public.time_logs tl
        WHERE (tl.clock_in AT TIME ZONE 'Europe/Madrid')::date >= p_start_date
          AND (tl.clock_in AT TIME ZONE 'Europe/Madrid')::date <= p_end_date
          AND COALESCE(tl.total_hours, 0) > 0
          AND (tl.event_type IS NULL OR tl.event_type IN ('regular', 'overtime', 'weekend'))
    ),
    hours_by_user AS (
        SELECT
            s.id AS user_id,
            COALESCE(SUM(CASE WHEN l.isodow BETWEEN 1 AND 5 THEN l.rounded_hours ELSE 0 END), 0) AS weekday_hours_raw,
            COALESCE(SUM(CASE WHEN l.isodow IN (6,7) THEN l.rounded_hours ELSE 0 END), 0) AS weekend_hours_raw
        FROM staff s
        LEFT JOIN logs l ON l.user_id = s.id
        GROUP BY s.id
    ),
    overrides_weekday AS (
        SELECT o.user_id, o.override_hours, o.override_amount, o.notes
        FROM public.tip_pool_overrides o
        JOIN pool_weekday p ON p.pool_id = o.pool_id
    ),
    overrides_weekend AS (
        SELECT o.user_id, o.override_hours, o.override_amount, o.notes
        FROM public.tip_pool_overrides o
        JOIN pool_weekend p ON p.pool_id = o.pool_id
    ),
    staff_calc AS (
        SELECT
            s.id,
            trim(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) AS name,
            s.role,
            COALESCE(owd.override_hours, h.weekday_hours_raw) AS weekday_hours,
            COALESCE(owe.override_hours, h.weekend_hours_raw) AS weekend_hours,
            h.weekday_hours_raw,
            h.weekend_hours_raw,
            owd.override_amount AS weekday_amount_override,
            owe.override_amount AS weekend_amount_override
        FROM staff s
        JOIN hours_by_user h ON h.user_id = s.id
        LEFT JOIN overrides_weekday owd ON owd.user_id = s.id
        LEFT JOIN overrides_weekend owe ON owe.user_id = s.id
    ),
    totals AS (
        SELECT
            COALESCE(SUM(weekday_hours), 0) AS total_weekday_hours,
            COALESCE(SUM(weekend_hours), 0) AS total_weekend_hours
        FROM staff_calc
    ),
    staff_amounts AS (
        SELECT
            sc.*,
            CASE
                WHEN (SELECT total_weekday_hours FROM totals) > 0
                THEN ROUND(((COALESCE((SELECT cash_total FROM pool_weekday), 0) * sc.weekday_hours) / (SELECT total_weekday_hours FROM totals))::numeric, 2)
                ELSE 0
            END AS weekday_amount_calc,
            CASE
                WHEN (SELECT total_weekend_hours FROM totals) > 0
                THEN ROUND(((COALESCE((SELECT cash_total FROM pool_weekend), 0) * sc.weekend_hours) / (SELECT total_weekend_hours FROM totals))::numeric, 2)
                ELSE 0
            END AS weekend_amount_calc
        FROM staff_calc sc
    ),
    final_staff AS (
        SELECT
            id,
            name,
            role,
            weekday_hours,
            weekend_hours,
            weekday_hours_raw,
            weekend_hours_raw,
            weekday_amount_override,
            weekend_amount_override,
            COALESCE(weekday_amount_override, weekday_amount_calc) AS weekday_amount,
            COALESCE(weekend_amount_override, weekend_amount_calc) AS weekend_amount,
            (COALESCE(weekday_amount_override, weekday_amount_calc) + COALESCE(weekend_amount_override, weekend_amount_calc)) AS total_amount
        FROM staff_amounts
    )
    SELECT jsonb_build_object(
        'range', jsonb_build_object('startDate', p_start_date::text, 'endDate', p_end_date::text),
        'pools', jsonb_build_object(
            'weekday', jsonb_build_object(
                'id', (SELECT pool_id FROM pool_weekday),
                'cashTotal', COALESCE((SELECT cash_total FROM pool_weekday), 0),
                'cashBreakdown', COALESCE((SELECT cash_breakdown FROM pool_weekday), '{}'::jsonb),
                'notes', (SELECT notes FROM pool_weekday)
            ),
            'weekend', jsonb_build_object(
                'id', (SELECT pool_id FROM pool_weekend),
                'cashTotal', COALESCE((SELECT cash_total FROM pool_weekend), 0),
                'cashBreakdown', COALESCE((SELECT cash_breakdown FROM pool_weekend), '{}'::jsonb),
                'notes', (SELECT notes FROM pool_weekend)
            )
        ),
        'totals', jsonb_build_object(
            'weekdayHours', (SELECT total_weekday_hours FROM totals),
            'weekendHours', (SELECT total_weekend_hours FROM totals),
            'weekdayCash', COALESCE((SELECT cash_total FROM pool_weekday), 0),
            'weekendCash', COALESCE((SELECT cash_total FROM pool_weekend), 0),
            'grandCash', COALESCE((SELECT cash_total FROM pool_weekday), 0) + COALESCE((SELECT cash_total FROM pool_weekend), 0)
        ),
        'staff', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'name', name,
                    'role', role,
                    'weekdayHours', weekday_hours,
                    'weekendHours', weekend_hours,
                    'weekdayHoursRaw', weekday_hours_raw,
                    'weekendHoursRaw', weekend_hours_raw,
                    'weekdayAmount', weekday_amount,
                    'weekendAmount', weekend_amount,
                    'totalAmount', total_amount,
                    'hasOverrides', (weekday_amount_override IS NOT NULL OR weekend_amount_override IS NOT NULL OR weekday_hours <> weekday_hours_raw OR weekend_hours <> weekend_hours_raw)
                )
                ORDER BY name
            )
            FROM final_staff
        ), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$$;
