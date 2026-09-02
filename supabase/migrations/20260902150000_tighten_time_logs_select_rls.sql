-- Cierra SELECT global en time_logs y revoca acceso de supervisores a fichajes ajenos.
-- Permanecen: propio usuario, manager (Manager_Full_Access), admin vía is_manager().
DROP POLICY IF EXISTS "emergency_select" ON public.time_logs;
DROP POLICY IF EXISTS "time_logs_select_policy" ON public.time_logs;
DROP POLICY IF EXISTS "Supervisores pueden ver todos los logs" ON public.time_logs;
DROP POLICY IF EXISTS "Supervisores pueden gestionar logs" ON public.time_logs;
