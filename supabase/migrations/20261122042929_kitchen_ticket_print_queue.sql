-- Comandas de reservas para impresora termica de cocina.
-- Solo el backend con service_role puede consultar o modificar esta cola.
create table if not exists public.kitchen_print_jobs (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  event_id uuid references public.events(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  selection text not null check (selection in ('food','drink','all')),
  language text not null check (language in ('ca','es','en')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  error text,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kitchen_print_jobs_pending_idx
  on public.kitchen_print_jobs (created_at, id) where status = 'pending';
create index if not exists kitchen_print_jobs_owner_idx
  on public.kitchen_print_jobs (created_by, created_at desc);
alter table public.kitchen_print_jobs enable row level security;
revoke all on public.kitchen_print_jobs from anon, authenticated;
grant select, insert, update on public.kitchen_print_jobs to service_role;
comment on table public.kitchen_print_jobs is
  'Cola privada de comandas de cocina. Un procesamiento incierto nunca se reintenta automaticamente.';