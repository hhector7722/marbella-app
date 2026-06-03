-- ==============================================================================
-- get_tip_pool_preview: sanciones sin doble conteo + shadowAmount en JSON
-- (chef incluido en CTE staff; hereda 20260604120000)
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
    v_tji_exempt_user_id uuid := 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6'::uuid;
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: start_date and end_date are required';
    END IF;
    IF p_end_date < p_start_date THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: end_date must be >= p_start_date';
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
        SELECT id, first_name, last_name, role, email
        FROM public.profiles
        WHERE role IN ('staff', 'manager', 'supervisor', 'chef')
    ),
    range_days AS (
        SELECT
            gs::date AS d,
            EXTRACT(ISODOW FROM gs)::int AS isodow
        FROM generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day') gs
    ),
    weekday_days AS (
        SELECT COUNT(*)::numeric AS cnt
        FROM range_days
        WHERE isodow BETWEEN 1 AND 5
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
          AND (tl.event_type IS NULL OR tl.event_type IN ('regular', 'no_registered'))
    ),
    hours_by_user AS (
        SELECT
            s.id AS user_id,
            CASE
                WHEN lower(COALESCE(s.email, '')) = 'hhector7722@gmail.com'
                THEN
                    (8 * (SELECT cnt FROM weekday_days))
                    + COALESCE(SUM(CASE WHEN l.isodow BETWEEN 1 AND 5 THEN l.rounded_hours ELSE 0 END), 0)
                ELSE
                    COALESCE(SUM(CASE WHEN l.isodow BETWEEN 1 AND 5 THEN l.rounded_hours ELSE 0 END), 0)
            END AS weekday_hours_raw,
            COALESCE(SUM(CASE WHEN l.isodow IN (6,7) THEN l.rounded_hours ELSE 0 END), 0) AS weekend_hours_raw
        FROM staff s
        LEFT JOIN logs l ON l.user_id = s.id
        GROUP BY s.id, s.email
    ),
    tji_days AS (
        SELECT
            tl.user_id,
            (tl.clock_in AT TIME ZONE 'Europe/Madrid')::date AS local_day,
            BOOL_OR(tl.clock_out_show_no_registrada) AS had_olvido
        FROM public.time_logs tl
        WHERE (tl.clock_in AT TIME ZONE 'Europe/Madrid')::date >= p_start_date
          AND (tl.clock_in AT TIME ZONE 'Europe/Madrid')::date <= p_end_date
          AND (tl.event_type IS NULL OR tl.event_type <> 'no_registered')
        GROUP BY tl.user_id, (tl.clock_in AT TIME ZONE 'Europe/Madrid')::date
    ),
    tji_by_user AS (
        SELECT
            user_id,
            COUNT(*)::int AS jornadas_totales,
            COUNT(*) FILTER (WHERE had_olvido)::int AS jornadas_con_olvido
        FROM tji_days
        GROUP BY user_id
    ),
    hours_tji_metrics AS (
        SELECT
            h.user_id,
            h.weekday_hours_raw,
            h.weekend_hours_raw,
            COALESCE(t.jornadas_totales, 0) AS jornadas_totales,
            COALESCE(t.jornadas_con_olvido, 0) AS jornadas_con_olvido,
            CASE
                WHEN h.user_id = v_tji_exempt_user_id THEN 0::numeric
                WHEN COALESCE(t.jornadas_totales, 0) = 0 THEN 0::numeric
                ELSE (COALESCE(t.jornadas_con_olvido, 0)::numeric / t.jornadas_totales::numeric) * 100
            END AS tji_pct
        FROM hours_by_user h
        LEFT JOIN tji_by_user t ON t.user_id = h.user_id
    ),
    hours_with_tji AS (
        SELECT
            m.user_id,
            m.weekday_hours_raw,
            m.weekend_hours_raw,
            m.jornadas_totales,
            m.jornadas_con_olvido,
            m.tji_pct,
            CASE
                WHEN m.user_id = v_tji_exempt_user_id THEN 0
                WHEN m.tji_pct <= 5.0 THEN 0
                WHEN m.tji_pct <= 15.0 THEN 10
                WHEN m.tji_pct <= 25.0 THEN 20
                ELSE 35
            END AS penalizacion_pct,
            CASE
                WHEN m.user_id = v_tji_exempt_user_id THEN m.weekday_hours_raw
                ELSE m.weekday_hours_raw * (1 - (
                    CASE
                        WHEN m.tji_pct <= 5.0 THEN 0
                        WHEN m.tji_pct <= 15.0 THEN 10
                        WHEN m.tji_pct <= 25.0 THEN 20
                        ELSE 35
                    END
                ) / 100.0)
            END AS weekday_hours_effective,
            CASE
                WHEN m.user_id = v_tji_exempt_user_id THEN m.weekend_hours_raw
                ELSE m.weekend_hours_raw * (1 - (
                    CASE
                        WHEN m.tji_pct <= 5.0 THEN 0
                        WHEN m.tji_pct <= 15.0 THEN 10
                        WHEN m.tji_pct <= 25.0 THEN 20
                        ELSE 35
                    END
                ) / 100.0)
            END AS weekend_hours_effective
        FROM hours_tji_metrics m
    ),
    overrides_weekday AS (
        SELECT o.user_id, o.override_hours, o.override_amount, o.notes, o.is_sanctioned
        FROM public.tip_pool_overrides o
        JOIN pool_weekday p ON p.pool_id = o.pool_id
    ),
    overrides_weekend AS (
        SELECT o.user_id, o.override_hours, o.override_amount, o.notes, o.is_sanctioned
        FROM public.tip_pool_overrides o
        JOIN pool_weekend p ON p.pool_id = o.pool_id
    ),
    staff_calc AS (
        SELECT
            s.id,
            trim(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) AS name,
            s.role,
            COALESCE(owd.override_hours, h.weekday_hours_effective) AS weekday_hours,
            COALESCE(owe.override_hours, h.weekend_hours_effective) AS weekend_hours,
            h.weekday_hours_raw,
            h.weekend_hours_raw,
            h.weekday_hours_effective,
            h.weekend_hours_effective,
            h.jornadas_totales,
            h.jornadas_con_olvido,
            h.tji_pct,
            h.penalizacion_pct,
            owd.override_amount AS weekday_amount_override,
            owe.override_amount AS weekend_amount_override,
            COALESCE(owd.is_sanctioned, owe.is_sanctioned, false) AS is_sanctioned
        FROM staff s
        JOIN hours_with_tji h ON h.user_id = s.id
        LEFT JOIN overrides_weekday owd ON owd.user_id = s.id
        LEFT JOIN overrides_weekend owe ON owe.user_id = s.id
    ),
    totals AS (
        SELECT
            COALESCE(SUM(weekday_hours), 0) AS total_weekday_hours,
            COALESCE(SUM(weekend_hours), 0) AS total_weekend_hours
        FROM staff_calc
    ),
    pool_values AS (
        SELECT
            COALESCE((SELECT cash_total FROM pool_weekday), 0) AS weekday_cash_total,
            COALESCE((SELECT cash_total FROM pool_weekend), 0) AS weekend_cash_total,
            (SELECT total_weekday_hours FROM totals) AS total_weekday_hours,
            (SELECT total_weekend_hours FROM totals) AS total_weekend_hours
    ),
    weekday_base AS (
        SELECT
            sc.id,
            sc.is_sanctioned,
            sc.weekday_hours,
            CASE
                WHEN pv.total_weekday_hours > 0
                THEN (pv.weekday_cash_total * sc.weekday_hours) / pv.total_weekday_hours
                ELSE 0::numeric
            END AS weekday_exact_amount,
            CASE
                WHEN pv.total_weekday_hours > 0
                THEN floor(((pv.weekday_cash_total * sc.weekday_hours) / pv.total_weekday_hours) * 100)::bigint
                ELSE 0::bigint
            END AS weekday_base_cents
        FROM staff_calc sc
        CROSS JOIN pool_values pv
    ),
    weekday_ranked AS (
        SELECT
            b.id,
            b.weekday_base_cents,
            (b.weekday_exact_amount * 100 - b.weekday_base_cents::numeric) AS weekday_fraction_cents,
            row_number() OVER (
                ORDER BY (b.weekday_exact_amount * 100 - b.weekday_base_cents::numeric) DESC, b.id
            ) AS rn
        FROM weekday_base b
    ),
    weekday_remaining AS (
        SELECT
            GREATEST(
                (
                    round((SELECT weekday_cash_total FROM pool_values) * 100)::bigint
                    - SUM(b.weekday_base_cents)
                )::bigint,
                0::bigint
            ) AS remaining_cents
        FROM weekday_base b
    ),
    weekday_allocation AS (
        SELECT
            r.id,
            ((r.weekday_base_cents + CASE WHEN r.rn <= wr.remaining_cents THEN 1::bigint ELSE 0::bigint END)::numeric / 100)::numeric AS weekday_amount_calc
        FROM weekday_ranked r
        CROSS JOIN weekday_remaining wr
    ),
    weekend_base AS (
        SELECT
            sc.id,
            sc.is_sanctioned,
            sc.weekend_hours,
            CASE
                WHEN pv.total_weekend_hours > 0
                THEN (pv.weekend_cash_total * sc.weekend_hours) / pv.total_weekend_hours
                ELSE 0::numeric
            END AS weekend_exact_amount,
            CASE
                WHEN pv.total_weekend_hours > 0
                THEN floor(((pv.weekend_cash_total * sc.weekend_hours) / pv.total_weekend_hours) * 100)::bigint
                ELSE 0::bigint
            END AS weekend_base_cents
        FROM staff_calc sc
        CROSS JOIN pool_values pv
    ),
    weekend_ranked AS (
        SELECT
            b.id,
            b.weekend_base_cents,
            (b.weekend_exact_amount * 100 - b.weekend_base_cents::numeric) AS weekend_fraction_cents,
            row_number() OVER (
                ORDER BY (b.weekend_exact_amount * 100 - b.weekend_base_cents::numeric) DESC, b.id
            ) AS rn
        FROM weekend_base b
    ),
    weekend_remaining AS (
        SELECT
            GREATEST(
                (
                    round((SELECT weekend_cash_total FROM pool_values) * 100)::bigint
                    - SUM(b.weekend_base_cents)
                )::bigint,
                0::bigint
            ) AS remaining_cents
        FROM weekend_base b
    ),
    weekend_allocation AS (
        SELECT
            r.id,
            ((r.weekend_base_cents + CASE WHEN r.rn <= wr.remaining_cents THEN 1::bigint ELSE 0::bigint END)::numeric / 100)::numeric AS weekend_amount_calc
        FROM weekend_ranked r
        CROSS JOIN weekend_remaining wr
    ),
    final_staff_pre_sanction AS (
        SELECT
            sc.*,
            COALESCE(sc.weekday_amount_override, wa.weekday_amount_calc) AS weekday_amount,
            COALESCE(sc.weekend_amount_override, we.weekend_amount_calc) AS weekend_amount,
            (COALESCE(sc.weekday_amount_override, wa.weekday_amount_calc) + COALESCE(sc.weekend_amount_override, we.weekend_amount_calc)) AS total_amount
        FROM staff_calc sc
        LEFT JOIN weekday_allocation wa ON wa.id = sc.id
        LEFT JOIN weekend_allocation we ON we.id = sc.id
    ),
    sanction_pool AS (
        SELECT
            COALESCE(SUM(total_amount), 0) AS total_sanctioned_amount,
            (SELECT COUNT(*) FROM final_staff_pre_sanction WHERE is_sanctioned = false AND (weekday_hours + weekend_hours) > 0) AS eligible_count
        FROM final_staff_pre_sanction
        WHERE is_sanctioned = true
    ),
    sanction_redistribution_base AS (
        SELECT
            f.id,
            CASE WHEN sp.eligible_count > 0 THEN floor((sp.total_sanctioned_amount / sp.eligible_count) * 100)::bigint ELSE 0::bigint END AS base_cents,
            CASE WHEN sp.eligible_count > 0 THEN (sp.total_sanctioned_amount / sp.eligible_count) * 100 - floor((sp.total_sanctioned_amount / sp.eligible_count) * 100) ELSE 0 END AS fraction
        FROM final_staff_pre_sanction f
        CROSS JOIN sanction_pool sp
        WHERE f.is_sanctioned = false AND (f.weekday_hours + f.weekend_hours) > 0
    ),
    sanction_redistribution_ranked AS (
        SELECT
            id,
            base_cents,
            row_number() OVER (ORDER BY fraction DESC, id) AS rn
        FROM sanction_redistribution_base
    ),
    sanction_remaining_cents AS (
        SELECT
            GREATEST(
                (round((SELECT total_sanctioned_amount FROM sanction_pool) * 100)::bigint - COALESCE(SUM(base_cents), 0))::bigint,
                0::bigint
            ) AS rem_cents
        FROM sanction_redistribution_base
    ),
    sanction_allocation AS (
        SELECT
            r.id,
            ((r.base_cents + CASE WHEN r.rn <= sr.rem_cents THEN 1::bigint ELSE 0::bigint END)::numeric / 100)::numeric AS bonus_amount
        FROM sanction_redistribution_ranked r
        CROSS JOIN sanction_remaining_cents sr
    ),
    final_staff AS (
        SELECT
            f.*,
            COALESCE(sa.bonus_amount, 0::numeric) AS redistribution_bonus,
            CASE WHEN f.is_sanctioned THEN f.total_amount ELSE NULL::numeric END AS shadow_amount,
            CASE WHEN f.is_sanctioned THEN 0::numeric
                 ELSE f.total_amount + COALESCE(sa.bonus_amount, 0::numeric)
            END AS final_total_amount
        FROM final_staff_pre_sanction f
        LEFT JOIN sanction_allocation sa ON sa.id = f.id
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
                    'weekdayHoursEffective', weekday_hours_effective,
                    'weekendHoursEffective', weekend_hours_effective,
                    'jornadasTotales', jornadas_totales,
                    'jornadasConOlvido', jornadas_con_olvido,
                    'tjiPct', tji_pct,
                    'penalizacionPct', penalizacion_pct,
                    'weekdayAmount', CASE WHEN is_sanctioned THEN 0::numeric ELSE weekday_amount END,
                    'weekendAmount', CASE WHEN is_sanctioned THEN 0::numeric ELSE weekend_amount END,
                    'totalAmount', final_total_amount,
                    'shadowAmount', shadow_amount,
                    'shadowWeekdayAmount', CASE WHEN is_sanctioned THEN weekday_amount ELSE NULL::numeric END,
                    'shadowWeekendAmount', CASE WHEN is_sanctioned THEN weekend_amount ELSE NULL::numeric END,
                    'isSanctioned', is_sanctioned,
                    'bonusAmount', redistribution_bonus,
                    'hasOverrides', (
                        weekday_amount_override IS NOT NULL
                        OR weekend_amount_override IS NOT NULL
                        OR weekday_hours <> weekday_hours_raw
                        OR weekend_hours <> weekend_hours_raw
                        OR penalizacion_pct > 0
                        OR is_sanctioned = true
                    )
                )
                ORDER BY name
            )
            FROM final_staff
        ), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- confirm_tip_distribution: bonus weekday/weekend = 0 si sancionado (JSON ya trae importes pagados en 0)
