-- K1 · Etapa 2/2 de endurecimiento RLS.
-- Se aplica únicamente después de ejecutar y aprobar la matriz de acceso de
-- la etapa 1. Reemplaza grants amplios y policies heredadas por contratos
-- explícitos. Las policies k1_r_* restrictivas siguen como defensa adicional.

-- Policies permisivas explícitas que, junto a k1_r_*, forman el contrato final.
DROP POLICY IF EXISTS k1_p_ingredients_select ON public.ingredients;
CREATE POLICY k1_p_ingredients_select ON public.ingredients
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS k1_p_ingredients_write ON public.ingredients;
CREATE POLICY k1_p_ingredients_write ON public.ingredients
  FOR ALL TO authenticated
  USING (public.is_purchase_manager_or_admin())
  WITH CHECK (public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k1_p_stock_select ON public.stock_movements;
CREATE POLICY k1_p_stock_select ON public.stock_movements
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS k1_p_stock_insert ON public.stock_movements;
CREATE POLICY k1_p_stock_insert ON public.stock_movements
  FOR INSERT TO authenticated WITH CHECK (public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k1_p_invoice_select ON public.purchase_invoices;
CREATE POLICY k1_p_invoice_select ON public.purchase_invoices
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS k1_p_invoice_insert ON public.purchase_invoices;
CREATE POLICY k1_p_invoice_insert ON public.purchase_invoices
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS k1_p_invoice_update ON public.purchase_invoices;
CREATE POLICY k1_p_invoice_update ON public.purchase_invoices
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_purchase_manager_or_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k1_p_invoice_line_select ON public.purchase_invoice_lines;
CREATE POLICY k1_p_invoice_line_select ON public.purchase_invoice_lines
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS k1_p_invoice_line_insert ON public.purchase_invoice_lines;
CREATE POLICY k1_p_invoice_line_insert ON public.purchase_invoice_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_invoices pi
      WHERE pi.id = purchase_invoice_lines.invoice_id
        AND (pi.created_by = auth.uid() OR public.is_purchase_manager_or_admin())
    )
  );
DROP POLICY IF EXISTS k1_p_invoice_line_update ON public.purchase_invoice_lines;
CREATE POLICY k1_p_invoice_line_update ON public.purchase_invoice_lines
  FOR UPDATE TO authenticated
  USING (public.is_purchase_manager_or_admin())
  WITH CHECK (public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k1_p_attachment_select ON public.purchase_invoice_attachments;
CREATE POLICY k1_p_attachment_select ON public.purchase_invoice_attachments
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS k1_p_attachment_insert ON public.purchase_invoice_attachments;
CREATE POLICY k1_p_attachment_insert ON public.purchase_invoice_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.purchase_invoices pi
      WHERE pi.id = purchase_invoice_attachments.invoice_id
        AND (pi.created_by = auth.uid() OR public.is_purchase_manager_or_admin())
    )
  );
DROP POLICY IF EXISTS k1_p_attachment_update ON public.purchase_invoice_attachments;
CREATE POLICY k1_p_attachment_update ON public.purchase_invoice_attachments
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_purchase_manager_or_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k1_p_price_history_select ON public.ingredient_price_history;
CREATE POLICY k1_p_price_history_select ON public.ingredient_price_history
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS k1_p_price_history_insert ON public.ingredient_price_history;
CREATE POLICY k1_p_price_history_insert ON public.ingredient_price_history
  FOR INSERT TO authenticated WITH CHECK (public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k1_p_supplier_map_select ON public.supplier_item_mappings;
CREATE POLICY k1_p_supplier_map_select ON public.supplier_item_mappings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS k1_p_supplier_map_write ON public.supplier_item_mappings;
CREATE POLICY k1_p_supplier_map_write ON public.supplier_item_mappings
  FOR ALL TO authenticated
  USING (public.is_purchase_manager_or_admin())
  WITH CHECK (public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k1_p_order_select ON public.purchase_orders;
CREATE POLICY k1_p_order_select ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_purchase_manager_or_admin());
DROP POLICY IF EXISTS k1_p_order_insert ON public.purchase_orders;
CREATE POLICY k1_p_order_insert ON public.purchase_orders
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS k1_p_order_update ON public.purchase_orders;
CREATE POLICY k1_p_order_update ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_purchase_manager_or_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k1_p_order_item_select ON public.purchase_order_items;
CREATE POLICY k1_p_order_item_select ON public.purchase_order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND (po.created_by = auth.uid() OR public.is_purchase_manager_or_admin())
    )
  );
