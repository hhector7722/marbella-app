-- K1 · Etapa 1/2 de endurecimiento RLS.
--
-- Esta migración no elimina todavía ninguna policy heredada ni ningún grant.
-- Añade políticas RESTRICTIVE que se combinan con las permisivas ya existentes;
-- así podemos verificar la matriz real de acceso sin abrir una ventana de
-- regresión. La etapa 2 retira las policies/grants heredados solo después de
-- esa verificación.
--
-- Convención de actor:
--   * auth.role() = authenticated: usuario con sesión válida.
--   * is_manager_or_admin(): única vía humana de cambios económicos/config.
--   * service_role: proceso de servidor; bypass RLS, auditado fuera de Data API.

-- Ingredientes: catálogo legible por quien está autenticado; su configuración
-- solo se modifica desde operaciones de gestión.
DROP POLICY IF EXISTS k1_r_ingredients_select_authenticated ON public.ingredients;
CREATE POLICY k1_r_ingredients_select_authenticated ON public.ingredients
  AS RESTRICTIVE FOR SELECT TO public
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS k1_r_ingredients_insert_manager_admin ON public.ingredients;
CREATE POLICY k1_r_ingredients_insert_manager_admin ON public.ingredients
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (public.is_manager_or_admin());
DROP POLICY IF EXISTS k1_r_ingredients_update_manager_admin ON public.ingredients;
CREATE POLICY k1_r_ingredients_update_manager_admin ON public.ingredients
  AS RESTRICTIVE FOR UPDATE TO public
  USING (public.is_manager_or_admin())
  WITH CHECK (public.is_manager_or_admin());
DROP POLICY IF EXISTS k1_r_ingredients_delete_manager_admin ON public.ingredients;
CREATE POLICY k1_r_ingredients_delete_manager_admin ON public.ingredients
  AS RESTRICTIVE FOR DELETE TO public
  USING (public.is_manager_or_admin());

-- Ledger: todos los usuarios autenticados pueden consultar; ninguna mutación
-- directa por usuarios salvo INSERT de manager/admin. UPDATE/DELETE se niegan
-- desde ahora: K2 lo convierte en append-only canónico.
DROP POLICY IF EXISTS k1_r_stock_select_authenticated ON public.stock_movements;
CREATE POLICY k1_r_stock_select_authenticated ON public.stock_movements
  AS RESTRICTIVE FOR SELECT TO public
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS k1_r_stock_insert_manager_admin ON public.stock_movements;
CREATE POLICY k1_r_stock_insert_manager_admin ON public.stock_movements
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (public.is_manager_or_admin());

DROP POLICY IF EXISTS k1_r_stock_update_denied ON public.stock_movements;
CREATE POLICY k1_r_stock_update_denied ON public.stock_movements
  AS RESTRICTIVE FOR UPDATE TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS k1_r_stock_delete_denied ON public.stock_movements;
CREATE POLICY k1_r_stock_delete_denied ON public.stock_movements
  AS RESTRICTIVE FOR DELETE TO public
  USING (false);

-- Albaranes: cualquier usuario autenticado puede capturar uno propio y leer
-- el histórico. Solo su creador (para el estado de captura) o manager/admin
-- puede actualizarlo; no se permite borrar el hecho documental.
DROP POLICY IF EXISTS k1_r_invoice_select_authenticated ON public.purchase_invoices;
CREATE POLICY k1_r_invoice_select_authenticated ON public.purchase_invoices
  AS RESTRICTIVE FOR SELECT TO public
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS k1_r_invoice_insert_owner ON public.purchase_invoices;
CREATE POLICY k1_r_invoice_insert_owner ON public.purchase_invoices
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (auth.role() = 'authenticated' AND created_by = auth.uid());

DROP POLICY IF EXISTS k1_r_invoice_update_actor ON public.purchase_invoices;
CREATE POLICY k1_r_invoice_update_actor ON public.purchase_invoices
  AS RESTRICTIVE FOR UPDATE TO public
  USING (created_by = auth.uid() OR public.is_manager_or_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_manager_or_admin());

