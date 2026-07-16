-- =================================================================
-- hours_contract_terms — tramos contractuales versionados (hechos)
--
-- Fuente única de jornada / régimen / bolsa-pago / tarifa OT para el motor.
-- profiles.* deja de ser fuente contractual para liquidación.
-- Seed inicial: un tramo abierto por empleado desde el perfil vivo actual.
-- =================================================================

begin;

create table if not exists public.hours_contract_terms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  effective_from date not null,
  effective_to date null,
  weekly_hours numeric not null check (weekly_hours >= 0),
  bag_mode boolean not null default false,
  regime text not null check (regime in ('staff', 'manager', 'fixed')),
  overtime_rate_per_hour numeric null check (
    overtime_rate_per_hour is null or overtime_rate_per_hour >= 0
  ),
  created_at timestamptz not null default now(),
  constraint hours_contract_terms_range_chk check (
    effective_to is null or effective_to >= effective_from
  )
);

create index if not exists hours_contract_terms_user_from_idx
  on public.hours_contract_terms (user_id, effective_from);

comment on table public.hours_contract_terms is
  'Tramos contractuales versionados (hechos). Única fuente de contrato para hours-engine.';

alter table public.hours_contract_terms enable row level security;

drop policy if exists hours_contract_terms_select_own_or_manager on public.hours_contract_terms;
create policy hours_contract_terms_select_own_or_manager
  on public.hours_contract_terms
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_manager_or_admin()
  );

drop policy if exists hours_contract_terms_write_manager on public.hours_contract_terms;
create policy hours_contract_terms_write_manager
  on public.hours_contract_terms
  for all
  to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

-- Seed: un tramo abierto por perfil (estado vivo actual → histórico inicial)
insert into public.hours_contract_terms (
  user_id,
  effective_from,
  effective_to,
  weekly_hours,
  bag_mode,
  regime,
  overtime_rate_per_hour
)
select
  p.id,
  coalesce(p.joining_date, date '2000-01-01'),
  null,
  case
    when p.role = 'manager' or coalesce(p.is_fixed_salary, false) then 0
    else coalesce(p.contracted_hours_weekly, 40)
  end,
  coalesce(p.prefer_stock_hours, false),
  case
    when p.role = 'manager' then 'manager'
    when coalesce(p.is_fixed_salary, false) then 'fixed'
    else 'staff'
  end,
  p.overtime_cost_per_hour
from public.profiles p
where not exists (
  select 1 from public.hours_contract_terms t where t.user_id = p.id
);

notify pgrst, 'reload schema';

commit;
