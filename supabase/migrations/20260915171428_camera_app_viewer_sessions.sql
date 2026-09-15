create table if not exists public.camera_app_viewer_sessions (
  session_id text primary key,
  camera_id text not null,
  user_id uuid not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint camera_app_viewer_sessions_time_check check (ended_at is null or ended_at >= started_at)
);

create index if not exists camera_app_viewer_sessions_camera_active_idx
  on public.camera_app_viewer_sessions (camera_id, ended_at, last_seen_at desc);

create index if not exists camera_app_viewer_sessions_camera_started_idx
  on public.camera_app_viewer_sessions (camera_id, started_at desc);

alter table public.camera_app_viewer_sessions enable row level security;
revoke all on table public.camera_app_viewer_sessions from anon, authenticated;

comment on table public.camera_app_viewer_sessions is 'Server-only presence/history for authenticated viewers of the Marbella camera page.';