DROP POLICY IF EXISTS k1_r_invoice_delete_denied ON public.purchase_invoices;
CREATE POLICY k1_r_invoice_delete_denied ON public.purchase_invoices
  AS RESTRICTIVE FOR DELETE TO public
  USING (false);

-- Líneas de albarán: el escáner puede proponer líneas en un documento propio;
-- el cambio de mapeo queda reservado a manager/admin. No se borran líneas.
DROP POLICY IF EXISTS k1_r_invoice_line_select_authenticated ON public.purchase_invoice_lines;
CREATE POLICY k1_r_invoice_line_select_authenticated ON public.purchase_invoice_lines
  AS RESTRICTIVE FOR SELECT TO public
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS k1_r_invoice_line_insert_actor ON public.purchase_invoice_lines;
CREATE POLICY k1_r_invoice_line_insert_actor ON public.purchase_invoice_lines
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.purchase_invoices pi
      WHERE pi.id = purchase_invoice_lines.invoice_id
        AND (pi.created_by = auth.uid() OR public.is_manager_or_admin())
    )
  );

DROP POLICY IF EXISTS k1_r_invoice_line_update_manager_admin ON public.purchase_invoice_lines;
CREATE POLICY k1_r_invoice_line_update_manager_admin ON public.purchase_invoice_lines
  AS RESTRICTIVE FOR UPDATE TO public
  USING (public.is_manager_or_admin())
  WITH CHECK (public.is_manager_or_admin());

DROP POLICY IF EXISTS k1_r_invoice_line_delete_denied ON public.purchase_invoice_lines;
CREATE POLICY k1_r_invoice_line_delete_denied ON public.purchase_invoice_lines
  AS RESTRICTIVE FOR DELETE TO public
  USING (false);

-- Hojas y adjuntos: insert/estado del propio capturador, sin borrado.
DROP POLICY IF EXISTS k1_r_attachment_select_authenticated ON public.purchase_invoice_attachments;
CREATE POLICY k1_r_attachment_select_authenticated ON public.purchase_invoice_attachments
  AS RESTRICTIVE FOR SELECT TO public
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS k1_r_attachment_insert_actor ON public.purchase_invoice_attachments;
CREATE POLICY k1_r_attachment_insert_actor ON public.purchase_invoice_attachments
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_invoices pi
      WHERE pi.id = purchase_invoice_attachments.invoice_id
        AND (pi.created_by = auth.uid() OR public.is_manager_or_admin())
    )
  );

DROP POLICY IF EXISTS k1_r_attachment_update_actor ON public.purchase_invoice_attachments;
CREATE POLICY k1_r_attachment_update_actor ON public.purchase_invoice_attachments
  AS RESTRICTIVE FOR UPDATE TO public
  USING (created_by = auth.uid() OR public.is_manager_or_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_manager_or_admin());

DROP POLICY IF EXISTS k1_r_attachment_delete_denied ON public.purchase_invoice_attachments;
CREATE POLICY k1_r_attachment_delete_denied ON public.purchase_invoice_attachments
  AS RESTRICTIVE FOR DELETE TO public
  USING (false);

-- Precio y aprendizaje de proveedor: lectura autenticada, escritura solo de
-- gestión. Las rutas históricas de trigger siguen bajo el propietario de BD.
DROP POLICY IF EXISTS k1_r_price_history_select_authenticated ON public.ingredient_price_history;
CREATE POLICY k1_r_price_history_select_authenticated ON public.ingredient_price_history
  AS RESTRICTIVE FOR SELECT TO public
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS k1_r_price_history_insert_manager_admin ON public.ingredient_price_history;
CREATE POLICY k1_r_price_history_insert_manager_admin ON public.ingredient_price_history
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (public.is_manager_or_admin());
DROP POLICY IF EXISTS k1_r_price_history_update_denied ON public.ingredient_price_history;
CREATE POLICY k1_r_price_history_update_denied ON public.ingredient_price_history
  AS RESTRICTIVE FOR UPDATE TO public
  USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS k1_r_price_history_delete_denied ON public.ingredient_price_history;
