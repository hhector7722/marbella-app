-- Producción: aplicado el 17-11-2026 (Supabase migration 20261117182634).
-- time_logs guarda fichajes de entrada/salida de empleados.
-- RLS no controla TRUNCATE: nunca concederlo a clientes.
REVOKE ALL PRIVILEGES ON TABLE public.time_logs FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.time_logs FROM authenticated;

-- Eliminar políticas que dejaban insertar, modificar y eliminar fichajes ajenos.
DROP POLICY IF EXISTS time_logs_delete_policy ON public.time_logs;
DROP POLICY IF EXISTS time_logs_update_policy ON public.time_logs;
DROP POLICY IF EXISTS time_logs_insert_policy ON public.time_logs;
DROP POLICY IF EXISTS emergency_insert ON public.time_logs;

-- El staff conserva el fichaje de salida de la jornada propia abierta.
-- Las correcciones de jornadas cerradas quedan reservadas a gerencia.
DROP POLICY IF EXISTS "Usuarios pueden fichar salida" ON public.time_logs;
DROP POLICY IF EXISTS staff_update_own_logs ON public.time_logs;
CREATE POLICY time_logs_staff_close_own
  ON public.time_logs
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND clock_out IS NULL)
  WITH CHECK (user_id = (SELECT auth.uid()) AND clock_out IS NOT NULL);

-- manager y admin pueden consultar y crear fichajes de terceros.
-- Actualización y borrado de gerencia: políticas is_manager() preexistentes.
CREATE POLICY time_logs_management_read
  ON public.time_logs
  FOR SELECT TO authenticated
  USING (public.is_manager());

CREATE POLICY time_logs_management_insert
  ON public.time_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager());
