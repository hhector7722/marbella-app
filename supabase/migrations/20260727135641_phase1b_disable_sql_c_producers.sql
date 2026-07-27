-- Fase 1b (ADR-HE-SSOT-001): desconectar productores SQL de columnas C.
-- No elimina fn_recalc / RPCs históricas; solo deja de invocarlas en producción.
-- Writer TS writeWeeklyProjection es el único productor efectivo de C.

begin;

-- 1) Trigger: UPDATE de B (is_paid / prefer_stock) o de C (contracted_hours_snapshot
--    por el Writer) disparaba fn_recalc → segundo productor de C.
drop trigger if exists trigger_propagate_on_paid_change on public.weekly_snapshots;
drop trigger if exists trigger_propagate_on_config_change on public.weekly_snapshots;

create or replace function public.fn_trigger_propagate_from_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Fase 1b: no-op. Propagación de proyección = writeWeeklyProjection (TS).
  return new;
end;
$$;

comment on function public.fn_trigger_propagate_from_snapshot() is
  'Fase 1b: no-op. Antes llamaba fn_recalc_and_propagate_snapshots; columnas C solo vía Writer TS.';

-- 2) pg_cron: dejar de llamar rpc_recalculate_all_balances (productor SQL de C).
--    Solo dispara el endpoint HTTP (Writer vía /api/cron/recalculate-balances).

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

  v_url := split_part(v_url, '?', 1);

  -- mode=full → Writer writeWeeklyProjection (sin RPC SQL de horas)
  select net.http_get(
    url := v_url,
    params := jsonb_build_object(
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
  'Fase 1b: pg_net GET /api/cron/recalculate-balances (Writer). Sin rpc_recalculate_all_balances.';

create or replace function public.cron_weekly_recalculate_balances_if_madrid_winter()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.madrid_utc_offset_hours(now()) = 1 then
    -- Sin rpc_recalculate_all_balances: columnas C solo vía Writer HTTP.
    begin
      perform public.fn_cron_request_persist_overtime_cost('winter');
    exception when others then
      raise warning
        'Cron winter Fase 1b: Writer HTTP falló: %',
        SQLERRM;
    end;
  end if;
end;
$$;

comment on function public.cron_weekly_recalculate_balances_if_madrid_winter() is
  'Fase 1b pg_cron invierno: solo HTTP Writer (sin rpc SQL de columnas C).';

create or replace function public.cron_weekly_recalculate_balances_if_madrid_summer()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.madrid_utc_offset_hours(now()) = 2 then
    begin
      perform public.fn_cron_request_persist_overtime_cost('summer');
    exception when others then
      raise warning
        'Cron summer Fase 1b: Writer HTTP falló: %',
        SQLERRM;
    end;
  end if;
end;
$$;

comment on function public.cron_weekly_recalculate_balances_if_madrid_summer() is
  'Fase 1b pg_cron verano: solo HTTP Writer (sin rpc SQL de columnas C).';

comment on function public.fn_recalc_and_propagate_snapshots(uuid, date) is
  'LEGACY inerte en producción Fase 1b. Columnas C: writeWeeklyProjection. Función conservada sin callers activos (trigger/cron/app).';

comment on function public.rpc_recalculate_all_balances() is
  'LEGACY inerte en producción Fase 1b. Usar Writer TS /api/cron/recalculate-balances.';

commit;
