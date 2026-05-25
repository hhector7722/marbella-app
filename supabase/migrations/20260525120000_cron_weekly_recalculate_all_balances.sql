-- =================================================================
-- Cron: recálculo global de balances semanales (horas / arrastre)
--
-- Dos jobs pg_cron (UTC) con guarda DST Europe/Madrid; solo uno ejecuta
-- rpc_recalculate_all_balances() cada lunes a las 04:00 locales:
--
--   weekly_recalculate_balances_winter  0 3 * * 1  → 04:00 CET (UTC+1)
--   weekly_recalculate_balances_summer  0 2 * * 1  → 04:00 CEST (UTC+2)
--
-- NO usar CREATE EXTENSION pg_cron (Supabase hosted: error 2BP01).
-- Habilitar en Dashboard → Database → Extensions → pg_cron si falta schema cron.
-- =================================================================

begin;

-- Offset horario Madrid vs UTC en el instante ts (1 = CET, 2 = CEST).
create or replace function public.madrid_utc_offset_hours(ts timestamptz default now())
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    extract(
      epoch from (
        (ts at time zone 'Europe/Madrid') - (ts at time zone 'UTC')
      )
    ) / 3600
  )::integer;
$$;

comment on function public.madrid_utc_offset_hours(timestamptz) is
  'Horas de diferencia reloj Madrid − UTC (1 invierno CET, 2 verano CEST).';

create or replace function public.cron_weekly_recalculate_balances_if_madrid_winter()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.madrid_utc_offset_hours(now()) = 1 then
    perform public.rpc_recalculate_all_balances();
  end if;
end;
$$;

comment on function public.cron_weekly_recalculate_balances_if_madrid_winter() is
  'pg_cron invierno: recálculo solo si Madrid está en CET (offset UTC+1).';

create or replace function public.cron_weekly_recalculate_balances_if_madrid_summer()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.madrid_utc_offset_hours(now()) = 2 then
    perform public.rpc_recalculate_all_balances();
  end if;
end;
$$;

comment on function public.cron_weekly_recalculate_balances_if_madrid_summer() is
  'pg_cron verano: recálculo solo si Madrid está en CEST (offset UTC+2).';

do $cron_setup$
declare
  r record;
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise exception
      'pg_cron no está habilitado. Dashboard → Database → Extensions → pg_cron.';
  end if;

  for r in
    select jobid
    from cron.job
    where jobname in (
      'weekly_recalculate_all_balances',
      'weekly_recalculate_balances_winter',
      'weekly_recalculate_balances_summer'
    )
  loop
    perform cron.unschedule(r.jobid);
  end loop;

  perform cron.schedule(
    'weekly_recalculate_balances_winter',
    '0 3 * * 1',
    $$select public.cron_weekly_recalculate_balances_if_madrid_winter();$$
  );

  perform cron.schedule(
    'weekly_recalculate_balances_summer',
    '0 2 * * 1',
    $$select public.cron_weekly_recalculate_balances_if_madrid_summer();$$
  );
end;
$cron_setup$;

commit;
