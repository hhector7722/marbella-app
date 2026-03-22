-- Prorrateo de venta para % M.O.: pondera por coste/hora ordinario vs extra (términos laborales + horas contrato).
-- Sustituye get_daily_rounded_hours_by_user (solo horas crudas).
DROP FUNCTION IF EXISTS public.get_daily_rounded_hours_by_user(date);

CREATE OR REPLACE FUNCTION public.get_daily_sales_proration_weights_by_user(p_date date)
RETURNS TABLE (user_id uuid, weight numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_manager_or_admin() THEN
        RAISE EXCEPTION 'forbidden';
    END IF;

    RETURN QUERY
    WITH base AS (
        SELECT
            tl.user_id,
            public.fn_round_marbella_hours(tl.total_hours)::numeric AS h,
            COALESCE(tl.event_type::text, '') = 'overtime' AS is_overtime
        FROM public.time_logs tl
        WHERE public.get_working_date(tl.clock_in) = p_date
          AND tl.total_hours IS NOT NULL
    ),
    calc AS (
        SELECT
            b.user_id,
            b.h,
            b.is_overtime,
            tv.monthly_cost,
            tv.overtime_cost_per_hour,
            COALESCE(p.contracted_hours_weekly, 40)::numeric AS chw
        FROM base b
        INNER JOIN public.profiles p ON p.id = b.user_id
        CROSS JOIN LATERAL public.fn_labor_term_values(b.user_id, p_date) tv
    ),
    w AS (
        SELECT
            c.user_id,
            CASE
                WHEN c.h <= 0 THEN 0::numeric
                ELSE
                    CASE
                        WHEN c.is_overtime THEN c.h * COALESCE(c.overtime_cost_per_hour, 0)
                        ELSE
                            c.h
                            * COALESCE(c.monthly_cost, 0)
                            / NULLIF((c.chw * 52::numeric / 12::numeric), 0)
                    END
            END AS w_raw,
            c.h AS h
        FROM calc c
    )
    SELECT
        w.user_id,
        (CASE
            WHEN w.w_raw > 0 THEN w.w_raw
            WHEN w.h > 0 THEN w.h
            ELSE 0::numeric
        END)::numeric AS weight
    FROM w
    WHERE w.h > 0
      AND (CASE WHEN w.w_raw > 0 THEN w.w_raw WHEN w.h > 0 THEN w.h ELSE 0 END) > 0;
END;
$$;

COMMENT ON FUNCTION public.get_daily_sales_proration_weights_by_user(date) IS
    'Peso por usuario para repartir venta del día: horas × tarifa ordinaria (monthly / horas mes contrato) u hora extra (overtime_cost_per_hour). Si tarifa 0, cae a horas redondeadas.';

GRANT EXECUTE ON FUNCTION public.get_daily_sales_proration_weights_by_user(date) TO authenticated;
