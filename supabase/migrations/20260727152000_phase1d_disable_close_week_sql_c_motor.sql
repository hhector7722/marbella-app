-- Fase 1d (ADR-HE-SSOT-001): eliminar el último motor SQL legacy del cierre semanal.
--
-- close_week_for_all_users calculaba e upsertaba columnas C en weekly_snapshots
-- (profiles + view_daily_hours_breakdown + final_balance previo) sin Hours Engine
-- ni writeWeeklyProjection.
--
-- Tras esta migración:
--   - close_week_for_all_users NO calcula ni escribe columnas C.
--   - el job pg_cron close-previous-week invoca solo el flujo oficial (HTTP Writer).
--   - fn_recalc_and_propagate_snapshots queda no-op (ya sin callers de trigger/cron;
--     evita un segundo motor SQL invocable por RPC).
--
-- Columnas C (única vía): Hours Engine → writeWeeklyProjection (TS).

begin;

-- ---------------------------------------------------------------------------
-- 1) Wrapper de cierre semanal → HTTP Writer (mismo endpoint que winter/summer)
-- ---------------------------------------------------------------------------
create or replace function public.cron_close_previous_week_via_writer()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offset integer;
begin
  -- DST Madrid: CET=1 → winter (03:00 UTC), CEST=2 → summer (02:00 UTC).
  -- Misma guardia que cron_weekly_recalculate_balances_if_madrid_*.
  v_offset := public.madrid_utc_offset_hours(now());

  begin
    if v_offset = 2 then
      perform public.fn_cron_request_persist_overtime_cost('summer');
    else
      -- CET (1) u offset inesperado: winter (el endpoint puede skipped si DST no cuadra)
      perform public.fn_cron_request_persist_overtime_cost('winter');
    end if;
  exception when others then
    raise warning
      'Cron close-previous-week Fase 1d: Writer HTTP falló: %',
      SQLERRM;
  end;
end;
$$;

comment on function public.cron_close_previous_week_via_writer() is
  'Fase 1d: cierre semana anterior vía HTTP Writer (/api/cron/recalculate-balances). Sin SQL de columnas C.';

-- ---------------------------------------------------------------------------
-- 2) close_week_for_all_users → no-op (firma conservada; sin cálculo C)
-- ---------------------------------------------------------------------------
create or replace function public.close_week_for_all_users(
  target_week_start date,
  target_week_end date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Fase 1d: sin INSERT/UPDATE de columnas C.
  -- target_week_start / target_week_end se ignoran a propósito: la proyección
  -- oficial recalcula la cadena completa vía Hours Engine → writeWeeklyProjection.
  --
  -- Si se invoca por RPC, delega al mismo pipeline HTTP que el cron
  -- (idempotente con winter/summer).
  perform public.cron_close_previous_week_via_writer();
end;
$$;

comment on function public.close_week_for_all_users(date, date) is
  'Fase 1d: no calcula columnas C. Delega a Writer HTTP (Hours Engine → writeWeeklyProjection). Params de semana ignorados.';

-- ---------------------------------------------------------------------------
-- 3) pg_cron: close-previous-week deja de ejecutar el motor SQL legacy
--    (cron.alter_job: el rol no puede UPDATE directo sobre cron.job)
-- ---------------------------------------------------------------------------
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'close-previous-week'
  limit 1;

  if v_job_id is null then
    raise warning
      'Fase 1d: job close-previous-week no encontrado; no se actualizó cron';
  else
    perform cron.alter_job(
      v_job_id,
      command := 'select public.cron_close_previous_week_via_writer();',
      active := true
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) fn_recalc → no-op (motor SQL residual invocable por RPC legacy)
--    Las RPCs rpc_recalculate_* llaman a esta función; quedan inofensivas.
-- ---------------------------------------------------------------------------
create or replace function public.fn_recalc_and_propagate_snapshots(
  p_user_id uuid,
  p_start_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Fase 1d: no-op. Antes calculaba e upsertaba columnas C en weekly_snapshots.
  -- Productor único: writeWeeklyProjection (TS).
  -- Params conservados por firma; no se usan.
  null;
end;
$$;

comment on function public.fn_recalc_and_propagate_snapshots(uuid, date) is
  'Fase 1d: no-op. LEGACY. Columnas C solo vía writeWeeklyProjection (TS).';

commit;
