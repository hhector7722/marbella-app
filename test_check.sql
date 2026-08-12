DO $script$
DECLARE
  v_inv_count INT;
  v_ext_count INT;
  v_tab_count INT;
  v_col_count INT;
  v_row_count INT;
  v_cel_count INT;
  v_lin_count INT;
  v_prv_count INT;
BEGIN
  SELECT count(*) INTO v_inv_count FROM public.purchase_invoices WHERE invoice_number = 'TEST-DELETE-001';
  SELECT count(*) INTO v_ext_count FROM public.document_extractions WHERE extractor_version = 'test';
  SELECT count(*) INTO v_tab_count FROM public.document_tables dt JOIN public.document_extractions de ON dt.extraction_id = de.id WHERE de.extractor_version = 'test';
  SELECT count(*) INTO v_cel_count FROM public.document_cells dc WHERE raw_value = 'Test Cell';
  SELECT count(*) INTO v_lin_count FROM public.purchase_invoice_lines WHERE original_name = 'Test Line';
  SELECT count(*) INTO v_prv_count FROM public.purchase_line_provenance WHERE linked_by = 'test';
  
  RAISE NOTICE 'Counts: inv=%, ext=%, tab=%, cel=%, lin=%, prv=%', v_inv_count, v_ext_count, v_tab_count, v_cel_count, v_lin_count, v_prv_count;
END;
$script$;
