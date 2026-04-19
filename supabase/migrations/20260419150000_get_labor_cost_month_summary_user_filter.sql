-- Opcional: filtrar resumen mensual de coste laboral por un trabajador (uuid).
-- Las llamadas existentes con (año, mes) siguen siendo válidas (tercer arg por defecto NULL).

DROP FUNCTION IF EXISTS public.get_labor_cost_month_summary(int, int);

CREATE OR REPLACE FUNCTION public.get_labor_cost_month_summary(p_year int, p_month int, p_user_id uuid DEFAULT NULL)
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
              AND (p_user_id IS NULL OR p.id = p_user_id)
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

GRANT EXECUTE ON FUNCTION public.get_labor_cost_month_summary(int, int, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_labor_cost_month_summary(int, int, uuid) IS
    'Coste laboral mensual por día: ordinario por tasa efectiva + extra por hora. p_user_id NULL = todos los perfiles; si no NULL, solo ese trabajador.';
