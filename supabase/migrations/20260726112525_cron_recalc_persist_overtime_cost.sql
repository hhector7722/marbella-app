-- =================================================================
-- Cron semanal: horas en SQL + persistencia Cost Engine vía HTTP
--
-- 1) rpc_recalculate_all_balances() — Hours Engine (sin dinero)
-- 2) pg_net → GET /api/cron/recalculate-balances?mode=persist-only&slot=…
--
-- Si falta URL/bearer, las horas SÍ se recalculan y se emite WARNING
-- (Vercel Cron de refuerzo puede completar el dinero).
--
-- app_settings:
--   recalc_balances_cron_url → URL del endpoint
--   cron_recalc_bearer       → = CRON_SECRET (Vercel); no versionar el real
-- =================================================================

begin;

create extension if not exists pg_net;

insert into public.app_settings (key, value)
values (
  'recalc_balances_cron_url',
  'https://marbella-app.vercel.app/api/cron/recalculate-balances'
)
on conflict (key) do nothing;

insert into public.app_settings (key, value)
values (
  'cron_recalc_bearer',
  'REPLACE_WITH_CRON_SECRET'
)
on conflict (key) do nothing;

drop policy if exists "app_settings_read_authenticated" on public.app_settings;

create policy "app_settings_read_authenticated"
  on public.app_settings
  for select
  to authenticated
  using (
    key not in (
      'cron_recalc_bearer',
      'cron_secret',
      'service_role_key'
    )
  );

create or replace function public.fn_cron_request_persist_overtime_cost(p_slot text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_bearer text;
  v_request_id bigint;
begin
  if p_slot is distinct from 'winter' and p_slot is distinct from 'summer' then
    raise exception 'fn_cron_request_persist_overtime_cost: slot inválido %', p_slot;
  end if;

  select value into v_url
  from public.app_settings
  where key = 'recalc_balances_cron_url';

  select value into v_bearer
  from public.app_settings
  where key = 'cron_recalc_bearer';

  if v_url is null or length(trim(v_url)) = 0 then
    raise exception
      'Falta app_settings.recalc_balances_cron_url';
  end if;

  if v_bearer is null
     or length(trim(v_bearer)) = 0
     or v_bearer = 'REPLACE_WITH_CRON_SECRET' then
    raise exception
      'Falta app_settings.cron_recalc_bearer (= CRON_SECRET de Vercel)';
  end if;

  -- Base URL sin query; mode/slot van en params (pg_net los append)
  v_url := split_part(v_url, '?', 1);

  select net.http_get(
    url := v_url,
    params := jsonb_build_object(
      'mode', 'persist-only',
      'slot', p_slot
    ),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_bearer,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 290000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

comment on function public.fn_cron_request_persist_overtime_cost(text) is
  'Tras rpc horas: pg_net GET persist-only Cost Engine (slot winter|summer).';

grant execute on function public.madrid_utc_offset_hours(timestamptz) to service_role;
grant execute on function public.madrid_utc_offset_hours(timestamptz) to authenticated;

create or replace function public.cron_weekly_recalculate_balances_if_madrid_winter()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.madrid_utc_offset_hours(now()) = 1 then
    perform public.rpc_recalculate_all_balances();
    begin
      perform public.fn_cron_request_persist_overtime_cost('winter');
    exception when others then
      raise warning
        'Cron winter: horas OK; persist Cost Engine falló: %',
        SQLERRM;
    end;
  end if;
end;
$$;

comment on function public.cron_weekly_recalculate_balances_if_madrid_winter() is
  'pg_cron invierno: rpc horas + HTTP persist-only Cost Engine si Madrid CET.';

create or replace function public.cron_weekly_recalculate_balances_if_madrid_summer()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.madrid_utc_offset_hours(now()) = 2 then
    perform public.rpc_recalculate_all_balances();
    begin
      perform public.fn_cron_request_persist_overtime_cost('summer');
    exception when others then
      raise warning
        'Cron summer: horas OK; persist Cost Engine falló: %',
        SQLERRM;
    end;
  end if;
end;
$$;

comment on function public.cron_weekly_recalculate_balances_if_madrid_summer() is
  'pg_cron verano: rpc horas + HTTP persist-only Cost Engine si Madrid CEST.';

commit;