CREATE POLICY k1_r_price_history_delete_denied ON public.ingredient_price_history
  AS RESTRICTIVE FOR DELETE TO public
  USING (false);

DROP POLICY IF EXISTS k1_r_supplier_map_select_authenticated ON public.supplier_item_mappings;
CREATE POLICY k1_r_supplier_map_select_authenticated ON public.supplier_item_mappings
  AS RESTRICTIVE FOR SELECT TO public
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS k1_r_supplier_map_insert_manager_admin ON public.supplier_item_mappings;
CREATE POLICY k1_r_supplier_map_insert_manager_admin ON public.supplier_item_mappings
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (public.is_manager_or_admin());
DROP POLICY IF EXISTS k1_r_supplier_map_update_manager_admin ON public.supplier_item_mappings;
CREATE POLICY k1_r_supplier_map_update_manager_admin ON public.supplier_item_mappings
  AS RESTRICTIVE FOR UPDATE TO public
  USING (public.is_manager_or_admin())
  WITH CHECK (public.is_manager_or_admin());
DROP POLICY IF EXISTS k1_r_supplier_map_delete_denied ON public.supplier_item_mappings;
CREATE POLICY k1_r_supplier_map_delete_denied ON public.supplier_item_mappings
  AS RESTRICTIVE FOR DELETE TO public
  USING (false);

-- Tabla heredada sin consumidor directo actual: explícitamente inaccesible
-- hasta que K2 introduzca versiones de mapeo con contrato propio.
DO $$
BEGIN
  IF to_regclass('public.supplier_ingredient_mappings') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS k1_r_supplier_ingredient_mapping_denied ON public.supplier_ingredient_mappings';
    EXECUTE 'CREATE POLICY k1_r_supplier_ingredient_mapping_denied ON public.supplier_ingredient_mappings AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- Pedidos: se conserva el flujo actual de pedido propio; lectura/gestión total
-- para manager/admin. No se permite borrado de hechos de compra.
DROP POLICY IF EXISTS k1_r_order_select_actor ON public.purchase_orders;
CREATE POLICY k1_r_order_select_actor ON public.purchase_orders
  AS RESTRICTIVE FOR SELECT TO public
  USING (created_by = auth.uid() OR public.is_manager_or_admin());

DROP POLICY IF EXISTS k1_r_order_insert_owner ON public.purchase_orders;
CREATE POLICY k1_r_order_insert_owner ON public.purchase_orders
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS k1_r_order_update_actor ON public.purchase_orders;
CREATE POLICY k1_r_order_update_actor ON public.purchase_orders
  AS RESTRICTIVE FOR UPDATE TO public
  USING (created_by = auth.uid() OR public.is_manager_or_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_manager_or_admin());

DROP POLICY IF EXISTS k1_r_order_delete_denied ON public.purchase_orders;
CREATE POLICY k1_r_order_delete_denied ON public.purchase_orders
  AS RESTRICTIVE FOR DELETE TO public
  USING (false);

DROP POLICY IF EXISTS k1_r_order_item_select_actor ON public.purchase_order_items;
CREATE POLICY k1_r_order_item_select_actor ON public.purchase_order_items
  AS RESTRICTIVE FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND (po.created_by = auth.uid() OR public.is_manager_or_admin())
    )
  );

DROP POLICY IF EXISTS k1_r_order_item_insert_actor ON public.purchase_order_items;
CREATE POLICY k1_r_order_item_insert_actor ON public.purchase_order_items
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND (po.created_by = auth.uid() OR public.is_manager_or_admin())
    )
  );

