SELECT 
  (SELECT count(*) FROM public.purchase_invoices WHERE invoice_number = 'TEST-DELETE-001') as inv,
  (SELECT count(*) FROM public.document_extractions WHERE extractor_version = 'test') as ext,
  (SELECT count(*) FROM public.document_cells WHERE raw_value = 'Test Cell') as cel,
  (SELECT count(*) FROM public.purchase_invoice_lines WHERE original_name = 'Test Line') as lin,
  (SELECT count(*) FROM public.purchase_line_provenance WHERE linked_by = 'test') as prv;
