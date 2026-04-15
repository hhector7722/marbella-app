-- Fix: ensure profiles.role is injected into auth.users.raw_app_meta_data.role (JWT claim)
-- Needed for RLS policies that rely on auth.jwt() ->> 'role' (e.g., public.import_runs)

-- 1) Function + trigger (idempotent)
create or replace function public.sync_profile_role_to_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', coalesce(new.role, 'staff'))
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_profile_updated_sync_role on public.profiles;
create trigger on_profile_updated_sync_role
  after insert or update of role on public.profiles
  for each row
  execute function public.sync_profile_role_to_auth();

-- 2) Backfill: copy current roles to auth.users
do $$
declare
  r record;
begin
  for r in select id, role from public.profiles
  loop
    update auth.users
    set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', coalesce(r.role, 'staff'))
    where id = r.id;
  end loop;
end $$;

-- 3) Specific safety backfill for master user (if present)
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'manager')
where id = 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6'::uuid;

