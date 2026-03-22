-- =============================================================================
-- Coste laboral: términos versionados (monthly_cost / overtime) + RPCs calendario
-- - valid_from / valid_to INCLUSIVOS: vigente si valid_from <= d AND (valid_to IS NULL OR d <= valid_to)
-- - Prorrateo fijo: monthly_cost(día) / días del mes calendario; solo días con joining_date <= d
-- - Extras: mismo criterio que get_weekly_worker_stats (final_balance, prefer_stock);
--   tarifa overtime_cost_per_hour del término vigente en el lunes de la semana;
--   reparto del coste semanal de extras entre días proporcional a horas del día / horas semanales
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profile_labor_cost_terms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    valid_from date NOT NULL,
    valid_to date,
    monthly_cost numeric(10, 2) NOT NULL DEFAULT 0,
    overtime_cost_per_hour numeric(10, 2) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users (id),
    CONSTRAINT profile_labor_cost_terms_valid_range_chk CHECK (
        valid_to IS NULL OR valid_to >= valid_from
    ),
    CONSTRAINT profile_labor_cost_terms_user_valid_from_uniq UNIQUE (user_id, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_profile_labor_cost_terms_user_dates
    ON public.profile_labor_cost_terms (user_id, valid_from);

COMMENT ON TABLE public.profile_labor_cost_terms IS
    'Tramos de coste laboral (fijo mensual y precio hora extras). Inmutable histórico: cerrar tramo con valid_to e insertar nuevo.';

ALTER TABLE public.profile_labor_cost_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage labor cost terms"
    ON public.profile_labor_cost_terms
    FOR ALL
    TO authenticated
    USING (public.is_manager_or_admin())
    WITH CHECK (public.is_manager_or_admin());

-- Backfill: un tramo abierto por perfil desde joining_date (o 2020-01-01 si es null)
INSERT INTO public.profile_labor_cost_terms (user_id, valid_from, valid_to, monthly_cost, overtime_cost_per_hour)
SELECT
    p.id,
    COALESCE(p.joining_date, DATE '2020-01-01'),
    NULL,
    COALESCE(p.monthly_cost, 0),
    COALESCE(p.overtime_cost_per_hour, 0)
FROM public.profiles p
ON CONFLICT (user_id, valid_from) DO NOTHING;

-- Valores efectivos en una fecha (fallback profiles)
CREATE OR REPLACE FUNCTION public.fn_labor_term_values(p_user_id uuid, p_on_date date)
RETURNS TABLE (
    monthly_cost numeric,
    overtime_cost_per_hour numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        COALESCE(
            (SELECT t.monthly_cost
             FROM public.profile_labor_cost_terms t
             WHERE t.user_id = p_user_id
               AND t.valid_from <= p_on_date
               AND (t.valid_to IS NULL OR p_on_date <= t.valid_to)
             ORDER BY t.valid_from DESC
             LIMIT 1),
            (SELECT p.monthly_cost FROM public.profiles p WHERE p.id = p_user_id),
            0::numeric
        ) AS monthly_cost,
        COALESCE(
            (SELECT t.overtime_cost_per_hour
             FROM public.profile_labor_cost_terms t
             WHERE t.user_id = p_user_id
               AND t.valid_from <= p_on_date
               AND (t.valid_to IS NULL OR p_on_date <= t.valid_to)
             ORDER BY t.valid_from DESC
             LIMIT 1),
            (SELECT p.overtime_cost_per_hour FROM public.profiles p WHERE p.id = p_user_id),
            0::numeric
        ) AS overtime_cost_per_hour;
$$;

-- Coste extras imputado a un día (proporción semanal; misma base que get_weekly_worker_stats)
CREATE OR REPLACE FUNCTION public.fn_labor_overtime_allocated_day(p_user_id uuid, p_date date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_week_start date;
    v_week_logs_sum numeric;
    v_day_hours numeric;
    v_final_balance numeric;
    v_prefer_stock boolean;
    v_over_price numeric;
    v_week_ot numeric;
BEGIN
    v_week_start := date_trunc('week', p_date::timestamp)::date;

    SELECT COALESCE(SUM(public.fn_round_marbella_hours(tl.total_hours)), 0)
    INTO v_week_logs_sum
    FROM public.time_logs tl
    WHERE tl.user_id = p_user_id
      AND date_trunc('week', tl.clock_in AT TIME ZONE 'Europe/Madrid')::date = v_week_start
      AND tl.total_hours IS NOT NULL;

    SELECT COALESCE(SUM(public.fn_round_marbella_hours(tl.total_hours)), 0)
    INTO v_day_hours
    FROM public.time_logs tl
    WHERE tl.user_id = p_user_id
      AND (tl.clock_in AT TIME ZONE 'Europe/Madrid')::date = p_date
      AND tl.total_hours IS NOT NULL;

    SELECT
        COALESCE(s.final_balance, 0),
        COALESCE(s.prefer_stock_hours_override, p.prefer_stock_hours, false),
        (SELECT o.overtime_cost_per_hour FROM public.fn_labor_term_values(p_user_id, v_week_start) o)
    INTO v_final_balance, v_prefer_stock, v_over_price
    FROM public.profiles p
    LEFT JOIN public.weekly_snapshots s
        ON s.user_id = p_user_id AND s.week_start = v_week_start
    WHERE p.id = p_user_id;

    IF v_final_balance IS NULL THEN
        v_final_balance := 0;
    END IF;

    v_week_ot := CASE
        WHEN v_final_balance > 0 AND NOT v_prefer_stock THEN v_final_balance * COALESCE(v_over_price, 0)
        ELSE 0::numeric
    END;

    IF v_week_logs_sum <= 0 THEN
        RETURN 0;
    END IF;

    RETURN round(v_week_ot * (v_day_hours / v_week_logs_sum), 2);
END;
$$;

-- Coste fijo de un usuario en un día (prorrateo mensual / días del mes)
CREATE OR REPLACE FUNCTION public.fn_labor_fixed_day_for_user(p_user_id uuid, p_date date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_join date;
    v_dim int;
    v_mc numeric;
BEGIN
    SELECT COALESCE(p.joining_date, DATE '2000-01-01')
    INTO v_join
    FROM public.profiles p
    WHERE p.id = p_user_id;

    IF v_join IS NULL OR p_date < v_join THEN
        RETURN 0;
    END IF;

    v_dim := (date_trunc('month', p_date::timestamp) + interval '1 month - 1 day')::date
        - date_trunc('month', p_date::timestamp)::date + 1;

    SELECT t.monthly_cost INTO v_mc FROM public.fn_labor_term_values(p_user_id, p_date) t;

    RETURN round(COALESCE(v_mc, 0) / NULLIF(v_dim, 0), 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_labor_cost_month_summary(p_year int, p_month int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_start date;
    v_end date;
    v_dim int;
    d date;
    v_fixed numeric;
    v_ot numeric;
    v_user record;
    v_day_fixed numeric;
    v_day_ot numeric;
    v_total_fixed numeric := 0;
    v_total_ot numeric := 0;
    v_by_date jsonb := '{}'::jsonb;
    v_sum_day numeric;
BEGIN
    IF NOT public.is_manager_or_admin() THEN
        RAISE EXCEPTION 'forbidden';
    END IF;

    v_start := make_date(p_year, p_month, 1);
    v_end := (date_trunc('month', v_start::timestamp) + interval '1 month - 1 day')::date;
    v_dim := v_end - v_start + 1;

    d := v_start;
    WHILE d <= v_end LOOP
        v_day_fixed := 0;
        v_day_ot := 0;

        FOR v_user IN
            SELECT p.id AS uid
            FROM public.profiles p
            WHERE COALESCE(p.joining_date, DATE '2000-01-01') <= d
        LOOP
            v_day_fixed := v_day_fixed + public.fn_labor_fixed_day_for_user(v_user.uid, d);
            v_day_ot := v_day_ot + COALESCE(public.fn_labor_overtime_allocated_day(v_user.uid, d), 0);
        END LOOP;

        v_sum_day := round(v_day_fixed + v_day_ot, 2);
        v_total_fixed := v_total_fixed + v_day_fixed;
        v_total_ot := v_total_ot + v_day_ot;

        v_by_date := v_by_date || jsonb_build_object(
            to_char(d, 'YYYY-MM-DD'),
            jsonb_build_object(
                'total', v_sum_day,
                'fixed', round(v_day_fixed, 2),
                'overtime', round(v_day_ot, 2)
            )
        );

        d := d + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'year', p_year,
        'month', p_month,
        'daysInMonth', v_dim,
        'totalFixed', round(v_total_fixed, 2),
        'totalOvertime', round(v_total_ot, 2),
        'totalCost', round(v_total_fixed + v_total_ot, 2),
        'byDate', v_by_date
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_labor_cost_day_detail(p_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_manager_or_admin() THEN
        RAISE EXCEPTION 'forbidden';
    END IF;

    RETURN (
        WITH w AS (
            SELECT p.id AS uid,
                   TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS name,
                   public.fn_labor_fixed_day_for_user(p.id, p_date) AS fixed,
                   COALESCE(public.fn_labor_overtime_allocated_day(p.id, p_date), 0) AS ot
            FROM public.profiles p
            WHERE COALESCE(p.joining_date, DATE '2000-01-01') <= p_date
        ),
        f AS (
            SELECT uid, name, fixed, ot, round(fixed + ot, 2) AS tot
            FROM w
            WHERE fixed <> 0 OR ot <> 0
        )
        SELECT jsonb_build_object(
            'date', to_char(p_date, 'YYYY-MM-DD'),
            'totalFixed', COALESCE((SELECT round(SUM(fixed), 2) FROM f), 0),
            'totalOvertime', COALESCE((SELECT round(SUM(ot), 2) FROM f), 0),
            'totalCost', COALESCE((SELECT round(SUM(tot), 2) FROM f), 0),
            'workers', COALESCE(
                (SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', uid,
                        'name', NULLIF(name, ''),
                        'fixed', round(fixed, 2),
                        'overtime', round(ot, 2),
                        'total', tot
                    ) ORDER BY name
                ) FROM f),
                '[]'::jsonb
            )
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_labor_term_values(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_labor_overtime_allocated_day(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_labor_fixed_day_for_user(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_labor_cost_month_summary(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_labor_cost_day_detail(date) TO authenticated;

-- Sync: al cambiar costes en profiles, versionar términos
CREATE OR REPLACE FUNCTION public.trg_profiles_sync_labor_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.profile_labor_cost_terms (user_id, valid_from, valid_to, monthly_cost, overtime_cost_per_hour, created_by)
        VALUES (
            NEW.id,
            COALESCE(NEW.joining_date, v_today),
            NULL,
            COALESCE(NEW.monthly_cost, 0),
            COALESCE(NEW.overtime_cost_per_hour, 0),
            auth.uid()
        )
        ON CONFLICT (user_id, valid_from) DO UPDATE SET
            monthly_cost = EXCLUDED.monthly_cost,
            overtime_cost_per_hour = EXCLUDED.overtime_cost_per_hour;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF (OLD.monthly_cost IS DISTINCT FROM NEW.monthly_cost OR OLD.overtime_cost_per_hour IS DISTINCT FROM NEW.overtime_cost_per_hour) THEN
            IF EXISTS (
                SELECT 1 FROM public.profile_labor_cost_terms t
                WHERE t.user_id = NEW.id AND t.valid_to IS NULL AND t.valid_from < v_today
            ) THEN
                UPDATE public.profile_labor_cost_terms t
                SET valid_to = v_today - 1
                WHERE t.user_id = NEW.id AND t.valid_to IS NULL AND t.valid_from < v_today;
            END IF;

            IF EXISTS (
                SELECT 1 FROM public.profile_labor_cost_terms t
                WHERE t.user_id = NEW.id AND t.valid_to IS NULL AND t.valid_from = v_today
            ) THEN
                UPDATE public.profile_labor_cost_terms t
                SET monthly_cost = COALESCE(NEW.monthly_cost, 0),
                    overtime_cost_per_hour = COALESCE(NEW.overtime_cost_per_hour, 0),
                    created_by = auth.uid()
                WHERE t.user_id = NEW.id AND t.valid_to IS NULL AND t.valid_from = v_today;
            ELSE
                INSERT INTO public.profile_labor_cost_terms (user_id, valid_from, valid_to, monthly_cost, overtime_cost_per_hour, created_by)
                VALUES (
                    NEW.id,
                    v_today,
                    NULL,
                    COALESCE(NEW.monthly_cost, 0),
                    COALESCE(NEW.overtime_cost_per_hour, 0),
                    auth.uid()
                );
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_labor_terms ON public.profiles;
CREATE TRIGGER trg_profiles_sync_labor_terms
    AFTER INSERT OR UPDATE OF monthly_cost, overtime_cost_per_hour ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_profiles_sync_labor_terms();

COMMENT ON FUNCTION public.get_labor_cost_month_summary(int, int) IS
    'Resumen coste laboral mensual: fijo prorrateado + extras repartidas por día (manager).';
COMMENT ON FUNCTION public.get_labor_cost_day_detail(date) IS
    'Desglose por trabajador de un día concreto.';
