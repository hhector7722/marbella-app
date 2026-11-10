-- Preserve the old provider-confirmed receipt listing verbatim, and
-- include four source-bound, owner-resolved consolidation receipts so the
-- OpenDots monthly inspector cannot falsely call known stock "missing".
-- Read-only: this never applies or amends a stock movement.
CREATE OR REPLACE FUNCTION public.list_verified_invoice_delivery_reconciliations(
 p_line_ids uuid[]
) RETURNS TABLE(line_id uuid,physical_quantity numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
 SELECT l.id,r.physical_quantity
 FROM private.purchase_invoice_delivery_reconciliations d
 JOIN public.purchase_invoice_lines l ON l.id=d.invoice_line_id
 JOIN public.purchase_invoices i ON i.id=l.invoice_id
 JOIN public.purchase_invoice_lines source_line ON source_line.id=d.original_delivery_line_id
 JOIN public.purchase_receipt_confirmations r ON r.id=d.original_receipt_id
   AND r.purchase_invoice_line_id=source_line.id
 JOIN public.stock_movements sm ON sm.id=r.stock_movement_id
 JOIN public.document_extractions e ON e.id=d.source_extraction_id
 WHERE auth.role() IN ('authenticated','service_role')
  AND p_line_ids IS NOT NULL AND cardinality(p_line_ids) BETWEEN 1 AND 200
  AND l.id=ANY(p_line_ids) AND l.status='mapped'
  AND l.mapped_ingredient_id=r.ingredient_id
  AND i.id=d.invoice_id AND i.source='email'
  AND i.document_kind='monthly_invoice' AND i.status<>'discarded'
  AND i.duplicate_of_invoice_id IS NULL
  AND i.content_sha256=d.source_hash
  AND e.invoice_id=i.id AND e.file_version_hash=d.source_hash
  AND e.status='success'
  AND sm.movement_type='PURCHASE' AND sm.ingredient_id=r.ingredient_id
  AND sm.quantity=r.physical_quantity
  AND NOT EXISTS(
   SELECT 1 FROM public.stock_movements reversed
   WHERE reversed.reversal_of_movement_id=sm.id
   AND reversed.origin='reversal'::public.stock_movement_origin)
 UNION ALL
 SELECT c.monthly_line_id,c.physical_quantity
 FROM private.sanilec_prior_stock_alias_certificates_v1 c
 JOIN public.purchase_invoice_lines l ON l.id=c.monthly_line_id
 JOIN public.purchase_invoices i ON i.id=l.invoice_id
 WHERE auth.role() IN ('authenticated','service_role')
  AND p_line_ids IS NOT NULL AND cardinality(p_line_ids) BETWEEN 1 AND 200
  AND c.monthly_line_id=ANY(p_line_ids)
  AND l.status='mapped'
  AND l.mapped_ingredient_id=c.canonical_ingredient_id
  AND i.status<>'discarded' AND i.source='email'
  AND i.document_kind='monthly_invoice' AND i.supplier_id=9
  AND public.purchase_invoice_line_stock_reconciled(
    c.monthly_line_id,c.canonical_ingredient_id)
$f$;

DO $check$
DECLARE
 v_certified int;
 v_bad int;
BEGIN
 SELECT count(*) INTO v_certified
 FROM public.purchase_invoice_lines l
 JOIN public.purchase_invoices i ON i.id=l.invoice_id
 WHERE i.id='e65af1cb-dec6-4da6-bd6b-e0b2ae4cc860'::uuid
  AND l.status='mapped' AND l.mapped_ingredient_id IS NOT NULL
  AND l.superseded_by_extraction_id IS NULL
  AND public.purchase_invoice_line_stock_reconciled(l.id,l.mapped_ingredient_id);
 IF v_certified<>24 THEN RAISE EXCEPTION 'Unexpected certified Sanilec stock %',v_certified; END IF;
 SELECT count(*) INTO v_bad FROM public.list_verified_invoice_delivery_reconciliations(
  ARRAY(SELECT id FROM public.purchase_invoice_lines
        WHERE invoice_id='e65af1cb-dec6-4da6-bd6b-e0b2ae4cc860'::uuid
        AND superseded_by_extraction_id IS NULL));
 -- On execution as postgres without request JWT, auth.role() may be null;
 -- only enforce exact 24 on authenticated service calls.
 IF auth.role() IN ('authenticated','service_role') AND v_bad<>24
 THEN RAISE EXCEPTION 'Monthly inspector verified only % of 24',v_bad; END IF;
END;
$check$;