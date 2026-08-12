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
  -- Create a dummy supplier if needed (or get the first one)
  SELECT id INTO v_supplier_id FROM public.suppliers LIMIT 1;
  
  -- 1. purchase_invoices
  INSERT INTO public.purchase_invoices (supplier_id, invoice_number, invoice_date, status, source, file_path)
  VALUES (v_supplier_id, 'TEST-DELETE-001', '2026-08-12', 'pending_mapping', 'scanner', 'test/path.jpg')
  RETURNING id INTO v_invoice_id;

  -- 2. purchase_invoice_lines
  INSERT INTO public.purchase_invoice_lines (invoice_id, original_name, quantity, unit_price, total_price, status)
  VALUES (v_invoice_id, 'Test Line', 1, 10, 10, 'pending')
  RETURNING id INTO v_invoice_line_id;

  -- 3. document_extractions
  INSERT INTO public.document_extractions (invoice_id, extractor_version, status)
  VALUES (v_invoice_id, 'test', 'success')
  RETURNING id INTO v_extraction_id;

  -- 4. document_tables -> columns -> rows -> cells
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

  -- 5. purchase_line_provenance
  INSERT INTO public.purchase_line_provenance (invoice_line_id, document_row_id, linked_by)
  VALUES (v_invoice_line_id, v_row_id, 'test')
  RETURNING id INTO v_prov_id;

  RAISE NOTICE 'Test data created: invoice_id=%', v_invoice_id;
END;
$script$;
