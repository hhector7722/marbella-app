-- Seguimiento de uso de la app (sesiones, vistas, acciones)

create type public.app_usage_event_type as enum ('login', 'session', 'page_view', 'action');

create table public.app_usage_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_type public.app_usage_event_type not null,
  path text,
  label text,
  search text,
  referrer_path text,
  duration_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on column public.app_usage_events.label is 'Etiqueta legible (ej. Albaranes, Cierre caja)';
comment on column public.app_usage_events.search is 'Query string sin pathname';
comment on column public.app_usage_events.referrer_path is 'Ruta anterior en la navegacion';
comment on column public.app_usage_events.duration_ms is 'Tiempo en pantalla/modal anterior (ms)';
comment on column public.app_usage_events.metadata is 'Contexto: action, modalId, tabLabel, etc.';

create index idx_app_usage_events_profile_created
  on public.app_usage_events (profile_id, created_at desc);

create index idx_app_usage_events_created
  on public.app_usage_events (created_at desc);

create index idx_app_usage_events_type_created
  on public.app_usage_events (event_type, created_at desc);

create or replace function public.is_usage_analyst(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and lower(trim(coalesce(p.email, ''))) = 'hhector7722@gmail.com'
  );
$$;

alter table public.app_usage_events enable row level security;

create policy app_usage_events_insert on public.app_usage_events
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy app_usage_events_select on public.app_usage_events
  for select
  to authenticated
  using (public.is_usage_analyst());

grant execute on function public.is_usage_analyst(uuid) to authenticated;
