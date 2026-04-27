-- =================================================================
-- FIX: weekly_snapshots SSOT debe respetar profiles.joining_date
--
-- Problema:
-- - Aunque las RPCs de lectura prorrateen, si existe snapshot el frontend suele
--   consumir final_balance/balance_hours del snapshot.
-- - Si el snapshot se calculó sin joining_date, la semana de incorporación
--   queda mal (Semana 16 en tu caso).
--
-- Solución:
-- - fn_recalc_and_propagate_snapshots prorratea contracted_hours_snapshot para
--   la semana en la que cae joining_date (Mon..Sun).
-- - Si joining_date es posterior al domingo de la semana, el contrato efectivo
--   de esa semana es 0.
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

  -- Prorrateo contrato por incorporación
  v_active_days int;
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

  -- Limpieza defensiva
  delete from public.weekly_snapshots
  where user_id = p_user_id
    and week_start < public.get_iso_week_start(v_first_clock_in);

  while v_current_week <= v_end_date loop
    -- 1) Suma de horas de la semana
    select coalesce(sum(public.fn_round_marbella_hours(total_hours)), 0)
    into v_logs_sum
    from public.time_logs
    where user_id = p_user_id
      and clock_in::date >= v_current_week
      and clock_in::date < (v_current_week + 7);

    -- 2) Snapshot de la semana (si existe) para preservar overrides
    select contracted_hours_snapshot, is_paid, prefer_stock_hours_override
    into v_snapshot_contracted_hours, v_is_paid_current, v_snapshot_prefer_override
    from public.weekly_snapshots
    where user_id = p_user_id and week_start = v_current_week;

    v_snapshot_contracted_hours := coalesce(v_snapshot_contracted_hours, v_current_contracted_hours);
    v_is_paid_current := coalesce(v_is_paid_current, false);

    -- 2.1) Prorrateo por joining_date (solo staff normal; agosto/manager/fijo ya tienen reglas propias)
    if not (extract(month from v_current_week) = 8 or v_role = 'manager' or coalesce(v_is_fixed_salary, false)) then
      if v_snapshot_contracted_hours > 0 and v_joining_date is not null then
        if v_joining_date <= v_current_week then
          -- Semana completa (sin prorrateo)
          v_snapshot_contracted_hours := v_snapshot_contracted_hours;
        elsif v_joining_date > (v_current_week + 6) then
          -- Aún no incorporado en esa semana
          v_snapshot_contracted_hours := 0;
        else
          v_active_days := greatest(0, 7 - (v_joining_date - v_current_week));
          v_snapshot_contracted_hours := v_snapshot_contracted_hours * (v_active_days::numeric / 7.0);
        end if;
      end if;
    end if;

    -- 3) Balance semanal (regla agosto / manager / fijo)
    if extract(month from v_current_week) = 8 then
      v_total_hours_week := v_logs_sum;
      v_weekly_balance := v_logs_sum;
    elsif v_role = 'manager' then
      v_total_hours_week := 40 + v_logs_sum;
      v_weekly_balance := v_logs_sum;
    else
      v_total_hours_week := v_logs_sum;
      v_weekly_balance := v_logs_sum - v_snapshot_contracted_hours;
    end if;

    -- 4) Arrastre desde la semana anterior (deuda siempre; crédito solo bolsa + no pagada)
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

    -- 5) Balance final
    v_final_balance := v_pending_balance + v_weekly_balance;

    -- 6) Upsert snapshot (preservando override)
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

  -- Sync perfil con la semana anterior completa (misma regla: no acumula + positivo => 0)
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

