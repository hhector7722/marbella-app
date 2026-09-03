-- Notas libres por día y por usuario en el horario.
-- Cada usuario (staff) ve solo su nota del día; manager/supervisor/admin ve todas las del día.
-- Patrón RLS alineado con el resto del esquema: helper public.is_manager_or_admin().

begin;

-- Helper RBAC (idempotente; incluye supervisor como en migraciones posteriores)
create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) in ('manager', 'admin', 'supervisor'),
    false
  );
$$;

create table if not exists public.schedule_day_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

comment on table public.schedule_day_notes is
  'Nota libre por día y por usuario en el horario. Cada usuario ve la suya; el manager ve todas las del día.';

alter table public.schedule_day_notes enable row level security;

-- Lectura: la propia nota; manager/admin/supervisor, todas las del día.
drop policy if exists "schedule_day_notes_select" on public.schedule_day_notes;
create policy "schedule_day_notes_select"
  on public.schedule_day_notes
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_manager_or_admin());

-- Inserción: solo nota propia.
drop policy if exists "schedule_day_notes_insert" on public.schedule_day_notes;
create policy "schedule_day_notes_insert"
  on public.schedule_day_notes
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Actualización: solo nota propia.
drop policy if exists "schedule_day_notes_update" on public.schedule_day_notes;
create policy "schedule_day_notes_update"
  on public.schedule_day_notes
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Borrado: solo nota propia.
drop policy if exists "schedule_day_notes_delete" on public.schedule_day_notes;
create policy "schedule_day_notes_delete"
  on public.schedule_day_notes
  for delete
  to authenticated
  using (user_id = auth.uid());

notify pgrst, 'reload schema';

commit;