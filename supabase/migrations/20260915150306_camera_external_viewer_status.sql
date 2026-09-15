create table if not exists public.camera_external_viewer_status (
  camera_id text primary key,
  external_connections integer not null default 0 check (external_connections >= 0),
  external_online boolean not null default false,
  checked_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.camera_external_viewer_status enable row level security;

revoke all on table public.camera_external_viewer_status from anon, authenticated;

comment on table public.camera_external_viewer_status is 'Server-only status published by the bar camera bridge; no direct client access.';
