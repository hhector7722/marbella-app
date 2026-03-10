-- ==============================================================================
-- FIX: get_tip_pool_preview - empleados con horas weekday/weekend
-- 1. Incluir supervisor en staff
-- 2. Incluir event_type 'weekend' en logs (turnos de fin de semana)
-- 3. No depender de full_name (usar first_name + last_name)
-- ==============================================================================

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

    WITH pools AS (
        SELECT
            tp.pool_type,
            tp.id AS pool_id,
            tp.cash_total,
            tp.cash_breakdown,
            tp.notes
        FROM public.tip_pools tp
        WHERE tp.start_date = p_start_date
          AND tp.end_date = p_end_date
    ),
    pool_weekday AS (
        SELECT * FROM pools WHERE pool_type = 'weekday'
    ),
    pool_weekend AS (
        SELECT * FROM pools WHERE pool_type = 'weekend'
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
