-- RLS de líneas de albaranes y facturas: el acceso al documento
-- no debe depender de los controles visuales ni del asistente.
CREATE POLICY invoice_header_role_bound_select_20261112
ON public.purchase_invoices
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND public.current_employee_role() IN ('manager','admin'));

CREATE POLICY invoice_line_role_bound_select_20261112
ON public.purchase_invoice_lines
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND public.current_employee_role() IN ('manager','admin'));
