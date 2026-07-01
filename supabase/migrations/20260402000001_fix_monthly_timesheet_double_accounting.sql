-- =================================================================
-- FIX: get_monthly_timesheet (Final - Double Accounting & Deuda Handling)
-- 1. Devuelve preferStock y limitHours reales.
-- 2. Asegura que estimatedValue sea 0 si la semana es Bolsa.
-- 3. Asegura que estimatedValue sea 0 si el saldo es negativo (deuda).
-- =================================================================

CREATE OR REPLACE FUNCTION public.get_monthly_timesheet(p_user_id uuid, p_year integer, p_month integer)
RETURNS jsonb AS $$
DECLARE
    v_start_date DATE;
    v_end_date DATE;
    v_result JSONB;
    v_profile RECORD;
    v_eff_contract NUMERIC;
BEGIN
    -- 1. Obtener perfil
    SELECT contracted_hours_weekly, is_fixed_salary, prefer_stock_hours, hours_balance, overtime_cost_per_hour, role
    INTO v_profile
    FROM public.profiles
    WHERE id = p_user_id;

    -- 2. Calcular contrato efectivo (Regla base)
    IF p_month = 8 OR v_profile.role = 'manager' OR v_profile.is_fixed_salary THEN
        v_eff_contract := 0;
    ELSE
        v_eff_contract := COALESCE(v_profile.contracted_hours_weekly, 0);
    END IF;

    -- 3. Límites del calendario
    v_start_date := DATE_TRUNC('week', MAKE_DATE(p_year, p_month, 1))::DATE;
    v_end_date := (DATE_TRUNC('week', MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month - 1 day') + INTERVAL '6 days')::DATE;

    WITH RECURSIVE
    calendar_days AS (
        SELECT generate_series(v_start_date, v_end_date, '1 day'::interval)::date AS d_date
    ),
    daily_logs AS (
        SELECT
            cd.d_date,
            DATE_TRUNC('week', cd.d_date)::date AS week_start,
            tl.id AS log_id,
            tl.clock_in,
            tl.clock_out,
            COALESCE(tl.total_hours, 0) AS daily_hours,
            tl.event_type
        FROM calendar_days cd
        LEFT JOIN public.time_logs tl 
            ON DATE(tl.clock_in AT TIME ZONE 'Europe/Madrid') = cd.d_date 
            AND tl.user_id = p_user_id
    ),
    running_logs AS (
        SELECT 
            *,
            SUM(daily_hours) OVER (PARTITION BY week_start ORDER BY d_date) AS running_weekly_hours
        FROM daily_logs
    ),
    calculated_days AS (
        SELECT 
            *,
            CASE 
                WHEN (running_weekly_hours - daily_hours) >= v_eff_contract THEN daily_hours
                WHEN running_weekly_hours > v_eff_contract THEN running_weekly_hours - v_eff_contract
                ELSE 0
            END AS daily_extra_hours
        FROM running_logs
    ),
    aggregated_days AS (
        SELECT
            week_start,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'date', d_date,
                    'dayName', CASE EXTRACT(ISODOW FROM d_date)
                                  WHEN 1 THEN 'LUN' WHEN 2 THEN 'MAR' WHEN 3 THEN 'MIE'
                                  WHEN 4 THEN 'JUE' WHEN 5 THEN 'VIE' WHEN 6 THEN 'SAB' WHEN 7 THEN 'DOM' END,
                    'dayNumber', EXTRACT(DAY FROM d_date),
                    'hasLog', log_id IS NOT NULL,
                    'clockIn', TO_CHAR(clock_in AT TIME ZONE 'Europe/Madrid', 'HH24:MI'),
                    'clockOut', TO_CHAR(clock_out AT TIME ZONE 'Europe/Madrid', 'HH24:MI'),
                    'totalHours', daily_hours,
                    'extraHours', daily_extra_hours,
                    'eventType', COALESCE(event_type, 'regular'),
                    'isToday', d_date = CURRENT_DATE
                ) ORDER BY d_date
            ) AS days_json,
            SUM(daily_hours) AS week_total_hours
        FROM calculated_days
        GROUP BY week_start
    ),
    weekly_data AS (
        SELECT
            ad.week_start,
            EXTRACT(WEEK FROM ad.week_start) AS week_number,
            ad.days_json,
            ad.week_total_hours,
            ws.total_hours AS snap_total,
            ws.pending_balance AS snap_start_balance,
            ws.balance_hours AS snap_balance,
            ws.final_balance AS snap_final_balance,
            ws.is_paid,
            ws.contracted_hours_snapshot as snap_contract,
            COALESCE(ws.prefer_stock_hours_override, v_profile.prefer_stock_hours, false) as snap_prefer_stock
        FROM aggregated_days ad
        LEFT JOIN public.weekly_snapshots ws 
            ON ws.week_start = ad.week_start 
            AND ws.user_id = p_user_id
    )
    SELECT JSONB_AGG(
        JSONB_BUILD_OBJECT(
            'weekNumber', week_number,
            'startDate', week_start,
            'isCurrentWeek', week_start = DATE_TRUNC('week', CURRENT_DATE)::date,
            'days', days_json,
            'summary', JSONB_BUILD_OBJECT(
                'totalHours', COALESCE(snap_total, week_total_hours),
                'startBalance', COALESCE(snap_start_balance, 0), -- Se calcula en la propagación
                'weeklyBalance', COALESCE(snap_balance, week_total_hours - v_eff_contract),
                'finalBalance', COALESCE(snap_final_balance, 0),
                -- FIX: Solo calcula importe si NO es Bolsa y saldo es POSITIVO
                'estimatedValue', CASE 
                    WHEN snap_prefer_stock THEN 0 
                    ELSE GREATEST(0, COALESCE(snap_final_balance, 0)) * COALESCE(v_profile.overtime_cost_per_hour, 0) 
                END,
                'isPaid', COALESCE(is_paid, false),
                'preferStock', snap_prefer_stock,
                'limitHours', COALESCE(snap_contract, v_eff_contract)
            )
        ) ORDER BY week_start
    ) INTO v_result
    FROM weekly_data;

    RETURN COALESCE(v_result, '[]');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
