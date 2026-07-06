-- =================================================================
-- FIX: joining_date (incorporación) dentro de la semana
-- - Días anteriores a joining_date: siempre cuentan como "extras"
-- - Límite de contrato semanal: se prorratea por días activos (Mon..Sun) si joining_date cae dentro de la semana
-- Afecta a las 3 fuentes SSOT usadas por la UI:
-- - get_worker_weekly_log_grid (grid semanal en /staff/dashboard)
-- - get_monthly_timesheet (grid mensual en /staff/history y modal semanal)
-- - get_weekly_worker_stats (totales en dashboard y modales)
-- =================================================================

CREATE OR REPLACE FUNCTION public.get_worker_weekly_log_grid(
    p_user_id uuid,
    p_start_date date,
    p_contracted_hours numeric DEFAULT 40
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    i INT;
    v_accumulated NUMERIC := 0;
    v_day_hours NUMERIC;
    v_day_extras NUMERIC;
    v_date DATE;
    v_result JSONB := '[]'::jsonb;
    v_clock_in TEXT;
    v_clock_out TEXT;
    v_has_log BOOLEAN;
    v_joining_date DATE;
    v_week_limit NUMERIC := COALESCE(p_contracted_hours, 0);
    v_active_days INT;
BEGIN
    SELECT p.joining_date
    INTO v_joining_date
    FROM public.profiles p
    WHERE p.id = p_user_id;

    IF v_joining_date IS NOT NULL AND v_week_limit > 0 THEN
        IF v_joining_date <= p_start_date THEN
            v_week_limit := v_week_limit;
        ELSIF v_joining_date > (p_start_date + 6) THEN
            v_week_limit := 0;
        ELSE
            v_active_days := GREATEST(0, 7 - (v_joining_date - p_start_date));
            v_week_limit := v_week_limit * (v_active_days::numeric / 7.0);
        END IF;
    END IF;

    FOR i IN 0..6 LOOP
        v_date := p_start_date + i;

        SELECT
            COALESCE(SUM(public.fn_calculate_rounded_hours(total_hours)), 0),
            MIN(clock_in)::time::text,
            MAX(clock_out)::time::text,
            COUNT(id) > 0
        INTO v_day_hours, v_clock_in, v_clock_out, v_has_log
        FROM public.time_logs
        WHERE user_id = p_user_id
          AND DATE(clock_in AT TIME ZONE 'Europe/Madrid') = v_date;

        v_day_extras := 0;

        IF v_joining_date IS NOT NULL AND v_date < v_joining_date THEN
            v_day_extras := v_day_hours;
        ELSE
            IF (v_accumulated + v_day_hours) > v_week_limit THEN
                IF v_accumulated >= v_week_limit THEN
                    v_day_extras := v_day_hours;
                ELSE
                    v_day_extras := (v_accumulated + v_day_hours) - v_week_limit;
                END IF;
            END IF;
            v_accumulated := v_accumulated + v_day_hours;
        END IF;

        v_result := v_result || jsonb_build_object(
            'date', v_date,
            'hasLog', v_has_log,
            'clockIn', COALESCE(SUBSTRING(v_clock_in FROM 1 FOR 5), ''),
            'clockOut', COALESCE(SUBSTRING(v_clock_out FROM 1 FOR 5), ''),
            'totalHours', v_day_hours,
            'extraHours', v_day_extras
        );
    END LOOP;

    RETURN v_result;
END;
$$;


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
    SELECT contracted_hours_weekly, is_fixed_salary, prefer_stock_hours, hours_balance, overtime_cost_per_hour, role, joining_date
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
    week_limits AS (
        SELECT
            DISTINCT dl.week_start,
            CASE
                WHEN v_eff_contract <= 0 THEN 0
                WHEN v_profile.joining_date IS NULL OR v_profile.joining_date <= dl.week_start THEN v_eff_contract
                WHEN v_profile.joining_date > (dl.week_start + 6) THEN 0
                ELSE v_eff_contract * (GREATEST(0, 7 - (v_profile.joining_date - dl.week_start))::numeric / 7.0)
            END AS limit_hours
        FROM daily_logs dl
    ),
    running_logs AS (
        SELECT
            dl.*,
            wl.limit_hours,
            SUM(
                CASE
                    WHEN v_profile.joining_date IS NOT NULL AND dl.d_date < v_profile.joining_date THEN 0
                    ELSE dl.daily_hours
                END
            ) OVER (PARTITION BY dl.week_start ORDER BY dl.d_date) AS running_weekly_hours
        FROM daily_logs dl
        JOIN week_limits wl ON wl.week_start = dl.week_start
    ),
    calculated_days AS (
        SELECT
            *,
            CASE
                WHEN v_profile.joining_date IS NOT NULL AND d_date < v_profile.joining_date THEN daily_hours
                WHEN (running_weekly_hours - daily_hours) >= limit_hours THEN daily_hours
                WHEN running_weekly_hours > limit_hours THEN running_weekly_hours - limit_hours
                ELSE 0
            END AS daily_extra_hours
        FROM running_logs
    ),
    aggregated_days AS (
        SELECT
            week_start,
            MAX(limit_hours) AS limit_hours,
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
            ad.limit_hours AS computed_limit_hours,
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
                'startBalance', COALESCE(snap_start_balance, 0),
                'weeklyBalance', COALESCE(snap_balance, week_total_hours - COALESCE(snap_contract, computed_limit_hours)),
                'finalBalance', COALESCE(snap_final_balance, 0),
                'estimatedValue', CASE
                    WHEN snap_prefer_stock THEN 0
                    ELSE GREATEST(0, COALESCE(snap_final_balance, 0)) * COALESCE(v_profile.overtime_cost_per_hour, 0)
                END,
                'isPaid', COALESCE(is_paid, false),
                'preferStock', snap_prefer_stock,
                'limitHours', COALESCE(snap_contract, computed_limit_hours)
            )
        ) ORDER BY week_start
    ) INTO v_result
    FROM weekly_data;

    RETURN COALESCE(v_result, '[]');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


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
    weeks_with_snapshots AS (
        SELECT DISTINCT s.week_start, s.user_id
        FROM public.weekly_snapshots s
        WHERE s.week_start IN (SELECT week_start FROM weeks_in_range)
          AND (p_user_id IS NULL OR s.user_id = p_user_id)
          AND NOT EXISTS (SELECT 1 FROM weekly_user_logs wl WHERE wl.week_start = s.week_start AND wl.user_id = s.user_id)
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
            -- base_limit = override semanal (si existe) o contrato del perfil
            COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0) as base_limit_hours,
            -- limit prorrateado por joining_date si cae dentro de la semana
            CASE
                WHEN extract(month from wu.week_start) = 8 OR p.role = 'manager' OR p.is_fixed_salary = true THEN 0
                WHEN COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0) <= 0 THEN 0
                WHEN p.joining_date IS NULL OR p.joining_date <= wu.week_start THEN COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0)
                WHEN p.joining_date > (wu.week_start + 6) THEN 0
                ELSE COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0) * (GREATEST(0, 7 - (p.joining_date - wu.week_start))::numeric / 7.0)
            END as limit_hours,
            wu.week_logs_sum,
            COALESCE(s.is_paid, false) as is_paid,
            COALESCE(s.pending_balance, 0) as start_balance,
            COALESCE(
                s.balance_hours,
                CASE
                    WHEN extract(month from wu.week_start) = 8 OR p.role = 'manager' OR p.is_fixed_salary = true
                    THEN wu.week_logs_sum
                    ELSE (wu.week_logs_sum - (
                        CASE
                            WHEN COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0) <= 0 THEN 0
                            WHEN p.joining_date IS NULL OR p.joining_date <= wu.week_start THEN COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0)
                            WHEN p.joining_date > (wu.week_start + 6) THEN 0
                            ELSE COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0) * (GREATEST(0, 7 - (p.joining_date - wu.week_start))::numeric / 7.0)
                        END
                    ))
                END
            ) as weekly_balance,
            COALESCE(
                s.final_balance,
                CASE
                    WHEN extract(month from wu.week_start) = 8 OR p.role = 'manager' OR p.is_fixed_salary = true
                    THEN wu.week_logs_sum
                    ELSE (wu.week_logs_sum - (
                        CASE
                            WHEN COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0) <= 0 THEN 0
                            WHEN p.joining_date IS NULL OR p.joining_date <= wu.week_start THEN COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0)
                            WHEN p.joining_date > (wu.week_start + 6) THEN 0
                            ELSE COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0) * (GREATEST(0, 7 - (p.joining_date - wu.week_start))::numeric / 7.0)
                        END
                    ))
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
                ) ORDER BY (CASE WHEN final_balance > 0 AND NOT prefer_stock THEN (final_balance * over_price) ELSE 0 END) DESC
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

