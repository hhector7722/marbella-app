-- 2026-11-05. Business owner confirmed:
-- Ametller SKU 16190: 1 manojo = 100 g (0.1 kg).
-- SERHS SKU 53872/53873: 1 billed package = 100 individual gloves;
-- G/large 3 packages = 300 units, M/medium 1 package = 100 units.
-- Source-bound, appendix-only K5 proposals and confirmed mapping versions.
-- No stock or prior historical receipt is modified, inferred, or posted.

CREATE TABLE IF NOT EXISTS private.purchase_owner_verified_packaging (
 invoice_line_id uuid PRIMARY KEY REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
 ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 supplier_sku text NOT NULL,
 owner_confirmed_content numeric NOT NULL CHECK(owner_confirmed_content=100),
 owner_confirmed_unit text NOT NULL CHECK(owner_confirmed_unit IN ('g','ud')),
 source_line_quantity numeric NOT NULL CHECK(source_line_quantity>0),
 verified_purchase_quantity numeric NOT NULL CHECK(verified_purchase_quantity>0),
 verified_physical_quantity numeric NOT NULL CHECK(verified_physical_quantity>0),
 verified_base_unit text NOT NULL CHECK(verified_base_unit IN ('g','ud')),
 verified_line_net numeric(16,2) NOT NULL CHECK(verified_line_net>0),
 verified_normalized_unit_price numeric(18,8) NOT NULL CHECK(verified_normalized_unit_price>0),
 corrected_mapping_version_id uuid NOT NULL REFERENCES public.purchase_mapping_versions(id) ON DELETE RESTRICT,
 corrected_interpretation_proposal_id uuid NOT NULL REFERENCES public.purchase_interpretation_proposals(id) ON DELETE RESTRICT,
 owner_instruction text NOT NULL DEFAULT '2026-11-05: manojo 100 gramos; paquete guantes 100 unidades',
 previous_stock_is_untouched boolean NOT NULL DEFAULT true CHECK(previous_stock_is_untouched),
 no_new_stock boolean NOT NULL DEFAULT true CHECK(no_new_stock),
 rule_version text NOT NULL DEFAULT 'owner_100g_manojo_100_gloves_each_pack_v1',
 applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.purchase_owner_verified_packaging ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_owner_verified_packaging FROM PUBLIC,anon,authenticated;
GRANT SELECT ON private.purchase_owner_verified_packaging TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_owner_verified_manojo_and_gloves_v1(
 p_invoice_id uuid,p_preview boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 v_i public.purchase_invoices%ROWTYPE;
 v_l public.purchase_invoice_lines%ROWTYPE;
 v_p public.purchase_interpretation_proposals%ROWTYPE;
 v_e public.document_extractions%ROWTYPE;
 v_mail public.purchase_email_documents%ROWTYPE;
 v_job public.document_processing_jobs%ROWTYPE;
 v_g public.ingredients%ROWTYPE;
 v_m public.purchase_mapping_versions%ROWTYPE;
 v_row jsonb;
 v_t record;
 v_units integer;
 v_factor numeric;
 v_physical numeric;
 v_purchase numeric;
 v_price numeric;
 v_billing text;
 v_content_unit text;
 v_profile_id text;
 v_profile_version text;
 v_profile_hash text;
 v_new_proposal uuid;
 v_sku text;
 v_expected_count integer;
 v_done integer:=0;
 v_total numeric;
 v_count integer;
 v_results jsonb:='[]'::jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_invoice_id IS NULL
 THEN RETURN jsonb_build_object('ok',false,'reason','service_role_only'); END IF;
 IF p_invoice_id NOT IN (
  '96923f2c-b493-4384-84c3-5108b1e3a98f'::uuid,
  '8045fa1f-4612-46b4-848c-f90471e8eda3'::uuid)
 THEN RETURN jsonb_build_object('ok',false,'reason','invoice_outside_owner_evidence_scope'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('owner-packaging-20261105:'||p_invoice_id::text,0));
 SELECT * INTO v_i FROM public.purchase_invoices WHERE id=p_invoice_id FOR UPDATE;
 IF v_i.id IS NULL OR v_i.source<>'email' OR v_i.status<>'pending_mapping'
  OR v_i.duplicate_of_invoice_id IS NOT NULL
  OR v_i.content_sha256 !~ '^[a-f0-9]{64}$'
  OR v_i.base_amount<=0 OR v_i.tax_amount<=0 OR v_i.total_amount<=0
  OR round(v_i.base_amount+v_i.tax_amount,2)<>v_i.total_amount
 THEN RETURN jsonb_build_object('ok',false,'reason','original_email_header_not_valid'); END IF;
 IF (v_i.id='96923f2c-b493-4384-84c3-5108b1e3a98f'
    AND (v_i.supplier_id<>1 OR v_i.invoice_number<>'0100009253'
     OR v_i.content_sha256<>'59716ef66171492f1f3e01aa95ad3059711b6a657c0a4ae3bdab05ca34f12465'))
  OR (v_i.id='8045fa1f-4612-46b4-848c-f90471e8eda3'
    AND (v_i.supplier_id<>8 OR v_i.invoice_number<>'FV826/091654'
     OR v_i.content_sha256<>'2094253d65dea4d762f49e1ba7090dead591ffe89c746389d6cd6fd3b81382f1'))
 THEN RETURN jsonb_build_object('ok',false,'reason','source_sha_supplier_or_invoice_number_changed'); END IF;
 SELECT coalesce(sum(l.total_price),0),count(*) INTO v_total,v_count
 FROM public.purchase_invoice_lines l WHERE l.invoice_id=v_i.id
  AND l.superseded_by_extraction_id IS NULL;
 IF v_count<>(CASE WHEN v_i.supplier_id=1 THEN 75 ELSE 4 END)
  OR abs(v_total-v_i.base_amount)>0.01
 THEN RETURN jsonb_build_object('ok',false,'reason','invoice_lines_no_longer_match_original_net'); END IF;
 SELECT * INTO v_mail FROM public.purchase_email_documents
  WHERE invoice_id=v_i.id FOR KEY SHARE;
 SELECT * INTO v_job FROM public.document_processing_jobs
  WHERE invoice_id=v_i.id FOR KEY SHARE;
 IF v_mail.id IS NULL OR v_job.id IS NULL OR v_mail.status<>'imported'
  OR v_mail.content_sha256<>v_i.content_sha256
  OR v_mail.supplier_id<>v_i.supplier_id OR v_mail.storage_path<>v_i.file_path
  OR v_job.status<>'completed' OR v_job.file_version_hash<>v_i.content_sha256
  OR NOT EXISTS(SELECT 1 FROM public.purchase_supplier_sender_addresses a
   WHERE a.supplier_id=v_i.supplier_id AND a.confirmed_by_owner
   AND lower(a.sender_email)=lower(v_mail.sender_email))
 THEN RETURN jsonb_build_object('ok',false,'reason','source_mail_not_confirmed'); END IF;
 SELECT * INTO v_e FROM public.document_extractions
 WHERE invoice_id=v_i.id AND id=v_job.evidence_extraction_id FOR KEY SHARE;
 IF v_e.id IS NULL OR v_e.status<>'success'
  OR v_e.file_version_hash<>v_i.content_sha256
  OR (v_i.supplier_id=1 AND v_e.extractor_version<>'ametller-pdf-text-v1')
  OR (v_i.supplier_id=8 AND (
   v_e.extractor_version<>'mistral-ocr-4-1-document-observation-v2'
   OR v_e.raw_json_artifact->>'extractor'<>'mistral'))
 THEN RETURN jsonb_build_object('ok',false,'reason','original_extraction_not_verified'); END IF;

 FOR v_t IN
  SELECT * FROM (VALUES
   ('572a5574-0f01-4af8-a739-3e46c21fae14'::uuid,
    '16190'::text,'Albahaca Manojo'::text,
    'f0e64833-be80-448f-a92a-b2312b781888'::uuid,'Albahaca'::text,
    1::numeric,1.85::numeric,1.85::numeric,'MAN'::text,100::numeric,'g'::text,100::numeric,'g'::text,0.1::numeric,'kg'::text,18.5::numeric),
   ('139aaf39-0d00-43ed-b2ec-193c92093d59'::uuid,
    '53872','G.NITRIL S/P NG"G"3,5g P100C10',
    '314ccee6-b80f-4643-91f2-46fa0d0c0786'::uuid,'Guantes negros L',
    3::numeric,4.98::numeric,14.95::numeric,'Unidades',100::numeric,'ud',300::numeric,'ud',300::numeric,'ud',round(14.95::numeric/300,8)),
   ('cb987fdb-2486-4e0f-940f-6be00b38b3ad'::uuid,
    '53873','G.NITRIL S/P NG"M"3,5g P100C10',
    'a593e221-21c8-4820-b22c-a3aca7253629'::uuid,'Guantes negros M',
    1::numeric,4.98::numeric,4.98::numeric,'Unidades',100::numeric,'ud',100::numeric,'ud',100::numeric,'ud',0.0498::numeric)
  ) AS x(line_id,sku,source_name,ingredient_id,ingredient_name,
    expected_quantity,unit_price,line_total,billing_unit,content_qty,content_unit,
    physical_quantity,base_unit,purchase_quantity,purchase_unit,normalized_price)
  WHERE (v_i.supplier_id=1 AND x.sku='16190')
     OR (v_i.supplier_id=8 AND x.sku IN ('53872','53873'))
  ORDER BY x.sku
 LOOP
  SELECT * INTO v_l FROM public.purchase_invoice_lines
   WHERE id=v_t.line_id AND invoice_id=v_i.id
     AND superseded_by_extraction_id IS NULL FOR UPDATE;
  SELECT * INTO v_g FROM public.ingredients WHERE id=v_t.ingredient_id FOR KEY SHARE;
  IF v_l.id IS NULL OR v_g.id IS NULL
   OR v_l.original_name<>v_t.source_name
   OR v_l.quantity<>v_t.expected_quantity
   OR v_l.unit_price<>v_t.unit_price
   OR v_l.total_price<>v_t.line_total
   OR v_l.mapped_ingredient_id<>v_g.id
   OR v_g.name<>v_t.ingredient_name OR v_g.archived_at IS NOT NULL
   OR v_g.base_unit<>v_t.base_unit OR v_g.purchase_unit<>v_t.purchase_unit
   OR (v_l.line_unit IS NOT NULL AND lower(trim(v_l.line_unit))
      NOT IN ('man','un','unidades'))
  THEN RETURN jsonb_build_object('ok',false,'reason','source_line_or_active_ingredient_drift','sku',v_t.sku); END IF;
  IF v_l.status='mapped' AND EXISTS(SELECT 1 FROM private.purchase_owner_verified_packaging z
     WHERE z.invoice_line_id=v_l.id AND z.verified_physical_quantity=v_t.physical_quantity)
  THEN
    v_results:=v_results||jsonb_build_array(jsonb_build_object('sku',v_t.sku,'idempotent',true));
    CONTINUE;
  END IF;
  IF v_l.status<>'pending'
   OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r
       WHERE r.purchase_invoice_line_id=v_l.id)
   OR EXISTS(SELECT 1 FROM public.stock_movements sm
       WHERE sm.reference_id=v_l.id AND sm.movement_type='PURCHASE')
  THEN RETURN jsonb_build_object('ok',false,'reason','receipt_already_modified_or_line_approved','sku',v_t.sku); END IF;
  SELECT * INTO v_p FROM public.purchase_interpretation_proposals
   WHERE id=v_l.interpretation_proposal_id FOR KEY SHARE;
  v_row:=v_e.raw_json_artifact->'canonical'->'lines'->v_p.source_row_index;
  IF v_p.id IS NULL OR v_p.purchase_invoice_id<>v_i.id OR v_p.supplier_id<>v_i.supplier_id
   OR v_p.document_extraction_id<>v_e.id OR v_p.source_file_hash<>v_i.content_sha256
   OR v_p.source_item_name<>v_l.original_name OR v_p.mapping_version_id IS NOT NULL
     AND v_i.supplier_id=1
   OR v_p.provenance ? 'revision'
   OR v_p.normalizer_version<>(CASE WHEN v_i.supplier_id=1 THEN 'ametller-pdf-text-v1' ELSE 'mistral-pipeline-v3' END)
   OR v_p.source_row_index IS NULL OR v_p.source_row_index<0
   OR v_p.source_row_index>=jsonb_array_length(v_e.raw_json_artifact->'canonical'->'lines')
   OR v_p.source_table_index IS DISTINCT FROM (v_row->>'page_index')::integer
   OR v_p.observed->>'supplier_product_code_raw'<>v_t.sku
   OR v_p.observed->>'description_raw'<>v_t.source_name
   OR v_row->>'supplier_product_code_raw'<>v_t.sku
   OR v_row->>'description_raw'<>v_t.source_name
   OR replace(v_row->>'quantity_raw',',','.')::numeric<>v_l.quantity
   OR replace(v_row->>'unit_price_raw',',','.')::numeric<>v_l.unit_price
   OR replace(v_row->>'line_total_raw',',','.')::numeric<>v_l.total_price
   OR v_p.line_quantity<>v_l.quantity OR v_p.line_total<>v_l.total_price
   OR abs(v_l.unit_price*v_l.quantity-v_l.total_price)>(v_l.quantity*0.005+0.0051)
   OR v_p.status NOT IN ('needs_mapping','needs_review')
   OR (v_i.supplier_id=1 AND (
     v_p.provenance->>'source'<>'pdf_text_verified'
     OR v_p.provenance->>'original_source_sha'<>v_i.content_sha256
     OR NOT EXISTS(SELECT 1 FROM private.purchase_verified_ingredient_unit_holds h
       WHERE h.invoice_line_id=v_l.id AND h.ingredient_id=v_g.id
         AND h.invoice_billing_unit='MAN' AND h.historical_billing_unit='kg')))
   OR (v_i.supplier_id=8 AND (
     v_p.provenance->>'source'<>'mistral_canonical'
     OR v_p.provenance->>'trigger'<>'mistral_job_completion'
     OR v_p.provenance->>'schema_version'<>'mistral-pipeline-v3'
     OR v_p.observed->>'billing_unit_raw'<>'Unidades'
     OR v_p.observed->>'discount_header_raw'<>'Dte.'))
  THEN RETURN jsonb_build_object('ok',false,'reason','OCR_source_or_prior_review_not_verified','sku',v_t.sku); END IF;
  -- Owner instruction fixes packaging, not historical stock or discounts.
  IF v_i.supplier_id=1 AND v_t.physical_quantity<>100 OR
     v_i.supplier_id=8 AND v_t.physical_quantity<>v_l.quantity*100
  THEN RETURN jsonb_build_object('ok',false,'reason','packaging_math_mismatch'); END IF;
  v_done:=v_done+1;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('sku',v_t.sku,
   'line_id',v_l.id,'ingredient',v_g.name,
   'supplier_units',v_l.quantity,'units_per_package',v_t.content_qty,
   'physical_quantity',v_t.physical_quantity,'base_unit',v_t.base_unit,
   'unit_price_from_original_net',v_t.normalized_price));
  IF p_preview THEN CONTINUE; END IF;
  INSERT INTO public.purchase_mapping_versions(
   supplier_id,supplier_item_name,ingredient_id,conversion_factor,
   line_billing_unit,line_content_qty,line_content_unit,status,
   source_document_extraction_id,idempotency_key,proposed_by,confirmed_by,confirmed_at,note)
  VALUES(v_i.supplier_id,v_l.original_name,v_g.id,
   CASE WHEN v_i.supplier_id=1 THEN 0.1 ELSE 100 END,
   v_t.billing_unit,v_t.content_qty,v_t.content_unit,
   'confirmed'::public.purchase_mapping_version_status,v_e.id,
   'owner-pack-20261105:'||v_l.id::text,v_p.created_by,v_p.created_by,now(),
   'Owner provided in chat 2026-11-05: 1 manojo = 100g; 1 guante pack = 100 units. New forward-looking mapping; do not silently edit prior receipts.')
  RETURNING * INTO v_m;

  v_profile_id:=coalesce(v_p.supplier_profile_id,'owner-verified-unit-measurements');
  v_profile_version:=coalesce(v_p.supplier_profile_version,'2026-11-05-v1');
  v_profile_hash:=coalesce(v_p.supplier_profile_hash,encode(
    sha256(convert_to('owner-20261105:'||v_t.sku||':'||v_t.content_qty||v_t.content_unit,'UTF8')),'hex'));
  INSERT INTO public.purchase_interpretation_proposals(
   proposal_set_id,purchase_invoice_id,document_extraction_id,supplier_id,
   supplier_profile_id,supplier_profile_version,supplier_profile_hash,
   normalizer_version,source_file_hash,input_fingerprint,
   source_table_index,source_row_index,source_item_name,
   mapping_version_id,ingredient_id,status,
   observed,interpreted,normalized,pricing,proposed_allocations,
   review_reasons,warnings,line_quantity,line_unit,observed_unit_price,line_total,
   physical_quantity,base_unit,purchase_quantity,purchase_unit,normalized_unit_price,
   supersedes_proposal_id,created_by,provenance
  ) VALUES(
   v_p.proposal_set_id,v_i.id,v_e.id,v_i.supplier_id,
   v_profile_id,v_profile_version,v_profile_hash,
   v_p.normalizer_version,v_i.content_sha256,encode(sha256(convert_to(
    v_p.input_fingerprint||':owner-verified-20261105:'||v_m.id::text,'UTF8')),'hex'),
   v_p.source_table_index,v_p.source_row_index,v_l.original_name,
   v_m.id,v_g.id,'ready_for_review'::public.purchase_interpretation_proposal_status,
   v_p.observed,
   v_p.interpreted||jsonb_build_object('match_source','owner_confirmed_package_size',
     'candidate_ingredient_id',v_g.id::text,'previous_review_reasons',to_jsonb(v_p.review_reasons),
     'net_discount_already_in_printed_unit_price',true),
   v_p.normalized||jsonb_build_object('physical_quantity',v_t.physical_quantity,
    'base_unit',v_t.base_unit,'purchase_quantity',v_t.purchase_quantity,
    'purchase_unit',v_t.purchase_unit,'normalized_unit_price',v_t.normalized_price),
   v_p.pricing||jsonb_build_object('verified_net_price_from_original',true,
    'discount_subtracted_again',false,'display_unit_price',v_l.unit_price,
    'source_net_line_total',v_l.total_price),
   '[]'::jsonb,
   '{}'::text[],'{}'::text[],v_l.quantity,v_t.billing_unit,v_l.unit_price,v_l.total_price,
   v_t.physical_quantity,v_t.base_unit,v_t.purchase_quantity,v_t.purchase_unit,
   v_t.normalized_price,v_p.id,v_p.created_by,
   v_p.provenance||jsonb_build_object('revision',jsonb_build_object(
    'kind','owner_verified_physical_package_size_20261105_v1',
    'parent_id',v_p.id,'source_hash',v_i.content_sha256,
    'owner_instruction','1 manojo de albahaca = 100 gramos; 1 paquete de guantes = 100 unidades',
    'stock_changed',false,'prior_receipts_unchanged',true))
  ) RETURNING id INTO v_new_proposal;
  INSERT INTO private.purchase_owner_verified_packaging(
   invoice_line_id,invoice_id,ingredient_id,source_sha256,supplier_sku,
   owner_confirmed_content,owner_confirmed_unit,source_line_quantity,
   verified_purchase_quantity,verified_physical_quantity,verified_base_unit,
   verified_line_net,verified_normalized_unit_price,
   corrected_mapping_version_id,corrected_interpretation_proposal_id)
  VALUES(v_l.id,v_i.id,v_g.id,v_i.content_sha256,v_t.sku,100,v_t.content_unit,
    v_l.quantity,v_t.purchase_quantity,v_t.physical_quantity,v_t.base_unit,
    v_l.total_price,v_t.normalized_price,v_m.id,v_new_proposal);
  UPDATE public.purchase_invoice_lines SET status='mapped',
   line_unit=v_t.billing_unit,
   interpretation_proposal_id=v_new_proposal
  WHERE id=v_l.id AND status='pending' AND mapped_ingredient_id=v_g.id
   AND interpretation_proposal_id=v_p.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent purchase line change; rollback'; END IF;
 END LOOP;
 IF v_done=0 THEN RETURN jsonb_build_object('ok',true,'idempotent',true,
   'stock_changed',false,'source_verified',true,'items',v_results); END IF;
 IF NOT p_preview THEN PERFORM public.sync_purchase_invoice_status(v_i.id); END IF;
 RETURN jsonb_build_object('ok',true,'eligible',true,'applied',NOT p_preview,
  'lines_prepared',v_done,'items',v_results,
  'source_verified',true,'stock_changed',false,
  'old_stock_untouched',true,'original_invoice_amounts_unchanged',true,
  'receipt_proof_separate',true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.prepare_owner_verified_manojo_and_gloves_v1(uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_owner_verified_manojo_and_gloves_v1(uuid,boolean)
 TO service_role;
