-- =================================================================
-- RPC: get_weekly_worker_stats (V3 Final - UTC Fixed)
-- Centraliza la agregación de horas, redondeo y cálculo de costes.
-- Soporta filtrado por usuario en origen para máxima eficiencia.
-- FIX: Fuerza la evaluación de fechas en UTC para evitar saltos de semana.
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
    -- 1. CTE para agrupar logs por semana y usuario con redondeo CENTRALIZADO
    -- FIX CRÍTICO: Se evalúa clock_in en UTC antes del casteo a ::date
    WITH weekly_user_logs AS (
        SELECT 
            date_trunc('week', clock_in AT TIME ZONE 'UTC')::date as week_start,
            user_id,
            SUM(public.fn_round_marbella_hours(total_hours)) as week_logs_sum
        FROM public.time_logs
        WHERE (clock_in AT TIME ZONE 'UTC')::date >= p_start_date 
          AND (clock_in AT TIME ZONE 'UTC')::date <= p_end_date
          AND total_hours IS NOT NULL
          AND (p_user_id IS NULL OR user_id = p_user_id)
        GROUP BY 1, 2
    ),
    -- 2. CTE para unir con perfiles y snapshots
    staff_stats AS (
        SELECT 
            wl.week_start,
            p.id as user_id,
            p.first_name || ' ' || COALESCE(p.last_name, '') as name,
            p.role,
            p.overtime_cost_per_hour as over_price,
            p.prefer_stock_hours as prefer_stock,
            COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0) as limit_hours,
            wl.week_logs_sum,
            COALESCE(s.is_paid, false) as is_paid,
            -- Lógica de Balance Semanal (Espejo de fn_recalc_and_propagate_snapshots)
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
    -- 3. Formatear desglose por trabajador (StaffWeeklyStats)
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
    -- 4. Formatear cada semana (WeeklyStats)
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
