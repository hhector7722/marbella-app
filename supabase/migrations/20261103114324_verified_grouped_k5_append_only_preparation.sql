-- Auditable, append-only K5 revision for unambiguous supplier-statement
-- lines. Never posts stock itself. Only service_role can call this function.
CREATE OR REPLACE FUNCTION public.prepare_verified_grouped_k5_line(
 p_line_id uuid,
 p_preview boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE
 v_line public.purchase_invoice_lines%ROWTYPE;
 v_invoice public.purchase_invoices%ROWTYPE;
 v_parent public.purchase_interpretation_proposals%ROWTYPE;
 v_extraction public.document_extractions%ROWTYPE;
 v_g public.ingredients%ROWTYPE;
 v_email public.purchase_email_documents%ROWTYPE;
 v_mapping public.purchase_mapping_versions%ROWTYPE;
 v_existing public.purchase_interpretation_proposals%ROWTYPE;
 v_actor uuid;
 v_qty_per numeric;
 v_line_unit text;
 v_units_per_box numeric;
 v_sku text;
 v_expected text;
 v_fingerprint text;
 v_new_mapping uuid;
 v_new_proposal uuid;
 v_purchase_qty numeric;
 v_new_price numeric;
 v_table text;
 v_ocr_row_count integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_line_id IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','service_role_only_or_invalid_line');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('verified-grouped-k5:'||p_line_id::text,0));
 SELECT * INTO v_line FROM public.purchase_invoice_lines WHERE id=p_line_id FOR UPDATE;
 IF v_line.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','line_not_found'); END IF;
 SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id=v_line.invoice_id FOR KEY SHARE;
 SELECT * INTO v_parent FROM public.purchase_interpretation_proposals
   WHERE id=v_line.interpretation_proposal_id;
 IF v_parent.id IS NOT NULL AND v_parent.supersedes_proposal_id IS NOT NULL
   AND v_parent.provenance->'revision'->>'kind'='verified_grouped_delivery'
   AND v_parent.status='ready_for_review' THEN
  RETURN jsonb_build_object('ok',true,'already_prepared',true,'applied',false,
   'line_id',v_line.id,'mapping_version_id',v_parent.mapping_version_id,
   'proposal_id',v_parent.id);
 END IF;
 SELECT * INTO v_extraction FROM public.document_extractions
 WHERE id=v_parent.document_extraction_id FOR KEY SHARE;
 SELECT * INTO v_g FROM public.ingredients WHERE id=v_line.mapped_ingredient_id;
 SELECT * INTO v_email FROM public.purchase_email_documents WHERE invoice_id=v_invoice.id;
 SELECT a.profile_id INTO v_actor FROM private.purchase_receipt_automation_actor a
 JOIN public.profiles p ON p.id=a.profile_id
 JOIN auth.users u ON u.id=a.profile_id
 WHERE a.singleton=true AND p.role IN ('admin','manager')
   AND p.visible_in_plantilla=false
   AND u.email='marbella-purchase-automation@marbella.invalid'
   AND u.raw_app_meta_data->>'marbella_automation_actor'='purchase_receipt_v1';
 IF v_invoice.id IS NULL OR v_parent.id IS NULL OR v_extraction.id IS NULL
   OR v_g.id IS NULL OR v_actor IS NULL OR v_email.id IS NULL
   OR v_invoice.supplier_id NOT IN (2,11)
   OR v_invoice.source<>'email' OR v_invoice.document_kind<>'monthly_invoice'
   OR v_invoice.status<>'pending_mapping' OR v_invoice.duplicate_of_invoice_id IS NOT NULL
   OR v_extraction.status<>'success'
   OR v_extraction.extractor_version<>'mistral-ocr-4-1-document-observation-v2'
   OR v_extraction.raw_json_artifact->>'extractor'<>'mistral'
   OR v_extraction.raw_json_artifact->>'model'<>'mistral-ocr-4-1'
   OR v_extraction.invoice_id<>v_invoice.id
   OR v_extraction.file_version_hash<>v_invoice.content_sha256
   OR v_parent.normalizer_version<>'mistral-pipeline-v3'
   OR v_parent.provenance->>'source'<>'mistral_canonical'
   OR v_parent.provenance->>'trigger'<>'mistral_job_completion'
   OR v_parent.provenance->>'schema_version'<>'mistral-pipeline-v3'
   OR v_parent.provenance->>'economic_effects'<>'false'
   OR v_parent.provenance?'revision'
   OR v_parent.status<>'needs_mapping'
   OR v_parent.review_reasons<>ARRAY['producto_sin_mapping']::text[]
   OR cardinality(v_parent.warnings)<>0
   OR v_parent.mapping_version_id IS NOT NULL OR v_parent.ingredient_id IS NOT NULL
   OR v_parent.purchase_invoice_id<>v_invoice.id OR v_parent.supplier_id<>v_invoice.supplier_id
   OR v_parent.source_file_hash<>v_invoice.content_sha256
   OR v_line.status<>'pending' OR v_line.superseded_by_extraction_id IS NOT NULL
   OR v_line.mapped_ingredient_id IS NULL OR v_g.archived_at IS NOT NULL
   OR v_parent.source_item_name<>v_line.original_name
   OR v_parent.line_quantity<>v_line.quantity
   OR v_parent.line_total<>v_line.total_price
   OR v_parent.observed_unit_price<>v_line.unit_price
   OR v_parent.proposed_allocations <> '[]'::jsonb
   OR v_line.quantity IS NULL OR v_line.quantity<=0
   OR v_line.unit_price IS NULL OR v_line.unit_price<=0
   OR v_line.total_price IS NULL OR v_line.total_price<=0
   OR v_g.purchase_unit<>'ud' OR v_g.base_unit<>'ud'
   OR (v_invoice.supplier_id=2 AND v_parent.observed->>'discount_raw' IS DISTINCT FROM '25,00')
   OR (v_invoice.supplier_id=11 AND v_parent.observed->>'discount_raw' IS NOT NULL)
   OR v_email.status<>'imported'
   OR v_email.content_sha256<>v_invoice.content_sha256
   OR v_email.supplier_id<>v_invoice.supplier_id
   OR NOT EXISTS(
     SELECT 1 FROM public.purchase_supplier_sender_addresses s
     WHERE lower(s.sender_email)=lower(v_email.sender_email)
       AND s.supplier_id=v_invoice.supplier_id AND s.confirmed_by_owner
   )
   OR (SELECT count(*) FROM public.document_processing_jobs j
       WHERE j.invoice_id=v_invoice.id AND j.status='completed'
        AND j.file_version_hash=v_invoice.content_sha256
        AND j.evidence_extraction_id=v_extraction.id)<>1
   OR v_invoice.expected_pages<>1
   OR EXISTS(SELECT 1 FROM public.purchase_invoice_attachments a WHERE a.invoice_id=v_invoice.id)
   OR EXISTS(SELECT 1 FROM public.purchase_interpretation_proposals p
       WHERE p.supersedes_proposal_id=v_parent.id)
   OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r
       WHERE r.purchase_invoice_line_id=v_line.id)
   OR EXISTS(SELECT 1 FROM public.stock_movements s
       WHERE s.reference_id=v_line.id OR s.reference_doc='ALB-LINE-'||v_line.id::text)
   OR EXISTS(SELECT 1 FROM private.purchase_invoice_delivery_reconciliations d
       WHERE d.invoice_line_id=v_line.id)
 THEN
   RETURN jsonb_build_object('ok',false,'reason','unverified_source_or_existing_economic_effect');
 END IF;
 v_sku:=upper(btrim(coalesce(v_parent.observed->>'supplier_product_code_raw','')));
 v_table:=coalesce(v_extraction.raw_json_artifact->'response'->'pages'->0->'tables'->0->>'content','');
 IF v_invoice.supplier_id=2 THEN
   IF v_line.original_name<>'CROISSANT BOMBON FERMENTADO - 40 uds 0131'
     OR v_sku<>'17080809' OR v_line.line_unit<>'CAJA'
     OR v_line.quantity<>1 OR v_g.name<>'Croissant bombón'
     OR v_parent.observed->>'billing_unit_raw'<>'CAJA'
     OR abs(v_line.unit_price*v_line.quantity-v_line.total_price)>0.011
     OR abs(
        ((replace(v_parent.observed->>'unit_price_raw',',','.')::numeric)*
          (1-(replace(v_parent.observed->>'discount_raw',',','.')::numeric/100)))
        -v_line.total_price)>0.011
     OR NOT EXISTS(
       SELECT 1 FROM public.purchase_mapping_versions m
       JOIN public.purchase_invoice_lines existing ON existing.mapped_ingredient_id=m.ingredient_id
       JOIN public.purchase_receipt_confirmations receipt
         ON receipt.purchase_invoice_line_id=existing.id
       WHERE m.supplier_id=v_invoice.supplier_id AND m.ingredient_id=v_g.id
         AND m.status='confirmed' AND m.conversion_factor=40
         AND lower(m.line_billing_unit)='caja'
         AND m.line_content_qty=40 AND lower(m.line_content_unit)='ud'
         AND existing.line_unit='CAJA' AND receipt.physical_quantity=40*existing.quantity
         AND existing.original_name ILIKE 'CROISSANT BOMBON FERMENTADO - 40%'
     )
   THEN RETURN jsonb_build_object('ok',false,'reason','panabad_original_pack_or_historical_mapping_unverified'); END IF;
   v_qty_per:=40;v_line_unit:='CAJA';
 ELSIF v_invoice.supplier_id=11 THEN
   IF v_line.original_name<>'0,5L PET NATURAL CX24'
     OR v_sku<>'PN2155CT-1' OR v_line.line_unit IS NOT NULL
     OR v_g.name<>'Agua Sant Aniol'
     OR v_line.quantity<>24*(v_parent.observed->>'package_count_raw')::numeric
     OR (v_parent.observed->>'units_per_package_raw')::numeric<>24
     OR v_parent.observed->>'description_raw'<>'0,5L PET NATURAL CX24'
     OR v_parent.observed->>'content_per_unit_raw'<>'0,5L'
     OR abs(v_line.unit_price*v_line.quantity-v_line.total_price)>0.011
     OR v_parent.observed->>'quantity_raw' IS NULL
   THEN RETURN jsonb_build_object('ok',false,'reason','sant_aniol_original_units_or_cartons_unverified'); END IF;
   v_qty_per:=1;v_line_unit:='ud';
 END IF;
 IF (SELECT count(*) FROM public.purchase_invoice_lines l
     WHERE l.invoice_id=v_invoice.id AND l.superseded_by_extraction_id IS NULL)
     IS DISTINCT FROM (CASE WHEN v_invoice.supplier_id=2 THEN 15 ELSE 5 END)
 THEN RETURN jsonb_build_object('ok',false,'reason','invoice_line_count_changed'); END IF;
 IF NOT EXISTS(
   SELECT 1 FROM public.ingredients g
   WHERE g.id=v_line.mapped_ingredient_id AND g.archived_at IS NULL
 ) THEN RETURN jsonb_build_object('ok',false,'reason','ingredient_archived'); END IF;
 -- The source original contains the corresponding delivery groups; its
 -- physical extraction hash and specific group/line are rechecked by K4.
 IF v_invoice.supplier_id=11 THEN
   IF v_extraction.raw_json_artifact->'response'->'pages'->0->>'markdown' NOT ILIKE '%FACTURA%'
     OR v_table NOT ILIKE '%ALBARÀ%'
     OR v_table NOT LIKE '%PN2155CT-1%'
   THEN RETURN jsonb_build_object('ok',false,'reason','original_sant_aniol_pdf_not_verified'); END IF;
 END IF;
 v_expected:='verified-grouped-k5-v1:'||v_line.id::text;
 v_fingerprint:=encode(extensions.digest(
   concat_ws('|',v_expected,v_parent.id::text,v_invoice.content_sha256,
     v_g.id::text,v_qty_per::text,v_line_unit,v_line.quantity::text,
     v_line.unit_price::text,v_line.total_price::text),'sha256'),'hex');
 IF p_preview THEN
   RETURN jsonb_build_object('ok',true,'eligible',true,'line_id',v_line.id,
    'invoice',v_invoice.invoice_number,'ingredient_id',v_g.id,
    'quantity',v_line.quantity,'billing_unit',v_line_unit,
    'physical_quantity',v_line.quantity*v_qty_per,
    'original_proposal_id',v_parent.id,'stock_changed',false,'applied',false);
 END IF;
 INSERT INTO public.purchase_mapping_versions(
   supplier_id,supplier_item_name,ingredient_id,conversion_factor,
   line_billing_unit,line_content_qty,line_content_unit,
   status,source_document_extraction_id,idempotency_key,
   proposed_by,confirmed_by,confirmed_at,note
 ) VALUES (
   v_invoice.supplier_id,v_line.original_name,v_g.id,v_qty_per,
   v_line_unit,v_qty_per,'ud',
   'confirmed',v_extraction.id,v_expected,
   v_actor,v_actor,now(),
   'Mapeo verificado automáticamente a partir del original; la mercancía no se recibe otra vez'
 ) RETURNING id INTO v_new_mapping;
 v_purchase_qty:=v_line.quantity*v_qty_per;
 v_new_price:=round((v_line.unit_price/v_qty_per)::numeric,8);
 INSERT INTO public.purchase_interpretation_proposals(
   proposal_set_id,purchase_invoice_id,document_extraction_id,
   supplier_id,supplier_profile_id,supplier_profile_version,supplier_profile_hash,
   normalizer_version,source_file_hash,input_fingerprint,
   source_table_index,source_row_index,source_item_name,
   mapping_version_id,ingredient_id,status,
   observed,interpreted,normalized,pricing,proposed_allocations,
   review_reasons,warnings,line_quantity,line_unit,observed_unit_price,line_total,
   physical_quantity,base_unit,purchase_quantity,purchase_unit,normalized_unit_price,
   supersedes_proposal_id,created_by,provenance
 ) VALUES (
   v_parent.proposal_set_id,v_parent.purchase_invoice_id,v_parent.document_extraction_id,
   v_parent.supplier_id,v_parent.supplier_profile_id,v_parent.supplier_profile_version,
   v_parent.supplier_profile_hash,v_parent.normalizer_version,
   v_parent.source_file_hash,v_fingerprint,
   v_parent.source_table_index,v_parent.source_row_index,v_parent.source_item_name,
   v_new_mapping,v_g.id,'ready_for_review',
   v_parent.observed,
   v_parent.interpreted||jsonb_build_object('match_source','code','match_score',1,
      'verified_supplier_sku',v_sku),
   jsonb_build_object('physical_quantity',v_purchase_qty,'base_unit','ud',
      'purchase_quantity',v_purchase_qty,'purchase_unit','ud',
      'normalized_unit_price',v_new_price),
   v_parent.pricing,'[]'::jsonb,'{}'::text[],'{}'::text[],
   v_line.quantity,v_line_unit,v_line.unit_price,v_line.total_price,
   v_purchase_qty,'ud',v_purchase_qty,'ud',v_new_price,
   v_parent.id,v_actor,
   v_parent.provenance||jsonb_build_object('revision',jsonb_build_object(
    'kind','verified_grouped_delivery','parent_id',v_parent.id::text,
    'stock_changed',false,'physical_units_evidence','supplier_original_pdf',
    'automation_actor',v_actor::text))
 ) RETURNING id INTO v_new_proposal;
 UPDATE public.purchase_invoice_lines
 SET line_unit=v_line_unit,status='mapped',interpretation_proposal_id=v_new_proposal
 WHERE id=v_line.id AND invoice_id=v_invoice.id AND status='pending'
  AND mapped_ingredient_id=v_g.id AND interpretation_proposal_id=v_parent.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verified grouped K5 line changed concurrently'; END IF;
 RETURN jsonb_build_object('ok',true,'applied',true,'line_id',v_line.id,
   'mapping_version_id',v_new_mapping,'proposal_id',v_new_proposal,
   'physical_quantity',v_purchase_qty,'stock_changed',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.prepare_verified_grouped_k5_line(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_verified_grouped_k5_line(uuid,boolean) TO service_role;
