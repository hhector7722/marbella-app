begin;

create or replace function public.fn_profiles_guard_staffing_mode()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_role text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.staffing_mode is not distinct from old.staffing_mode
     and new.extra_slot is not distinct from old.extra_slot then
    return new;
  end if;

  if auth.role() = 'service_role' then
    return new;
  end if;

  select p.role into actor_role
  from public.profiles p
  where p.id = auth.uid();

  if actor_role in ('manager', 'admin') then
    return new;
  end if;

  raise exception 'solo manager puede cambiar el modo de plantilla';
end;
$$;

create or replace function public.fn_time_logs_block_managed_extra_self_clock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.user_id = auth.uid() then
    if exists (
      select 1
      from public.profiles p
      where p.id = new.user_id
        and p.staffing_mode = 'managed_extra'
    ) then
      raise exception 'un extra gestionado no ficha';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_profiles_guard_staffing_mode() from public, anon, authenticated;
revoke execute on function public.fn_time_logs_block_managed_extra_self_clock() from public, anon, authenticated;

grant execute on function public.fn_profiles_guard_staffing_mode() to service_role;
grant execute on function public.fn_time_logs_block_managed_extra_self_clock() to service_role;

notify pgrst, 'reload schema';

commit;
