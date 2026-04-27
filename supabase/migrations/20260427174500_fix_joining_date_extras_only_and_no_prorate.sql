-- =================================================================
-- FIX: joining_date (incorporación) dentro de la semana — REGLA OPERATIVA CORRECTA
--
-- Regla que se busca:
-- - Días ANTES de joining_date: TODO lo trabajado es EXTRA pagable (no consume contrato).
-- - Desde joining_date en adelante: se aplica el contrato semanal NORMAL (ej. 40h),
--   y solo hay extras si las horas (desde joining_date) superan ese límite.
--
-- Importante:
-- - NO se prorratea el contrato semanal. Se "reinicia" el acumulado a partir de joining_date.
-- - Esto evita inflar extras (y el importe) en la semana de incorporación.
-- =================================================================

begin;

-- ---------------------------------------------------------------
-- 1) Grid semanal (staff dashboard): extras pre-incorporación + acumulado desde joining_date
-- ---------------------------------------------------------------
create or replace function public.get_worker_weekly_log_grid(
    p_user_id uuid,
    p_start_date date,
    p_contracted_hours numeric default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    i int;
    v_accumulated numeric := 0; -- acumulado SOLO desde joining_date
    v_day_hours numeric;
    v_day_extras numeric;
    v_date date;
    v_result jsonb := '[]'::jsonb;
    v_clock_in text;
    v_clock_out text;
    v_has_log boolean;
    v_joining_date date;
    v_week_limit numeric := coalesce(p_contracted_hours, 0);
begin
    select p.joining_date
    into v_joining_date
    from public.profiles p
    where p.id = p_user_id;

    for i in 0..6 loop
        v_date := p_start_date + i;

        select
            coalesce(sum(public.fn_calculate_rounded_hours(total_hours)), 0),
            min(clock_in)::time::text,
            max(clock_out)::time::text,
            count(id) > 0
        into v_day_hours, v_clock_in, v_clock_out, v_has_log
        from public.time_logs
        where user_id = p_user_id
          and date(clock_in at time zone 'Europe/Madrid') = v_date;

        v_day_extras := 0;

        if v_joining_date is not null and v_date < v_joining_date then
            -- Antes de incorporarse: todo es extra, y NO suma al acumulado de contrato.
            v_day_extras := v_day_hours;
        else
            -- Desde joining_date: aplica contrato normal.
            if (v_accumulated + v_day_hours) > v_week_limit then
                if v_accumulated >= v_week_limit then
                    v_day_extras := v_day_hours;
                else
                    v_day_extras := (v_accumulated + v_day_hours) - v_week_limit;
                end if;
            end if;
            v_accumulated := v_accumulated + v_day_hours;
        end if;

        v_result := v_result || jsonb_build_object(
            'date', v_date,
            'hasLog', v_has_log,
            'clockIn', coalesce(substring(v_clock_in from 1 for 5), ''),
            'clockOut', coalesce(substring(v_clock_out from 1 for 5), ''),
            'totalHours', v_day_hours,
            'extraHours', v_day_extras
        );
    end loop;

    return v_result;
end;
$$;


-- ---------------------------------------------------------------
-- 2) Timesheet mensual SSOT: extras pre-incorporación + running desde joining_date
-- ---------------------------------------------------------------
create or replace function public.get_monthly_timesheet(p_user_id uuid, p_year integer, p_month integer)
returns jsonb as $$
declare
    v_start_date date;
    v_end_date date;
    v_result jsonb;
    v_profile record;
    v_eff_contract numeric;
