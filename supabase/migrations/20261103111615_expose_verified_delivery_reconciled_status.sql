-- One RPC for UI status; report original delivered stock as reconciled,
-- never as a new stock entry against the later economic invoice.
CREATE OR REPLACE FUNCTION public.list_verified_invoice_delivery_reconciliations(p_line_ids uuid[])
RETURNS TABLE(line_id uuid, physical_quantity numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT l.id,r.physical_quantity
 FROM private.purchase_invoice_delivery_reconciliations d
 JOIN public.purchase_invoice_lines l ON l.id=d.invoice_line_id
 JOIN public.purchase_invoices i ON i.id=l.invoice_id
 JOIN public.purchase_invoice_lines source_line ON source_line.id=d.original_delivery_line_id
 JOIN public.purchase_receipt_confirmations r ON r.id=d.original_receipt_id AND r.purchase_invoice_line_id=source_line.id
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
   AND reversed.origin='reversal'::public.stock_movement_origin
  );
$function$;
REVOKE ALL ON FUNCTION public.list_verified_invoice_delivery_reconciliations(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_verified_invoice_delivery_reconciliations(uuid[]) TO authenticated,service_role;
-- A previous experimental direct alias-status mutation cannot succeed because
-- purchase_mapping_versions is correctly append-only. Disable that path.
REVOKE ALL ON FUNCTION public.confirm_verified_mistral_alias_mapping(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
