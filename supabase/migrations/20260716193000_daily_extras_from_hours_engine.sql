-- =================================================================
-- Migración Ex. diarias → hours-engine (LiquidationResult.dailyBreakdown)
--
-- Las RPC dejan de CALCULAR extras / running ordinario.
-- extraHours se emite siempre 0; la UI pinta Ex. desde el motor TS.
-- Clocks + totalHours se conservan (lectura de time_logs).
-- =================================================================

begin;

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
    v_day_hours numeric;
    v_date date;
    v_result jsonb := '[]'::jsonb;
    v_clock_in text;
    v_clock_out text;
    v_has_log boolean;
begin
    -- p_contracted_hours conservado por compatibilidad de firma; ya no se usa
    -- para calcular extras (fuente: Liquidation Engine / dailyBreakdown).
    perform p_contracted_hours;

    for i in 0..6 loop
        v_date := p_start_date + i;

        select
            coalesce(sum(public.fn_calculate_rounded_hours(total_hours)), 0),
            to_char(min(clock_in at time zone 'Europe/Madrid'), 'HH24:MI'),
            to_char(max(clock_out at time zone 'Europe/Madrid'), 'HH24:MI'),
            count(id) > 0
        into v_day_hours, v_clock_in, v_clock_out, v_has_log
        from public.time_logs
        where user_id = p_user_id
          and date(clock_in at time zone 'Europe/Madrid') = v_date;

        v_result := v_result || jsonb_build_object(
            'date', v_date,
            'hasLog', v_has_log,
            'clockIn', coalesce(v_clock_in, ''),
            'clockOut', coalesce(v_clock_out, ''),
            'totalHours', v_day_hours,
            -- Extras diarias: siempre 0 aquí. UI usa hours-engine.
            'extraHours', 0
        );
    end loop;

    return v_result;
end;
$$;

create or replace function public.get_monthly_timesheet(
    p_user_id uuid,
    p_year integer,
    p_month integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_start_date date;
    v_end_date date;
    v_result jsonb;
    v_profile record;
    v_eff_contract numeric;
begin
    select contracted_hours_weekly, is_fixed_salary, prefer_stock_hours, hours_balance, overtime_cost_per_hour, role, joining_date
    into v_profile
    from public.profiles
    where id = p_user_id;

    if p_month = 8 or v_profile.role = 'manager' or v_profile.is_fixed_salary then
        v_eff_contract := 0;
    else
        v_eff_contract := coalesce(v_profile.contracted_hours_weekly, 0);
    end if;

    v_start_date := date_trunc('week', make_date(p_year, p_month, 1))::date;
    v_end_date := (date_trunc('week', make_date(p_year, p_month, 1) + interval '1 month - 1 day') + interval '6 days')::date;

    with calendar_days as (
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
    week_limits as (
        select
            distinct dl.week_start,
            case
                when v_eff_contract <= 0 then 0
                when v_profile.joining_date is null or v_profile.joining_date <= dl.week_start then v_eff_contract
                when v_profile.joining_date > (dl.week_start + 6) then 0
                else v_eff_contract * (greatest(0, 7 - (v_profile.joining_date - dl.week_start))::numeric / 7.0)
            end as limit_hours
        from daily_logs dl
    ),
    -- Sin running / daily_extra_hours: extras las calcula el motor TS.
    aggregated_days as (
        select
            dl.week_start,
            max(wl.limit_hours) as limit_hours,
            jsonb_agg(
                jsonb_build_object(
                    'date', dl.d_date,
                    'dayName', case extract(isodow from dl.d_date)
                                  when 1 then 'LUN' when 2 then 'MAR' when 3 then 'MIE'
                                  when 4 then 'JUE' when 5 then 'VIE' when 6 then 'SAB' when 7 then 'DOM' end,
                    'dayNumber', extract(day from dl.d_date),
                    'hasLog', dl.log_id is not null,
                    'clockIn', to_char(dl.clock_in at time zone 'Europe/Madrid', 'HH24:MI'),
                    'clockOut', to_char(dl.clock_out at time zone 'Europe/Madrid', 'HH24:MI'),
                    'totalHours', dl.daily_hours,
                    'extraHours', 0,
                    'eventType', coalesce(dl.event_type, 'regular'),
                    'isToday', dl.d_date = current_date
                ) order by dl.d_date
            ) as days_json,
            sum(dl.daily_hours) as week_total_hours
        from daily_logs dl
        join week_limits wl on wl.week_start = dl.week_start
        group by dl.week_start
    ),
    weekly_data as (
        select
            ad.week_start,
            extract(week from ad.week_start) as week_number,
            ad.days_json,
            ad.week_total_hours,
            ad.limit_hours as computed_limit_hours,
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
                'weeklyBalance', coalesce(snap_balance, week_total_hours - coalesce(snap_contract, computed_limit_hours)),
                'finalBalance', coalesce(snap_final_balance, 0),
                'estimatedValue', case
                    when snap_prefer_stock then 0
                    else greatest(0, coalesce(snap_final_balance, 0)) * coalesce(v_profile.overtime_cost_per_hour, 0)
                end,
                'isPaid', coalesce(is_paid, false),
                'preferStock', snap_prefer_stock,
                'limitHours', coalesce(snap_contract, computed_limit_hours)
            )
        ) order by week_start
    ) into v_result
    from weekly_data;

    return coalesce(v_result, '[]');
end;
$$;

notify pgrst, 'reload schema';

commit;
