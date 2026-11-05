-- Ametller source verified 820g ground black pepper: exact original
-- scanned delivery is an expense-only receipt, not an inventory movement.
-- Confirm product *and unit* but DO NOT automatically book 820g stock.
CREATE OR REPLACE FUNCTION public.prepare_verified_ametller_pepper_820g_no_stock_v1(
 p_invoice_id uuid,p_preview boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 i public.purchase_invoices%ROWTYPE;
 l public.purchase_invoice_lines%ROWTYPE;
 p public.purchase_interpretation_proposals%ROWTYPE;
 e public.document_extractions%ROWTYPE;
 job public.document_processing_jobs%ROWTYPE;
 mail public.purchase_email_documents%ROWTYPE;
 g public.ingredients%ROWTYPE;
 old_l public.purchase_invoice_lines%ROWTYPE;
 old_i public.purchase_invoices%ROWTYPE;
 v_m public.purchase_mapping_versions%ROWTYPE;
 v_pr uuid;
 source_row jsonb;
 v_count int;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_invoice_id IS DISTINCT FROM
   '96923f2c-b493-4384-84c3-5108b1e3a98f'::uuid
 THEN RETURN jsonb_build_object('ok',false,'reason','source_invoice_not_authorized'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pepper820:'||p_invoice_id::text,0));
 SELECT * INTO i FROM public.purchase_invoices WHERE id=p_invoice_id FOR UPDATE;
 IF i.id IS NULL OR i.supplier_id<>1 OR i.source<>'email'
  OR i.document_kind<>'monthly_invoice' OR i.invoice_number<>'0100009253'
  OR i.content_sha256<>'59716ef66171492f1f3e01aa95ad3059711b6a657c0a4ae3bdab05ca34f12465'
  OR i.status<>'pending_mapping' OR i.duplicate_of_invoice_id IS NOT NULL
 THEN RETURN jsonb_build_object('ok',false,'reason','original_invoice_sha_or_state_changed'); END IF;
 SELECT * INTO l FROM public.purchase_invoice_lines WHERE id='8c913099-2864-4ac2-9b42-0fafe2145d3f'::uuid
 AND invoice_id=i.id AND superseded_by_extraction_id IS NULL FOR UPDATE;
 SELECT * INTO g FROM public.ingredients WHERE id='f4f2287f-d66e-4f86-bab9-8eac5fd34498'::uuid FOR KEY SHARE;
 SELECT count(*) INTO v_count FROM public.purchase_invoice_lines WHERE invoice_id=i.id
 AND superseded_by_extraction_id IS NULL;
 IF l.id IS NULL OR g.id IS NULL OR v_count<>75
  OR g.name<>'Pimienta molida' OR g.base_unit<>'g' OR g.purchase_unit<>'kg'
  OR g.archived_at IS NOT NULL
  OR l.original_name<>'Pimienta Negra Molida 820 g' OR l.quantity<>1
  OR l.line_unit<>'UNI' OR l.unit_price<>16.28 OR l.total_price<>16.28
  OR l.mapped_ingredient_id<>g.id
 THEN RETURN jsonb_build_object('ok',false,'reason','product_unit_or_source_line_changed'); END IF;
 IF l.status='mapped' THEN
  IF EXISTS (SELECT 1 FROM public.purchase_mapping_versions v
   JOIN public.purchase_interpretation_proposals pr ON pr.mapping_version_id=v.id
   WHERE pr.id=l.interpretation_proposal_id AND v.supplier_id=1
    AND v.ingredient_id=g.id AND v.conversion_factor=0.82
    AND v.line_billing_unit='UNI' AND v.line_content_qty=820
    AND v.line_content_unit='g' AND v.status='confirmed'
    AND pr.physical_quantity=820 AND pr.purchase_quantity=0.82
    AND pr.provenance->'revision'->>'kind'='verified_original_820g_pepper_source_v1')
  THEN RETURN jsonb_build_object('ok',true,'idempotent',true,
   'stock_changed',false,'mapped',true);
  END IF;
  RETURN jsonb_build_object('ok',false,'reason','mapped_from_other_unverified_source');
 END IF;
 IF l.status<>'pending' OR
  EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r
    WHERE r.purchase_invoice_line_id=l.id) OR
  EXISTS(SELECT 1 FROM public.stock_movements sm
    WHERE sm.reference_id=l.id AND sm.movement_type='PURCHASE')
 THEN RETURN jsonb_build_object('ok',false,'reason','receipt_or_line_not_eligible'); END IF;
 IF NOT EXISTS(SELECT 1 FROM private.purchase_verified_pepper_source_identity v
    WHERE v.invoice_line_id=l.id AND v.invoice_id=i.id
     AND v.ingredient_id=g.id AND v.source_sha256=i.content_sha256
     AND v.source_sku='41444' AND v.source_package_g=820
     AND v.source_net_total=l.total_price AND v.stock_changed=false)
 THEN RETURN jsonb_build_object('ok',false,'reason','immutable_source_identity_evidence_absent'); END IF;
 SELECT * INTO p FROM public.purchase_interpretation_proposals WHERE id=l.interpretation_proposal_id FOR KEY SHARE;
 SELECT * INTO e FROM public.document_extractions WHERE id=p.document_extraction_id FOR KEY SHARE;
 SELECT * INTO job FROM public.document_processing_jobs WHERE invoice_id=i.id FOR KEY SHARE;
 SELECT * INTO mail FROM public.purchase_email_documents WHERE invoice_id=i.id FOR KEY SHARE;
 IF p.id IS NULL OR e.id IS NULL OR job.id IS NULL OR mail.id IS NULL
 OR p.document_extraction_id<>e.id OR p.purchase_invoice_id<>i.id OR p.supplier_id<>1
 OR p.source_item_name<>l.original_name OR p.source_file_hash<>i.content_sha256
 OR p.normalizer_version<>'ametller-pdf-text-v1'
 OR p.provenance->>'source'<>'pdf_text_verified'
 OR p.provenance->>'original_source_sha'<>i.content_sha256
 OR p.status<>'needs_mapping' OR p.mapping_version_id IS NOT NULL
 OR p.ingredient_id IS NOT NULL
 OR p.review_reasons<>ARRAY['producto_sin_mapping']::text[]
 OR cardinality(p.warnings)<>0
 OR p.source_row_index<>17 OR p.source_table_index<>0
 OR e.status<>'success' OR e.file_version_hash<>i.content_sha256
 OR job.status<>'completed' OR job.evidence_extraction_id<>e.id
 OR mail.status<>'imported' OR mail.content_sha256<>i.content_sha256
 OR mail.supplier_id<>1 OR mail.storage_path<>i.file_path
 OR NOT EXISTS(SELECT 1 FROM public.purchase_supplier_sender_addresses a
     WHERE a.supplier_id=1 AND a.confirmed_by_owner AND lower(a.sender_email)=lower(mail.sender_email))
 THEN RETURN jsonb_build_object('ok',false,'reason','original_pdf_ocr_or_supplier_sender_not_verified'); END IF;
 source_row:=e.raw_json_artifact->'canonical'->'lines'->p.source_row_index;
 IF source_row->>'supplier_product_code_raw'<>'41444'
 OR source_row->>'description_raw'<>'Pimienta Negra Molida 820 g'
 OR source_row->>'billing_unit_raw'<>'UNI'
 OR source_row->>'quantity_raw'<>'1.000'
 OR source_row->>'line_total_raw'<>'16.28'
 OR source_row->>'unit_price_raw'<>'16.280'
 THEN RETURN jsonb_build_object('ok',false,'reason','original_pdf_row_differs_from_database'); END IF;

 -- The delivery document is separately scanned on 19 October, with
 -- matching code, name, price and quantity. It was an EXPENSE_ONLY item,
 -- not a posted receipt; this function must not invent the stock movement.
 SELECT * INTO old_l FROM public.purchase_invoice_lines
 WHERE id='16c193a8-8b34-42a4-8c11-bc18eeec06d0'::uuid FOR KEY SHARE;
 SELECT * INTO old_i FROM public.purchase_invoices WHERE id=old_l.invoice_id FOR KEY SHARE;
 IF old_l.id IS NULL OR old_i.id IS NULL OR old_i.source<>'scanner'
 OR old_i.supplier_id<>1 OR old_i.invoice_date<>'2026-10-19'::date
 OR old_i.invoice_number<>'01/0277400' OR old_l.status<>'expense_only'
 OR old_l.original_name<>l.original_name OR old_l.quantity<>l.quantity
 OR old_l.unit_price<>l.unit_price OR old_l.total_price<>l.total_price
 OR old_l.mapped_ingredient_id IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r
    WHERE r.purchase_invoice_line_id=old_l.id)
 OR EXISTS(SELECT 1 FROM public.stock_movements sm
    WHERE sm.reference_id=old_l.id AND sm.movement_type='PURCHASE')
 THEN RETURN jsonb_build_object('ok',false,'reason','historical_expense_only_delivery_not_unique'); END IF;
 IF p_preview THEN
  RETURN jsonb_build_object('ok',true,'eligible',true,'ingredient_id',g.id,
   'source_invoice',i.invoice_number,'original_delivery',old_i.invoice_number,
   'source_package_g',820,'purchase_quantity_kg',0.82,
   'normalized_price_eur_per_kg',round(l.total_price/0.82,8),
   'stock_changed',false,'historical_stock_missing',true); END IF;
 INSERT INTO public.purchase_mapping_versions(
 supplier_id,supplier_item_name,ingredient_id,conversion_factor,
 line_billing_unit,line_content_qty,line_content_unit,status,
 source_document_extraction_id,idempotency_key,proposed_by,confirmed_by,confirmed_at,note)
 VALUES(1,l.original_name,g.id,0.82,'UNI',820,'g',
  'confirmed'::public.purchase_mapping_version_status,e.id,
  'verified-pepper820-original-source:'||l.id::text,
  p.created_by,p.created_by,now(),
  'Original supplier PDF and scanned 19-Oct delivery: 820g package. Invoice only mapped. Historical delivery expense_only, no stock posted.')
 RETURNING * INTO v_m;
 INSERT INTO public.purchase_interpretation_proposals (
  proposal_set_id,purchase_invoice_id,document_extraction_id,supplier_id,
  supplier_profile_id,supplier_profile_version,supplier_profile_hash,
  normalizer_version,source_file_hash,input_fingerprint,
  source_table_index,source_row_index,source_item_name,mapping_version_id,ingredient_id,
  status,observed,interpreted,normalized,pricing,proposed_allocations,
  review_reasons,warnings,line_quantity,line_unit,observed_unit_price,line_total,
  physical_quantity,base_unit,purchase_quantity,purchase_unit,normalized_unit_price,
  supersedes_proposal_id,created_by,provenance)
 VALUES(
  p.proposal_set_id,i.id,e.id,1,
  'verified-source-pepper-820g','2026-11-05-v1',
  encode(sha256(convert_to('verified-pepper-820g-v1:'||i.content_sha256,'UTF8')),'hex'),
  p.normalizer_version,i.content_sha256,
  encode(sha256(convert_to(p.input_fingerprint||':pepper820:'||v_m.id::text,'UTF8')),'hex'),
  0,17,l.original_name,v_m.id,g.id,
  'ready_for_review'::public.purchase_interpretation_proposal_status,
  p.observed,p.interpreted||jsonb_build_object('match_source','original_pdf_820g_unit'),
  p.normalized||jsonb_build_object('physical_quantity',820,'base_unit','g',
    'purchase_quantity',0.82,'purchase_unit','kg',
    'normalized_unit_price',round(l.total_price/0.82,8)),
  p.pricing||jsonb_build_object('verified_net_price_from_original',true),
  '[]'::jsonb,'{}'::text[],'{}'::text[],l.quantity,'UNI',l.unit_price,l.total_price,
  820,'g',0.82,'kg',round(l.total_price/0.82,8),
  p.id,p.created_by,p.provenance||jsonb_build_object('revision',jsonb_build_object(
   'kind','verified_original_820g_pepper_source_v1',
   'original_pdf_sha',i.content_sha256,'prior_delivery_line_id',old_l.id,
   'prior_delivery_was_expense_only',true,'stock_changed',false))
 ) RETURNING id INTO v_pr;
 UPDATE public.purchase_invoice_lines SET status='mapped',interpretation_proposal_id=v_pr
 WHERE id=l.id AND status='pending' AND interpretation_proposal_id=p.id
  AND mapped_ingredient_id=g.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent pepper invoice line update'; END IF;
 PERFORM public.sync_purchase_invoice_status(i.id);
 RETURN jsonb_build_object('ok',true,'applied',true,'stock_changed',false,
   'mapped',true,'physical_package_g',820,'old_expense_only_line',old_l.id,
   'prior_stock_still_missing',true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.prepare_verified_ametller_pepper_820g_no_stock_v1(uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_verified_ametller_pepper_820g_no_stock_v1(uuid,boolean)
 TO service_role;