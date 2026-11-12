-- Admin comparte el acceso a los tickets necesario para consultar ventas,
-- sin ampliar permisos a staff ni supervisor.
CREATE POLICY "Admin_Read_Tickets_For_Copilot"
ON public.tickets_marbella
FOR SELECT TO authenticated
USING (public.current_employee_role() = 'admin');
