-- Sustituye la firma de 3 argumentos por una de 4 (4.º con default) para no duplicar overloads.
DROP FUNCTION IF EXISTS public.get_weekly_worker_stats(date, date, uuid);

-- =================================================================
-- Horas extras: no listar semanas que aún no han cerrado (lun–dom, Europe/Madrid).
-- La semana cuenta como cerrada cuando el domingo (lunes+6) es estrictamente
-- anterior al día actual en Madrid (misma regla que el dashboard principal).
-- p_only_completed_weeks = false conserva el comportamiento para fichajes / staff.
-- =================================================================

CREATE OR REPLACE FUNCTION public.get_weekly_worker_stats(
    p_start_date date,
    p_end_date date,
    p_user_id uuid DEFAULT NULL,
    p_only_completed_weeks boolean DEFAULT false
)
RETURNS jsonb AS $$
DECLARE
    v_result jsonb;
    v_today_madrid date;
BEGIN
    v_today_madrid := (current_timestamp AT TIME ZONE 'Europe/Madrid')::date;

    WITH weeks_in_range AS (
        SELECT DISTINCT date_trunc('week', d::timestamp)::date AS week_start
        FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS d
    ),
    weeks_in_range_filtered AS (
        SELECT w.week_start
        FROM weeks_in_range w
        WHERE NOT p_only_completed_weeks
           OR (w.week_start + interval '6 days')::date < v_today_madrid
    ),
    weekly_user_logs AS (
        SELECT
            date_trunc('week', clock_in AT TIME ZONE 'Europe/Madrid')::date AS week_start,
            user_id,
            SUM(public.fn_round_marbella_hours(total_hours)) AS week_logs_sum
        FROM public.time_logs
        WHERE date_trunc('week', clock_in AT TIME ZONE 'Europe/Madrid')::date IN (SELECT week_start FROM weeks_in_range_filtered)
          AND total_hours IS NOT NULL
          AND (p_user_id IS NULL OR user_id = p_user_id)
        GROUP BY 1, 2
    ),
    weeks_with_snapshots AS (
        SELECT DISTINCT s.week_start, s.user_id
        FROM public.weekly_snapshots s
        WHERE s.week_start IN (SELECT week_start FROM weeks_in_range_filtered)
          AND (p_user_id IS NULL OR s.user_id = p_user_id)
          AND NOT EXISTS (
              SELECT 1
              FROM weekly_user_logs wl
              WHERE wl.week_start = s.week_start AND wl.user_id = s.user_id
          )
    ),
    all_week_users AS (
        SELECT week_start, user_id, week_logs_sum FROM weekly_user_logs
        UNION ALL
        SELECT week_start, user_id, 0 FROM weeks_with_snapshots
    ),
    staff_stats AS (
        SELECT
            wu.week_start,
            p.id as user_id,
            p.first_name || ' ' || COALESCE(p.last_name, '') as name,
            p.role,
            p.overtime_cost_per_hour as over_price,
            COALESCE(s.prefer_stock_hours_override, p.prefer_stock_hours, false) as prefer_stock,
            COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0) as limit_hours,
            wu.week_logs_sum,
            COALESCE(s.is_paid, false) as is_paid,
            COALESCE(s.pending_balance, 0) as start_balance,
            COALESCE(
                s.balance_hours,
                CASE
                    WHEN extract(month from wu.week_start) = 8 OR p.role = 'manager' OR p.is_fixed_salary = true
                    THEN wu.week_logs_sum
                    ELSE (wu.week_logs_sum - COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0))
                END
            ) as weekly_balance,
            COALESCE(
                s.final_balance,
                CASE
                    WHEN extract(month from wu.week_start) = 8 OR p.role = 'manager' OR p.is_fixed_salary = true
                    THEN wu.week_logs_sum
                    ELSE (wu.week_logs_sum - COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0))
                END
            ) as final_balance
        FROM all_week_users wu
        JOIN public.profiles p ON wu.user_id = p.id
        LEFT JOIN public.weekly_snapshots s ON wu.user_id = s.user_id AND wu.week_start = s.week_start
    ),
    formatted_staff AS (
        SELECT
            week_start,
            jsonb_agg(
                jsonb_build_object(
                    'id', user_id,
                    'name', name,
                    'role', role,
                    'totalHours', CASE WHEN role = 'manager' THEN (limit_hours + week_logs_sum) ELSE week_logs_sum END,
                    'regularHours', CASE WHEN role = 'manager' THEN limit_hours ELSE GREATEST(week_logs_sum - GREATEST(final_balance, 0), 0) END,
                    'overtimeHours', GREATEST(final_balance, 0),
                    'startBalance', start_balance,
                    'weeklyBalance', weekly_balance,
                    'finalBalance', final_balance,
                    'totalCost', CASE WHEN final_balance > 0 AND NOT prefer_stock THEN (final_balance * over_price) ELSE 0 END,
                    'regularCost', 0,
                    'overtimeCost', CASE WHEN final_balance > 0 AND NOT prefer_stock THEN (final_balance * over_price) ELSE 0 END,
                    'isPaid', is_paid,
                    'preferStock', prefer_stock,
                    'pendingBalance', start_balance
                )
                ORDER BY (CASE WHEN final_balance > 0 AND NOT prefer_stock THEN (final_balance * over_price) ELSE 0 END) DESC
            ) as staff_list,
            SUM(CASE WHEN final_balance > 0 AND NOT prefer_stock THEN (final_balance * over_price) ELSE 0 END) as week_overtime_cost,
            SUM(CASE WHEN role = 'manager' THEN (limit_hours + week_logs_sum) ELSE week_logs_sum END) as week_total_hours
        FROM staff_stats
        GROUP BY week_start
    ),
    weeks_array AS (
        SELECT
            jsonb_agg(
                jsonb_build_object(
                    'weekId', week_start::text,
                    'label', 'Semana del ' || to_char(week_start, 'DD "de" TMMonth'),
                    'startDate', week_start::text,
                    'totalAmount', week_overtime_cost,
                    'totalHours', week_total_hours,
                    'staff', staff_list
                )
                ORDER BY week_start DESC
            ) as weeks
        FROM formatted_staff
    )
    SELECT
        jsonb_build_object(
            'weeksResult', COALESCE((SELECT weeks FROM weeks_array), '[]'::jsonb),
            'summary', jsonb_build_object(
                'totalCost', COALESCE((SELECT SUM(week_overtime_cost) FROM formatted_staff), 0),
                'totalHours', COALESCE((SELECT SUM(week_total_hours) FROM formatted_staff), 0),
                'totalOvertimeCost', COALESCE((SELECT SUM(week_overtime_cost) FROM formatted_staff), 0)
            )
        )
    INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.get_weekly_worker_stats(date, date, uuid, boolean) IS
'Stats semanales de horas/extras. Si p_only_completed_weeks=true, excluye semanas cuyo domingo (lunes+6) aún no sea anterior al día actual en Europe/Madrid (vista Horas extras / nómina).';

GRANT EXECUTE ON FUNCTION public.get_weekly_worker_stats(date, date, uuid, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_worker_stats(date, date, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_worker_stats(date, date, uuid, boolean) TO service_role;
