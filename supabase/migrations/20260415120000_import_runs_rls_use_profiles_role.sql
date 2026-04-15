-- Fix: make import_runs RLS depend on profiles.role (not JWT claims)
-- JWT role can lag until session refresh; profiles.role is source-of-truth.

-- Ensure helper exists (defined in 20260319_sanitation_critical.sql in most envs)
create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) in ('manager','admin','supervisor'),
    false
  );
$$;

alter table public.import_runs enable row level security;

drop policy if exists "import_runs_select_elevated" on public.import_runs;
drop policy if exists "import_runs_insert_elevated" on public.import_runs;

create policy "import_runs_select_elevated"
on public.import_runs
for select
using ( public.is_manager_or_admin() );

create policy "import_runs_insert_elevated"
on public.import_runs
for insert
with check ( public.is_manager_or_admin() and auth.uid() = user_id );

