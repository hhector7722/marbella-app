alter table public.camera_app_viewer_sessions
  add column if not exists viewer_email text;

update public.camera_app_viewer_sessions s
set viewer_email = lower(trim(p.email))
from public.profiles p
where s.user_id = p.id
  and s.viewer_email is null;

create index if not exists camera_app_viewer_sessions_viewer_email_idx
  on public.camera_app_viewer_sessions (viewer_email);
