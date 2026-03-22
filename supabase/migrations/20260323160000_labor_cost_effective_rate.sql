-- Coste laboral operativo: tasa efectiva ordinaria (sin prorrateo lineal mensual).
-- Ordinario = horas fichadas NO overtime × monthly_cost / (horas contrato mes × 0.85).
-- Extra = horas fichadas overtime × overtime_cost_per_hour.
-- Día sin fichaje efectivo → 0 € para ese trabajador.

DROP FUNCTION IF EXISTS public.get_daily_sales_proration_weights_by_user(date);

CREATE OR REPLACE FUNCTION public.fn_labor_effective_ordinary_rate(p_user_id uuid, p_on_date date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        COALESCE(tv.monthly_cost, 0)
        / NULLIF(
            COALESCE(p.contracted_hours_weekly, 40)::numeric * (52.0::numeric / 12.0) * 0.85::numeric,
            0
        )
    FROM public.profiles p
    CROSS JOIN LATERAL public.fn_labor_term_values(p_user_id, p_on_date) tv
    WHERE p.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.fn_labor_fixed_day_for_user(p_user_id uuid, p_date date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_join date;
    v_h numeric;
    v_rate numeric;
BEGIN
    SELECT COALESCE(p.joining_date, DATE '2000-01-01')
    INTO v_join
    FROM public.profiles p
    WHERE p.id = p_user_id;

    IF v_join IS NULL OR p_date < v_join THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(SUM(public.fn_round_marbella_hours(tl.total_hours)), 0)
    INTO v_h
    FROM public.time_logs tl
    WHERE tl.user_id = p_user_id
      AND public.get_working_date(tl.clock_in) = p_date
      AND tl.total_hours IS NOT NULL
      AND COALESCE(tl.event_type::text, '') <> 'overtime';

    IF v_h <= 0 THEN
        RETURN 0;
    END IF;

    v_rate := COALESCE(public.fn_labor_effective_ordinary_rate(p_user_id, p_date), 0);

    RETURN round(v_h * v_rate, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_labor_overtime_allocated_day(p_user_id uuid, p_date date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_join date;
    v_h numeric;
    v_price numeric;
BEGIN
    SELECT COALESCE(p.joining_date, DATE '2000-01-01')
    INTO v_join
    FROM public.profiles p
    WHERE p.id = p_user_id;

    IF v_join IS NULL OR p_date < v_join THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(SUM(public.fn_round_marbella_hours(tl.total_hours)), 0)
    INTO v_h
    FROM public.time_logs tl
    WHERE tl.user_id = p_user_id
      AND public.get_working_date(tl.clock_in) = p_date
      AND tl.total_hours IS NOT NULL
      AND COALESCE(tl.event_type::text, '') = 'overtime';

    IF v_h <= 0 THEN
        RETURN 0;
    END IF;

    SELECT tv.overtime_cost_per_hour INTO v_price FROM public.fn_labor_term_values(p_user_id, p_date) tv;

    RETURN round(v_h * COALESCE(v_price, 0), 2);
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
        WITH scored AS (
            SELECT
                p.id AS uid,
                TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS name,
                d.fixed,
                d.ot,
                round(d.fixed + d.ot, 2) AS tot
            FROM public.profiles p
            CROSS JOIN LATERAL (
                SELECT
                    public.fn_labor_fixed_day_for_user(p.id, p_date) AS fixed,
                    COALESCE(public.fn_labor_overtime_allocated_day(p.id, p_date), 0) AS ot
            ) d
            WHERE COALESCE(p.joining_date, DATE '2000-01-01') <= p_date
        )
        SELECT jsonb_build_object(
            'date', to_char(p_date, 'YYYY-MM-DD'),
            'totalFixed', COALESCE(
                (SELECT round(SUM(s.fixed), 2) FROM scored s WHERE s.fixed <> 0 OR s.ot <> 0),
                0
            ),
            'totalOvertime', COALESCE(
                (SELECT round(SUM(s.ot), 2) FROM scored s WHERE s.fixed <> 0 OR s.ot <> 0),
                0
            ),
            'totalCost', COALESCE(
                (SELECT round(SUM(s.tot), 2) FROM scored s WHERE s.fixed <> 0 OR s.ot <> 0),
                0
            ),
            'workers', COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', s.uid,
                            'name', NULLIF(s.name, ''),
                            'fixed', round(s.fixed, 2),
                            'overtime', round(s.ot, 2),
                            'total', s.tot
                        )
                        ORDER BY s.name
                    )
                    FROM scored s
                    WHERE s.fixed <> 0 OR s.ot <> 0
                ),
                '[]'::jsonb
            )
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_labor_effective_ordinary_rate(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.fn_labor_effective_ordinary_rate(uuid, date) IS
    'Tasa €/h ordinaria: monthly_cost / (contracted_hours_weekly * 52/12 * 0.85).';

COMMENT ON FUNCTION public.fn_labor_fixed_day_for_user(uuid, date) IS
    'Coste ordinario del día: horas fichadas (no overtime) × tasa efectiva ordinaria; 0 si no hay horas.';

COMMENT ON FUNCTION public.fn_labor_overtime_allocated_day(uuid, date) IS
    'Coste extra del día: horas fichadas overtime × overtime_cost_per_hour.';

COMMENT ON FUNCTION public.get_labor_cost_month_summary(int, int) IS
    'Coste laboral mensual por día: ordinario por tasa efectiva + extra por hora; sin prorrateo lineal del mensual.';

COMMENT ON FUNCTION public.get_labor_cost_day_detail(date) IS
    'Desglose por trabajador con coste 0 si no fichó ese día.';