DROP POLICY IF EXISTS k1_p_order_item_insert ON public.purchase_order_items;
CREATE POLICY k1_p_order_item_insert ON public.purchase_order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND (po.created_by = auth.uid() OR public.is_purchase_manager_or_admin())
    )
  );
DROP POLICY IF EXISTS k1_p_order_item_update ON public.purchase_order_items;
CREATE POLICY k1_p_order_item_update ON public.purchase_order_items
  FOR UPDATE TO authenticated
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

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'document_extractions', 'document_tables', 'document_columns',
    'document_rows', 'document_cells'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS k1_p_%s_select ON public.%I', t, t);
    EXECUTE format('CREATE POLICY k1_p_%s_select ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS k1_p_provenance_select ON public.purchase_line_provenance;
CREATE POLICY k1_p_provenance_select ON public.purchase_line_provenance
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS k1_p_provenance_insert ON public.purchase_line_provenance;
CREATE POLICY k1_p_provenance_insert ON public.purchase_line_provenance
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.purchase_invoice_lines pil
      JOIN public.purchase_invoices pi ON pi.id = pil.invoice_id
      WHERE pil.id = purchase_line_provenance.invoice_line_id
        AND (pi.created_by = auth.uid() OR public.is_purchase_manager_or_admin())
    )
  );

-- Mantiene el bucket privado y elimina la vía de UPDATE global heredada.
DROP POLICY IF EXISTS k1_p_albaranes_storage_select ON storage.objects;
CREATE POLICY k1_p_albaranes_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'albaranes');
DROP POLICY IF EXISTS k1_p_albaranes_storage_insert ON storage.objects;
CREATE POLICY k1_p_albaranes_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'albaranes' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS k1_p_albaranes_storage_update ON storage.objects;
CREATE POLICY k1_p_albaranes_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'albaranes' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_purchase_manager_or_admin()))
  WITH CHECK (bucket_id = 'albaranes' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_purchase_manager_or_admin()));

-- Retira todas las policies anteriores de las tablas cerradas. Es deliberado:
-- el inventario K1 las ha enumerado y las k1_p_* + k1_r_* cubren cada flujo
-- legítimo conservado.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'ingredients', 'stock_movements', 'purchase_invoices',
        'purchase_invoice_lines', 'purchase_invoice_attachments',
        'ingredient_price_history', 'supplier_item_mappings',
        'supplier_ingredient_mappings', 'purchase_orders',
        'purchase_order_items', 'document_extractions', 'document_tables',
        'document_columns', 'document_rows', 'document_cells',
        'purchase_line_provenance'
      ])
      AND policyname NOT LIKE 'k1\_%' ESCAPE '\'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

DROP POLICY IF EXISTS albaranes_authenticated_select_all ON storage.objects;
DROP POLICY IF EXISTS albaranes_authenticated_update_all ON storage.objects;
DROP POLICY IF EXISTS albaranes_managers_select_all ON storage.objects;
DROP POLICY IF EXISTS albaranes_users_insert_own ON storage.objects;
DROP POLICY IF EXISTS albaranes_users_select_own ON storage.objects;
DROP POLICY IF EXISTS albaranes_users_update_own ON storage.objects;

