-- =================================================================
-- Shadow Convergence Iteración B (única causa raíz): end_date
-- Evidencia: SHADOW_VALIDATION_REPORT.md Grupo B/C.
--
-- Causa raíz demostrada:
--   fn_recalc_and_propagate_snapshots lee joining_date pero NUNCA
--   profiles.end_date. El contrato efectivo se toma de
--   coalesce(weekly_snapshots.contracted_hours_snapshot,
--            profiles.contracted_hours_weekly) y el snapshot "pegajoso"
--   perpetúa 8/40 h post-baja (Martí/Mouad; fantasma Hugo/Pau 2026-07-13).
--
-- Corrección mínima:
--   1) Leer end_date.
--   2) Si week_start > end_date → contracted = 0 (fuerza, no coalesce).
--   3) Si end_date cae dentro de la semana → prorrateo días/7 × jornada
--      perfil (fn_round_marbella_hours), alineado a HE contract-resolver.
--
-- NO toca: manager=40, modo pago, algoritmo de carry, Hours Engine TS,
--          ordinary/extra (Iter A).
-- =================================================================

create or replace function public.fn_recalc_and_propagate_snapshots(
  p_user_id uuid,
  p_start_date date
)
returns void
language plpgsql
security definer
as $function$
declare
  v_current_week date;
  v_last_week date;
  v_horizon_end date;

  v_logs_sum numeric;
  v_logs_prejoin numeric;
  v_logs_postjoin numeric;
  v_total_hours_week numeric;
  v_weekly_balance numeric;
  v_pending_balance numeric := 0;
  v_final_balance numeric;
  v_total_cost numeric := 0;
  v_ordinary_hours numeric := 0;
  v_extra_hours numeric := 0;

  v_current_contracted_hours numeric;
  v_profile_overtime_price numeric;
  v_profile_prefer_stock boolean;
  v_is_fixed_salary boolean;
  v_role text;
  v_joining_date date;
  v_employment_end_date date;

  v_snapshot_contracted_hours numeric;
  v_snapshot_prefer_override boolean;
  v_is_paid_current boolean;
  v_effective_prefer_stock boolean;
  v_over_price numeric;
  v_days_employed integer;
  v_full_week_contract numeric;

  v_prev_final_balance numeric;
  v_prev_is_paid boolean;
  v_prev_prefer_override boolean;
  v_prev_prefer_stock boolean;

  v_first_clock_in date;
