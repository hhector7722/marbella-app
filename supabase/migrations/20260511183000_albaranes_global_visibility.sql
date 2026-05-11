-- ==============================================================================
-- Albaranes: Visibilidad global para todos los usuarios autenticados
-- Objetivo: Evitar que el staff escanee duplicados al no ver lo que otros han subido.
-- ==============================================================================

-- 1) purchase_invoices: Permitir SELECT global a authenticated
DROP POLICY IF EXISTS "purchase_invoices_select_manager_admin" ON public.purchase_invoices;
DROP POLICY IF EXISTS "purchase_invoices_select_own" ON public.purchase_invoices;

CREATE POLICY "purchase_invoices_select_global"
  ON public.purchase_invoices FOR SELECT TO authenticated
  USING (true);

-- 2) purchase_invoice_lines: Permitir SELECT global a authenticated
DROP POLICY IF EXISTS "purchase_invoice_lines_select_manager_admin" ON public.purchase_invoice_lines;
DROP POLICY IF EXISTS "purchase_invoice_lines_select_own" ON public.purchase_invoice_lines;

CREATE POLICY "purchase_invoice_lines_select_global"
  ON public.purchase_invoice_lines FOR SELECT TO authenticated
  USING (true);

-- NOTA: Las políticas de INSERT (solo si created_by = auth.uid()) 
-- y UPDATE/DELETE (solo managers) se mantienen para seguridad e integridad.
