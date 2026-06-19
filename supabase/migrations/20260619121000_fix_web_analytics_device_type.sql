-- Corrige device_type en record_web_analytics_event (usaba p_locale por error)

create or replace function public.record_web_analytics_event(
  p_visitor_id uuid,
  p_session_id uuid,
  p_event_type public.web_analytics_event_type,
  p_path text default null,
  p_label text default null,
  p_search text default null,
  p_referrer_path text default null,
  p_external_referrer text default null,
  p_duration_ms integer default null,
  p_locale text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_device_type text default null,
  p_viewport_width integer default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_visitor_id is null or p_session_id is null then
    raise exception 'visitor_id y session_id son obligatorios';
  end if;

  insert into public.web_analytics_events (
    visitor_id,
    session_id,
    event_type,
    path,
    label,
    search,
    referrer_path,
    external_referrer,
    duration_ms,
    locale,
    utm_source,
    utm_medium,
    utm_campaign,
    device_type,
    viewport_width,
    metadata
  )
  values (
    p_visitor_id,
    p_session_id,
    p_event_type,
    nullif(left(trim(coalesce(p_path, '')), 512), ''),
    nullif(left(trim(coalesce(p_label, '')), 512), ''),
    nullif(left(trim(coalesce(p_search, '')), 1024), ''),
    nullif(left(trim(coalesce(p_referrer_path, '')), 512), ''),
    nullif(left(trim(coalesce(p_external_referrer, '')), 1024), ''),
    case
      when p_duration_ms is null then null
      when p_duration_ms < 0 then null
      when p_duration_ms > 86400000 then 86400000
      else p_duration_ms
    end,
    nullif(left(trim(coalesce(p_locale, '')), 16), ''),
    nullif(left(trim(coalesce(p_utm_source, '')), 128), ''),
    nullif(left(trim(coalesce(p_utm_medium, '')), 128), ''),
    nullif(left(trim(coalesce(p_utm_campaign, '')), 128), ''),
    nullif(left(trim(coalesce(p_device_type, '')), 32), ''),
    case
      when p_viewport_width is null then null
      when p_viewport_width < 0 then null
      when p_viewport_width > 10000 then 10000
      else p_viewport_width
    end,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;