begin
    -- 1. Obtener perfil
    select contracted_hours_weekly, is_fixed_salary, prefer_stock_hours, hours_balance, overtime_cost_per_hour, role, joining_date
    into v_profile
    from public.profiles
    where id = p_user_id;

    -- 2. Contrato efectivo (regla base)
    if p_month = 8 or v_profile.role = 'manager' or v_profile.is_fixed_salary then
        v_eff_contract := 0;
    else
        v_eff_contract := coalesce(v_profile.contracted_hours_weekly, 0);
    end if;

    -- 3. Límites del calendario
    v_start_date := date_trunc('week', make_date(p_year, p_month, 1))::date;
    v_end_date := (date_trunc('week', make_date(p_year, p_month, 1) + interval '1 month - 1 day') + interval '6 days')::date;

    with recursive
    calendar_days as (
        select generate_series(v_start_date, v_end_date, '1 day'::interval)::date as d_date
    ),
    daily_logs as (
        select
            cd.d_date,
            date_trunc('week', cd.d_date)::date as week_start,
            tl.id as log_id,
            tl.clock_in,
            tl.clock_out,
            coalesce(tl.total_hours, 0) as daily_hours,
            tl.event_type
        from calendar_days cd
        left join public.time_logs tl
            on date(tl.clock_in at time zone 'Europe/Madrid') = cd.d_date
            and tl.user_id = p_user_id
    ),
    running_logs as (
        select
            *,
            -- running_weekly_hours SOLO cuenta desde joining_date (si existe)
            sum(
                case
                    when v_profile.joining_date is not null and d_date < v_profile.joining_date then 0
                    else daily_hours
                end
            ) over (partition by week_start order by d_date) as running_weekly_hours
        from daily_logs
    ),
    calculated_days as (
        select
            *,
            case
                when v_profile.joining_date is not null and d_date < v_profile.joining_date then daily_hours
                when (running_weekly_hours - daily_hours) >= v_eff_contract then daily_hours
                when running_weekly_hours > v_eff_contract then running_weekly_hours - v_eff_contract
                else 0
            end as daily_extra_hours
        from running_logs
    ),
    aggregated_days as (
        select
            week_start,
            jsonb_agg(
                jsonb_build_object(
                    'date', d_date,
                    'dayName', case extract(isodow from d_date)
                                  when 1 then 'LUN' when 2 then 'MAR' when 3 then 'MIE'
                                  when 4 then 'JUE' when 5 then 'VIE' when 6 then 'SAB' when 7 then 'DOM' end,
                    'dayNumber', extract(day from d_date),
                    'hasLog', log_id is not null,
                    'clockIn', to_char(clock_in at time zone 'Europe/Madrid', 'HH24:MI'),
                    'clockOut', to_char(clock_out at time zone 'Europe/Madrid', 'HH24:MI'),
                    'totalHours', daily_hours,
                    'extraHours', daily_extra_hours,
                    'eventType', coalesce(event_type, 'regular'),
                    'isToday', d_date = current_date
                ) order by d_date
            ) as days_json,
            sum(daily_hours) as week_total_hours
        from calculated_days
        group by week_start
    ),
    weekly_data as (
        select
            ad.week_start,
            extract(week from ad.week_start) as week_number,
            ad.days_json,
            ad.week_total_hours,
            ws.total_hours as snap_total,
            ws.pending_balance as snap_start_balance,
            ws.balance_hours as snap_balance,
            ws.final_balance as snap_final_balance,
            ws.is_paid,
            ws.contracted_hours_snapshot as snap_contract,
            coalesce(ws.prefer_stock_hours_override, v_profile.prefer_stock_hours, false) as snap_prefer_stock
        from aggregated_days ad
        left join public.weekly_snapshots ws
            on ws.week_start = ad.week_start
            and ws.user_id = p_user_id
    )
    select jsonb_agg(
        jsonb_build_object(
            'weekNumber', week_number,
            'startDate', week_start,
            'isCurrentWeek', week_start = date_trunc('week', current_date)::date,
            'days', days_json,
            'summary', jsonb_build_object(
                'totalHours', coalesce(snap_total, week_total_hours),
                'startBalance', coalesce(snap_start_balance, 0),
                'weeklyBalance', coalesce(snap_balance, week_total_hours - v_eff_contract),
                'finalBalance', coalesce(snap_final_balance, 0),
                'estimatedValue', case
                    when snap_prefer_stock then 0
                    else greatest(0, coalesce(snap_final_balance, 0)) * coalesce(v_profile.overtime_cost_per_hour, 0)
                end,
                'isPaid', coalesce(is_paid, false),
                'preferStock', snap_prefer_stock,
                'limitHours', coalesce(snap_contract, v_eff_contract)
            )
        ) order by week_start
    ) into v_result
    from weekly_data;

    return coalesce(v_result, '[]');
