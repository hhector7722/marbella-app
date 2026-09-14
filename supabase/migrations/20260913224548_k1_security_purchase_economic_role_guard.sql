-- K1 · Corrección descubierta durante la matriz de acceso.
-- `is_manager_or_admin()` es una helper transversal heredada que también
-- incluye supervisor. No se altera: otros dominios todavía la usan. Compras e
-- inventario usan desde ahora una guardia propia y más estrecha.

CREATE OR REPLACE FUNCTION public.is_purchase_manager_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'admin'),
    false
  );
$$;

COMMENT ON FUNCTION public.is_purchase_manager_or_admin() IS
  'Autorización de efectos económicos de compras: solo manager o admin; no incluye supervisor ni chef.';

-- Segunda capa restrictive. No modifica ninguna policy heredada: reduce las
-- ya activas antes de poder retirar los grants/policies antiguos en K1 etapa 2.
DROP POLICY IF EXISTS k1_r2_ingredients_insert_purchase_manager ON public.ingredients;
CREATE POLICY k1_r2_ingredients_insert_purchase_manager ON public.ingredients
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (public.is_purchase_manager_or_admin());
DROP POLICY IF EXISTS k1_r2_ingredients_update_purchase_manager ON public.ingredients;
CREATE POLICY k1_r2_ingredients_update_purchase_manager ON public.ingredients
  AS RESTRICTIVE FOR UPDATE TO public
  USING (public.is_purchase_manager_or_admin())
  WITH CHECK (public.is_purchase_manager_or_admin());
DROP POLICY IF EXISTS k1_r2_ingredients_delete_purchase_manager ON public.ingredients;
CREATE POLICY k1_r2_ingredients_delete_purchase_manager ON public.ingredients
  AS RESTRICTIVE FOR DELETE TO public
  USING (public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k1_r2_stock_insert_purchase_manager ON public.stock_movements;
CREATE POLICY k1_r2_stock_insert_purchase_manager ON public.stock_movements
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k1_r2_invoice_update_actor ON public.purchase_invoices;
CREATE POLICY k1_r2_invoice_update_actor ON public.purchase_invoices
  AS RESTRICTIVE FOR UPDATE TO public
  USING (created_by = auth.uid() OR public.is_purchase_manager_or_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k1_r2_invoice_line_insert_actor ON public.purchase_invoice_lines;
CREATE POLICY k1_r2_invoice_line_insert_actor ON public.purchase_invoice_lines
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_invoices pi
      WHERE pi.id = purchase_invoice_lines.invoice_id
        AND (pi.created_by = auth.uid() OR public.is_purchase_manager_or_admin())
    )
  );
DROP POLICY IF EXISTS k1_r2_invoice_line_update_purchase_manager ON public.purchase_invoice_lines;
CREATE POLICY k1_r2_invoice_line_update_purchase_manager ON public.purchase_invoice_lines
  AS RESTRICTIVE FOR UPDATE TO public
  USING (public.is_purchase_manager_or_admin())
  WITH CHECK (public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k1_r2_attachment_insert_actor ON public.purchase_invoice_attachments;
CREATE POLICY k1_r2_attachment_insert_actor ON public.purchase_invoice_attachments
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.purchase_invoices pi
      WHERE pi.id = purchase_invoice_attachments.invoice_id
        AND (pi.created_by = auth.uid() OR public.is_purchase_manager_or_admin())
    )
  );
DROP POLICY IF EXISTS k1_r2_attachment_update_actor ON public.purchase_invoice_attachments;
CREATE POLICY k1_r2_attachment_update_actor ON public.purchase_invoice_attachments
  AS RESTRICTIVE FOR UPDATE TO public
  USING (created_by = auth.uid() OR public.is_purchase_manager_or_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k1_r2_price_history_insert_purchase_manager ON public.ingredient_price_history;
CREATE POLICY k1_r2_price_history_insert_purchase_manager ON public.ingredient_price_history
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k1_r2_supplier_map_insert_purchase_manager ON public.supplier_item_mappings;
CREATE POLICY k1_r2_supplier_map_insert_purchase_manager ON public.supplier_item_mappings
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (public.is_purchase_manager_or_admin());
DROP POLICY IF EXISTS k1_r2_supplier_map_update_purchase_manager ON public.supplier_item_mappings;
CREATE POLICY k1_r2_supplier_map_update_purchase_manager ON public.supplier_item_mappings
  AS RESTRICTIVE FOR UPDATE TO public
  USING (public.is_purchase_manager_or_admin())
  WITH CHECK (public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k1_r2_order_select_actor ON public.purchase_orders;
CREATE POLICY k1_r2_order_select_actor ON public.purchase_orders
  AS RESTRICTIVE FOR SELECT TO public
  USING (created_by = auth.uid() OR public.is_purchase_manager_or_admin());
DROP POLICY IF EXISTS k1_r2_order_update_actor ON public.purchase_orders;
CREATE POLICY k1_r2_order_update_actor ON public.purchase_orders
  AS RESTRICTIVE FOR UPDATE TO public
  USING (created_by = auth.uid() OR public.is_purchase_manager_or_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k1_r2_order_item_select_actor ON public.purchase_order_items;
CREATE POLICY k1_r2_order_item_select_actor ON public.purchase_order_items
  AS RESTRICTIVE FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND (po.created_by = auth.uid() OR public.is_purchase_manager_or_admin())
    )
  );
DROP POLICY IF EXISTS k1_r2_order_item_insert_actor ON public.purchase_order_items;
CREATE POLICY k1_r2_order_item_insert_actor ON public.purchase_order_items
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND (po.created_by = auth.uid() OR public.is_purchase_manager_or_admin())
    )
  );
DROP POLICY IF EXISTS k1_r2_order_item_update_actor ON public.purchase_order_items;
CREATE POLICY k1_r2_order_item_update_actor ON public.purchase_order_items
  AS RESTRICTIVE FOR UPDATE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND (po.created_by = auth.uid() OR public.is_purchase_manager_or_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND (po.created_by = auth.uid() OR public.is_purchase_manager_or_admin())
    )
  );

DROP POLICY IF EXISTS k1_r2_provenance_insert_actor ON public.purchase_line_provenance;
CREATE POLICY k1_r2_provenance_insert_actor ON public.purchase_line_provenance
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.purchase_invoice_lines pil
      JOIN public.purchase_invoices pi ON pi.id = pil.invoice_id
      WHERE pil.id = purchase_line_provenance.invoice_line_id
        AND (pi.created_by = auth.uid() OR public.is_purchase_manager_or_admin())
    )
  );

DROP POLICY IF EXISTS k1_r2_albaranes_storage_update_actor ON storage.objects;
CREATE POLICY k1_r2_albaranes_storage_update_actor ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO public
  USING (
    bucket_id = 'albaranes'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_purchase_manager_or_admin())
  )
  WITH CHECK (
    bucket_id = 'albaranes'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_purchase_manager_or_admin())
  );
