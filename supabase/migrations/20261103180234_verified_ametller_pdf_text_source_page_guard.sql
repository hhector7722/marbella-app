-- Reconcile every source page against its immutable canonical page index.
-- Previously only PDF page 0 was accepted; pages 1-2 were wrongly blocked.
CREATE OR REPLACE FUNCTION public.record_verified_invoice_delivery_reconciliation_v4(p_invoice_line uuid, p_prior_delivery_line uuid, p_delivery_ref text, p_delivery_date date, p_preview boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_l public.purchase_invoice_lines%ROWTYPE;
 v_i public.purchase_invoices%ROWTYPE;
 v_p public.purchase_interpretation_proposals%ROWTYPE;
 v_prior_l public.purchase_invoice_lines%ROWTYPE;
 v_prior_i public.purchase_invoices%ROWTYPE;
 v_prior_p public.purchase_interpretation_proposals%ROWTYPE;
 v_r public.purchase_receipt_confirmations%ROWTYPE;
 v_s public.stock_movements%ROWTYPE;
 v_extraction public.document_extractions%ROWTYPE;
 v_email public.purchase_email_documents%ROWTYPE;
 v_count integer;
 v_found uuid;
 v_stored record;
 v_auto_legacy boolean := false;
 v_pdf_fallback boolean := false;
 v_pdf_job public.document_processing_jobs%ROWTYPE;
 v_pdf_row jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
   RETURN jsonb_build_object('ok',false,'reason','service_role_only');
 END IF;
 IF p_invoice_line IS NULL OR p_prior_delivery_line IS NULL
   OR p_invoice_line=p_prior_delivery_line OR p_delivery_date IS NULL
   OR p_delivery_ref IS NULL OR length(trim(p_delivery_ref))<4
 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_reconciliation_identity'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_invoice_line::text,8421));
 SELECT * INTO v_l FROM public.purchase_invoice_lines WHERE id=p_invoice_line FOR UPDATE;
 SELECT * INTO v_prior_l FROM public.purchase_invoice_lines WHERE id=p_prior_delivery_line FOR KEY SHARE;
 IF v_l.id IS NULL OR v_prior_l.id IS NULL OR v_l.invoice_id=v_prior_l.invoice_id
 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_reconciliation_lines'); END IF;
 SELECT * INTO v_i FROM public.purchase_invoices WHERE id=v_l.invoice_id FOR KEY SHARE;
 SELECT * INTO v_prior_i FROM public.purchase_invoices WHERE id=v_prior_l.invoice_id FOR KEY SHARE;
 IF v_i.id IS NULL OR v_prior_i.id IS NULL
   OR v_i.status='discarded' OR v_i.source<>'email'
   OR v_i.document_kind<>'monthly_invoice' OR v_i.duplicate_of_invoice_id IS NOT NULL
   OR v_i.supplier_id IS NULL OR v_i.supplier_id<>v_prior_i.supplier_id
   OR v_prior_i.status IS DISTINCT FROM 'mapped'
   OR v_prior_i.invoice_date IS DISTINCT FROM p_delivery_date
   OR v_i.invoice_date<p_delivery_date OR v_i.invoice_date>p_delivery_date+45
   OR v_l.superseded_by_extraction_id IS NOT NULL
   OR v_prior_l.superseded_by_extraction_id IS NOT NULL
   OR v_l.status NOT IN ('mapped','pending') OR v_prior_l.status<>'mapped'
   OR v_l.mapped_ingredient_id IS NULL
   OR v_l.mapped_ingredient_id IS DISTINCT FROM v_prior_l.mapped_ingredient_id
   OR v_l.quantity IS DISTINCT FROM v_prior_l.quantity
   OR abs(v_l.total_price-v_prior_l.total_price)>0.011
 THEN RETURN jsonb_build_object('ok',false,'reason','different_supplier_date_status_ingredient_or_economics'); END IF;
 SELECT * INTO v_p FROM public.purchase_interpretation_proposals WHERE id=v_l.interpretation_proposal_id;
 SELECT * INTO v_prior_p FROM public.purchase_interpretation_proposals WHERE id=v_prior_l.interpretation_proposal_id;
 SELECT * INTO v_extraction FROM public.document_extractions WHERE id=v_p.document_extraction_id;
 SELECT * INTO v_email FROM public.purchase_email_documents WHERE invoice_id=v_i.id;
 SELECT * INTO v_pdf_job FROM public.document_processing_jobs WHERE invoice_id=v_i.id;
 v_pdf_row := v_extraction.raw_json_artifact->'canonical'->'lines'->v_p.source_row_index;
 -- The Ametller fallback was admitted by an atomic, source-bound OCR recovery.
 -- Reverify it per line and supplier delivery before accepting a stock link.
 v_pdf_fallback := COALESCE(
   v_i.supplier_id=1 AND v_i.source='email' AND v_i.document_kind='monthly_invoice'
   AND v_prior_i.source='scanner'
   AND v_extraction.extractor_version='ametller-pdf-text-v1'
   AND v_extraction.status='success'
   AND v_extraction.file_version_hash=v_i.content_sha256
   AND v_extraction.raw_json_artifact->>'extractor'='pdftotext_verified'
   AND v_extraction.raw_json_artifact->'provenance'->>'kind'='digital_text_pdf_fallback'
   AND v_extraction.raw_json_artifact->'provenance'->>'parser'='ametller-pdf-text-v1'
   AND v_extraction.raw_json_artifact->'provenance'->>'stock_changed'='false'
   AND v_extraction.raw_json_artifact->'provenance'->>'original_sha256'=v_i.content_sha256
   AND v_extraction.raw_json_artifact->'response'->>'original_file_sha256'=v_i.content_sha256
   AND encode(extensions.digest(convert_to(
        v_extraction.raw_json_artifact->'response'->>'source_text','UTF8'),'sha256'),'hex')
       =v_extraction.raw_json_artifact->'response'->>'source_text_sha256'
   AND v_extraction.raw_json_artifact->'canonical'->>'document_number_raw'=v_i.invoice_number
   AND (v_extraction.raw_json_artifact->'canonical'->>'subtotal_raw')::numeric=v_i.base_amount
   AND (v_extraction.raw_json_artifact->'canonical'->>'total_raw')::numeric=v_i.total_amount
   AND (v_extraction.raw_json_artifact->'canonical'->>'tax_raw')::numeric=v_i.tax_amount
   AND v_i.base_amount+v_i.tax_amount=v_i.total_amount
   AND jsonb_array_length(v_extraction.raw_json_artifact->'canonical'->'lines')
       = (SELECT count(*) FROM public.purchase_invoice_lines pl
          WHERE pl.invoice_id=v_i.id AND pl.superseded_by_extraction_id IS NULL)
   AND (SELECT sum(pl.total_price) FROM public.purchase_invoice_lines pl
          WHERE pl.invoice_id=v_i.id AND pl.superseded_by_extraction_id IS NULL)=v_i.base_amount
   AND v_pdf_job.status='completed'
   AND v_pdf_job.replay_mode='historical'
   AND v_pdf_job.extractor_version='ametller-pdf-text-v1'
   AND v_pdf_job.evidence_extraction_id=v_extraction.id
   AND v_pdf_job.file_version_hash=v_i.content_sha256
   AND v_pdf_job.extraction_metrics->>'source_sha'=v_i.content_sha256
   AND v_p.source_row_index BETWEEN 0 AND 149
   AND v_p.source_table_index=(v_pdf_row->>'page_index')::integer
   AND v_p.observed->>'page_index'=v_pdf_row->>'page_index'
   AND v_p.provenance->>'source'='pdf_text_verified'
   AND v_p.provenance->>'trigger'='original_text_fallback'
   AND v_p.provenance->>'schema_version'='ametller-pdf-text-v1'
   AND v_p.provenance->>'economic_effects'='false'
   AND v_p.provenance->>'original_source_sha'=v_i.content_sha256
   AND NOT (v_p.provenance ? 'revision')
   AND v_p.normalizer_version='ametller-pdf-text-v1'
   AND v_pdf_row->>'supplier_product_code_raw'=v_p.observed->>'supplier_product_code_raw'
   AND v_pdf_row->>'description_raw'=v_l.original_name
   AND v_pdf_row->>'description_raw'=v_p.source_item_name
   AND v_pdf_row->>'quantity_raw'=v_p.observed->>'quantity_raw'
   AND v_pdf_row->>'line_total_raw'=v_p.observed->>'line_total_raw'
   AND (v_pdf_row->>'quantity_raw')::numeric=v_l.quantity
   AND (v_pdf_row->>'line_total_raw')::numeric=v_l.total_price
   AND length(btrim(v_p.observed->>'supplier_product_code_raw'))>=3
   AND upper(btrim(v_p.observed->>'supplier_product_code_raw'))
       =upper(btrim(v_prior_p.observed->>'supplier_product_code_raw'))
   AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(
          v_extraction.raw_json_artifact->'response'->'deliveries') g
      WHERE g->>'number'=p_delivery_ref
        AND g->>'date'=to_char(p_delivery_date,'YYYY-MM-DD')
        AND g->>'printed'='true'
        AND (g->>'firstRow')::int<=v_p.source_row_index
        AND (g->>'lastRow')::int>=v_p.source_row_index
        AND (SELECT sum((l.value->>'line_total_raw')::numeric)*100
          FROM jsonb_array_elements(
            v_extraction.raw_json_artifact->'canonical'->'lines')
            WITH ORDINALITY AS l(value,idx)
          WHERE (l.idx-1) BETWEEN (g->>'firstRow')::int AND (g->>'lastRow')::int)
         = (g->>'netCents')::numeric
   )
 ,false);
 v_auto_legacy := v_l.status='pending'
   AND v_p.status='needs_mapping'
   AND v_p.mapping_version_id IS NULL AND v_p.ingredient_id IS NULL
   AND v_p.review_reasons=ARRAY['producto_sin_mapping']::text[]
   AND cardinality(v_p.warnings)=0
   AND (v_p.interpreted->>'match_source'='unmatched'
      OR (v_pdf_fallback AND v_p.interpreted->>'match_source'='unverified'))
   AND v_p.physical_quantity IS NULL;
 IF v_p.id IS NULL OR v_prior_p.id IS NULL OR v_extraction.id IS NULL OR v_email.id IS NULL
   OR v_p.purchase_invoice_id IS DISTINCT FROM v_i.id
   OR NOT ((v_p.status='ready_for_review' AND v_l.status='mapped') OR v_auto_legacy)
   OR (cardinality(v_p.review_reasons)>0 AND NOT v_auto_legacy) OR cardinality(v_p.warnings)>0
   OR (v_p.ingredient_id IS DISTINCT FROM v_l.mapped_ingredient_id AND NOT v_auto_legacy)
   OR v_p.source_file_hash IS DISTINCT FROM v_i.content_sha256
   OR v_p.source_item_name IS DISTINCT FROM v_l.original_name
   OR v_p.line_quantity IS DISTINCT FROM v_l.quantity
   OR abs(v_p.line_total-v_l.total_price)>0.011
   OR NOT (v_pdf_fallback OR (
      v_p.provenance->>'source' IS NOT DISTINCT FROM 'mistral_canonical'
      AND v_p.provenance->>'trigger' IS NOT DISTINCT FROM 'mistral_job_completion'
      AND v_p.provenance->>'schema_version' IS NOT DISTINCT FROM 'mistral-pipeline-v3'
      AND NOT (v_p.provenance ? 'revision')
      AND v_p.normalizer_version IS NOT DISTINCT FROM 'mistral-pipeline-v3'
   ))
   OR v_extraction.invoice_id<>v_i.id OR v_extraction.file_version_hash<>v_i.content_sha256
   OR v_extraction.status<>'success'
   OR v_email.status<>'imported' OR v_email.supplier_id<>v_i.supplier_id
   OR v_email.content_sha256<>v_i.content_sha256
   OR NOT EXISTS (
      SELECT 1 FROM public.purchase_supplier_sender_addresses a
      WHERE lower(a.sender_email)=lower(v_email.sender_email)
      AND a.supplier_id=v_i.supplier_id AND a.confirmed_by_owner
   )
 THEN RETURN jsonb_build_object('ok',false,'reason','source_identity_sender_or_economics_not_verified'); END IF;
 -- OCR can truncate a product label, but matching source SKU or exact name
 -- plus precise quantity and net amount is mandatory.
 IF NOT (
   (length(btrim(coalesce(v_p.observed->>'supplier_product_code_raw','')))>2
    AND upper(btrim(v_p.observed->>'supplier_product_code_raw'))=
        upper(btrim(v_prior_p.observed->>'supplier_product_code_raw')))
   OR lower(btrim(v_l.original_name))=lower(btrim(v_prior_l.original_name))
   OR (
      v_i.supplier_id=2
      AND v_p.observed->>'supplier_product_code_raw'='1530007'
      AND v_prior_p.observed->>'supplier_product_code_raw'='PEDIDO CONTESTADOR'
      AND v_l.original_name='BOCATA MEDITERRANEO- 60 Uds. 100006632'
      AND v_prior_l.original_name='BOCATA MEDITERRANEO- 60 Uds.'
   )
 )
 THEN RETURN jsonb_build_object('ok',false,'reason','supplier_item_identity_differs'); END IF;
 SELECT * INTO v_r FROM public.purchase_receipt_confirmations
 WHERE purchase_invoice_line_id=p_prior_delivery_line;
 IF v_r.id IS NULL OR v_r.purchase_invoice_id<>v_prior_i.id
   OR v_r.ingredient_id<>v_l.mapped_ingredient_id OR v_r.supplier_id<>v_i.supplier_id
   OR (v_p.physical_quantity IS NULL AND NOT v_auto_legacy) OR (v_p.physical_quantity IS NOT NULL AND v_p.physical_quantity<>v_r.physical_quantity)
 THEN RETURN jsonb_build_object('ok',false,'reason','prior_receipt_identity_or_physical_units_invalid'); END IF;
 SELECT * INTO v_s FROM public.stock_movements WHERE id=v_r.stock_movement_id;
 IF v_s.id IS NULL OR v_s.movement_type<>'PURCHASE'
   OR v_s.ingredient_id<>v_l.mapped_ingredient_id
   OR v_s.quantity<>v_r.physical_quantity
   OR NOT (v_s.reference_id=p_prior_delivery_line OR v_s.reference_doc='ALB-LINE-'||p_prior_delivery_line::text)
   OR EXISTS (
      SELECT 1 FROM public.stock_movements u
      WHERE u.reversal_of_movement_id=v_s.id AND u.origin='reversal'
   )
 THEN RETURN jsonb_build_object('ok',false,'reason','prior_stock_movement_missing_or_reversed'); END IF;
 IF EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations WHERE purchase_invoice_line_id=p_invoice_line)
 OR EXISTS(SELECT 1 FROM public.stock_movements WHERE reference_id=p_invoice_line OR reference_doc='ALB-LINE-'||p_invoice_line::text)
 THEN RETURN jsonb_build_object('ok',false,'reason','invoice_line_already_posted'); END IF;
 SELECT invoice_line_id INTO v_found
 FROM private.purchase_invoice_delivery_reconciliations
 WHERE original_delivery_line_id=p_prior_delivery_line OR invoice_line_id=p_invoice_line;
 IF v_found IS NOT NULL THEN
   SELECT * INTO v_stored FROM private.purchase_invoice_delivery_reconciliations WHERE invoice_line_id=p_invoice_line;
   RETURN jsonb_build_object('ok',
     (v_stored.original_delivery_line_id IS NOT DISTINCT FROM p_prior_delivery_line),
     'idempotent',true,'applied',false);
 END IF;
 -- Defend against two equally plausible prior receipts on that supplier/date.
 SELECT count(*) INTO v_count FROM public.purchase_receipt_confirmations r
 JOIN public.purchase_invoice_lines l ON l.id=r.purchase_invoice_line_id
 JOIN public.purchase_invoices i ON i.id=l.invoice_id
 WHERE i.supplier_id=v_i.supplier_id AND i.invoice_date=p_delivery_date
   AND l.mapped_ingredient_id=v_l.mapped_ingredient_id
   AND l.quantity=v_l.quantity AND abs(l.total_price-v_l.total_price)<=0.011;
 IF v_count<>1 THEN RETURN jsonb_build_object('ok',false,'reason','ambiguous_prior_delivery_receipt','matches',v_count); END IF;
 IF p_preview THEN
   RETURN jsonb_build_object('ok',true,'eligible',true,'applied',false,
     'invoice_line_id',p_invoice_line,'delivery_line_id',p_prior_delivery_line,'stock_changed',false,'legacy_mapping_verified',v_auto_legacy);
 END IF;
 INSERT INTO private.purchase_invoice_delivery_reconciliations(
 invoice_line_id,original_delivery_line_id,original_receipt_id,invoice_id,source_extraction_id,
 source_hash,supplier_delivery_ref,supplier_delivery_date
 ) VALUES (p_invoice_line,p_prior_delivery_line,v_r.id,v_i.id,v_extraction.id,
           v_i.content_sha256,p_delivery_ref,p_delivery_date);
 IF v_auto_legacy THEN
   UPDATE public.purchase_invoice_lines SET status='mapped'
   WHERE id=p_invoice_line AND invoice_id=v_i.id AND status='pending'
   AND mapped_ingredient_id=v_r.ingredient_id AND interpretation_proposal_id=v_p.id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Verified monthly mapping changed concurrently; rollback'; END IF;
 END IF;
 PERFORM public.sync_purchase_invoice_status(v_i.id);
 RETURN jsonb_build_object('ok',true,'applied',true,'invoice_line_id',p_invoice_line,
  'delivery_line_id',p_prior_delivery_line,'stock_changed',false,'legacy_mapping_verified',v_auto_legacy);
END
$function$;
REVOKE ALL ON FUNCTION public.record_verified_invoice_delivery_reconciliation_v4(uuid,uuid,text,date,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_verified_invoice_delivery_reconciliation_v4(uuid,uuid,text,date,boolean) TO service_role;
