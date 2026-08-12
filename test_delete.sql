DO $script$
DECLARE
  v_invoice_id UUID;
BEGIN
  SELECT id INTO v_invoice_id FROM public.purchase_invoices WHERE invoice_number = 'TEST-DELETE-001' LIMIT 1;
  
  IF v_invoice_id IS NOT NULL THEN
    DELETE FROM public.purchase_invoices WHERE id = v_invoice_id;
    RAISE NOTICE 'Deleted successfully';
  ELSE
    RAISE NOTICE 'Invoice not found';
  END IF;
END;
$script$;
