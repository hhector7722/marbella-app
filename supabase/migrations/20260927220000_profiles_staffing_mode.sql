-- Extra gestionado: tres slots reutilizables sobre profiles.
-- No crea usuarios de Auth. Eso lo hace el bootstrap server-side.

begin;

alter table public.profiles
  add column if not exists staffing_mode text not null default 'regular';

alter table public.profiles
  add column if not exists extra_slot smallint;

alter table public.profiles
  drop constraint if exists profiles_staffing_mode_chk;

alter table public.profiles
  add constraint profiles_staffing_mode_chk
  check (staffing_mode in ('regular', 'managed_extra'));

alter table public.profiles
  drop constraint if exists profiles_extra_slot_mode_chk;

alter table public.profiles
  add constraint profiles_extra_slot_mode_chk
  check (
    (staffing_mode = 'regular' and extra_slot is null)
    or (staffing_mode = 'managed_extra' and extra_slot between 1 and 3)
  );

create unique index if not exists profiles_extra_slot_uidx
  on public.profiles (extra_slot);

comment on column public.profiles.staffing_mode is
  'regular: persona de plantilla. managed_extra: slot reutilizable Extra 1-3, operado solo por manager.';

comment on column public.profiles.extra_slot is
  'Número estable del slot (1, 2 o 3) cuando staffing_mode = managed_extra. Nulo en el resto.';

-- Un perfil regular no puede proclamarse extra ni mover el slot.
create or replace function public.fn_profiles_guard_staffing_mode()
returns trigger
language plpgsql
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

drop trigger if exists trg_profiles_guard_staffing_mode on public.profiles;

create trigger trg_profiles_guard_staffing_mode
  before update of staffing_mode, extra_slot
  on public.profiles
  for each row
  execute function public.fn_profiles_guard_staffing_mode();

-- El propio extra no ficha. Manager inserta con otro auth.uid().
create or replace function public.fn_time_logs_block_managed_extra_self_clock()
returns trigger
language plpgsql
security definer
set search_path = public
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

drop trigger if exists trg_time_logs_block_managed_extra_self_clock on public.time_logs;

create trigger trg_time_logs_block_managed_extra_self_clock
  before insert on public.time_logs
  for each row
  execute function public.fn_time_logs_block_managed_extra_self_clock();

notify pgrst, 'reload schema';

commit;