DROP POLICY IF EXISTS k1_r_order_item_update_actor ON public.purchase_order_items;
CREATE POLICY k1_r_order_item_update_actor ON public.purchase_order_items
  AS RESTRICTIVE FOR UPDATE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND (po.created_by = auth.uid() OR public.is_manager_or_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND (po.created_by = auth.uid() OR public.is_manager_or_admin())
    )
  );

DROP POLICY IF EXISTS k1_r_order_item_delete_denied ON public.purchase_order_items;
CREATE POLICY k1_r_order_item_delete_denied ON public.purchase_order_items
  AS RESTRICTIVE FOR DELETE TO public
  USING (false);

-- Evidencia documental: solo lectura directa. La única escritura permitida es
-- la RPC SECURITY DEFINER de evidencia, que se endurece en la etapa 2.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'document_extractions', 'document_tables', 'document_columns',
    'document_rows', 'document_cells'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS k1_r_%s_select_authenticated ON public.%I', t, t);
    EXECUTE format('CREATE POLICY k1_r_%s_select_authenticated ON public.%I AS RESTRICTIVE FOR SELECT TO public USING (auth.role() = ''authenticated'')', t, t);
    EXECUTE format('DROP POLICY IF EXISTS k1_r_%s_insert_denied ON public.%I', t, t);
    EXECUTE format('CREATE POLICY k1_r_%s_insert_denied ON public.%I AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS k1_r_%s_update_denied ON public.%I', t, t);
    EXECUTE format('CREATE POLICY k1_r_%s_update_denied ON public.%I AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS k1_r_%s_delete_denied ON public.%I', t, t);
    EXECUTE format('CREATE POLICY k1_r_%s_delete_denied ON public.%I AS RESTRICTIVE FOR DELETE TO public USING (false)', t, t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS k1_r_provenance_select_authenticated ON public.purchase_line_provenance;
CREATE POLICY k1_r_provenance_select_authenticated ON public.purchase_line_provenance
  AS RESTRICTIVE FOR SELECT TO public
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS k1_r_provenance_insert_actor ON public.purchase_line_provenance;
CREATE POLICY k1_r_provenance_insert_actor ON public.purchase_line_provenance
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.purchase_invoice_lines pil
      JOIN public.purchase_invoices pi ON pi.id = pil.invoice_id
      WHERE pil.id = purchase_line_provenance.invoice_line_id
        AND (pi.created_by = auth.uid() OR public.is_manager_or_admin())
    )
  );

DROP POLICY IF EXISTS k1_r_provenance_update_denied ON public.purchase_line_provenance;
CREATE POLICY k1_r_provenance_update_denied ON public.purchase_line_provenance
  AS RESTRICTIVE FOR UPDATE TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS k1_r_provenance_delete_denied ON public.purchase_line_provenance;
CREATE POLICY k1_r_provenance_delete_denied ON public.purchase_line_provenance
  AS RESTRICTIVE FOR DELETE TO public
  USING (false);

-- Storage de albaranes: permanece privado. Cualquier autenticado puede leer
-- para el histórico actual, pero nunca un anónimo; modificar solo el propio
-- objeto o manager/admin. No se crea una policy de DELETE.
DROP POLICY IF EXISTS k1_r_albaranes_storage_select_authenticated ON storage.objects;
CREATE POLICY k1_r_albaranes_storage_select_authenticated ON storage.objects
  AS RESTRICTIVE FOR SELECT TO public
  USING (bucket_id = 'albaranes' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS k1_r_albaranes_storage_insert_owner ON storage.objects;
CREATE POLICY k1_r_albaranes_storage_insert_owner ON storage.objects
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    bucket_id = 'albaranes'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS k1_r_albaranes_storage_update_actor ON storage.objects;
CREATE POLICY k1_r_albaranes_storage_update_actor ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO public
  USING (
    bucket_id = 'albaranes'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_manager_or_admin())
  )
  WITH CHECK (
    bucket_id = 'albaranes'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_manager_or_admin())
  );
