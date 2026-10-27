-- Don't let a later paper/email invoice double manual deliveries from Don Hielo/Pons.
-- For those suppliers the receipt of goods is always through the one-product manual form.
CREATE OR REPLACE FUNCTION public.reject_monthly_invoice_stock()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE v_line uuid;
BEGIN
  IF TG_TABLE_NAME='stock_movements' THEN
    IF NEW.movement_type <> 'PURCHASE' THEN RETURN NEW; END IF;
    IF NEW.reference_type='purchase_invoice_line'::public.stock_reference_type THEN
      v_line:=NEW.reference_id;
    ELSIF coalesce(NEW.reference_doc,'') ~*
      '^ALB-LINE-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_line:=substring(NEW.reference_doc from 10)::uuid;
    END IF;
  ELSIF TG_TABLE_NAME='purchase_receipt_confirmations' THEN
    v_line:=NEW.purchase_invoice_line_id;
  END IF;
  IF v_line IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.purchase_invoice_lines l
    JOIN public.purchase_invoices i ON i.id=l.invoice_id
    LEFT JOIN public.suppliers s ON s.id=i.supplier_id
    WHERE l.id=v_line AND (
      i.document_kind='monthly_invoice'
      OR lower(btrim(s.name)) IN ('don hielo','pons')
    )
  ) THEN
    RAISE EXCEPTION 'Factura mensual o proveedor de recepción manual: el documento no puede generar segunda entrada de stock';
  END IF;
  RETURN NEW;
END;
$fn$;
