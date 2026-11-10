-- Learn only three invoice-line identities on Sanilec's original 23-Oct
-- delivery note, reusing the exact confirmed 31-Oct monthly-invoice
-- source evidence. No receipt, movement or price mutation is performed.
CREATE TABLE IF NOT EXISTS private.purchase_sanilec_a64199_verified_aliases_v1 (
 invoice_line_id uuid PRIMARY KEY REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 monthly_line_id uuid NOT NULL REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
 ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
 verified_mapping_version_id uuid NOT NULL REFERENCES public.purchase_mapping_versions(id) ON DELETE RESTRICT,
 original_proposal_id uuid NOT NULL REFERENCES public.purchase_interpretation_proposals(id) ON DELETE RESTRICT,
 resulting_proposal_id uuid NOT NULL UNIQUE REFERENCES public.purchase_interpretation_proposals(id) ON DELETE RESTRICT,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 source_sku text NOT NULL,
 units_per_package integer NOT NULL CHECK(units_per_package IN (5,1000,3000)),
 net_amount numeric(16,2) NOT NULL CHECK(net_amount>0),
 stock_changed boolean NOT NULL DEFAULT false CHECK(NOT stock_changed),
 source_total_gross numeric(16,2) NOT NULL CHECK(source_total_gross=417.78),
 source_total_net numeric(16,2) NOT NULL CHECK(source_total_net=345.27),
 inferred_source_vat numeric(16,2) NOT NULL CHECK(inferred_source_vat=72.51),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.purchase_sanilec_a64199_verified_aliases_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_sanilec_a64199_verified_aliases_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON private.purchase_sanilec_a64199_verified_aliases_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_sanilec_a64199_original_verified_aliases_v1(
 p_invoice_id uuid,p_preview boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 i public.purchase_invoices%ROWTYPE;
 monthly public.purchase_invoices%ROWTYPE;
 em public.purchase_email_documents%ROWTYPE;
 j public.document_processing_jobs%ROWTYPE;
 e public.document_extractions%ROWTYPE;
 l public.purchase_invoice_lines%ROWTYPE;
 older public.purchase_invoice_lines%ROWTYPE;
 p public.purchase_interpretation_proposals%ROWTYPE;
 v public.purchase_mapping_versions%ROWTYPE;
 g public.ingredients%ROWTYPE;
 witness private.purchase_verified_sanilec_packages%ROWTYPE;
 orig jsonb;
 r record;
 total_lines int;
 sum_lines numeric;
 pending_count int:=0;
 already int:=0;
 applied int:=0;
 proposed_id uuid;
 details jsonb:='[]'::jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role'
 OR p_invoice_id IS DISTINCT FROM '8b22b629-c480-49c4-b11b-382ea21c9998'::uuid
 THEN RETURN jsonb_build_object('ok',false,'reason','not_authorized_original_delivery'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sanilec-a64199-monthly-proof-only',0));
 SELECT * INTO i FROM public.purchase_invoices
 WHERE id=p_invoice_id FOR UPDATE;
 SELECT * INTO monthly FROM public.purchase_invoices
 WHERE id='e65af1cb-dec6-4da6-bd6b-e0b2ae4cc860'::uuid FOR KEY SHARE;
 IF i.id IS NULL OR monthly.id IS NULL OR i.source<>'email'
 OR i.supplier_id<>9 OR i.document_kind<>'delivery_note'
 OR i.invoice_number<>'A/64199' OR i.invoice_date<>'2026-10-23'
 OR i.status<>'pending_mapping' OR i.duplicate_of_invoice_id IS NOT NULL
 OR i.content_sha256<>'963d539dc24173658446d4ba2dcba9633195c14273f91504e6fa906f380ec8f6'
 OR i.total_amount<>417.78
 OR monthly.invoice_number<>'A/20456' OR monthly.source<>'email'
 OR monthly.supplier_id<>9 OR monthly.document_kind<>'monthly_invoice'
 OR monthly.content_sha256<>'4357ee7da8d4a8e2498c1d6a4495b869a526bac5e5cdefe2d7fcf64373733a3b'
 OR monthly.base_amount<>673.80 OR monthly.total_amount<>815.30
 THEN RETURN jsonb_build_object('ok',false,'reason','source_invoice_or_monthly_proof_changed'); END IF;
 SELECT count(*),sum(total_price) INTO total_lines,sum_lines
 FROM public.purchase_invoice_lines
 WHERE invoice_id=i.id AND superseded_by_extraction_id IS NULL;
 IF total_lines<>17 OR sum_lines<>345.27 OR round(sum_lines*1.21,2)<>417.78
 THEN RETURN jsonb_build_object('ok',false,'reason','delivery_original_17_net_vat21_not_verified'); END IF;
 SELECT * INTO em FROM public.purchase_email_documents
 WHERE invoice_id=i.id FOR KEY SHARE;
 SELECT * INTO j FROM public.document_processing_jobs WHERE invoice_id=i.id FOR KEY SHARE;
 SELECT * INTO e FROM public.document_extractions WHERE id=j.evidence_extraction_id FOR KEY SHARE;
 IF em.id IS NULL OR j.id IS NULL OR e.id IS NULL
 OR em.status<>'imported' OR em.sender_email<>'pedido@sanilec.es'
 OR em.gmail_message_id<>'1a167a3fe260e082'
 OR em.supplier_id<>9 OR em.content_sha256<>i.content_sha256 OR em.storage_path<>i.file_path
 OR NOT EXISTS(SELECT 1 FROM public.purchase_supplier_sender_addresses a
  WHERE a.supplier_id=9 AND a.confirmed_by_owner AND a.sender_email=em.sender_email)
 OR j.status<>'completed' OR j.evidence_extraction_id<>e.id
 OR e.status<>'success' OR e.file_version_hash<>i.content_sha256
 OR e.extractor_version<>'mistral-ocr-4-1-document-observation-v2'
 OR e.raw_json_artifact->>'extractor'<>'mistral'
 OR e.raw_json_artifact->'canonical'->>'document_number_raw'<>'A/64199'
 OR replace(e.raw_json_artifact->'canonical'->>'total_raw',',','.')::numeric<>417.78
 OR jsonb_array_length(e.raw_json_artifact->'canonical'->'lines')<>17
 THEN RETURN jsonb_build_object('ok',false,'reason','Gmail_original_sha_sender_or_ocr_unverified'); END IF;

 FOR r IN
 SELECT * FROM (VALUES
 ('1482d8ac-22d1-49f6-952e-231388d089aa'::uuid,
  'f3784f80-498d-44a2-8228-e952e87aa49e'::uuid,
  'BA1064'::text,5::integer,2.25::numeric,2::integer,'pack'::text),
 ('cd7a68a2-b322-43d8-be22-678a603ae91b'::uuid,
  'ed30fe7a-9475-46fa-8c52-4ad014195f54'::uuid,
  'BV1011',1000,30.54,4,'box'),
 ('0238b4e5-1317-4e0d-b575-ea9086892076'::uuid,
  'd15c03c8-649f-4def-b53f-9c85539c66f6'::uuid,
  'SE2166',3000,54.23,11,'box')
 ) items(line_id,monthly_line_id,sku,pack_size,amount,source_row_index,unit_name)
 ORDER BY source_row_index
 LOOP
  SELECT * INTO l FROM public.purchase_invoice_lines
   WHERE id=r.line_id AND invoice_id=i.id AND superseded_by_extraction_id IS NULL FOR UPDATE;
  SELECT * INTO older FROM public.purchase_invoice_lines
   WHERE id=r.monthly_line_id AND invoice_id=monthly.id
   AND superseded_by_extraction_id IS NULL FOR KEY SHARE;
  SELECT * INTO witness FROM private.purchase_verified_sanilec_packages
   WHERE invoice_line_id=older.id FOR KEY SHARE;
  SELECT * INTO v FROM public.purchase_mapping_versions
   WHERE id=witness.mapping_version_id FOR KEY SHARE;
  SELECT * INTO g FROM public.ingredients
   WHERE id=witness.ingredient_id FOR KEY SHARE;
  IF l.id IS NULL OR older.id IS NULL OR witness.invoice_line_id IS NULL OR
   v.id IS NULL OR g.id IS NULL OR g.archived_at IS NOT NULL
   OR g.base_unit<>'ud' OR g.purchase_unit<>'ud'
   OR l.original_name<>older.original_name OR l.quantity<>older.quantity
   OR l.total_price<>r.amount OR older.total_price<>r.amount
   OR witness.original_line_total<>r.amount
   OR witness.supplier_sku<>r.sku
   OR witness.units_per_package<>r.pack_size
   OR witness.source_sha256<>monthly.content_sha256
   OR witness.ingredient_id<>g.id OR witness.stock_changed
   OR older.status<>'mapped' OR older.mapped_ingredient_id<>g.id
   OR v.status<>'confirmed' OR v.supplier_id<>9 OR v.ingredient_id<>g.id
   OR v.supplier_item_name<>l.original_name OR v.conversion_factor<>r.pack_size
   OR v.line_content_qty<>r.pack_size OR v.line_content_unit<>'ud'
   OR v.line_billing_unit<>r.unit_name
  THEN RETURN jsonb_build_object('ok',false,'reason','verified_monthly_identity_or_pack_conflicted','sku',r.sku); END IF;
  IF EXISTS(SELECT 1 FROM private.purchase_sanilec_a64199_verified_aliases_v1 a
   WHERE a.invoice_line_id=l.id AND a.monthly_line_id=older.id
   AND a.ingredient_id=g.id AND a.source_sha256=i.content_sha256)
   AND l.status='mapped' AND l.mapped_ingredient_id=g.id
  THEN
   already:=already+1;
   CONTINUE;
  END IF;
  IF l.status<>'pending' OR l.line_unit IS NOT NULL
   OR l.mapped_ingredient_id IS DISTINCT FROM g.id AND l.mapped_ingredient_id IS NOT NULL
   OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations rc WHERE rc.purchase_invoice_line_id=l.id)
   OR EXISTS(SELECT 1 FROM public.stock_movements st
     WHERE st.reference_id=l.id AND st.movement_type='PURCHASE')
  THEN RETURN jsonb_build_object('ok',false,'reason','delivery_line_state_or_receipt_conflicted','sku',r.sku); END IF;

  SELECT * INTO p FROM public.purchase_interpretation_proposals WHERE id=l.interpretation_proposal_id FOR KEY SHARE;
  IF p.id IS NULL OR p.purchase_invoice_id<>i.id OR p.document_extraction_id<>e.id
   OR p.source_file_hash<>i.content_sha256 OR p.normalizer_version<>'mistral-pipeline-v3'
   OR p.status<>'needs_mapping' OR p.source_row_index<>r.source_row_index
   OR p.source_item_name<>l.original_name
   OR p.observed->>'supplier_product_code_raw'<>r.sku
   OR p.review_reasons<>ARRAY['producto_sin_mapping']::text[]
   OR p.warnings<>ARRAY['lineas_total_no_reconcilian']::text[]
   OR p.mapping_version_id IS NOT NULL OR p.ingredient_id IS NOT NULL
   OR p.provenance->>'source'<>'mistral_canonical'
  THEN RETURN jsonb_build_object('ok',false,'reason','original_OCR_proposal_not_unique','sku',r.sku); END IF;
  orig:=e.raw_json_artifact->'canonical'->'lines'->p.source_row_index;
  IF orig IS NULL OR orig->>'supplier_product_code_raw'<>r.sku
   OR orig->>'description_raw'<>l.original_name
   OR replace(orig->>'quantity_raw',',','.')::numeric<>l.quantity
   OR replace(orig->>'line_total_raw',',','.')::numeric<>l.total_price
  THEN RETURN jsonb_build_object('ok',false,'reason','original_OCR_line_differs','sku',r.sku); END IF;
  pending_count:=pending_count+1;
  details:=details||jsonb_build_array(jsonb_build_object(
   'sku',r.sku,'ingredient',g.name,'units',r.pack_size,
   'total_net',r.amount,'stock_changed',false));
  IF p_preview THEN CONTINUE; END IF;
  INSERT INTO public.purchase_interpretation_proposals (
   proposal_set_id,purchase_invoice_id,document_extraction_id,supplier_id,
   supplier_profile_id,supplier_profile_version,supplier_profile_hash,
   normalizer_version,source_file_hash,input_fingerprint,
   source_table_index,source_row_index,source_item_name,
   mapping_version_id,ingredient_id,status,observed,interpreted,normalized,
   pricing,proposed_allocations,review_reasons,warnings,
   line_quantity,line_unit,observed_unit_price,line_total,
   physical_quantity,base_unit,purchase_quantity,purchase_unit,
   normalized_unit_price,supersedes_proposal_id,created_by,provenance)
  VALUES(
   p.proposal_set_id,i.id,e.id,9,p.supplier_profile_id,p.supplier_profile_version,
   p.supplier_profile_hash,p.normalizer_version,i.content_sha256,
   encode(sha256(convert_to(p.input_fingerprint||':sanilec-original-a64199:'||v.id::text,'UTF8')),'hex'),
   p.source_table_index,p.source_row_index,l.original_name,
   v.id,g.id,'ready_for_review'::public.purchase_interpretation_proposal_status,
   p.observed,
   p.interpreted||jsonb_build_object('match_source','owner_verified_monthly_source_exact_SKU_and_pack',
    'verified_monthly_line',older.id,'source_vat21_inferred_from_345_27_to_417_78',true),
   p.normalized||jsonb_build_object('physical_quantity',r.pack_size,'base_unit','ud',
    'purchase_quantity',r.pack_size,'purchase_unit','ud',
    'normalized_unit_price',round(r.amount/r.pack_size,8)),
   p.pricing||jsonb_build_object('source_net_line_total',r.amount,
    'source_gross_total',417.78,'vat_inferred_from_gross_minus_net',72.51),
   '[]'::jsonb,'{}'::text[],'{}'::text[],
   l.quantity,r.unit_name,l.unit_price,l.total_price,
   r.pack_size,'ud',r.pack_size,'ud',round(r.amount/r.pack_size,8),
   p.id,p.created_by,p.provenance||jsonb_build_object('revision',jsonb_build_object(
    'kind','sanilec_original_monthly_alias_without_stock_v1',
    'source_original_sha',i.content_sha256,'monthly_invoice_sha',monthly.content_sha256,
    'monthly_invoice_line',older.id,'prior_delivery_stock_not_proven',true,'stock_changed',false))
  ) RETURNING id INTO proposed_id;
  UPDATE public.purchase_invoice_lines
    SET mapped_ingredient_id=g.id,line_unit=r.unit_name,status='mapped',
    interpretation_proposal_id=proposed_id
    WHERE id=l.id AND status='pending' AND interpretation_proposal_id=p.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent original Sanilec delivery modification'; END IF;
  INSERT INTO private.purchase_sanilec_a64199_verified_aliases_v1 (
   invoice_line_id,monthly_line_id,invoice_id,ingredient_id,verified_mapping_version_id,
   original_proposal_id,resulting_proposal_id,source_sha256,source_sku,
   units_per_package,net_amount,source_total_gross,source_total_net,inferred_source_vat)
  VALUES(l.id,older.id,i.id,g.id,v.id,p.id,proposed_id,i.content_sha256,
   r.sku,r.pack_size,r.amount,417.78,345.27,72.51);
  applied:=applied+1;
 END LOOP;
 IF NOT p_preview THEN PERFORM public.sync_purchase_invoice_status(i.id); END IF;
 RETURN jsonb_build_object('ok',true,'eligible',true,'preview',p_preview,
  'candidate_count',pending_count,'already_verified',already,'applied',applied,
  'stock_changed',false,'old_scan_untouched',true,'supplier_original_total_unchanged',true,
  'remaining_stock_reconciliation_needed',true,'details',details);
END;
$fn$;
REVOKE ALL ON FUNCTION public.prepare_sanilec_a64199_original_verified_aliases_v1(uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_sanilec_a64199_original_verified_aliases_v1(uuid,boolean)
 TO service_role;