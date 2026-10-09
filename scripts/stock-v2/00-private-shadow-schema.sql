-- Stock 2.0: recinto privado para simulación histórica, sin cambiar stock_current
-- 2026-10-09. Administrador únicamente, ningún grant a clientes ni API pública.
create schema if not exists stock_v2;
revoke all on schema stock_v2 from public, anon, authenticated;

create table if not exists stock_v2.replay_runs (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  status text not null default 'draft'
    check (status in ('draft','simulated','blocked','approved')),
  description text not null,
  assumptions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create table if not exists stock_v2.daily_deltas (
  run_id uuid not null references stock_v2.replay_runs(id) on delete cascade,
  business_date date not null,
  ingredient_id uuid not null references public.ingredients(id),
  source text not null check (source in ('sale_recipe_estimate','purchase_legacy','purchase_k4')),
  base_unit text not null check (base_unit in ('g','ml','ud')),
  signed_quantity numeric(20,4) not null,
  source_records bigint not null check (source_records >= 0),
  is_estimate boolean not null,
  primary key (run_id,business_date,ingredient_id,source,base_unit)
);
create index if not exists stock_v2_daily_by_ingredient
  on stock_v2.daily_deltas(run_id,ingredient_id,business_date);
create table if not exists stock_v2.issues (
  run_id uuid not null references stock_v2.replay_runs(id) on delete cascade,
  issue_type text not null,
  source_key text not null,
  occurrences bigint not null check (occurrences >= 1),
  evidence jsonb not null default '{}'::jsonb,
  primary key(run_id,issue_type,source_key)
);
create table if not exists stock_v2.inventory_candidates (
  run_id uuid not null references stock_v2.replay_runs(id) on delete cascade,
  count_id uuid not null references public.inventory_counts(id),
  ingredient_id uuid not null references public.ingredients(id),
  count_date timestamptz not null,
  physical_quantity numeric(20,4) not null,
  counted_unit text not null,
  certified boolean not null default false,
  primary key(run_id,count_id,ingredient_id)
);
alter table stock_v2.replay_runs enable row level security;
alter table stock_v2.daily_deltas enable row level security;
alter table stock_v2.issues enable row level security;
alter table stock_v2.inventory_candidates enable row level security;
revoke all on all tables in schema stock_v2 from public, anon, authenticated;

comment on schema stock_v2 is 'Simulador administrativo de stock 2.0. NO es stock real y no debe consultarse en el TPV hasta certificar inventario y conciliar entradas.';
comment on table stock_v2.daily_deltas is 'Saldos relativos, sin existencias iniciales. Ventas basadas en recetas actuales, históricamente estimadas.';
