-- =================================================================
-- SSOT: comentario de versión en fn_recalc + GRANTs RPC recálculo parcial
-- - Documenta en catálogo qué motor de propagación se espera.
-- - Expone rpc_recalculate_user_balances_from_week y rpc_recalculate_all_users_from_week
--   a roles de API (misma línea que get_monthly_timesheet en 20260427200500).
-- =================================================================

begin;

comment on function public.fn_recalc_and_propagate_snapshots(uuid, date) is
'SSOT weekly balances. Fingerprint 2026-04-28: Madrid TZ day partition; joining_date pre/post split for staff weekly_balance; carry negative always; carry positive only if prev week bolsa AND NOT is_paid; sync profiles.hours_balance. Ver context/HORAS_SNAPSHOTS_Y_ARRASTRE.md y sql/diagnostics/verify_fn_recalc_engine.sql.';

comment on function public.rpc_recalculate_user_balances_from_week(uuid, date) is
'Recálculo parcial: un empleado desde p_week_start (lunes ISO). Preferir frente a rpc_recalculate_all_balances_from_week cuando el alcance es una persona.';

grant execute on function public.rpc_recalculate_user_balances_from_week(uuid, date) to anon;
grant execute on function public.rpc_recalculate_user_balances_from_week(uuid, date) to authenticated;
grant execute on function public.rpc_recalculate_user_balances_from_week(uuid, date) to service_role;

-- Opcional: existe solo si aplicaste 20260427144500_rpc_recalculate_all_users_from_week.sql
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rpc_recalculate_all_users_from_week'
  ) then
    execute
      $c$comment on function public.rpc_recalculate_all_users_from_week(date) is
'Recálculo parcial: empleados con time_logs o weekly_snapshots desde p_week_start. Preferir frente a rpc_recalculate_all_balances_from_week (itera todos los profiles) salvo necesidad de reescribir filas sin actividad.'$c$;
    execute 'grant execute on function public.rpc_recalculate_all_users_from_week(date) to anon';
    execute 'grant execute on function public.rpc_recalculate_all_users_from_week(date) to authenticated';
    execute 'grant execute on function public.rpc_recalculate_all_users_from_week(date) to service_role';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
