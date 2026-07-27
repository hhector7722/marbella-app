-- Fase 1c (ADR-HE-SSOT-001): eliminar el último productor SQL de columnas C.
--
-- Contexto post-Fase 1b:
--   - trigger_propagate_on_config_change ya eliminado
--   - cron weekly_* ya no llama rpc_recalculate_all_balances
--   - Único productor residual:
--       time_logs.trigger_recalc_snapshots
--         → recalc_snapshots_on_log_change()
--           → fn_recalc_and_propagate_snapshots(...)  -- escribe columnas C
--
-- Los flujos TS ya regeneran proyección vía writeWeeklyProjection() tras mutar time_logs.
-- Este trigger SQL es un segundo escritor (dualidad C) y debe desconectarse.
--
-- Decisión:
--   1) DROP TRIGGER (prioridad: ya no es necesario)
--   2) CONVERT FUNCTION → no-op (defensa: si alguien recrea el trigger, no escribe C)
--   3) Conservar fn_recalc_and_propagate_snapshots (legado; sin callers operativos)
--
-- No toca: Writer TS, Hours Engine, Cost Engine, total_cost, filas históricas.

begin;

drop trigger if exists trigger_recalc_snapshots on public.time_logs;

create or replace function public.recalc_snapshots_on_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Fase 1c: no-op (antes invocaba el motor SQL de snapshots).
  -- Proyección columnas C: únicamente writeWeeklyProjection (TS).
  return coalesce(new, old);
end;
$$;

comment on function public.recalc_snapshots_on_log_change() is
  'Fase 1c: no-op. Antes disparaba fn_recalc tras INSERT/UPDATE/DELETE en time_logs. Columnas C solo vía Writer TS.';

comment on function public.fn_recalc_and_propagate_snapshots(uuid, date) is
  'LEGACY inerte Fase 1c. Sin callers operativos (trigger time_logs y cron desconectados). Columnas C: writeWeeklyProjection.';

commit;
