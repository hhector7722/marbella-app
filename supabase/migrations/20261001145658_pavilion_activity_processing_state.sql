alter table public.pavilion_activity_sheets
  add column if not exists content_hash text,
  add column if not exists processing_status text not null default 'pending',
  add column if not exists processing_error text,
  add column if not exists processed_at timestamptz,
  add column if not exists processing_attempts integer not null default 0;

alter table public.pavilion_activity_sheets
  drop constraint if exists pavilion_activity_sheets_processing_status_check;

alter table public.pavilion_activity_sheets
  add constraint pavilion_activity_sheets_processing_status_check
  check (processing_status in ('pending', 'processing', 'processed', 'error'));

create index if not exists idx_pavilion_activity_sheets_processing_status
  on public.pavilion_activity_sheets (processing_status);
