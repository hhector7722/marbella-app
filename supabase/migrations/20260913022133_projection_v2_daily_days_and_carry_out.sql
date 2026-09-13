-- PROJECTION CONTRACT v2: carry_out en la fila semanal y desglose diario hijo.
-- Columnas C nuevas: el Writer es el único productor. NULL = aún no regenerado en v2.
-- Las lecturas no inventan ceros: si falta proyección v2, el read-model falla visible.

begin;

alter table public.weekly_snapshots
  add column if not exists carry_out numeric(10, 2),
  add column if not exists prefer_stock_effective boolean,
  add column if not exists has_missing_rate boolean,
  add column if not exists overtime_rate_effective numeric(10, 2);

comment on column public.weekly_snapshots.carry_out is
  'C) LiquidationResult.carryOut. Writer único. NULL = proyección v2 pendiente.';
comment on column public.weekly_snapshots.prefer_stock_effective is
  'C) Bolsa efectiva de la semana (override B o todos los segmentos bolsa). Writer único.';
comment on column public.weekly_snapshots.has_missing_rate is
  'C) Cost Engine: falta tarifa OT. Writer único. Distinto de total_cost = 0.';
comment on column public.weekly_snapshots.overtime_rate_effective is
  'C) €/h efectivo usado por el Cost Engine. NULL si falta tarifa o no aplica.';

create table if not exists public.weekly_snapshot_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  day date not null,
  overtime_hours numeric(10, 2) not null,
  overtime_cost numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day),
  constraint weekly_snapshot_days_week_fk
    foreign key (user_id, week_start)
    references public.weekly_snapshots (user_id, week_start)
    on delete cascade,
  constraint weekly_snapshot_days_day_in_week
    check (day >= week_start and day <= (week_start + 6))
);

create index if not exists weekly_snapshot_days_week_idx
  on public.weekly_snapshot_days (user_id, week_start);

comment on table public.weekly_snapshot_days is
  'Proyección diaria hija de weekly_snapshots. OT bruto y € extra del día. Writer único.';
comment on column public.weekly_snapshot_days.overtime_hours is
  'C) dailyBreakdown.overtimeHours del Hours Engine. Distinto del pie Extras.';
comment on column public.weekly_snapshot_days.overtime_cost is
  'C) Reparto de total_cost por pesos de overtime_hours. Cost Engine + Writer.';

alter table public.weekly_snapshot_days enable row level security;

revoke all on public.weekly_snapshot_days from anon, public;

grant select, insert, update, delete on public.weekly_snapshot_days to authenticated;
grant all on public.weekly_snapshot_days to service_role;

create policy "weekly_snapshot_days_staff_select_own"
  on public.weekly_snapshot_days
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "weekly_snapshot_days_staff_write_own"
  on public.weekly_snapshot_days
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "weekly_snapshot_days_manager_or_admin"
  on public.weekly_snapshot_days
  for all
  to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

notify pgrst, 'reload schema';

commit;