CREATE OR REPLACE FUNCTION public.confirm_tip_distribution(
    p_start_date date,
    p_end_date date,
    p_notes text DEFAULT NULL
)
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
    v_preview jsonb;
    v_distribution_id uuid;
    v_weekday_total numeric;
    v_weekend_total numeric;
    v_staff jsonb;
    v_uid uuid;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: authentication required';
    END IF;

    IF NOT public.is_manager_or_admin() THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: only manager/admin can confirm tip distribution';
    END IF;

    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: start_date and end_date are required';
    END IF;
    IF p_end_date < p_start_date THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: end_date must be >= p_start_date';
    END IF;

    v_preview := public.get_tip_pool_preview(p_start_date, p_end_date);

    v_weekday_total := COALESCE((v_preview->'pools'->'weekday'->>'cashTotal')::numeric, 0);
    v_weekend_total := COALESCE((v_preview->'pools'->'weekend'->>'cashTotal')::numeric, 0);
    v_staff := COALESCE(v_preview->'staff', '[]'::jsonb);

    INSERT INTO public.tip_distribution_history (
        period_start,
        period_end,
        weekday_total,
        weekend_total,
        confirmed_by,
        notes
    )
    VALUES (
        p_start_date,
        p_end_date,
        v_weekday_total,
        v_weekend_total,
        v_uid,
        p_notes
    )
    RETURNING id INTO v_distribution_id;

    INSERT INTO public.tip_distribution_lines (
        distribution_id,
        user_id,
        weekday_hours,
        weekend_hours,
        jornadas_totales,
        jornadas_con_olvido,
        tji_pct,
        penalizacion_pct,
        weekday_hours_effective,
        weekend_hours_effective,
        weekday_amount,
        weekend_amount,
        total_amount,
        weekday_bonus,
        weekend_bonus,
        is_sanctioned
    )
    SELECT
        v_distribution_id,
        (elem->>'id')::uuid,
        COALESCE((elem->>'weekdayHours')::numeric, 0),
        COALESCE((elem->>'weekendHours')::numeric, 0),
        COALESCE((elem->>'jornadasTotales')::int, 0),
        COALESCE((elem->>'jornadasConOlvido')::int, 0),
        COALESCE((elem->>'tjiPct')::numeric, 0),
        COALESCE((elem->>'penalizacionPct')::int, 0),
        COALESCE((elem->>'weekdayHoursEffective')::numeric, 0),
        COALESCE((elem->>'weekendHoursEffective')::numeric, 0),
        COALESCE((elem->>'weekdayAmount')::numeric, 0),
        COALESCE((elem->>'weekendAmount')::numeric, 0),
        COALESCE((elem->>'totalAmount')::numeric, 0),
        CASE
            WHEN COALESCE((elem->>'isSanctioned')::boolean, false) THEN 0
            WHEN COALESCE((elem->>'weekdayAmount')::numeric, 0) + COALESCE((elem->>'weekendAmount')::numeric, 0) > 0
            THEN ROUND(
                COALESCE((elem->>'bonusAmount')::numeric, 0)
                * COALESCE((elem->>'weekdayAmount')::numeric, 0)
                / (
                    COALESCE((elem->>'weekdayAmount')::numeric, 0)
                    + COALESCE((elem->>'weekendAmount')::numeric, 0)
                ),
                2
            )
            ELSE COALESCE((elem->>'bonusAmount')::numeric, 0)
        END,
        CASE
            WHEN COALESCE((elem->>'isSanctioned')::boolean, false) THEN 0
            WHEN COALESCE((elem->>'weekdayAmount')::numeric, 0) + COALESCE((elem->>'weekendAmount')::numeric, 0) > 0
            THEN COALESCE((elem->>'bonusAmount')::numeric, 0)
                - ROUND(
                    COALESCE((elem->>'bonusAmount')::numeric, 0)
                    * COALESCE((elem->>'weekdayAmount')::numeric, 0)
                    / (
                        COALESCE((elem->>'weekdayAmount')::numeric, 0)
                        + COALESCE((elem->>'weekendAmount')::numeric, 0)
                    ),
                    2
                )
            ELSE 0
        END,
        COALESCE((elem->>'isSanctioned')::boolean, false)
    FROM jsonb_array_elements(v_staff) AS elem
    WHERE (elem->>'id') IS NOT NULL;

    RETURN v_distribution_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_tip_distribution(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_tip_distribution(date, date, text) TO authenticated;
