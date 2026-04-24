-- map_tpv_receta: RLS + policies para permitir crear/editar mapeos desde dashboard
-- - SELECT: cualquier autenticado (para cargar editor)
-- - INSERT/UPDATE/DELETE: solo manager/admin/supervisor

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

alter table public.map_tpv_receta enable row level security;

drop policy if exists "Authenticated can read map_tpv_receta" on public.map_tpv_receta;
create policy "Authenticated can read map_tpv_receta"
  on public.map_tpv_receta
  for select
  to authenticated
  using (true);

drop policy if exists "Managers manage map_tpv_receta" on public.map_tpv_receta;
create policy "Managers manage map_tpv_receta"
  on public.map_tpv_receta
  for all
  to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

