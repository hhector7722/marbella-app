-- =================================================================
-- Sync automático profiles → hours_contract_terms
-- Trigger: cualquier INSERT/UPDATE de campos contractuales versiona tramos.
-- =================================================================

begin;

-- Evitar ambigüedad PostgREST: una sola firma con prefer_stock
drop function if exists public.create_worker_profile(text, text, text, text, numeric, numeric, date);
drop function if exists public.create_worker_profile(text, text, text, text, numeric, numeric, text, text);
drop function if exists public.create_worker_profile(text, text, text, text, numeric, numeric, date, boolean);

create or replace function public.create_worker_profile(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_role text,
  p_contracted_hours_weekly numeric,
  p_overtime_cost_per_hour numeric,
  p_joining_date date default current_date,
  p_prefer_stock_hours boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_user_id uuid;
begin
  insert into public.profiles (
    first_name,
    last_name,
    email,
    role,
    contracted_hours_weekly,
    overtime_cost_per_hour,
    joining_date,
    prefer_stock_hours
  ) values (
    p_first_name,
    p_last_name,
    p_email,
    p_role,
    p_contracted_hours_weekly,
    p_overtime_cost_per_hour,
    p_joining_date,
    coalesce(p_prefer_stock_hours, false)
  )
  returning id into new_user_id;

  return new_user_id;
end;
$$;

grant execute on function public.create_worker_profile(
  text, text, text, text, numeric, numeric, date, boolean
) to authenticated;

create or replace function public.fn_hours_contract_terms_sync_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eff date;
  v_regime text;
  v_weekly numeric;
  v_bag boolean;
  v_rate numeric;
  v_open record;
  v_day_before date;
  v_same boolean;
begin
  v_eff := (timezone('Europe/Madrid', now()))::date;

  if new.role = 'manager' then
    v_regime := 'manager';
  elsif coalesce(new.is_fixed_salary, false) then
    v_regime := 'fixed';
  else
    v_regime := 'staff';
  end if;

  if v_regime in ('manager', 'fixed') then
    v_weekly := 0;
  else
    v_weekly := coalesce(new.contracted_hours_weekly, 40);
  end if;

  v_bag := coalesce(new.prefer_stock_hours, false);
  v_rate := new.overtime_cost_per_hour;

  -- INSERT: primer tramo si no existe
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.hours_contract_terms t where t.user_id = new.id
    ) then
      insert into public.hours_contract_terms (
        user_id, effective_from, effective_to, weekly_hours, bag_mode, regime, overtime_rate_per_hour
      ) values (
        new.id,
        coalesce(new.joining_date, v_eff),
        null,
        v_weekly,
        v_bag,
        v_regime,
        v_rate
      );
    end if;
    return new;
  end if;

  -- UPDATE: solo si cambió algún campo contractual
  if tg_op = 'UPDATE' then
    if
      new.contracted_hours_weekly is not distinct from old.contracted_hours_weekly
      and new.prefer_stock_hours is not distinct from old.prefer_stock_hours
      and new.is_fixed_salary is not distinct from old.is_fixed_salary
      and new.overtime_cost_per_hour is not distinct from old.overtime_cost_per_hour
      and new.role is not distinct from old.role
    then
      return new;
    end if;

    select *
    into v_open
    from public.hours_contract_terms t
    where t.user_id = new.id and t.effective_to is null
    order by t.effective_from desc
    limit 1;

    if not found then
      -- Sin tramo abierto: crear uno enlazado o inicial
      insert into public.hours_contract_terms (
        user_id, effective_from, effective_to, weekly_hours, bag_mode, regime, overtime_rate_per_hour
      ) values (
        new.id, v_eff, null, v_weekly, v_bag, v_regime, v_rate
      );
      return new;
    end if;

    v_same :=
      v_open.weekly_hours = v_weekly
      and v_open.bag_mode = v_bag
      and v_open.regime = v_regime
      and v_open.overtime_rate_per_hour is not distinct from v_rate;

    if v_same then
      return new;
    end if;

    -- Mismo día: actualizar abierto
    if v_open.effective_from = v_eff then
      update public.hours_contract_terms
      set
        weekly_hours = v_weekly,
        bag_mode = v_bag,
        regime = v_regime,
        overtime_rate_per_hour = v_rate
      where id = v_open.id;
      return new;
    end if;

    if v_eff <= v_open.effective_from then
      raise exception
        'fn_hours_contract_terms_sync_from_profile: fecha efectiva % no posterior al tramo abierto %',
        v_eff, v_open.effective_from;
    end if;

    v_day_before := v_eff - 1;

    update public.hours_contract_terms
    set effective_to = v_day_before
    where id = v_open.id;

    insert into public.hours_contract_terms (
      user_id, effective_from, effective_to, weekly_hours, bag_mode, regime, overtime_rate_per_hour
    ) values (
      new.id, v_eff, null, v_weekly, v_bag, v_regime, v_rate
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_hours_contract_terms_sync on public.profiles;
create trigger trg_hours_contract_terms_sync
  after insert or update of
    contracted_hours_weekly,
    prefer_stock_hours,
    is_fixed_salary,
    overtime_cost_per_hour,
    role
  on public.profiles
  for each row
  execute function public.fn_hours_contract_terms_sync_from_profile();

notify pgrst, 'reload schema';

commit;
