-- Import runs history for /dashboard/import (legacy migration assistant)
-- Stores last imported file per step to avoid re-importing.

create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  step text not null,
  file_name text,
  file_hash_sha256 text,
  record_count integer,
  success boolean not null default false,
  result_message text,
  errors jsonb not null default '[]'::jsonb
);

alter table public.import_runs enable row level security;

-- Manager/Admin/Supervisor can read and write import history.
create policy "import_runs_select_elevated"
on public.import_runs
for select
using ( (auth.jwt() ->> 'role')::text in ('manager','admin','supervisor') );

create policy "import_runs_insert_elevated"
on public.import_runs
for insert
with check (
  (auth.jwt() ->> 'role')::text in ('manager','admin','supervisor')
  and auth.uid() = user_id
);

-- Optional: prevent accidental updates/deletes via client API.
revoke update, delete on table public.import_runs from authenticated, anon;

create index if not exists import_runs_step_created_at_idx
  on public.import_runs (step, created_at desc);

