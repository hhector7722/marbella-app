-- =================================================================
-- FIX: Restablecer contracted_hours_snapshot en la semana de incorporación
--
-- Síntoma:
-- - Semana de incorporación muestra "CONTRATO 28,57" (prorrateo legacy) aunque la regla
--   correcta NO prorratea el contrato.
--
-- Causa:
-- - Una migración anterior dejó guardado contracted_hours_snapshot prorrateado en weekly_snapshots.
-- - El recálculo preserva contracted_hours_snapshot (para no borrar overrides manuales).
--
-- Solución:
-- - En la semana donde joining_date cae dentro de Mon..Sun, si contracted_hours_snapshot coincide
--   con el prorrateo automático (profile_hours * active_days/7), lo tratamos como legacy y lo
--   restauramos a profile_hours (40 normalmente).
-- - Si el usuario puso un override manual distinto, se respeta.
-- =================================================================

begin;

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

  -- Para detectar prorrateo legacy
  v_active_days int;
  v_expected_prorated numeric;
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
    select coalesce(sum(public.fn_round_marbella_hours(total_hours)), 0)
    into v_logs_sum
    from public.time_logs
    where user_id = p_user_id
      and (clock_in at time zone 'Europe/Madrid')::date >= v_current_week
      and (clock_in at time zone 'Europe/Madrid')::date < (v_current_week + 7);

    select contracted_hours_snapshot, is_paid, prefer_stock_hours_override
    into v_snapshot_contracted_hours, v_is_paid_current, v_snapshot_prefer_override
    from public.weekly_snapshots
    where user_id = p_user_id and week_start = v_current_week;

    v_snapshot_contracted_hours := coalesce(v_snapshot_contracted_hours, v_current_contracted_hours);
    v_is_paid_current := coalesce(v_is_paid_current, false);

    -- Si joining_date cae en esta semana, y el contracted_hours_snapshot coincide con el prorrateo legacy,
    -- lo restauramos a horas del perfil (NO se prorratea según regla operativa).
    if v_joining_date is not null
       and v_joining_date >= v_current_week
       and v_joining_date <= (v_current_week + 6)
       and v_current_contracted_hours > 0
    then
      v_active_days := greatest(0, 7 - (v_joining_date - v_current_week));
      v_expected_prorated := v_current_contracted_hours * (v_active_days::numeric / 7.0);
      if abs(v_snapshot_contracted_hours - v_expected_prorated) < 0.02 then
        v_snapshot_contracted_hours := v_current_contracted_hours;
      end if;
    end if;

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

    -- Arrastre desde la semana anterior
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

