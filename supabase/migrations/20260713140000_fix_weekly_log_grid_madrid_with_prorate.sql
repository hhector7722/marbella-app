-- =================================================================
-- FIX: get_worker_weekly_log_grid — horas en Europe/Madrid (con prorrateo joining_date)
--
-- Síntoma: /staff/history (get_monthly_timesheet) muestra horas correctas;
-- modal horas extras y dashboard staff usan get_worker_weekly_log_grid con
-- MIN(clock_in)::time (UTC) → desfase de 2h en verano.
--
-- Mantiene la lógica de prorrateo semanal por joining_date (20260427143001)
-- y corrige clockIn/clockOut con AT TIME ZONE 'Europe/Madrid'.
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
    v_accumulated numeric := 0;
    v_day_hours numeric;
    v_day_extras numeric;
    v_date date;
    v_result jsonb := '[]'::jsonb;
    v_clock_in text;
    v_clock_out text;
    v_has_log boolean;
    v_joining_date date;
    v_week_limit numeric := coalesce(p_contracted_hours, 0);
    v_active_days int;
begin
    select p.joining_date
    into v_joining_date
    from public.profiles p
    where p.id = p_user_id;

    if v_joining_date is not null and v_week_limit > 0 then
        if v_joining_date <= p_start_date then
            v_week_limit := v_week_limit;
        elsif v_joining_date > (p_start_date + 6) then
            v_week_limit := 0;
        else
            v_active_days := greatest(0, 7 - (v_joining_date - p_start_date));
            v_week_limit := v_week_limit * (v_active_days::numeric / 7.0);
        end if;
    end if;

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

        v_day_extras := 0;

        if v_joining_date is not null and v_date < v_joining_date then
            v_day_extras := v_day_hours;
        else
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
            'clockIn', coalesce(v_clock_in, ''),
            'clockOut', coalesce(v_clock_out, ''),
            'totalHours', v_day_hours,
            'extraHours', v_day_extras
        );
    end loop;

    return v_result;
end;
$$;

notify pgrst, 'reload schema';

commit;