-- Quita grants heredados. service_role queda explícitamente para los procesos
-- de servidor inventariados (webhooks, evidencias y tareas de mantenimiento).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ingredients', 'stock_movements', 'purchase_invoices',
    'purchase_invoice_lines', 'purchase_invoice_attachments',
    'ingredient_price_history', 'supplier_item_mappings',
    'supplier_ingredient_mappings', 'purchase_orders',
    'purchase_order_items', 'document_extractions', 'document_tables',
    'document_columns', 'document_rows', 'document_cells',
    'purchase_line_provenance'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredients TO authenticated;
GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.purchase_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.purchase_invoice_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.purchase_invoice_attachments TO authenticated;
GRANT SELECT, INSERT ON public.ingredient_price_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_item_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.purchase_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.purchase_order_items TO authenticated;
GRANT SELECT ON public.document_extractions, public.document_tables, public.document_columns,
  public.document_rows, public.document_cells TO authenticated;
GRANT SELECT, INSERT ON public.purchase_line_provenance TO authenticated;

-- RPCs capaces de alterar stock o mapeos: sin anon/PUBLIC. El mapper sigue
-- disponible al flujo de gestión; su guardia interna garantiza manager/admin.
CREATE OR REPLACE FUNCTION public.auto_map_invoice_lines_fuzzy(
  p_invoice_id uuid DEFAULT NULL,
  p_similarity_threshold numeric DEFAULT 0.75
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mapped int := 0;
  v_skipped int := 0;
  rec record;
  v_ingredient_id uuid;
  v_name text;
  v_sim numeric;
BEGIN
  IF NOT public.is_purchase_manager_or_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  FOR rec IN
    SELECT pil.id, pil.original_name, pi.supplier_id
    FROM public.purchase_invoice_lines pil
    INNER JOIN public.purchase_invoices pi ON pi.id = pil.invoice_id
    WHERE pil.mapped_ingredient_id IS NULL
      AND COALESCE(pil.status, 'pending') <> 'excluded'
      AND pi.supplier_id IS NOT NULL
      AND trim(COALESCE(pil.original_name, '')) <> ''
      AND (p_invoice_id IS NULL OR pil.invoice_id = p_invoice_id)
  LOOP
    v_ingredient_id := NULL;
    v_name := lower(trim(rec.original_name));

    SELECT m.ingredient_id INTO v_ingredient_id
    FROM public.supplier_item_mappings m
    WHERE m.supplier_id = rec.supplier_id
      AND lower(trim(m.supplier_item_name)) = v_name
      AND m.ingredient_id IS NOT NULL
      AND COALESCE(m.conversion_factor, 0) > 0
    LIMIT 1;

    IF v_ingredient_id IS NULL AND v_name <> '' THEN
      SELECT m.ingredient_id, similarity(lower(trim(m.supplier_item_name)), v_name)
      INTO v_ingredient_id, v_sim
      FROM public.supplier_item_mappings m
      WHERE m.supplier_id = rec.supplier_id
        AND m.ingredient_id IS NOT NULL
        AND COALESCE(m.conversion_factor, 0) > 0
        AND similarity(lower(trim(m.supplier_item_name)), v_name) >= p_similarity_threshold
      ORDER BY similarity(lower(trim(m.supplier_item_name)), v_name) DESC
      LIMIT 1;
    END IF;

    IF v_ingredient_id IS NOT NULL THEN
      UPDATE public.purchase_invoice_lines
      SET mapped_ingredient_id = v_ingredient_id, status = 'mapped'
      WHERE id = rec.id;
      v_mapped := v_mapped + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('mapped', v_mapped, 'skipped', v_skipped);
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_document_evidence(
  p_invoice_id uuid,
  p_file_version_hash text,
  p_extractor_version text,
  p_raw_json_artifact jsonb,
  p_status public.extraction_status,
  p_tables jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_extraction_id uuid;
  v_table_id uuid;
  v_column_id uuid;
  v_row_id uuid;
  v_table jsonb;
  v_column jsonb;
  v_row jsonb;
  v_cell jsonb;
  v_row_mapping jsonb := '{}'::jsonb;
  v_hash text;
  v_inserted boolean := false;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.purchase_invoices pi
       WHERE pi.id = p_invoice_id
         AND (pi.created_by = auth.uid() OR public.is_purchase_manager_or_admin())
     ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  v_hash := btrim(coalesce(p_file_version_hash, ''));
  IF v_hash = '' THEN
    RAISE EXCEPTION 'persist_document_evidence: p_file_version_hash es obligatorio';
  END IF;

  SELECT id INTO v_extraction_id
  FROM public.document_extractions
  WHERE invoice_id = p_invoice_id AND file_version_hash = v_hash
  LIMIT 1;

  IF v_extraction_id IS NOT NULL THEN
    SELECT coalesce((
      SELECT jsonb_object_agg(key, value)
      FROM (
        SELECT (dt.table_index::text || '_' || dr.row_index::text) AS key, to_jsonb(dr.id) AS value
        FROM public.document_tables dt
        JOIN public.document_rows dr ON dr.table_id = dt.id
        WHERE dt.extraction_id = v_extraction_id
      ) s
    ), '{}'::jsonb) INTO v_row_mapping;
    RETURN jsonb_build_object('extraction_id', v_extraction_id, 'row_mapping', v_row_mapping, 'inserted', false);
  END IF;

  BEGIN
    INSERT INTO public.document_extractions (
      invoice_id, file_version_hash, extractor_version, raw_json_artifact, status
    ) VALUES (
      p_invoice_id, v_hash, p_extractor_version, p_raw_json_artifact, p_status
    ) RETURNING id INTO v_extraction_id;
    v_inserted := true;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_extraction_id
    FROM public.document_extractions
    WHERE invoice_id = p_invoice_id AND file_version_hash = v_hash
    LIMIT 1;
    RETURN jsonb_build_object('extraction_id', v_extraction_id, 'row_mapping', '{}'::jsonb, 'inserted', false);
  END;

  IF p_status = 'success' AND p_tables IS NOT NULL THEN
    FOR v_table IN SELECT * FROM jsonb_array_elements(p_tables) LOOP
      INSERT INTO public.document_tables (extraction_id, table_index)
      VALUES (v_extraction_id, (v_table->>'index')::int)
      RETURNING id INTO v_table_id;
      FOR v_column IN SELECT * FROM jsonb_array_elements(v_table->'columns') LOOP
        INSERT INTO public.document_columns (table_id, col_index, original_name)
        VALUES (v_table_id, (v_column->>'index')::int, v_column->>'name')
        RETURNING id INTO v_column_id;
      END LOOP;
      FOR v_row IN SELECT * FROM jsonb_array_elements(v_table->'rows') LOOP
        INSERT INTO public.document_rows (table_id, row_index)
        VALUES (v_table_id, (v_row->>'index')::int)
        RETURNING id INTO v_row_id;
        v_row_mapping := jsonb_set(
          v_row_mapping,
          ARRAY[(v_table->>'index')::text || '_' || (v_row->>'index')::text],
          to_jsonb(v_row_id)
        );
        FOR v_cell IN SELECT * FROM jsonb_array_elements(v_row->'cells') LOOP
          SELECT id INTO v_column_id
          FROM public.document_columns
          WHERE table_id = v_table_id AND col_index = (v_cell->>'column_index')::int;
          INSERT INTO public.document_cells (table_id, row_id, column_id, raw_value)
          VALUES (v_table_id, v_row_id, v_column_id, v_cell->>'raw_value');
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('extraction_id', v_extraction_id, 'row_mapping', v_row_mapping, 'inserted', v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_stock(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_map_invoice_lines_fuzzy(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_map_invoice_lines_fuzzy(uuid, numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.persist_document_evidence(uuid, text, text, jsonb, public.extraction_status, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.persist_document_evidence(uuid, text, text, jsonb, public.extraction_status, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.process_ticket_stock_deduction(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_ticket_stock_deduction(text) TO service_role;
REVOKE ALL ON FUNCTION public.revert_ticket_stock_deduction(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_ticket_stock_deduction(text) TO service_role;
