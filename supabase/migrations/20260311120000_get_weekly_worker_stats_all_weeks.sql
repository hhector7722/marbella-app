-- =================================================================
-- FIX: get_weekly_worker_stats devuelve TODAS las semanas del rango
-- Antes solo devolvía semanas con al menos un fichaje en time_logs,
-- por eso "desaparecían" semanas en el calendario de Horas Extras.
-- Ahora incluye todas las semanas (staff vacío y totales 0 si no hay datos).
-- =================================================================

CREATE OR REPLACE FUNCTION public.get_weekly_worker_stats(
    p_start_date date,
    p_end_date date,
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_result jsonb;
BEGIN
    WITH weeks_in_range AS (
        SELECT DISTINCT date_trunc('week', d::timestamp)::date AS week_start
        FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS d
    ),
    weekly_user_logs AS (
        SELECT 
            date_trunc('week', clock_in AT TIME ZONE 'Europe/Madrid')::date AS week_start,
            user_id,
            SUM(public.fn_round_marbella_hours(total_hours)) AS week_logs_sum
        FROM public.time_logs
        WHERE date_trunc('week', clock_in AT TIME ZONE 'Europe/Madrid')::date IN (SELECT week_start FROM weeks_in_range)
          AND total_hours IS NOT NULL
          AND (p_user_id IS NULL OR user_id = p_user_id)
        GROUP BY 1, 2
    ),
    staff_stats AS (
        SELECT 
            wl.week_start,
            p.id as user_id,
            p.first_name || ' ' || COALESCE(p.last_name, '') as name,
            p.role,
            p.overtime_cost_per_hour as over_price,
            COALESCE(s.prefer_stock_hours_override, p.prefer_stock_hours, false) as prefer_stock,
            COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0) as limit_hours,
            wl.week_logs_sum,
            COALESCE(s.is_paid, false) as is_paid,
            CASE 
                WHEN extract(month from wl.week_start) = 8 OR p.role = 'manager' OR p.is_fixed_salary = true 
                THEN wl.week_logs_sum 
                ELSE (wl.week_logs_sum - COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0))
            END as weekly_balance,
            COALESCE(s.pending_balance, 0) as pending_balance,
            COALESCE(s.final_balance, 0) as final_balance
        FROM weekly_user_logs wl
        JOIN public.profiles p ON wl.user_id = p.id
        LEFT JOIN public.weekly_snapshots s ON wl.user_id = s.user_id AND wl.week_start = s.week_start
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
                    'regularHours', CASE WHEN role = 'manager' THEN limit_hours ELSE (week_logs_sum - CASE WHEN final_balance > 0 THEN final_balance ELSE 0 END) END,
                    'overtimeHours', CASE WHEN final_balance > 0 THEN final_balance ELSE 0 END,
                    'totalCost', CASE WHEN final_balance > 0 AND NOT prefer_stock THEN (final_balance * over_price) ELSE 0 END,
                    'regularCost', 0,
                    'overtimeCost', CASE WHEN final_balance > 0 AND NOT prefer_stock THEN (final_balance * over_price) ELSE 0 END,
                    'isPaid', is_paid,
                    'preferStock', prefer_stock
                ) ORDER BY (CASE WHEN final_balance > 0 AND NOT prefer_stock THEN (final_balance * over_price) ELSE 0 END) DESC
            ) as staff_list,
            SUM(CASE WHEN final_balance > 0 AND NOT prefer_stock THEN (final_balance * over_price) ELSE 0 END) as week_overtime_cost,
            SUM(CASE WHEN role = 'manager' THEN (limit_hours + week_logs_sum) ELSE week_logs_sum END) as week_total_hours
        FROM staff_stats
        GROUP BY week_start
    ),
    all_weeks_with_data AS (
        SELECT 
            w.week_start,
            COALESCE(f.staff_list, '[]'::jsonb) AS staff_list,
            COALESCE(f.week_overtime_cost, 0) AS week_overtime_cost,
            COALESCE(f.week_total_hours, 0) AS week_total_hours
        FROM weeks_in_range w
        LEFT JOIN formatted_staff f ON w.week_start = f.week_start
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
                ) ORDER BY week_start DESC
            ) as weeks
        FROM all_weeks_with_data
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
