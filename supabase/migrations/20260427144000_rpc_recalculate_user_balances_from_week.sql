-- =================================================================
-- RPC: rpc_recalculate_user_balances_from_week
-- Recalcula balances SOLO para 1 empleado desde una semana (lunes) concreta.
--
-- Nota operativa:
-- - Aunque "quieras una semana", el arrastre obliga a recalcular desde ese lunes
--   hacia delante para ese empleado, para que pending_balance/final_balance
--   queden consistentes en semanas posteriores.
-- =================================================================

begin;

create or replace function public.rpc_recalculate_user_balances_from_week(
  p_user_id uuid,
  p_week_start date
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_week_start date;
begin
  -- Normaliza a lunes (inicio ISO week)
  v_week_start := public.get_iso_week_start(p_week_start);

  perform public.fn_recalc_and_propagate_snapshots(p_user_id, v_week_start);

  return jsonb_build_object(
    'success', true,
    'userId', p_user_id,
    'fromWeekStart', v_week_start::text,
    'message', 'Recálculo parcial completado (1 empleado desde semana indicada).'
  );
end;
$$;

comment on function public.rpc_recalculate_user_balances_from_week(uuid, date) is
'Recalcula balances SOLO para 1 empleado desde un lunes concreto (propaga hacia delante).';

notify pgrst, 'reload schema';

commit;

