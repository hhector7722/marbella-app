-- Exact in-transaction K4 successor only, with identical supplier, ingredient, physical
-- presentation and source extraction. The original service-only permit is preserved.
CREATE OR REPLACE FUNCTION private.invoice_stock_permit_is_current(p_line uuid, p_ingredient uuid, p_mapping uuid)
 RETURNS boolean
 LANGUAGE sql
 VOLATILE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(
 SELECT 1 FROM private.purchase_invoice_stock_authorizations a
 JOIN public.purchase_invoice_lines l ON l.id=a.invoice_line_id
 JOIN public.purchase_invoices i ON i.id=l.invoice_id AND i.id=a.invoice_id
 JOIN public.purchase_interpretation_proposals p ON p.id=a.interpretation_proposal_id
 JOIN public.document_extractions e ON e.id=a.source_extraction_id
 JOIN public.ingredients g ON g.id=p_ingredient
 WHERE a.invoice_line_id=p_line
 AND i.source='email' AND i.document_kind IS DISTINCT FROM 'delivery_note'
 AND i.document_kind IS DISTINCT FROM 'other'
 AND i.duplicate_of_invoice_id IS NULL
 AND i.supplier_id=a.supplier_id
 AND btrim(i.invoice_number)=a.supplier_invoice_number
 AND i.content_sha256=a.source_sha256
 AND l.superseded_by_extraction_id IS NULL
 AND l.mapped_ingredient_id=p_ingredient
 AND l.interpretation_proposal_id=p.id
 AND p.purchase_invoice_id=i.id
 AND p.document_extraction_id=e.id
 AND p.source_file_hash=a.source_sha256
 AND e.invoice_id=i.id AND e.file_version_hash=a.source_sha256
 AND e.status='success'
 AND (
   a.mapping_version_id=p_mapping
   OR EXISTS(
     SELECT 1 FROM public.purchase_mapping_versions successor
     JOIN public.purchase_mapping_versions original ON original.id=a.mapping_version_id
     WHERE successor.id=p_mapping AND successor.supersedes_id=original.id
       AND original.status='proposed' AND successor.status='confirmed'
       AND successor.idempotency_key='receipt-map:verified-invoice-stock:'||p_line::text
       AND successor.confirmed_by IS NOT NULL AND successor.confirmed_at IS NOT NULL
       AND successor.supplier_id=original.supplier_id AND successor.ingredient_id=original.ingredient_id
       AND successor.conversion_factor=original.conversion_factor
       AND lower(btrim(successor.line_billing_unit))=lower(btrim(original.line_billing_unit))
       AND successor.line_content_qty=original.line_content_qty
       AND lower(btrim(successor.line_content_unit))=lower(btrim(original.line_content_unit))
       AND successor.source_document_extraction_id IS NOT DISTINCT FROM original.source_document_extraction_id
   )
 )
 AND g.archived_at IS NULL
 AND auth.role()='service_role'
 );
$function$;
REVOKE ALL ON FUNCTION private.invoice_stock_permit_is_current(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.invoice_stock_permit_is_current(uuid,uuid,uuid) TO service_role;
