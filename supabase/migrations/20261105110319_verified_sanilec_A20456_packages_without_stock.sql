-- Sanilec A/20456: source-verified PACKAGING ONLY.
-- Every supplier item has an identified ingredient and a literal pack size
-- in the supplier's original invoice, independently SHA-checked by OpenDots.
-- The owner specifically confirmed TW1097 and TW1073 in 2026-11-01.
-- No receipt confirmation or stock movement, no price history or expense edits.

CREATE TABLE IF NOT EXISTS private.purchase_verified_sanilec_packages (
 invoice_line_id uuid PRIMARY KEY REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
 ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
 supplier_sku text NOT NULL,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 original_proposal_id uuid NOT NULL REFERENCES public.purchase_interpretation_proposals(id) ON DELETE RESTRICT,
 mapping_version_id uuid NOT NULL REFERENCES public.purchase_mapping_versions(id) ON DELETE RESTRICT,
 new_proposal_id uuid NOT NULL UNIQUE REFERENCES public.purchase_interpretation_proposals(id) ON DELETE RESTRICT,
 supplier_quantity numeric NOT NULL CHECK(supplier_quantity>0),
 units_per_package integer NOT NULL CHECK(units_per_package IN (5,50,1000,3000)),
 calculated_units numeric NOT NULL CHECK(calculated_units>0),
 original_line_total numeric(16,2) NOT NULL CHECK(original_line_total>0),
 stock_changed boolean NOT NULL DEFAULT false CHECK (stock_changed=false),
 review_status_only boolean NOT NULL DEFAULT true CHECK (review_status_only),
 original_delivery_unresolved boolean NOT NULL DEFAULT true CHECK (original_delivery_unresolved),
 provenance text NOT NULL DEFAULT 'owner_latest_confirmed_alias_or_exact_supplier_packaging_v1',
 recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.purchase_verified_sanilec_packages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_verified_sanilec_packages FROM PUBLIC,anon,authenticated;
GRANT SELECT ON private.purchase_verified_sanilec_packages TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_verified_sanilec_packages_A20456_v1(
 p_invoice_id uuid,p_preview boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 i public.purchase_invoices%ROWTYPE;
 e public.document_extractions%ROWTYPE;
 mail public.purchase_email_documents%ROWTYPE;
 job public.document_processing_jobs%ROWTYPE;
 p public.purchase_interpretation_proposals%ROWTYPE;
 l public.purchase_invoice_lines%ROWTYPE;
 g public.ingredients%ROWTYPE;
 map public.purchase_mapping_versions%ROWTYPE;
 row_data jsonb;
 rec record;
 new_proposal uuid;
 mapping_key text;
 invoice_lines_count integer;
 sum_net numeric;
 updated_count integer:=0;
 total_candidates integer:=0;
 mappings_created integer:=0;
 out jsonb:='[]'::jsonb;
 package integer;
 billing_unit text;
 expected_review text;
 canonical_name text;
 owner_version uuid;
 amount_per_item numeric;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_invoice_id IS DISTINCT FROM
  'e65af1cb-dec6-4da6-bd6b-e0b2ae4cc860'::uuid
 THEN RETURN jsonb_build_object('ok',false,'reason','invoice_scope_not_verified'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sanilec-verified-packaging-A20456:'||p_invoice_id::text,0));
 SELECT * INTO i FROM public.purchase_invoices WHERE id=p_invoice_id FOR UPDATE;
 IF i.id IS NULL OR i.source<>'email' OR i.supplier_id<>9
  OR i.invoice_number<>'A/20456' OR i.status<>'pending_mapping'
  OR i.document_kind<>'monthly_invoice'
  OR i.duplicate_of_invoice_id IS NOT NULL
  OR i.content_sha256<>'4357ee7da8d4a8e2498c1d6a4495b869a526bac5e5cdefe2d7fcf64373733a3b'
  OR i.base_amount<>673.80 OR i.tax_amount<>141.50 OR i.total_amount<>815.30
 THEN RETURN jsonb_build_object('ok',false,'reason','invoice_economic_or_source_sha_changed'); END IF;
 SELECT count(*),sum(total_price) INTO invoice_lines_count,sum_net
 FROM public.purchase_invoice_lines
 WHERE invoice_id=i.id AND superseded_by_extraction_id IS NULL;
 IF invoice_lines_count<>40 OR sum_net<>673.80
 THEN RETURN jsonb_build_object('ok',false,'reason','original_invoice_economic_rows_changed'); END IF;
 SELECT * INTO mail FROM public.purchase_email_documents WHERE invoice_id=i.id FOR KEY SHARE;
 SELECT * INTO job FROM public.document_processing_jobs WHERE invoice_id=i.id FOR KEY SHARE;
 SELECT * INTO e FROM public.document_extractions WHERE id=job.evidence_extraction_id FOR KEY SHARE;
 IF mail.id IS NULL OR job.id IS NULL OR e.id IS NULL
  OR mail.supplier_id<>9 OR mail.status<>'imported'
  OR lower(mail.sender_email)<>'administracion-ind@sanilec.es'
  OR NOT EXISTS(SELECT 1 FROM public.purchase_supplier_sender_addresses confirmed
   WHERE confirmed.supplier_id=9 AND confirmed.confirmed_by_owner
   AND lower(confirmed.sender_email)=lower(mail.sender_email))
  OR mail.content_sha256<>i.content_sha256 OR mail.storage_path<>i.file_path
  OR job.status<>'completed' OR job.file_version_hash<>i.content_sha256
  OR e.id<>job.evidence_extraction_id OR e.invoice_id<>i.id
  OR e.status<>'success' OR e.file_version_hash<>i.content_sha256
  OR e.extractor_version<>'mistral-ocr-4-1-document-observation-v2'
  OR e.raw_json_artifact->>'extractor'<>'mistral'
  OR jsonb_array_length(e.raw_json_artifact->'canonical'->'lines')<>40
 THEN RETURN jsonb_build_object('ok',false,'reason','mail_original_pdf_or_ocr_not_verified'); END IF;

 FOR rec IN
 SELECT * FROM (VALUES
  ('c101373e-dac6-470f-aa5d-4e9607f6fe04'::uuid,'TW1097'::text,
   '740a6194-2343-4c31-b876-7a327f7c6058'::uuid,'Bolsas bocadillos'::text,
   1000::integer,'pack'::text,'varios_ingredientes_posibles'::text,
   '52c8cb59-3457-423b-8911-f9fafc000c4b'::uuid),
  ('ea9fd7c1-7da4-4035-8777-0ff919300786'::uuid,'TW1097',
   '740a6194-2343-4c31-b876-7a327f7c6058'::uuid,'Bolsas bocadillos',
   1000,'pack','varios_ingredientes_posibles','52c8cb59-3457-423b-8911-f9fafc000c4b'::uuid),
  ('81571aaf-6ccb-4677-b206-933e05127a93'::uuid,'TW1073',
   '994d9639-7a40-49d3-9405-4236130f06b9'::uuid,'Bandejas bocadillos',
   50,'pack','varios_ingredientes_posibles','ffc2c93a-d131-4050-a6f8-0530f83be071'::uuid),
  ('f3784f80-498d-44a2-8228-e952e87aa49e'::uuid,'BA1064',
   '6b3d52b6-5240-44cd-b872-92041c72efcd'::uuid,'Bayetas microfibra',
   5,'pack','producto_sin_mapping',NULL::uuid),
  ('d15c03c8-649f-4def-b53f-9c85539c66f6'::uuid,'SE2166',
   'c0b6c9d8-6fdf-417b-9bc3-1d05677caea8'::uuid,'Servilletas 30x40',
   3000,'box','producto_sin_mapping',NULL::uuid),
  ('ed30fe7a-9475-46fa-8c52-4ad014195f54'::uuid,'BV1011',
   'c475a658-ebe2-4345-b5c7-8a7a52278f85'::uuid,'Bolsa vacio S',
   1000,'box','producto_sin_mapping',NULL::uuid)
 ) v(line_id,sku,ingredient_id,ingredient_name,pack_size,billing,review,prior_confirmed)
 ORDER BY v.sku,v.line_id
 LOOP
  SELECT * INTO l FROM public.purchase_invoice_lines
   WHERE id=rec.line_id AND invoice_id=i.id
   AND superseded_by_extraction_id IS NULL FOR UPDATE;
  SELECT * INTO g FROM public.ingredients WHERE id=rec.ingredient_id FOR KEY SHARE;
  IF l.id IS NULL OR g.id IS NULL OR l.mapped_ingredient_id<>g.id
   OR g.name<>rec.ingredient_name OR g.base_unit<>'ud' OR g.purchase_unit<>'ud'
   OR g.archived_at IS NOT NULL
   OR l.quantity<>1 OR l.total_price<=0
  THEN RETURN jsonb_build_object('ok',false,'reason','ingredient_identity_or_billing_changed','sku',rec.sku); END IF;
  IF l.status='mapped' AND EXISTS(
   SELECT 1 FROM private.purchase_verified_sanilec_packages v
   WHERE v.invoice_line_id=l.id AND v.ingredient_id=g.id
    AND v.units_per_package=rec.pack_size AND v.stock_changed=false)
  THEN
   out:=out||jsonb_build_array(jsonb_build_object('sku',rec.sku,'line',l.id,'idempotent',true));
   CONTINUE;
  END IF;
  IF l.status<>'pending' OR l.line_unit IS NOT NULL
   OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r
     WHERE r.purchase_invoice_line_id=l.id)
   OR EXISTS(SELECT 1 FROM public.stock_movements sm
     WHERE sm.reference_id=l.id AND sm.movement_type='PURCHASE')
  THEN RETURN jsonb_build_object('ok',false,'reason','receipt_or_invoice_line_already_changed','sku',rec.sku); END IF;
  SELECT * INTO p FROM public.purchase_interpretation_proposals
   WHERE id=l.interpretation_proposal_id FOR KEY SHARE;
  IF p.id IS NULL OR p.purchase_invoice_id<>i.id
    OR p.document_extraction_id<>e.id OR p.supplier_id<>9
    OR p.source_file_hash<>i.content_sha256
    OR p.normalizer_version<>'mistral-pipeline-v3'
    OR p.provenance->>'source'<>'mistral_canonical'
    OR p.provenance->>'trigger'<>'mistral_job_completion'
    OR p.provenance->>'schema_version'<>'mistral-pipeline-v3'
    OR p.provenance ? 'revision'
    OR p.status<>'needs_mapping' OR p.mapping_version_id IS NOT NULL
    OR p.ingredient_id IS NOT NULL
    OR p.review_reasons<>ARRAY[rec.review]::text[]
    OR cardinality(p.warnings)<>0
    OR p.source_row_index IS NULL OR p.source_row_index<0
    OR p.source_row_index>=40
    OR p.source_item_name<>l.original_name
    OR p.observed->>'supplier_product_code_raw'<>rec.sku
    OR p.observed->>'description_raw'<>l.original_name
    OR p.source_table_index IS NULL
  THEN RETURN jsonb_build_object('ok',false,'reason','canonical_proposal_source_mismatch','sku',rec.sku); END IF;
  row_data:=e.raw_json_artifact->'canonical'->'lines'->p.source_row_index;
  IF row_data IS NULL OR row_data->>'supplier_product_code_raw'<>rec.sku
   OR row_data->>'description_raw'<>l.original_name
   OR p.source_table_index IS DISTINCT FROM (row_data->>'page_index')::integer
   OR replace(row_data->>'quantity_raw',',','.')::numeric<>l.quantity
   OR replace(row_data->>'unit_price_raw',',','.')::numeric<>l.unit_price
   OR replace(row_data->>'line_total_raw',',','.')::numeric<>l.total_price
   OR abs(l.quantity*l.unit_price-l.total_price)>(l.quantity*0.005+0.0051)
  THEN RETURN jsonb_build_object('ok',false,'reason','canonical_original_economics_or_sku_mismatch','sku',rec.sku); END IF;
  IF rec.sku='TW1097' AND
    (l.original_name NOT LIKE '%9+5X23%' OR l.original_name NOT LIKE '%Pak.1000 Uds.%')
  THEN RETURN jsonb_build_object('ok',false,'reason','paper_bag_size_not_exact'); END IF;
  IF rec.sku='TW1073' AND
    (l.original_name NOT LIKE '%700 Ml%' OR l.original_name NOT LIKE '%Pack 50 uds%')
  THEN RETURN jsonb_build_object('ok',false,'reason','bionic_pack_size_not_exact'); END IF;
  IF rec.sku='BA1064' AND l.original_name NOT LIKE '%(Pak 5)%'
  THEN RETURN jsonb_build_object('ok',false,'reason','microfiber_pack_five_not_exact'); END IF;
  IF rec.sku='SE2166' AND l.original_name NOT LIKE '%(Cj.3000 Uds)%'
  THEN RETURN jsonb_build_object('ok',false,'reason','napkin_box_3000_not_exact'); END IF;
  IF rec.sku='BV1011' AND (
    l.original_name NOT LIKE '%150x200 (Cj.1000)%'
    OR NOT EXISTS(SELECT 1 FROM private.purchase_verified_supplier_dimension_identity v
       WHERE v.invoice_line_id=l.id AND v.ingredient_id=g.id
       AND v.units_per_case=1000 AND v.source_sha256=i.content_sha256
       AND v.stock_changed=false AND v.physical_receipt_unconfirmed=true))
  THEN RETURN jsonb_build_object('ok',false,'reason','vacuum_bag_owner_size_not_verified'); END IF;
  IF rec.prior_confirmed IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.purchase_mapping_versions m
   WHERE m.id=rec.prior_confirmed AND m.supplier_id=9
    AND m.status='confirmed' AND m.confirmed_by IS NOT NULL
    AND m.ingredient_id=g.id AND m.conversion_factor=rec.pack_size
    AND m.line_content_qty=rec.pack_size
    AND m.line_content_unit='ud' AND m.line_billing_unit=rec.billing
    AND m.note ILIKE '%Captura propietario%')
  THEN RETURN jsonb_build_object('ok',false,'reason','owner_confirmed_package_mismatch','sku',rec.sku); END IF;
  total_candidates:=total_candidates+1;
  out:=out||jsonb_build_array(jsonb_build_object('sku',rec.sku,'line',l.id,
   'ingredient',g.name,'units_per_pack',rec.pack_size,'gross_line_net',l.total_price,
   'stock_changed',false,'review_only',true));
  IF p_preview THEN CONTINUE; END IF;
  mapping_key:='sanilec-owner-verified-pack-v1:'||i.id::text||':'||rec.sku;
  SELECT * INTO map FROM public.purchase_mapping_versions
   WHERE supplier_id=9 AND idempotency_key=mapping_key FOR KEY SHARE;
  IF map.id IS NULL THEN
   INSERT INTO public.purchase_mapping_versions (
     supplier_id,supplier_item_name,ingredient_id,conversion_factor,
     line_billing_unit,line_content_qty,line_content_unit,status,
     source_document_extraction_id,idempotency_key,proposed_by,confirmed_by,confirmed_at,note)
   VALUES(9,l.original_name,g.id,rec.pack_size,
     rec.billing,rec.pack_size,'ud','confirmed'::public.purchase_mapping_version_status,
     e.id,mapping_key,p.created_by,p.created_by,now(),
     'Package name, SKU and owner-confirmed alias verified against SHA of original Sanilec A/20456 PDF. No original delivery or inventory booked.')
   RETURNING * INTO map;
   mappings_created:=mappings_created+1;
  END IF;
  IF map.ingredient_id<>g.id OR map.conversion_factor<>rec.pack_size
    OR map.line_billing_unit<>rec.billing OR map.supplier_item_name<>l.original_name
  THEN RAISE EXCEPTION 'Existing confirmed mapping changed; rollback'; END IF;
  amount_per_item:=round(l.total_price/rec.pack_size,8);
  INSERT INTO public.purchase_interpretation_proposals(
    proposal_set_id,purchase_invoice_id,document_extraction_id,supplier_id,
    supplier_profile_id,supplier_profile_version,supplier_profile_hash,
    normalizer_version,source_file_hash,input_fingerprint,
    source_table_index,source_row_index,source_item_name,
    mapping_version_id,ingredient_id,status,observed,interpreted,normalized,
    pricing,proposed_allocations,review_reasons,warnings,
    line_quantity,line_unit,observed_unit_price,line_total,
    physical_quantity,base_unit,purchase_quantity,purchase_unit,
    normalized_unit_price,supersedes_proposal_id,created_by,provenance
  ) VALUES(
    p.proposal_set_id,i.id,e.id,9,
    p.supplier_profile_id,p.supplier_profile_version,p.supplier_profile_hash,
    p.normalizer_version,i.content_sha256,
    encode(sha256(convert_to(p.input_fingerprint||':sanilec-pack-v1:'||map.id::text,'UTF8')),'hex'),
    p.source_table_index,p.source_row_index,l.original_name,
    map.id,g.id,'ready_for_review'::public.purchase_interpretation_proposal_status,
    p.observed,
    p.interpreted||jsonb_build_object('match_source','verified_supplier_sku_packaging',
      'previous_review_reasons',to_jsonb(p.review_reasons),
      'original_supplier_identity_mapping_version_id',rec.prior_confirmed),
    p.normalized||jsonb_build_object('physical_quantity',rec.pack_size,
      'base_unit','ud','purchase_quantity',rec.pack_size,
      'purchase_unit','ud','normalized_unit_price',amount_per_item),
    p.pricing||jsonb_build_object('source_net_line_total',l.total_price,
      'verified_net_price_from_original',true,'discount_subtracted_again',false),
    '[]'::jsonb,'{}'::text[],'{}'::text[],l.quantity,rec.billing,l.unit_price,l.total_price,
    rec.pack_size,'ud',rec.pack_size,'ud',amount_per_item,
    p.id,p.created_by,
    p.provenance||jsonb_build_object('revision',jsonb_build_object(
      'kind','sanilec_owner_verified_packaging_without_stock_v1',
      'source_hash',i.content_sha256,'source_proposal_id',p.id,
      'stock_changed',false,'physical_delivery_unreconciled',true))
  ) RETURNING id INTO new_proposal;
  INSERT INTO private.purchase_verified_sanilec_packages(
    invoice_line_id,invoice_id,ingredient_id,supplier_sku,source_sha256,
    original_proposal_id,mapping_version_id,new_proposal_id,
    supplier_quantity,units_per_package,calculated_units,original_line_total)
  VALUES(l.id,i.id,g.id,rec.sku,i.content_sha256,p.id,map.id,new_proposal,
    l.quantity,rec.pack_size,rec.pack_size,l.total_price);
  UPDATE public.purchase_invoice_lines
   SET status='mapped',line_unit=rec.billing,interpretation_proposal_id=new_proposal
   WHERE id=l.id AND status='pending' AND mapped_ingredient_id=g.id
     AND interpretation_proposal_id=p.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent Sanilec invoice row modification; rollback'; END IF;
  updated_count:=updated_count+1;
 END LOOP;
 IF NOT p_preview THEN PERFORM public.sync_purchase_invoice_status(i.id); END IF;
 RETURN jsonb_build_object('ok',true,'eligible',true,'applied',NOT p_preview,
  'candidate_lines',total_candidates,'prepared_lines',updated_count,
  'created_confirmed_mappings',mappings_created,
  'original_invoice_amounts_unchanged',true,'original_physical_receipts_unchanged',true,
  'stock_changed',false,'remaining_receipt_review',true,'items',out);
END;
$fn$;
REVOKE ALL ON FUNCTION public.prepare_verified_sanilec_packages_A20456_v1(uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_verified_sanilec_packages_A20456_v1(uuid,boolean)
 TO service_role;