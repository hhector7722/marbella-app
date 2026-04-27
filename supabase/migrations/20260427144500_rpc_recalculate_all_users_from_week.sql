-- =================================================================
-- RPC: rpc_recalculate_all_users_from_week
-- Recalcula balances para TODOS los empleados desde una semana (lunes) concreta.
--
-- Uso típico:
--   select public.rpc_recalculate_all_users_from_week('2026-04-20'::date);
--
-- Nota operativa:
-- - No recalcula semanas anteriores a p_week_start.
-- - Recalcula hacia delante para mantener consistencia del arrastre.
-- =================================================================

begin;

create or replace function public.rpc_recalculate_all_users_from_week(
  p_week_start date
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_week_start date;
  v_user_id uuid;
  v_count int := 0;
begin
  v_week_start := public.get_iso_week_start(p_week_start);

  -- Recalcular solo usuarios con actividad o snapshots desde esa semana
  for v_user_id in
    (
      select distinct p.id
      from public.profiles p
      where exists (
        select 1
        from public.time_logs tl
        where tl.user_id = p.id
          and (tl.clock_in at time zone 'Europe/Madrid')::date >= v_week_start
      )
      or exists (
        select 1
        from public.weekly_snapshots ws
        where ws.user_id = p.id
          and ws.week_start >= v_week_start
      )
    )
  loop
    perform public.fn_recalc_and_propagate_snapshots(v_user_id, v_week_start);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'fromWeekStart', v_week_start::text,
    'usersRecalculated', v_count,
    'message', 'Recálculo parcial completado (todos los empleados desde semana indicada).'
  );
end;
$$;

comment on function public.rpc_recalculate_all_users_from_week(date) is
'Recalcula balances para todos los empleados desde un lunes concreto (propaga hacia delante).';

notify pgrst, 'reload schema';

commit;

