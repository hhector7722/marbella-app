-- Tarifa €/h por semana (overtime_price_snapshot) en calendario /staff/history

CREATE OR REPLACE FUNCTION public.get_monthly_timesheet(p_user_id uuid, p_year integer, p_month integer)
RETURNS jsonb AS $$
DECLARE
    v_start_date date;
    v_end_date date;
    v_result jsonb;
    v_profile record;
    v_eff_contract numeric;
BEGIN
    SELECT contracted_hours_weekly, is_fixed_salary, prefer_stock_hours, hours_balance, overtime_cost_per_hour, role, joining_date
    INTO v_profile
    FROM public.profiles
    WHERE id = p_user_id;

    IF p_month = 8 OR v_profile.role = 'manager' OR v_profile.is_fixed_salary THEN
        v_eff_contract := 0;
    ELSE
        v_eff_contract := COALESCE(v_profile.contracted_hours_weekly, 0);
    END IF;

    v_start_date := date_trunc('week', make_date(p_year, p_month, 1))::date;
    v_end_date := (date_trunc('week', make_date(p_year, p_month, 1) + interval '1 month - 1 day') + interval '6 days')::date;

    WITH RECURSIVE
    calendar_days AS (
        SELECT generate_series(v_start_date, v_end_date, '1 day'::interval)::date AS d_date
    ),
    daily_logs AS (
        SELECT
            cd.d_date,
            date_trunc('week', cd.d_date)::date AS week_start,
            tl.id AS log_id,
            tl.clock_in,
            tl.clock_out,
            COALESCE(tl.total_hours, 0) AS daily_hours,
            tl.event_type
        FROM calendar_days cd
        LEFT JOIN public.time_logs tl
            ON date(tl.clock_in AT TIME ZONE 'Europe/Madrid') = cd.d_date
            AND tl.user_id = p_user_id
    ),
    running_logs AS (
        SELECT
            *,
            SUM(
                CASE
                    WHEN v_profile.joining_date IS NOT NULL AND d_date < v_profile.joining_date THEN 0
                    ELSE daily_hours
                END
            ) OVER (PARTITION BY week_start ORDER BY d_date) AS running_weekly_hours
        FROM daily_logs
    ),
    calculated_days AS (
        SELECT
            *,
            CASE
                WHEN v_profile.joining_date IS NOT NULL AND d_date < v_profile.joining_date THEN daily_hours
                WHEN (running_weekly_hours - daily_hours) >= v_eff_contract THEN daily_hours
                WHEN running_weekly_hours > v_eff_contract THEN running_weekly_hours - v_eff_contract
                ELSE 0
            END AS daily_extra_hours
        FROM running_logs
    ),
    aggregated_days AS (
        SELECT
            week_start,
            jsonb_agg(
                jsonb_build_object(
                    'date', d_date,
                    'dayName', CASE extract(isodow FROM d_date)
                                  WHEN 1 THEN 'LUN' WHEN 2 THEN 'MAR' WHEN 3 THEN 'MIE'
                                  WHEN 4 THEN 'JUE' WHEN 5 THEN 'VIE' WHEN 6 THEN 'SAB' WHEN 7 THEN 'DOM' END,
                    'dayNumber', extract(day FROM d_date),
                    'hasLog', log_id IS NOT NULL,
                    'clockIn', to_char(clock_in AT TIME ZONE 'Europe/Madrid', 'HH24:MI'),
                    'clockOut', to_char(clock_out AT TIME ZONE 'Europe/Madrid', 'HH24:MI'),
                    'totalHours', daily_hours,
                    'extraHours', daily_extra_hours,
                    'eventType', COALESCE(event_type, 'regular'),
                    'isToday', d_date = current_date
                ) ORDER BY d_date
            ) AS days_json,
            SUM(daily_hours) AS week_total_hours
        FROM calculated_days
        GROUP BY week_start
    ),
    weekly_data AS (
        SELECT
            ad.week_start,
            extract(week FROM ad.week_start) AS week_number,
            ad.days_json,
            ad.week_total_hours,
            ws.total_hours AS snap_total,
            ws.pending_balance AS snap_start_balance,
            ws.balance_hours AS snap_balance,
            ws.final_balance AS snap_final_balance,
            ws.is_paid,
            ws.contracted_hours_snapshot AS snap_contract,
            ws.overtime_price_snapshot AS snap_hourly_rate,
            COALESCE(ws.prefer_stock_hours_override, v_profile.prefer_stock_hours, false) AS snap_prefer_stock,
            COALESCE(ws.overtime_price_snapshot, v_profile.overtime_cost_per_hour, 0) AS effective_hourly_rate
        FROM aggregated_days ad
        LEFT JOIN public.weekly_snapshots ws
            ON ws.week_start = ad.week_start
            AND ws.user_id = p_user_id
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'weekNumber', week_number,
            'startDate', week_start,
            'isCurrentWeek', week_start = date_trunc('week', current_date)::date,
            'days', days_json,
            'summary', jsonb_build_object(
                'totalHours', COALESCE(snap_total, week_total_hours),
                'startBalance', COALESCE(snap_start_balance, 0),
                'weeklyBalance', COALESCE(snap_balance, week_total_hours - v_eff_contract),
                'finalBalance', COALESCE(snap_final_balance, 0),
                'estimatedValue', CASE
                    WHEN snap_prefer_stock THEN 0
                    ELSE GREATEST(0, COALESCE(snap_final_balance, 0)) * effective_hourly_rate
                END,
                'isPaid', COALESCE(is_paid, false),
                'preferStock', snap_prefer_stock,
                'limitHours', COALESCE(snap_contract, v_eff_contract),
                'hourlyRate', effective_hourly_rate
            )
        ) ORDER BY week_start
    ) INTO v_result
    FROM weekly_data;

    RETURN COALESCE(v_result, '[]');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_monthly_timesheet(uuid, integer, integer) IS
  'Calendario mensual /staff/history. hourlyRate = COALESCE(overtime_price_snapshot, profiles.overtime_cost_per_hour).';
