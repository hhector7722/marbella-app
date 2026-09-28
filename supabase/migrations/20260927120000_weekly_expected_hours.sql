-- Horas previstas de una semana que cruza el cierre de agosto.
-- Hecho de entrada (empleado + semana + día). No es proyección.
-- weekly_snapshots sigue siendo el resultado del Writer.

begin;

create or replace function public.can_manage_staff_attendance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select
        p.role in ('manager', 'admin')
        or lower(trim(coalesce(p.email, ''))) = 'hhector7722@gmail.com'
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

comment on function public.can_manage_staff_attendance() is
  'Manager, admin o la cuenta master. Misma puerta que la edición de asistencia en /staff/history. Un trabajador no entra.';

create table public.weekly_expected_hours (
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  day date not null,
  expected_hours numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (user_id, week_start, day),
  constraint weekly_expected_hours_monday_chk
    check (extract(isodow from week_start) = 1),
  constraint weekly_expected_hours_span_chk
    check (day >= week_start and day <= week_start + 6),
  constraint weekly_expected_hours_amount_chk
    check (expected_hours >= 0 and expected_hours <= 24)
);

comment on table public.weekly_expected_hours is
  'Distribución prevista día a día de una semana frontera de agosto. Input administrativo. No sale de fichajes ni de turnos. Siete filas = configurada; cero = pendiente; una a seis = dato corrupto.';

comment on column public.weekly_expected_hours.expected_hours is
  'Horas previstas de ese día antes de eximir el cierre. 0 es un valor real.';

comment on column public.weekly_expected_hours.updated_by is
  'Usuario que guardó la fila. Sin FK: el mismo criterio que otros updated_by del proyecto.';

drop trigger if exists weekly_expected_hours_set_updated_at on public.weekly_expected_hours;
create trigger weekly_expected_hours_set_updated_at
before update on public.weekly_expected_hours
for each row execute function public.update_updated_at_column();

alter table public.weekly_expected_hours enable row level security;

revoke all on table public.weekly_expected_hours from public;
revoke all on table public.weekly_expected_hours from anon;
revoke all on table public.weekly_expected_hours from authenticated;

grant select, insert, update, delete on table public.weekly_expected_hours to authenticated;
grant all on table public.weekly_expected_hours to service_role;

drop policy if exists weekly_expected_hours_select on public.weekly_expected_hours;
create policy weekly_expected_hours_select
  on public.weekly_expected_hours
  for select
  to authenticated
  using (public.can_manage_staff_attendance());

drop policy if exists weekly_expected_hours_insert on public.weekly_expected_hours;
create policy weekly_expected_hours_insert
  on public.weekly_expected_hours
  for insert
  to authenticated
  with check (public.can_manage_staff_attendance());

drop policy if exists weekly_expected_hours_update on public.weekly_expected_hours;
create policy weekly_expected_hours_update
  on public.weekly_expected_hours
  for update
  to authenticated
  using (public.can_manage_staff_attendance())
  with check (public.can_manage_staff_attendance());

drop policy if exists weekly_expected_hours_delete on public.weekly_expected_hours;
create policy weekly_expected_hours_delete
  on public.weekly_expected_hours
  for delete
  to authenticated
  using (public.can_manage_staff_attendance());

notify pgrst, 'reload schema';

commit;
