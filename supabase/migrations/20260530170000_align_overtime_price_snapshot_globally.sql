-- Alineación global: weekly_snapshots.overtime_price_snapshot → overtime, labor, insights, recalc

-- -----------------------------------------------------------------------------
-- Helper SSOT: tarifa €/h extra efectiva para una fecha (semana ISO lunes)
-- Prioridad: snapshot semanal > término laboral vigente > perfil > 0
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_worker_effective_overtime_rate(p_user_id uuid, p_on_date date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT s.overtime_price_snapshot
      FROM public.weekly_snapshots s
      WHERE s.user_id = p_user_id
        AND s.week_start = date_trunc('week', p_on_date::timestamp)::date
    ),
    (SELECT tv.overtime_cost_per_hour FROM public.fn_labor_term_values(p_user_id, p_on_date) tv),
    (SELECT p.overtime_cost_per_hour FROM public.profiles p WHERE p.id = p_user_id),
    0::numeric
  );
$$;

COMMENT ON FUNCTION public.fn_worker_effective_overtime_rate(uuid, date) IS
  'Tarifa €/h extras: COALESCE(weekly_snapshots.overtime_price_snapshot, fn_labor_term_values, profiles.overtime_cost_per_hour).';

GRANT EXECUTE ON FUNCTION public.fn_worker_effective_overtime_rate(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_worker_effective_overtime_rate(uuid, date) TO service_role;

-- -----------------------------------------------------------------------------
-- get_weekly_worker_stats: importes con tarifa semanal
-- -----------------------------------------------------------------------------
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
            public.fn_worker_effective_overtime_rate(p.id, wu.week_start) as over_price,
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
                    'pendingBalance', start_balance,
                    'hourlyRate', over_price
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
  'Stats semanales; totalCost usa fn_worker_effective_overtime_rate (snapshot semanal).';

-- -----------------------------------------------------------------------------
-- get_monthly_timesheet: misma tarifa efectiva
-- -----------------------------------------------------------------------------
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
            COALESCE(ws.prefer_stock_hours_override, v_profile.prefer_stock_hours, false) AS snap_prefer_stock,
            public.fn_worker_effective_overtime_rate(p_user_id, ad.week_start) AS effective_hourly_rate
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

-- -----------------------------------------------------------------------------
-- Labor: fichajes event_type overtime × tarifa efectiva
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_labor_overtime_allocated_day(p_user_id uuid, p_date date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_join date;
    v_h numeric;
    v_price numeric;
BEGIN
    SELECT COALESCE(p.joining_date, DATE '2000-01-01')
    INTO v_join
    FROM public.profiles p
    WHERE p.id = p_user_id;

    IF v_join IS NULL OR p_date < v_join THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(SUM(public.fn_round_marbella_hours(tl.total_hours)), 0)
    INTO v_h
    FROM public.time_logs tl
    WHERE tl.user_id = p_user_id
      AND public.get_working_date(tl.clock_in) = p_date
      AND tl.total_hours IS NOT NULL
      AND COALESCE(tl.event_type::text, '') = 'overtime';

    IF v_h <= 0 THEN
        RETURN 0;
    END IF;

    v_price := public.fn_worker_effective_overtime_rate(p_user_id, p_date);

    RETURN round(v_h * COALESCE(v_price, 0), 2);
END;
$$;

COMMENT ON FUNCTION public.fn_labor_overtime_allocated_day(uuid, date) IS
  'Coste extra del día (event_type overtime): horas × fn_worker_effective_overtime_rate.';

-- -----------------------------------------------------------------------------
-- Insights: tarifa extra alineada
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_worker_hourly_rate(
  p_user_id uuid,
  p_on_date date,
  p_event_type text DEFAULT 'regular'
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    CASE
      WHEN COALESCE(p_event_type, 'regular') = 'overtime' THEN
        public.fn_worker_effective_overtime_rate(p_user_id, p_on_date)
      ELSE
        public.fn_labor_effective_ordinary_rate(p_user_id, p_on_date)
    END,
    10.00
  );
$$;

COMMENT ON FUNCTION public.fn_worker_hourly_rate(uuid, date, text) IS
  'Tarifa horaria: ordinaria (fn_labor_effective_ordinary_rate) o extra (fn_worker_effective_overtime_rate).';

-- -----------------------------------------------------------------------------
-- Prorrateo ventas / M.O.: peso horas overtime con tarifa efectiva
-- -----------------------------------------------------------------------------
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
            public.fn_worker_effective_overtime_rate(b.user_id, p_date) AS effective_overtime_rate,
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
                        WHEN c.is_overtime THEN c.h * COALESCE(c.effective_overtime_rate, 0)
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

-- -----------------------------------------------------------------------------
-- fn_recalc: persistir total_cost con tarifa efectiva (no tocar overtime_price_snapshot)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_recalc_and_propagate_snapshots(p_user_id uuid, p_start_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_week date;
  v_last_week date;
  v_end_date date;

  v_logs_sum numeric;
  v_logs_prejoin numeric;
  v_logs_postjoin numeric;
  v_total_hours_week numeric;
  v_weekly_balance numeric;
  v_pending_balance numeric := 0;
  v_final_balance numeric;
  v_total_cost numeric := 0;

  v_current_contracted_hours numeric;
  v_profile_overtime_price numeric;
  v_profile_prefer_stock boolean;
  v_is_fixed_salary boolean;
  v_role text;
  v_joining_date date;

  v_snapshot_contracted_hours numeric;
  v_snapshot_prefer_override boolean;
  v_is_paid_current boolean;
  v_effective_prefer_stock boolean;
  v_over_price numeric;

  v_prev_final_balance numeric;
  v_prev_is_paid boolean;
  v_prev_prefer_override boolean;
  v_prev_prefer_stock boolean;

  v_first_clock_in date;
BEGIN
  SELECT contracted_hours_weekly, prefer_stock_hours, is_fixed_salary, role, joining_date, overtime_cost_per_hour
  INTO v_current_contracted_hours, v_profile_prefer_stock, v_is_fixed_salary, v_role, v_joining_date, v_profile_overtime_price
  FROM public.profiles
  WHERE id = p_user_id;

  v_current_contracted_hours := coalesce(v_current_contracted_hours, 0);
  v_profile_prefer_stock := coalesce(v_profile_prefer_stock, false);
  v_profile_overtime_price := coalesce(v_profile_overtime_price, 0);
  v_role := coalesce(v_role, 'staff');

  SELECT min(clock_in::date)
  INTO v_first_clock_in
  FROM public.time_logs
  WHERE user_id = p_user_id;

  IF v_first_clock_in IS NULL THEN
    RETURN;
  END IF;

  v_current_week := public.get_iso_week_start(greatest(p_start_date, v_first_clock_in));
  v_end_date := public.get_iso_week_start(current_date) + 7;

  DELETE FROM public.weekly_snapshots
  WHERE user_id = p_user_id
    AND week_start < public.get_iso_week_start(v_first_clock_in);

  WHILE v_current_week <= v_end_date LOOP
    SELECT coalesce(sum(public.fn_round_marbella_hours(total_hours)), 0)
    INTO v_logs_sum
    FROM public.time_logs
    WHERE user_id = p_user_id
      AND (clock_in AT TIME ZONE 'Europe/Madrid')::date >= v_current_week
      AND (clock_in AT TIME ZONE 'Europe/Madrid')::date < (v_current_week + 7);

    SELECT contracted_hours_snapshot, is_paid, prefer_stock_hours_override
    INTO v_snapshot_contracted_hours, v_is_paid_current, v_snapshot_prefer_override
    FROM public.weekly_snapshots
    WHERE user_id = p_user_id AND week_start = v_current_week;

    v_snapshot_contracted_hours := coalesce(v_snapshot_contracted_hours, v_current_contracted_hours);
    v_is_paid_current := coalesce(v_is_paid_current, false);

    IF v_joining_date IS NULL THEN
      v_logs_prejoin := 0;
      v_logs_postjoin := v_logs_sum;
    ELSIF v_joining_date <= v_current_week THEN
      v_logs_prejoin := 0;
      v_logs_postjoin := v_logs_sum;
    ELSIF v_joining_date > (v_current_week + 6) THEN
      v_logs_prejoin := v_logs_sum;
      v_logs_postjoin := 0;
    ELSE
      SELECT
        coalesce(sum(public.fn_round_marbella_hours(total_hours)) FILTER (WHERE (clock_in AT TIME ZONE 'Europe/Madrid')::date < v_joining_date), 0),
        coalesce(sum(public.fn_round_marbella_hours(total_hours)) FILTER (WHERE (clock_in AT TIME ZONE 'Europe/Madrid')::date >= v_joining_date), 0)
      INTO v_logs_prejoin, v_logs_postjoin
      FROM public.time_logs
      WHERE user_id = p_user_id
        AND (clock_in AT TIME ZONE 'Europe/Madrid')::date >= v_current_week
        AND (clock_in AT TIME ZONE 'Europe/Madrid')::date < (v_current_week + 7);
    END IF;

    IF extract(month FROM v_current_week) = 8 THEN
      v_total_hours_week := v_logs_sum;
      v_weekly_balance := v_logs_sum;
    ELSIF v_role = 'manager' OR coalesce(v_is_fixed_salary, false) THEN
      v_total_hours_week := 40 + v_logs_sum;
      v_weekly_balance := v_logs_sum;
    ELSE
      v_total_hours_week := v_logs_sum;
      v_weekly_balance := v_logs_prejoin + (v_logs_postjoin - v_snapshot_contracted_hours);
    END IF;

    v_last_week := v_current_week - 7;
    SELECT final_balance, is_paid, prefer_stock_hours_override
    INTO v_prev_final_balance, v_prev_is_paid, v_prev_prefer_override
    FROM public.weekly_snapshots
    WHERE user_id = p_user_id AND week_start = v_last_week;

    v_prev_prefer_stock := coalesce(v_prev_prefer_override, v_profile_prefer_stock);
    v_pending_balance := 0;
    IF v_prev_final_balance IS NOT NULL THEN
      IF v_prev_final_balance > 0 THEN
        IF v_prev_prefer_stock AND NOT coalesce(v_prev_is_paid, false) THEN
          v_pending_balance := v_prev_final_balance;
        ELSE
          v_pending_balance := 0;
        END IF;
      ELSE
        v_pending_balance := v_prev_final_balance;
      END IF;
    END IF;

    v_final_balance := v_pending_balance + v_weekly_balance;
    v_effective_prefer_stock := coalesce(v_snapshot_prefer_override, v_profile_prefer_stock, false);
    v_over_price := public.fn_worker_effective_overtime_rate(p_user_id, v_current_week);
    v_total_cost := CASE
      WHEN v_final_balance > 0 AND NOT v_effective_prefer_stock THEN greatest(0, v_final_balance) * coalesce(v_over_price, 0)
      ELSE 0
    END;

    INSERT INTO public.weekly_snapshots (
      user_id, week_start, week_end,
      total_hours, balance_hours, pending_balance, final_balance,
      contracted_hours_snapshot, is_paid, prefer_stock_hours_override,
      total_cost
    ) VALUES (
      p_user_id, v_current_week, (v_current_week + 6),
      v_total_hours_week, v_weekly_balance, v_pending_balance, v_final_balance,
      v_snapshot_contracted_hours, v_is_paid_current, v_snapshot_prefer_override,
      v_total_cost
    )
    ON CONFLICT (user_id, week_start) DO UPDATE SET
      total_hours = EXCLUDED.total_hours,
      balance_hours = EXCLUDED.balance_hours,
      pending_balance = EXCLUDED.pending_balance,
      final_balance = EXCLUDED.final_balance,
      week_end = EXCLUDED.week_end,
      is_paid = EXCLUDED.is_paid,
      contracted_hours_snapshot = EXCLUDED.contracted_hours_snapshot,
      prefer_stock_hours_override = EXCLUDED.prefer_stock_hours_override,
      total_cost = EXCLUDED.total_cost;

    v_current_week := v_current_week + 7;
  END LOOP;

  SELECT ws.final_balance,
         coalesce(ws.prefer_stock_hours_override, p.prefer_stock_hours, false),
         coalesce(ws.is_paid, false)
  INTO v_final_balance, v_prev_prefer_stock, v_prev_is_paid
  FROM public.weekly_snapshots ws
  JOIN public.profiles p ON p.id = p_user_id
  WHERE ws.user_id = p_user_id
    AND ws.week_start = public.get_iso_week_start(current_date - 6);

  IF v_final_balance IS NOT NULL THEN
    IF (NOT v_prev_prefer_stock OR v_prev_is_paid) AND v_final_balance > 0 THEN
      v_final_balance := 0;
    END IF;
    UPDATE public.profiles SET hours_balance = v_final_balance WHERE id = p_user_id;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
