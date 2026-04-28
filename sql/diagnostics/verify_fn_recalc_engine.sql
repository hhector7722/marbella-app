-- =================================================================
-- Diagnóstico: motor de snapshots semanales (fn_recalc_and_propagate_snapshots)
-- Ejecutar en Supabase SQL Editor (proyecto concreto) para comprobar que la
-- definición desplegada coincide con el repo (marcadores en el cuerpo).
--
-- Esperado tras aplicar migraciones hasta 20260427174500_* (o posteriores
-- que reemplacen fn_recalc sin quitar estas señales):
--   has_joining_date, has_prejoin_split, has_paid_carry_guard = true
-- =================================================================

select
  coalesce(obj_description('public.fn_recalc_and_propagate_snapshots(uuid,date)'::regprocedure, 'pg_proc'), '(sin comment)') as function_comment;

select
  position('joining_date' in pg_get_functiondef('public.fn_recalc_and_propagate_snapshots(uuid,date)'::regprocedure)) > 0 as has_joining_date,
  position('v_logs_prejoin' in pg_get_functiondef('public.fn_recalc_and_propagate_snapshots(uuid,date)'::regprocedure)) > 0 as has_prejoin_split,
  position('v_prev_is_paid' in pg_get_functiondef('public.fn_recalc_and_propagate_snapshots(uuid,date)'::regprocedure)) > 0 as has_paid_carry_guard,
  position('Europe/Madrid' in pg_get_functiondef('public.fn_recalc_and_propagate_snapshots(uuid,date)'::regprocedure)) > 0 as uses_madrid_tz;

-- RPCs de recálculo parcial (deben existir tras migraciones 20260427144000 / 27144500 / 27215500)
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'rpc_recalculate_user_balances_from_week',
    'rpc_recalculate_all_users_from_week',
    'rpc_recalculate_all_balances_from_week',
    'rpc_recalculate_all_balances'
  )
order by p.proname, args;
