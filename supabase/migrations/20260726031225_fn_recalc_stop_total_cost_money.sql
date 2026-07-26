-- =================================================================
-- Overtime Cost Engine Fase 1: SQL deja de producir dinero.
--
-- fn_recalc_and_propagate_snapshots:
--   - Calcula SOLO horas / balances / carry / snapshots.
--   - NO llama a fn_worker_effective_overtime_rate.
--   - NO escribe total_cost en UPDATE (preserva valor existente).
--   - En INSERT omite total_cost → DEFAULT NULL (= aún no persistido).
--
-- weekly_snapshots.total_cost:
--   - DEFAULT NULL (NULL ≠ 0 €).
--   - Único escritor: TypeScript Overtime Cost Engine (persistOvertimeCostFromEngine).
-- =================================================================

alter table public.weekly_snapshots
  alter column total_cost drop default;

alter table public.weekly_snapshots
  alter column total_cost set default null;

comment on column public.weekly_snapshots.total_cost is
  'Persistencia del estimatedValue del Overtime Cost Engine (TS). NULL = aún no persistido. SQL no calcula ni sobrescribe este valor.';

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
  v_ordinary_hours numeric := 0;
  v_extra_hours numeric := 0;

  v_current_contracted_hours numeric;
  v_profile_prefer_stock boolean;
  v_is_fixed_salary boolean;
  v_role text;
  v_joining_date date;
  v_employment_end_date date;

  v_snapshot_contracted_hours numeric;
  v_snapshot_prefer_override boolean;
  v_is_paid_current boolean;

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
    end_date
  into
    v_current_contracted_hours,
    v_profile_prefer_stock,
    v_is_fixed_salary,
    v_role,
    v_joining_date,
    v_employment_end_date
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
      and (
        v_employment_end_date is null
        or (clock_in at time zone 'Europe/Madrid')::date <= v_employment_end_date
      );

    select contracted_hours_snapshot, is_paid, prefer_stock_hours_override
    into v_snapshot_contracted_hours, v_is_paid_current, v_snapshot_prefer_override
    from public.weekly_snapshots
    where user_id = p_user_id and week_start = v_current_week;

    v_is_paid_current := coalesce(v_is_paid_current, false);

    -- Contrato efectivo semanal con fence end_date
    if v_employment_end_date is not null and v_current_week > v_employment_end_date then
      v_snapshot_contracted_hours := 0;
    elsif
      v_employment_end_date is not null
      and v_current_week <= v_employment_end_date
      and (v_current_week + 6) > v_employment_end_date
    then
      select coalesce(
        sum(
          public.fn_round_marbella_hours(
            (seg.n_days::numeric / 7.0) * seg.weekly_hours
          )
        ),
        0
      )
      into v_snapshot_contracted_hours
      from (
        select
          t.id as term_id,
          t.weekly_hours,
          count(*)::integer as n_days
        from generate_series(
          v_current_week,
          least(v_current_week + 6, v_employment_end_date),
          interval '1 day'
        ) as gs(day)
        inner join public.hours_contract_terms t
          on t.user_id = p_user_id
         and t.effective_from <= (gs.day::date)
         and (t.effective_to is null or t.effective_to >= (gs.day::date))
        group by t.id, t.weekly_hours
      ) as seg;
    else
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

    -- Dinero: NO. total_cost omitido en INSERT (DEFAULT NULL) y omitido en UPDATE
    -- (preserva persistencia del Overtime Cost Engine TS).
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
      prefer_stock_hours_override
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
      v_snapshot_prefer_override
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
      prefer_stock_hours_override = excluded.prefer_stock_hours_override;

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
  'Recalc weekly_snapshots (horas/balances/carry). NO calcula dinero. total_cost solo lo escribe el Overtime Cost Engine TS.';
