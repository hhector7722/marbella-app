-- =================================================================
-- RPC: rpc_recalculate_all_balances_from_week
-- Recalcula balances para TODOS los empleados desde una semana (lunes) concreta.
--
-- Uso:
--   select public.rpc_recalculate_all_balances_from_week('2026-04-14'::date);
--   select public.rpc_recalculate_all_balances_from_week(public.get_iso_week_start('2026-04-16'::date));
-- =================================================================

begin;

create or replace function public.rpc_recalculate_all_balances_from_week(
  p_week_start date
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_week_start date;
  v_user record;
  v_count int := 0;
begin
  v_week_start := public.get_iso_week_start(p_week_start);

  for v_user in
    select id from public.profiles
  loop
    perform public.fn_recalc_and_propagate_snapshots(v_user.id, v_week_start);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'fromWeekStart', v_week_start::text,
    'usersRecalculated', v_count,
    'message', 'Recálculo completado (todos los empleados desde la semana indicada).'
  );
end;
$$;

comment on function public.rpc_recalculate_all_balances_from_week(date) is
'Recalcula balances para TODOS los empleados desde un lunes concreto (propaga hacia delante por empleado).';

grant execute on function public.rpc_recalculate_all_balances_from_week(date) to anon;
grant execute on function public.rpc_recalculate_all_balances_from_week(date) to authenticated;
grant execute on function public.rpc_recalculate_all_balances_from_week(date) to service_role;

notify pgrst, 'reload schema';

commit;

