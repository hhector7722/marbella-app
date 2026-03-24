-- ==============================================================================
-- tip_pool_sanctions
-- Manager can mark an employee as sanctioned (Sin propina)
-- The sanctioned employee shows 0 effective hours for the pool, but the UI
-- wants to display what they *would* have gotten, crossed out.
-- Their money is distributed EQUALLY among the remaining non-sanctioned staff.
-- ==============================================================================

-- 1. Modify the table to add is_sanctioned
ALTER TABLE public.tip_pool_overrides ADD COLUMN IF NOT EXISTS is_sanctioned boolean NOT NULL DEFAULT false;

-- 2. Modify the upsert RPC to accept is_sanctioned
CREATE OR REPLACE FUNCTION public.upsert_tip_override(
    p_pool_id uuid,
    p_user_id uuid,
    p_override_hours numeric DEFAULT NULL,
    p_override_amount numeric DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_is_sanctioned boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.tip_pool_overrides (
        pool_id, 
        user_id, 
        override_hours, 
        override_amount, 
        notes,
        is_sanctioned
    )
    VALUES (
        p_pool_id, 
        p_user_id, 
        p_override_hours, 
        p_override_amount, 
        p_notes,
        p_is_sanctioned
    )
    ON CONFLICT (pool_id, user_id) 
    DO UPDATE SET 
        override_hours = EXCLUDED.override_hours,
        override_amount = EXCLUDED.override_amount,
        notes = EXCLUDED.notes,
        is_sanctioned = EXCLUDED.is_sanctioned,
        updated_at = now();
END;
$$;


-- 3. Modify get_tip_pool_preview
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
        WHERE role IN ('staff', 'manager', 'supervisor')
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
            COALESCE(owd.override_hours, h.weekday_hours_raw) AS weekday_hours,
            COALESCE(owe.override_hours, h.weekend_hours_raw) AS weekend_hours,
            h.weekday_hours_raw,
            h.weekend_hours_raw,
            owd.override_amount AS weekday_amount_override,
            owe.override_amount AS weekend_amount_override,
            COALESCE(owd.is_sanctioned, owe.is_sanctioned, false) AS is_sanctioned
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
    pool_values AS (
        SELECT
            COALESCE((SELECT cash_total FROM pool_weekday), 0) AS weekday_cash_total,
            COALESCE((SELECT cash_total FROM pool_weekend), 0) AS weekend_cash_total,
            (SELECT total_weekday_hours FROM totals) AS total_weekday_hours,
            (SELECT total_weekend_hours FROM totals) AS total_weekend_hours
    ),
    -- -------------------------
    -- WEEKDAY: asignación por céntimos
    -- -------------------------
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
    -- -------------------------
    -- WEEKEND: asignación por céntimos
    -- -------------------------
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
    -- FINAL STAFF BEFORE SANCTIONS
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
    -- -------------------------
    -- SANCTION REDISTRIBUTION
    -- -------------------------
    sanction_pool AS (
        SELECT
            COALESCE(SUM(total_amount), 0) AS total_sanctioned_amount,
            (SELECT COUNT(*) FROM final_staff_pre_sanction WHERE is_sanctioned = false AND (weekday_hours + weekend_hours) > 0) AS eligible_count
        FROM final_staff_pre_sanction 
        WHERE is_sanctioned = true
    ),
    -- Repartir la bolsa a céntimos exactos para los no sancionados
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
            f.total_amount + COALESCE(sa.bonus_amount, 0::numeric) AS final_total_amount
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
                    'weekdayAmount', weekday_amount,
                    'weekendAmount', weekend_amount,
                    'totalAmount', final_total_amount,
                    'isSanctioned', is_sanctioned,
                    'bonusAmount', redistribution_bonus,
                    'hasOverrides', (
                        weekday_amount_override IS NOT NULL
                        OR weekend_amount_override IS NOT NULL
                        OR weekday_hours <> weekday_hours_raw
                        OR weekend_hours <> weekend_hours_raw
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
