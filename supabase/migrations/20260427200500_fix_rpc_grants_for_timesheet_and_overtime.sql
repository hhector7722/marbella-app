-- =================================================================
-- FIX: Grants de RPCs usadas en cliente (staff/history + modal semanal + overtime)
-- =================================================================

begin;

-- get_worker_weekly_log_grid
grant execute on function public.get_worker_weekly_log_grid(uuid, date, numeric) to anon;
grant execute on function public.get_worker_weekly_log_grid(uuid, date, numeric) to authenticated;

-- get_monthly_timesheet
grant execute on function public.get_monthly_timesheet(uuid, integer, integer) to anon;
grant execute on function public.get_monthly_timesheet(uuid, integer, integer) to authenticated;

-- get_weekly_worker_stats
grant execute on function public.get_weekly_worker_stats(date, date, uuid) to anon;
grant execute on function public.get_weekly_worker_stats(date, date, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

