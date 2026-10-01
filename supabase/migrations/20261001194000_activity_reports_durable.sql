-- Durable source of truth for data submitted through /reporte.
-- It is intentionally independent from activity_occurrences so PDF reimports
-- can replace OCR-derived rows without deleting report data.

create table if not exists public.activity_reports (
  id uuid primary key default gen_random_uuid(),
  activity_date date not null,
  activity_id uuid not null references public.activities(id) on delete cascade,
  form_start_time time without time zone,
  form_end_time time without time zone,
  total_participants integer,
  category_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_reports_date_activity_unique unique (activity_date, activity_id)
);

alter table public.activity_reports enable row level security;

comment on table public.activity_reports is
  'Fuente durable de /reporte. No se elimina al reimportar PDFs del pabellón.';

create index if not exists idx_activity_reports_activity_date
  on public.activity_reports (activity_date);

-- Backfill de cualquier dato de /reporte que siga presente hoy en
-- activity_occurrences, incluidos participantes y categorías.
insert into public.activity_reports (
  activity_date,
  activity_id,
  form_start_time,
  form_end_time,
  total_participants,
  category_ids,
  updated_at
)
select
  o.activity_date,
  o.activity_id,
  max(o.form_start_time) as form_start_time,
  max(o.form_end_time) as form_end_time,
  max(o.total_participants) as total_participants,
  coalesce(
    array_agg(distinct g.category_id) filter (where g.category_id is not null),
    '{}'::uuid[]
  ) as category_ids,
  now()
from public.activity_occurrences o
left join public.occurrence_groups g on g.occurrence_id = o.id
where
  o.form_start_time is not null
  or o.form_end_time is not null
  or o.preferred_start_time = 'form'
  or o.preferred_end_time = 'form'
  or o.total_participants is not null
group by o.activity_date, o.activity_id
on conflict (activity_date, activity_id) do update set
  form_start_time = excluded.form_start_time,
  form_end_time = excluded.form_end_time,
  total_participants = excluded.total_participants,
  category_ids = excluded.category_ids,
  updated_at = now();
