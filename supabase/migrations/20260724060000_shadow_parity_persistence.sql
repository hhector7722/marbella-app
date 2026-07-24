-- =================================================================
-- Shadow Mode — persistencia de migración SSOT (Fase 1 Commit 7)
-- Solo lecturas/escrituras del dominio Migración. No toca liquidación.
-- =================================================================

begin;

create table if not exists public.shadow_parity_runs (
  id uuid primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  status text not null check (status in ('completed', 'failed')),
  horizon_start date not null,
  horizon_end date not null,
  duration_ms integer not null check (duration_ms >= 0),
  hours_engine_version text not null,
  shadow_version text not null,
  config jsonb not null default '{}'::jsonb,
  error_message text null,
  created_at timestamptz not null default now()
);

comment on table public.shadow_parity_runs is
  'Shadow Mode: ejecuciones de paridad (reproducibles). Dominio Migración.';

create table if not exists public.shadow_parity_run_metrics (
  run_id uuid primary key references public.shadow_parity_runs (id) on delete cascade,
  total_subjects integer not null,
  exact_matches integer not null,
  tolerated_matches integer not null,
  critical_differences integer not null,
  comparisons integer not null,
  skipped integer not null,
  diffs integer not null,
  duration_ms integer not null,
  exact_match_rate numeric not null,
  critical_diff_rate numeric not null,
  by_code jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.shadow_parity_discrepancies (
  id uuid primary key,
  fingerprint text not null unique,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  discrepancy_code text not null,
  severity text not null,
  owner text not null,
  status text not null,
  affected_fields text[] not null default '{}',
  occurrences integer not null default 1 check (occurrences >= 1),
  accepted boolean not null default false,
  notes text null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shadow_parity_discrepancies_subject_idx
  on public.shadow_parity_discrepancies (employee_id, week_start);

create index if not exists shadow_parity_discrepancies_status_idx
  on public.shadow_parity_discrepancies (status);

comment on table public.shadow_parity_discrepancies is
  'Shadow Mode: entidad principal de discrepancia (identidad = fingerprint).';

create table if not exists public.shadow_parity_comparisons (
  id uuid primary key,
  run_id uuid not null references public.shadow_parity_runs (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  match_status text not null,
  primary_discrepancy_code text null,
  discrepancy_fingerprints text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (run_id, employee_id, week_start)
);

create index if not exists shadow_parity_comparisons_run_idx
  on public.shadow_parity_comparisons (run_id);

create table if not exists public.shadow_parity_field_diffs (
  id uuid primary key,
  comparison_id uuid not null references public.shadow_parity_comparisons (id) on delete cascade,
  run_id uuid not null references public.shadow_parity_runs (id) on delete cascade,
  field text not null,
  he_value jsonb null,
  sql_value jsonb null,
  discrepancy_code text not null,
  severity text not null,
  created_at timestamptz not null default now(),
  unique (comparison_id, field)
);

create index if not exists shadow_parity_field_diffs_run_idx
  on public.shadow_parity_field_diffs (run_id);

-- RLS: solo managers/admins (tooling de migración)
alter table public.shadow_parity_runs enable row level security;
alter table public.shadow_parity_run_metrics enable row level security;
alter table public.shadow_parity_discrepancies enable row level security;
alter table public.shadow_parity_comparisons enable row level security;
alter table public.shadow_parity_field_diffs enable row level security;

drop policy if exists shadow_parity_runs_manager on public.shadow_parity_runs;
create policy shadow_parity_runs_manager
  on public.shadow_parity_runs
  for all
  to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

drop policy if exists shadow_parity_run_metrics_manager on public.shadow_parity_run_metrics;
create policy shadow_parity_run_metrics_manager
  on public.shadow_parity_run_metrics
  for all
  to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

drop policy if exists shadow_parity_discrepancies_manager on public.shadow_parity_discrepancies;
create policy shadow_parity_discrepancies_manager
  on public.shadow_parity_discrepancies
  for all
  to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

drop policy if exists shadow_parity_comparisons_manager on public.shadow_parity_comparisons;
create policy shadow_parity_comparisons_manager
  on public.shadow_parity_comparisons
  for all
  to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

drop policy if exists shadow_parity_field_diffs_manager on public.shadow_parity_field_diffs;
create policy shadow_parity_field_diffs_manager
  on public.shadow_parity_field_diffs
  for all
  to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

commit;