begin
  select
    contracted_hours_weekly,
    prefer_stock_hours,
    is_fixed_salary,
    role,
    joining_date,
    end_date,
    overtime_cost_per_hour
  into
    v_current_contracted_hours,
    v_profile_prefer_stock,
    v_is_fixed_salary,
    v_role,
    v_joining_date,
    v_employment_end_date,
    v_profile_overtime_price
  from public.profiles
  where id = p_user_id;

  v_current_contracted_hours := coalesce(v_current_contracted_hours, 0);
  v_profile_prefer_stock := coalesce(v_profile_prefer_stock, false);
  v_profile_overtime_price := coalesce(v_profile_overtime_price, 0);
  v_role := coalesce(v_role, 'staff');

  select min(clock_in::date)
  into v_first_clock_in
  from public.time_logs
  where user_id = p_user_id;

  if v_first_clock_in is null then
    return;
  end if;

  v_current_week := public.get_iso_week_start(greatest(p_start_date, v_first_clock_in));
  v_horizon_end := public.get_iso_week_start(current_date) + 7;

  delete from public.weekly_snapshots
  where user_id = p_user_id
    and week_start < public.get_iso_week_start(v_first_clock_in);

  while v_current_week <= v_horizon_end loop
    select coalesce(sum(public.fn_round_marbella_hours(total_hours)), 0)
    into v_logs_sum
    from public.time_logs
    where user_id = p_user_id
      and (clock_in at time zone 'Europe/Madrid')::date >= v_current_week
      and (clock_in at time zone 'Europe/Madrid')::date < (v_current_week + 7)
      -- Iter B: no computar fichajes posteriores a la baja (HE isComputableDay)
      and (
        v_employment_end_date is null
        or (clock_in at time zone 'Europe/Madrid')::date <= v_employment_end_date
      );

    select contracted_hours_snapshot, is_paid, prefer_stock_hours_override
    into v_snapshot_contracted_hours, v_is_paid_current, v_snapshot_prefer_override
    from public.weekly_snapshots
    where user_id = p_user_id and week_start = v_current_week;

    v_is_paid_current := coalesce(v_is_paid_current, false);

    -- Jornada de referencia pre-fence (perfil; evita snapshot pegajoso post-baja)
    v_full_week_contract := v_current_contracted_hours;

    -- Contrato efectivo semanal con fence end_date (Iter B — única regla nueva)
    if v_employment_end_date is not null and v_current_week > v_employment_end_date then
      -- Semana completa post-baja
      v_snapshot_contracted_hours := 0;
    elsif
      v_employment_end_date is not null
      and v_current_week <= v_employment_end_date
      and (v_current_week + 6) > v_employment_end_date
    then
      -- Semana parcial que contiene el día de baja (inclusive)
      v_days_employed := (v_employment_end_date - v_current_week) + 1;
      if v_days_employed < 0 then
        v_days_employed := 0;
      elsif v_days_employed > 7 then
        v_days_employed := 7;
      end if;
      v_snapshot_contracted_hours := public.fn_round_marbella_hours(
        (v_days_employed::numeric / 7.0) * v_full_week_contract
      );
    else
      -- Empleado activo toda la semana: conservar override de snapshot si existe
      v_snapshot_contracted_hours := coalesce(
        v_snapshot_contracted_hours,
        v_current_contracted_hours
      );
    end if;

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
        coalesce(
          sum(public.fn_round_marbella_hours(total_hours)) filter (
            where (clock_in at time zone 'Europe/Madrid')::date < v_joining_date
          ),
          0
        ),
        coalesce(
          sum(public.fn_round_marbella_hours(total_hours)) filter (
            where (clock_in at time zone 'Europe/Madrid')::date >= v_joining_date
          ),
          0
        )
      into v_logs_prejoin, v_logs_postjoin
      from public.time_logs
      where user_id = p_user_id
        and (clock_in at time zone 'Europe/Madrid')::date >= v_current_week
        and (clock_in at time zone 'Europe/Madrid')::date < (v_current_week + 7)
        and (
          v_employment_end_date is null
          or (clock_in at time zone 'Europe/Madrid')::date <= v_employment_end_date
        );
    end if;

    if extract(month from v_current_week) = 8 then
      v_total_hours_week := v_logs_sum;
      v_weekly_balance := v_logs_sum;
      v_ordinary_hours := 0;
      v_extra_hours := v_logs_sum;
    elsif v_role = 'manager' or coalesce(v_is_fixed_salary, false) then
      -- Iter C pendiente: manager=40 intacto
      v_total_hours_week := 40 + v_logs_sum;
      v_weekly_balance := v_logs_sum;
      v_ordinary_hours := 0;
      v_extra_hours := v_logs_sum;
    else
      v_total_hours_week := v_logs_sum;
      v_weekly_balance := v_logs_prejoin + (v_logs_postjoin - v_snapshot_contracted_hours);
      v_ordinary_hours := least(v_logs_postjoin, v_snapshot_contracted_hours);
      v_extra_hours :=
        greatest(0, v_logs_postjoin - v_snapshot_contracted_hours) + v_logs_prejoin;
    end if;

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
    v_effective_prefer_stock := coalesce(
      v_snapshot_prefer_override,
      v_profile_prefer_stock,
      false
    );
    v_over_price := public.fn_worker_effective_overtime_rate(p_user_id, v_current_week);
    v_total_cost := case
      when v_final_balance > 0 and not v_effective_prefer_stock then
        greatest(0, v_final_balance) * coalesce(v_over_price, 0)
      else 0
    end;

    insert into public.weekly_snapshots (
      user_id,
      week_start,
      week_end,
      total_hours,
      ordinary_hours,
      extra_hours,
      balance_hours,
      pending_balance,
      final_balance,
      contracted_hours_snapshot,
      is_paid,
      prefer_stock_hours_override,
      total_cost
    ) values (
      p_user_id,
      v_current_week,
      (v_current_week + 6),
      v_total_hours_week,
      v_ordinary_hours,
      v_extra_hours,
      v_weekly_balance,
      v_pending_balance,
      v_final_balance,
      v_snapshot_contracted_hours,
      v_is_paid_current,
      v_snapshot_prefer_override,
      v_total_cost
    )
    on conflict (user_id, week_start) do update set
      total_hours = excluded.total_hours,
      ordinary_hours = excluded.ordinary_hours,
      extra_hours = excluded.extra_hours,
      balance_hours = excluded.balance_hours,
      pending_balance = excluded.pending_balance,
      final_balance = excluded.final_balance,
      week_end = excluded.week_end,
      is_paid = excluded.is_paid,
      contracted_hours_snapshot = excluded.contracted_hours_snapshot,
      prefer_stock_hours_override = excluded.prefer_stock_hours_override,
      total_cost = excluded.total_cost;

    v_current_week := v_current_week + 7;
  end loop;

  select
    ws.final_balance,
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
    update public.profiles
    set hours_balance = v_final_balance
    where id = p_user_id;
  end if;
end;
$function$;

comment on function public.fn_recalc_and_propagate_snapshots(uuid, date) is
  'Recalc weekly_snapshots. Iter A: ordinary/extra. Iter B: fence profiles.end_date.';

-- Backfill idempotente: solo empleados con end_date (causa B).
-- Recalcula desde joining_date; no borra filas; reescribe snapshots in-place.
do $$
declare
  r record;
  v_start date;
begin
  for r in
    select
      id,
      joining_date,
      end_date
    from public.profiles
    where end_date is not null
  loop
    v_start := coalesce(r.joining_date, r.end_date - 90);
    perform public.fn_recalc_and_propagate_snapshots(r.id, v_start);
  end loop;
end;
$$;
