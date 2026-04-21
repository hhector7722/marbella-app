-- ==============================================================================
-- Albaranes: permitir que cualquier usuario autenticado inserte SUS albaranes
-- manteniendo privacidad (staff no ve albaranes ajenos).
--
-- Estrategia:
-- - Añadir `created_by` a `purchase_invoices` (UUID -> auth.users)
-- - RLS:
--   - SELECT: managers/admins ven todo; el resto solo sus propios (`created_by = auth.uid()`)
--   - INSERT: cualquiera puede insertar si `created_by = auth.uid()`
--   - UPDATE/DELETE: solo managers/admins
-- - Líneas: INSERT permitido si la cabecera pertenece al usuario; SELECT idem.
--
-- Duplicados:
-- - Se expone un helper `public.check_purchase_invoice_duplicate(...)` SECURITY DEFINER
--   que devuelve flags booleanos sin filtrar datos sensibles.
-- ==============================================================================

-- 1) Columnas de ownership
ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE public.purchase_invoices
  ADD CONSTRAINT purchase_invoices_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS purchase_invoices_created_by_idx
  ON public.purchase_invoices (created_by);

-- 2) Función helper: permite check de duplicados sin abrir SELECT global
CREATE OR REPLACE FUNCTION public.check_purchase_invoice_duplicate(
  p_content_sha256 TEXT,
  p_supplier_id BIGINT,
  p_invoice_number TEXT,
  p_invoice_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dup_hash BOOLEAN := FALSE;
  v_dup_semantic BOOLEAN := FALSE;
BEGIN
  IF p_content_sha256 IS NOT NULL AND length(trim(p_content_sha256)) > 0 THEN
    SELECT EXISTS(
      SELECT 1 FROM public.purchase_invoices pi
      WHERE pi.content_sha256 = p_content_sha256
    ) INTO v_dup_hash;
  END IF;

  IF p_supplier_id IS NOT NULL
     AND p_invoice_number IS NOT NULL AND length(trim(p_invoice_number)) > 0
     AND p_invoice_date IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.purchase_invoices pi
      WHERE pi.supplier_id = p_supplier_id
        AND pi.invoice_number = p_invoice_number
        AND pi.invoice_date = p_invoice_date
    ) INTO v_dup_semantic;
  END IF;

  RETURN jsonb_build_object(
    'dup_by_hash', v_dup_hash,
    'dup_by_semantic', v_dup_semantic
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_purchase_invoice_duplicate(TEXT, BIGINT, TEXT, DATE) TO authenticated;

-- 3) RLS policies: purchase_invoices
--    Reemplaza la policy "Managers and admins only on purchase_invoices" por policies separadas.
DROP POLICY IF EXISTS "Managers and admins only on purchase_invoices" ON public.purchase_invoices;

DROP POLICY IF EXISTS "purchase_invoices_select_manager_admin" ON public.purchase_invoices;
CREATE POLICY "purchase_invoices_select_manager_admin"
  ON public.purchase_invoices FOR SELECT TO authenticated
  USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "purchase_invoices_select_own" ON public.purchase_invoices;
CREATE POLICY "purchase_invoices_select_own"
  ON public.purchase_invoices FOR SELECT TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "purchase_invoices_insert_own" ON public.purchase_invoices;
CREATE POLICY "purchase_invoices_insert_own"
  ON public.purchase_invoices FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "purchase_invoices_update_manager_admin" ON public.purchase_invoices;
CREATE POLICY "purchase_invoices_update_manager_admin"
  ON public.purchase_invoices FOR UPDATE TO authenticated
  USING (public.is_manager_or_admin())
  WITH CHECK (public.is_manager_or_admin());

DROP POLICY IF EXISTS "purchase_invoices_delete_manager_admin" ON public.purchase_invoices;
CREATE POLICY "purchase_invoices_delete_manager_admin"
  ON public.purchase_invoices FOR DELETE TO authenticated
  USING (public.is_manager_or_admin());

-- 4) RLS policies: purchase_invoice_lines
DROP POLICY IF EXISTS "Managers and admins only on purchase_invoice_lines" ON public.purchase_invoice_lines;

DROP POLICY IF EXISTS "purchase_invoice_lines_select_manager_admin" ON public.purchase_invoice_lines;
CREATE POLICY "purchase_invoice_lines_select_manager_admin"
  ON public.purchase_invoice_lines FOR SELECT TO authenticated
  USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "purchase_invoice_lines_select_own" ON public.purchase_invoice_lines;
CREATE POLICY "purchase_invoice_lines_select_own"
  ON public.purchase_invoice_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_invoices pi
      WHERE pi.id = purchase_invoice_lines.invoice_id
        AND pi.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "purchase_invoice_lines_insert_own" ON public.purchase_invoice_lines;
CREATE POLICY "purchase_invoice_lines_insert_own"
  ON public.purchase_invoice_lines FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_invoices pi
      WHERE pi.id = purchase_invoice_lines.invoice_id
        AND pi.created_by = auth.uid()
    )
  );

-- Update/delete líneas: solo gestión
DROP POLICY IF EXISTS "purchase_invoice_lines_update_manager_admin" ON public.purchase_invoice_lines;
CREATE POLICY "purchase_invoice_lines_update_manager_admin"
  ON public.purchase_invoice_lines FOR UPDATE TO authenticated
  USING (public.is_manager_or_admin())
  WITH CHECK (public.is_manager_or_admin());

DROP POLICY IF EXISTS "purchase_invoice_lines_delete_manager_admin" ON public.purchase_invoice_lines;
CREATE POLICY "purchase_invoice_lines_delete_manager_admin"
  ON public.purchase_invoice_lines FOR DELETE TO authenticated
  USING (public.is_manager_or_admin());

