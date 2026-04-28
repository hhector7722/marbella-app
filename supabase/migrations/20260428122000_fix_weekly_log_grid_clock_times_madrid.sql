-- =================================================================
-- FIX: get_worker_weekly_log_grid debe mostrar horas en Madrid
--
-- Síntoma:
-- - /staff/history (get_monthly_timesheet) muestra 10:00–21:00
-- - /dashboard/overtime (modal semanal / grid semanal) muestra 08:00–19:00
--
-- Causa:
-- - get_worker_weekly_log_grid usaba min(clock_in)::time y max(clock_out)::time
--   (componente de hora en UTC), aunque filtraba el día por Madrid.
--
-- Solución:
-- - Formatear clock_in/clock_out con AT TIME ZONE 'Europe/Madrid' y HH24:MI.
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
begin
    select p.joining_date
    into v_joining_date
    from public.profiles p
    where p.id = p_user_id;

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

