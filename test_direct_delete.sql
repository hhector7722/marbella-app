DO $script$
DECLARE
  v_supplier_id INT;
  v_invoice_id UUID;
  v_invoice_line_id UUID;
  v_extraction_id UUID;
  v_table_id UUID;
  v_col_id UUID;
  v_row_id UUID;
  v_cell_id UUID;
  v_prov_id UUID;
BEGIN
  -- Setup isolated test data for direct delete test
  SELECT id INTO v_supplier_id FROM public.suppliers LIMIT 1;
  
  INSERT INTO public.purchase_invoices (supplier_id, invoice_number, invoice_date, status, source, file_path)
  VALUES (v_supplier_id, 'TEST-DIRECT-DELETE', '2026-08-12', 'pending_mapping', 'scanner', 'test/path.jpg')
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.purchase_invoice_lines (invoice_id, original_name, quantity, unit_price, total_price, status)
  VALUES (v_invoice_id, 'Test Line', 1, 10, 10, 'pending')
  RETURNING id INTO v_invoice_line_id;

  INSERT INTO public.document_extractions (invoice_id, extractor_version, status)
  VALUES (v_invoice_id, 'test', 'success')
  RETURNING id INTO v_extraction_id;

  INSERT INTO public.document_tables (extraction_id, table_index)
  VALUES (v_extraction_id, 0)
  RETURNING id INTO v_table_id;

  INSERT INTO public.document_columns (table_id, col_index, original_name)
  VALUES (v_table_id, 0, 'Test Col')
  RETURNING id INTO v_col_id;

  INSERT INTO public.document_rows (table_id, row_index)
  VALUES (v_table_id, 0)
  RETURNING id INTO v_row_id;

  INSERT INTO public.document_cells (table_id, row_id, column_id, raw_value)
  VALUES (v_table_id, v_row_id, v_col_id, 'Test Cell')
  RETURNING id INTO v_cell_id;

  INSERT INTO public.purchase_line_provenance (invoice_line_id, document_row_id, linked_by)
  VALUES (v_invoice_line_id, v_row_id, 'test')
  RETURNING id INTO v_prov_id;

  -- Attempt direct deletes
  BEGIN
    DELETE FROM public.document_cells WHERE id = v_cell_id;
    RAISE EXCEPTION 'FAIL: document_cells direct delete succeeded!';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'document_cells delete blocked: %', SQLERRM;
  END;

  BEGIN
    DELETE FROM public.document_rows WHERE id = v_row_id;
    RAISE EXCEPTION 'FAIL: document_rows direct delete succeeded!';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'document_rows delete blocked: %', SQLERRM;
  END;

  BEGIN
    DELETE FROM public.document_extractions WHERE id = v_extraction_id;
    RAISE EXCEPTION 'FAIL: document_extractions direct delete succeeded!';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'document_extractions delete blocked: %', SQLERRM;
  END;

  BEGIN
    DELETE FROM public.purchase_line_provenance WHERE id = v_prov_id;
    RAISE EXCEPTION 'FAIL: purchase_line_provenance direct delete succeeded!';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'purchase_line_provenance delete blocked: %', SQLERRM;
  END;

  -- Cleanup
  DELETE FROM public.purchase_invoices WHERE id = v_invoice_id;
END;
$script$;