end;
$$ language plpgsql security definer;


-- ---------------------------------------------------------------
-- 3) Recalc snapshots: weekly_balance correcto con joining_date
--    weekly_balance = prejoin_hours + (postjoin_hours - contract_limit)
-- ---------------------------------------------------------------
create or replace function public.fn_recalc_and_propagate_snapshots(p_user_id uuid, p_start_date date)
returns void
language plpgsql
security definer
as $$
declare
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

  -- Perfil actual
  v_current_contracted_hours numeric;
  v_profile_prefer_stock boolean;
  v_is_fixed_salary boolean;
  v_role text;
  v_joining_date date;

  -- Snapshot (semana actual)
  v_snapshot_contracted_hours numeric;
  v_snapshot_prefer_override boolean;
  v_is_paid_current boolean;

  -- Snapshot (semana anterior)
  v_prev_final_balance numeric;
  v_prev_is_paid boolean;
  v_prev_prefer_override boolean;
  v_prev_prefer_stock boolean;

  v_first_clock_in date;
begin
  select contracted_hours_weekly, prefer_stock_hours, is_fixed_salary, role, joining_date
  into v_current_contracted_hours, v_profile_prefer_stock, v_is_fixed_salary, v_role, v_joining_date
  from public.profiles
  where id = p_user_id;

  v_current_contracted_hours := coalesce(v_current_contracted_hours, 0);
  v_profile_prefer_stock := coalesce(v_profile_prefer_stock, false);
  v_role := coalesce(v_role, 'staff');

  select min(clock_in::date)
  into v_first_clock_in
  from public.time_logs
  where user_id = p_user_id;

  if v_first_clock_in is null then
    return;
  end if;

  v_current_week := public.get_iso_week_start(greatest(p_start_date, v_first_clock_in));
  v_end_date := public.get_iso_week_start(current_date) + 7;

  delete from public.weekly_snapshots
  where user_id = p_user_id
    and week_start < public.get_iso_week_start(v_first_clock_in);

  while v_current_week <= v_end_date loop
    -- total de semana (para UI)
    select coalesce(sum(public.fn_round_marbella_hours(total_hours)), 0)
    into v_logs_sum
    from public.time_logs
    where user_id = p_user_id
      and (clock_in at time zone 'Europe/Madrid')::date >= v_current_week
      and (clock_in at time zone 'Europe/Madrid')::date < (v_current_week + 7);

    -- snapshot config (overrides)
    select contracted_hours_snapshot, is_paid, prefer_stock_hours_override
    into v_snapshot_contracted_hours, v_is_paid_current, v_snapshot_prefer_override
    from public.weekly_snapshots
    where user_id = p_user_id and week_start = v_current_week;

    v_snapshot_contracted_hours := coalesce(v_snapshot_contracted_hours, v_current_contracted_hours);
    v_is_paid_current := coalesce(v_is_paid_current, false);

    -- split pre/post joining
    if v_joining_date is null then
      v_logs_prejoin := 0;
      v_logs_postjoin := v_logs_sum;
    elsif v_joining_date <= v_current_week then
      v_logs_prejoin := 0;
      v_logs_postjoin := v_logs_sum;
    elsif v_joining_date > (v_current_week + 6) then
      v_logs_prejoin := v_logs_sum;
      v_logs_postjoin := 0;
    else
      select
        coalesce(sum(public.fn_round_marbella_hours(total_hours)) filter (where (clock_in at time zone 'Europe/Madrid')::date < v_joining_date), 0),
        coalesce(sum(public.fn_round_marbella_hours(total_hours)) filter (where (clock_in at time zone 'Europe/Madrid')::date >= v_joining_date), 0)
      into v_logs_prejoin, v_logs_postjoin
      from public.time_logs
      where user_id = p_user_id
        and (clock_in at time zone 'Europe/Madrid')::date >= v_current_week
        and (clock_in at time zone 'Europe/Madrid')::date < (v_current_week + 7);
    end if;

    -- Balance semanal
    if extract(month from v_current_week) = 8 then
      v_total_hours_week := v_logs_sum;
      v_weekly_balance := v_logs_sum;
    elsif v_role = 'manager' or coalesce(v_is_fixed_salary, false) then
      v_total_hours_week := 40 + v_logs_sum;
      v_weekly_balance := v_logs_sum;
    else
      v_total_hours_week := v_logs_sum;
      v_weekly_balance := v_logs_prejoin + (v_logs_postjoin - v_snapshot_contracted_hours);
    end if;

    -- Arrastre desde la semana anterior (deuda siempre; crédito solo bolsa + no pagada)
    v_last_week := v_current_week - 7;
    select final_balance, is_paid, prefer_stock_hours_override
    into v_prev_final_balance, v_prev_is_paid, v_prev_prefer_override
    from public.weekly_snapshots
    where user_id = p_user_id and week_start = v_last_week;

    v_prev_prefer_stock := coalesce(v_prev_prefer_override, v_profile_prefer_stock);
    v_pending_balance := 0;
    if v_prev_final_balance is not null then
      if v_prev_final_balance > 0 then
        if v_prev_prefer_stock and not coalesce(v_prev_is_paid, false) then
          v_pending_balance := v_prev_final_balance;
        else
          v_pending_balance := 0;
        end if;
      else
        v_pending_balance := v_prev_final_balance;
      end if;
    end if;

    v_final_balance := v_pending_balance + v_weekly_balance;

    insert into public.weekly_snapshots (
      user_id, week_start, week_end,
      total_hours, balance_hours, pending_balance, final_balance,
      contracted_hours_snapshot, is_paid, prefer_stock_hours_override
    ) values (
      p_user_id, v_current_week, (v_current_week + 6),
      v_total_hours_week, v_weekly_balance, v_pending_balance, v_final_balance,
      v_snapshot_contracted_hours, v_is_paid_current, v_snapshot_prefer_override
    )
    on conflict (user_id, week_start) do update set
      total_hours = excluded.total_hours,
      balance_hours = excluded.balance_hours,
      pending_balance = excluded.pending_balance,
      final_balance = excluded.final_balance,
      week_end = excluded.week_end,
      is_paid = excluded.is_paid,
      contracted_hours_snapshot = excluded.contracted_hours_snapshot,
      prefer_stock_hours_override = excluded.prefer_stock_hours_override;

    v_current_week := v_current_week + 7;
  end loop;

  -- Sync perfil (misma regla: no acumula + positivo o pagado => 0)
  select ws.final_balance,
         coalesce(ws.prefer_stock_hours_override, p.prefer_stock_hours, false),
         coalesce(ws.is_paid, false)
  into v_final_balance, v_prev_prefer_stock, v_prev_is_paid
  from public.weekly_snapshots ws
  join public.profiles p on p.id = p_user_id
  where ws.user_id = p_user_id
    and ws.week_start = public.get_iso_week_start(current_date - 6);

  if v_final_balance is not null then
    if (not v_prev_prefer_stock or v_prev_is_paid) and v_final_balance > 0 then
      v_final_balance := 0;
    end if;
    update public.profiles set hours_balance = v_final_balance where id = p_user_id;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;

