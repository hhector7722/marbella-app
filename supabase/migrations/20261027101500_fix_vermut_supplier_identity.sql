-- Correct formerly mistaken "Pons": real supplier is existing "Vermut" (id 17).
-- This is an identity correction only, no stock movements changed.
DO $audit$
DECLARE v_count bigint;
BEGIN
 SELECT count(*) INTO v_count FROM public.manual_pons_vermut_receipts;
 IF v_count<>0 THEN RAISE EXCEPTION 'Manual Pons receipts exist; reconcile historical data before renaming'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=17 AND name='Vermut') THEN
    RAISE EXCEPTION 'Canonical supplier Vermut (id=17) missing';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=23 AND name='Pons') THEN
    RAISE EXCEPTION 'Erroneous Pons supplier missing or already corrected';
 END IF;
 -- Fail the migration unless all external references of the erroneous row are empty.
 IF EXISTS(SELECT 1 FROM public.purchase_invoices WHERE supplier_id=23)
 OR EXISTS(SELECT 1 FROM public.order_drafts WHERE supplier_id=23)
 OR EXISTS(SELECT 1 FROM public.purchase_email_documents WHERE supplier_id=23)
 OR EXISTS(SELECT 1 FROM public.supplier_item_mappings WHERE supplier_id=23)
 OR EXISTS(SELECT 1 FROM public.purchase_mapping_versions WHERE supplier_id=23)
 OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations WHERE supplier_id=23)
 OR EXISTS(SELECT 1 FROM public.purchase_interpretation_proposals WHERE supplier_id=23) THEN
   RAISE EXCEPTION 'Pons was referenced in operational records; manual reconciliation required';
 END IF;
 UPDATE public.manual_pons_vermut_receipts SET supplier_id=17 WHERE supplier_id=23;
 DELETE FROM public.suppliers WHERE id=23 AND name='Pons';
END;
$audit$;
ALTER TABLE public.manual_pons_vermut_receipts RENAME TO manual_vermut_receipts;
DROP FUNCTION IF EXISTS public.record_manual_pons_vermut_receipt(uuid,numeric,text);
CREATE OR REPLACE FUNCTION public.record_manual_vermut_receipt(
 p_request_id uuid,p_quantity_l numeric,p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $rpc$
DECLARE v_supplier bigint;v_ingredient uuid;v_movement uuid;
 v_existing public.manual_vermut_receipts%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_purchase_manager_or_admin() THEN
   RAISE EXCEPTION 'Solo manager o admin puede confirmar recepciones de Vermut';
 END IF;
 IF p_request_id IS NULL OR p_quantity_l IS NULL OR p_quantity_l<=0
   OR p_quantity_l>200 OR scale(p_quantity_l)>3 THEN
   RAISE EXCEPTION 'Introduce litros reales entre 0 y 200, máximo 3 decimales';
 END IF;
 IF length(coalesce(p_note,''))>300 THEN RAISE EXCEPTION 'Nota demasiado larga'; END IF;
 SELECT id INTO v_supplier FROM public.suppliers WHERE lower(btrim(name))='vermut' LIMIT 1;
 SELECT id INTO v_ingredient FROM public.ingredients
 WHERE name='Vermut' AND base_unit='ml' LIMIT 1;
 IF v_supplier IS NULL OR v_ingredient IS NULL THEN
   RAISE EXCEPTION 'Proveedor Vermut o ingrediente Vermut no configurados';
 END IF;
 SELECT * INTO v_existing FROM public.manual_vermut_receipts WHERE id=p_request_id FOR UPDATE;
 IF FOUND THEN
   RETURN jsonb_build_object('receipt_id',v_existing.id,'stock_movement_id',v_existing.stock_movement_id,'duplicate',true);
 END IF;
 INSERT INTO public.manual_vermut_receipts
  (id,supplier_id,ingredient_id,quantity_l,created_by,note)
 VALUES(p_request_id,v_supplier,v_ingredient,p_quantity_l,auth.uid(),nullif(btrim(p_note),''));
 INSERT INTO public.stock_movements(
  movement_type,ingredient_id,quantity,unit,reference_doc,reference_type,reference_external_id,
  origin,idempotency_key,notes,provenance
 ) VALUES(
  'ADJUSTMENT',v_ingredient,p_quantity_l*1000,'ml',
  'VERMUT-DELIVERY-'||p_request_id::text,'manual_adjustment',p_request_id::text,
  'manager_adjustment','vermut-delivery:'||p_request_id::text,
  'Entrada manual de Vermut sin factura: coste pendiente de justificante',
  jsonb_build_object('manual_vermut_receipt_id',p_request_id,
    'supplier_id',v_supplier,'quantity_l',p_quantity_l,'created_by',auth.uid(),
    'accounting_status','invoice_not_received')
 ) RETURNING id INTO v_movement;
 UPDATE public.manual_vermut_receipts
 SET stock_movement_id=v_movement WHERE id=p_request_id;
 RETURN jsonb_build_object('receipt_id',p_request_id,
   'stock_movement_id',v_movement,'duplicate',false);
END;
$rpc$;
REVOKE ALL ON FUNCTION public.record_manual_vermut_receipt(uuid,numeric,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_manual_vermut_receipt(uuid,numeric,text)
 TO authenticated;

-- Pons no longer exists. Existing supplier Vermut uses the one-product intake.
CREATE OR REPLACE FUNCTION public.reject_monthly_invoice_stock()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE v_line uuid;
BEGIN
 IF TG_TABLE_NAME='stock_movements' THEN
   IF NEW.movement_type <> 'PURCHASE' THEN RETURN NEW; END IF;
   IF NEW.reference_type='purchase_invoice_line'::public.stock_reference_type THEN
     v_line := NEW.reference_id;
   ELSIF coalesce(NEW.reference_doc,'') ~*
     '^ALB-LINE-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
     v_line:=substring(NEW.reference_doc from 10)::uuid;
   END IF;
 ELSIF TG_TABLE_NAME='purchase_receipt_confirmations' THEN
   v_line:=NEW.purchase_invoice_line_id;
 END IF;
 IF v_line IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.purchase_invoice_lines l
   JOIN public.purchase_invoices i ON i.id=l.invoice_id
   LEFT JOIN public.suppliers s ON s.id=i.supplier_id
   WHERE l.id=v_line AND (i.document_kind='monthly_invoice'
       OR lower(btrim(s.name)) IN ('don hielo','vermut'))
 ) THEN
   RAISE EXCEPTION 'Factura mensual o proveedor de recepción manual: no puede duplicar existencias';
 END IF;
 RETURN NEW;
END;
$fn$;
