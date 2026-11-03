-- Source-bound immutable K5 successor for the two SERHS milk lines of
-- FV826/091653. It relies on an independently verified original PDF audit.
-- No stock, receipt, price-history, or original OCR row is modified.
CREATE OR REPLACE FUNCTION public.prepare_verified_serhs_net_invoice_k5(
 p_line_id uuid,p_preview boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 v_l public.purchase_invoice_lines%ROWTYPE;
 v_i public.purchase_invoices%ROWTYPE;
 v_p public.purchase_interpretation_proposals%ROWTYPE;
 v_e public.document_extractions%ROWTYPE;
 v_j public.document_processing_jobs%ROWTYPE;
 v_mail public.purchase_email_documents%ROWTYPE;
 v_map public.purchase_mapping_versions%ROWTYPE;
 v_ingredient public.ingredients%ROWTYPE;
 v_actor uuid;
 v_sku text;
 v_factor numeric;
 v_phys numeric;
 v_liters numeric;
 v_net_unit numeric;
 v_source jsonb;
 v_new uuid;
 v_fp text;
 v_rows int;
 v_units numeric;
 v_source_price numeric;
 v_source_total numeric;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_line_id IS NULL THEN
  RETURN jsonb_build_object('ok',false,'reason','service_role_only');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('serhs-net-k5:'||p_line_id::text,0));
 SELECT * INTO v_l FROM public.purchase_invoice_lines WHERE id=p_line_id FOR UPDATE;
 IF v_l.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','missing_line'); END IF;
 SELECT * INTO v_i FROM public.purchase_invoices WHERE id=v_l.invoice_id FOR KEY SHARE;
 SELECT * INTO v_p FROM public.purchase_interpretation_proposals WHERE id=v_l.interpretation_proposal_id FOR KEY SHARE;
 IF v_p.id IS NOT NULL AND v_p.supersedes_proposal_id IS NOT NULL
  AND v_p.provenance->'revision'->>'kind'='verified_serhs_original_net_price_v1'
  AND v_p.status='ready_for_review' AND v_l.status='mapped' THEN
   RETURN jsonb_build_object('ok',true,'already_prepared',true,'applied',false,
     'line_id',v_l.id,'proposal_id',v_p.id,'stock_changed',false);
 END IF;
 SELECT * INTO v_e FROM public.document_extractions WHERE id=v_p.document_extraction_id FOR KEY SHARE;
 SELECT * INTO v_j FROM public.document_processing_jobs WHERE invoice_id=v_i.id FOR KEY SHARE;
 SELECT * INTO v_mail FROM public.purchase_email_documents WHERE invoice_id=v_i.id FOR KEY SHARE;
 SELECT * INTO v_map FROM public.purchase_mapping_versions WHERE id=v_p.mapping_version_id FOR KEY SHARE;
 SELECT * INTO v_ingredient FROM public.ingredients WHERE id=v_l.mapped_ingredient_id FOR KEY SHARE;
 SELECT a.profile_id INTO v_actor FROM private.purchase_receipt_automation_actor a
 JOIN public.profiles prof ON prof.id=a.profile_id
 JOIN auth.users u ON u.id=a.profile_id
 WHERE a.singleton=true AND prof.role IN ('admin','manager') AND prof.visible_in_plantilla=false
 AND u.email='marbella-purchase-automation@marbella.invalid'
 AND u.raw_app_meta_data->>'marbella_automation_actor'='purchase_receipt_v1';
 v_sku:=v_p.observed->>'supplier_product_code_raw';
 IF v_i.id IS NULL OR v_p.id IS NULL OR v_e.id IS NULL OR v_j.id IS NULL
  OR v_mail.id IS NULL OR v_map.id IS NULL OR v_ingredient.id IS NULL OR v_actor IS NULL
  OR v_i.supplier_id<>8 OR v_i.source<>'email' OR v_i.document_kind IS NOT NULL
  OR v_i.invoice_number<>'FV826/091653' OR v_i.invoice_date<>'2026-10-29'::date
  OR v_i.status<>'pending_mapping' OR v_i.duplicate_of_invoice_id IS NOT NULL
  OR v_i.base_amount<>214.40 OR v_i.tax_amount<>13.27 OR v_i.total_amount<>227.67
  OR v_i.expected_pages<>1
  OR v_l.status<>'pending' OR v_l.superseded_by_extraction_id IS NOT NULL
  OR v_l.quantity IS NULL OR v_l.quantity<=0 OR v_l.total_price<=0
  OR v_l.mapped_ingredient_id IS NULL OR v_ingredient.archived_at IS NOT NULL
  OR v_ingredient.base_unit<>'ml' OR v_ingredient.purchase_unit<>'l'
  OR v_p.purchase_invoice_id<>v_i.id OR v_p.supplier_id<>8
  OR v_p.source_item_name<>v_l.original_name
  OR v_p.source_file_hash<>v_i.content_sha256 OR v_p.document_extraction_id<>v_e.id
  OR v_p.status<>'needs_review' OR cardinality(v_p.warnings)<>0
  OR v_p.mapping_version_id<>v_map.id OR v_p.ingredient_id<>v_l.mapped_ingredient_id
  OR v_p.provenance->>'source'<>'mistral_canonical'
  OR v_p.provenance->>'trigger'<>'mistral_job_completion'
  OR v_p.provenance->>'schema_version'<>'mistral-pipeline-v3'
  OR v_p.provenance->>'economic_effects'<>'false'
  OR v_p.provenance?'revision'
  OR v_p.normalizer_version<>'mistral-pipeline-v3'
  OR v_p.source_table_index<>0 OR v_p.source_row_index NOT IN (0,1)
  OR v_p.line_quantity<>v_l.quantity OR v_p.line_total<>v_l.total_price
  OR v_p.observed_unit_price<>v_l.unit_price
  OR v_p.proposed_allocations<>'[]'::jsonb
  OR v_map.supplier_id<>8 OR v_map.status<>'confirmed'
  OR v_map.ingredient_id<>v_ingredient.id
  OR v_map.supplier_item_name<>v_l.original_name
  OR v_map.line_billing_unit<>'CA'
  OR lower(v_map.line_content_unit)<>'l'
  OR v_map.conversion_factor<=0 OR v_map.line_content_qty<>v_map.conversion_factor
  OR v_l.line_unit<>'CA'
  OR v_e.invoice_id<>v_i.id OR v_e.status<>'success'
  OR v_e.file_version_hash<>v_i.content_sha256
  OR v_e.extractor_version<>'mistral-ocr-4-1-document-observation-v2'
  OR v_e.raw_json_artifact->>'extractor'<>'mistral'
  OR v_e.raw_json_artifact->>'model'<>'mistral-ocr-4-1'
  OR v_j.status<>'completed' OR v_j.replay_mode<>'live'
  OR v_j.evidence_extraction_id<>v_e.id OR v_j.file_version_hash<>v_i.content_sha256
  OR v_mail.status<>'imported' OR v_mail.supplier_id<>8
  OR v_mail.content_sha256<>v_i.content_sha256 OR v_mail.storage_path<>v_i.file_path
  OR lower(v_mail.sender_email)<>'grupserhs@grupserhs.com'
  OR NOT EXISTS(SELECT 1 FROM public.purchase_supplier_sender_addresses a
      WHERE lower(a.sender_email)=lower(v_mail.sender_email) AND a.supplier_id=8
        AND a.confirmed_by_owner)
  OR EXISTS(SELECT 1 FROM public.purchase_invoice_attachments a WHERE a.invoice_id=v_i.id)
  OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r WHERE r.purchase_invoice_line_id=v_l.id)
  OR EXISTS(SELECT 1 FROM public.stock_movements s
    WHERE s.reference_id=v_l.id OR s.reference_doc='ALB-LINE-'||v_l.id::text)
  OR EXISTS(SELECT 1 FROM public.ingredient_price_history h WHERE h.purchase_invoice_line_id=v_l.id)
  OR EXISTS(SELECT 1 FROM public.purchase_interpretation_proposals x
      WHERE x.supersedes_proposal_id=v_p.id)
 THEN RETURN jsonb_build_object('ok',false,'reason','source_or_mapping_not_verifiably_current'); END IF;
 IF NOT ((v_sku='05087'
      AND v_l.original_name='RAM SENCERA 1,5L C/6' AND v_l.quantity=13
      AND v_l.total_price=143.30 AND v_map.conversion_factor=9
      AND v_ingredient.name='Leche entera'
      AND v_p.review_reasons=ARRAY['descuento_sin_porcentaje_verificado','cantidad_precio_importe_no_reconcilian']::text[])
   OR (v_sku='30502'
      AND v_l.original_name='BEG.CIVADA BARISTA YOSOY 1L C6' AND v_l.quantity=7
      AND v_l.total_price=67.20 AND v_map.conversion_factor=6
      AND v_ingredient.name='Leche avena'
      AND v_p.review_reasons=ARRAY['descuento_sin_porcentaje_verificado']::text[])
 ) THEN RETURN jsonb_build_object('ok',false,'reason','different_item_or_discount_review'); END IF;
 SELECT count(*) INTO v_rows FROM public.purchase_invoice_lines l
 WHERE l.invoice_id=v_i.id AND l.superseded_by_extraction_id IS NULL;
 IF v_rows<>3 OR v_rows<>jsonb_array_length(v_e.raw_json_artifact->'canonical'->'lines')
  OR (SELECT sum(total_price) FROM public.purchase_invoice_lines l WHERE l.invoice_id=v_i.id
       AND l.superseded_by_extraction_id IS NULL)<>214.40
  OR NOT EXISTS(SELECT 1 FROM public.purchase_invoice_lines fee
       JOIN public.purchase_interpretation_proposals fp ON fp.id=fee.interpretation_proposal_id
       WHERE fee.invoice_id=v_i.id AND fee.original_name='Per radial'
       AND fee.status='expense_only' AND fee.quantity=1 AND fee.total_price=3.90
       AND fp.observed->>'supplier_product_code_raw'='7056100001')
  OR v_e.raw_json_artifact->'canonical'->>'document_number_raw'<>v_i.invoice_number
  OR v_e.raw_json_artifact->'canonical'->>'document_date_raw'<>'29/10/2026'
  OR replace(v_e.raw_json_artifact->'canonical'->>'subtotal_raw',',','.')::numeric<>214.40
  OR replace(v_e.raw_json_artifact->'canonical'->>'tax_raw',',','.')::numeric<>13.27
  OR replace(v_e.raw_json_artifact->'canonical'->>'total_raw',',','.')::numeric<>227.67
 THEN RETURN jsonb_build_object('ok',false,'reason','invoice_economic_totals_not_verified'); END IF;
 v_source:=v_e.raw_json_artifact->'canonical'->'lines'->v_p.source_row_index;
 IF v_source IS NULL OR v_source->>'supplier_product_code_raw'<>v_sku
  OR v_source->>'description_raw'<>v_l.original_name
  OR v_p.observed->>'description_raw'<>v_l.original_name
  OR v_source->>'quantity_raw'<>v_p.observed->>'quantity_raw'
  OR v_source->>'unit_price_raw'<>v_p.observed->>'unit_price_raw'
  OR v_source->>'line_total_raw'<>v_p.observed->>'line_total_raw'
  OR replace(v_source->>'quantity_raw',',','.')::numeric<>v_l.quantity
  OR replace(v_source->>'line_total_raw',',','.')::numeric<>v_l.total_price
  OR replace(v_source->>'unit_price_raw',',','.')::numeric<>v_l.unit_price
  OR replace(v_source->>'discount_raw',',','.')::numeric<=0
  OR v_source->>'tax_rate_raw'<>(CASE WHEN v_sku='05087' THEN '4,00' ELSE '10,00' END)
 THEN RETURN jsonb_build_object('ok',false,'reason','supplier_source_line_not_verified'); END IF;
 v_units:=replace(v_source->>'quantity_raw',',','.')::numeric;
 v_source_price:=replace(v_source->>'unit_price_raw',',','.')::numeric;
 v_source_total:=replace(v_source->>'line_total_raw',',','.')::numeric;
 IF abs(v_units*v_source_price-v_source_total)>0.005*v_units+0.0051
 THEN RETURN jsonb_build_object('ok',false,'reason','net_invoice_rounding_not_valid'); END IF;
 v_factor:=v_map.conversion_factor;
 v_liters:=v_l.quantity*v_factor;
 v_phys:=v_liters*1000;
 IF v_p.physical_quantity IS NOT NULL AND v_p.physical_quantity<>v_phys
 THEN RETURN jsonb_build_object('ok',false,'reason','original_physical_quantity_conflict'); END IF;
 v_net_unit:=round(v_l.total_price/v_liters,8);
 v_fp:=encode(extensions.digest(
   concat_ws('|','serhs-net-k5-v1',v_i.content_sha256,v_l.id::text,
     v_p.id::text,v_map.id::text,v_phys::text,v_l.total_price::text),'sha256'),'hex');
 IF p_preview THEN
   RETURN jsonb_build_object('ok',true,'eligible',true,'applied',false,
     'line_id',v_l.id,'sku',v_sku,'physical_quantity',v_phys,
     'stock_changed',false,'net_unit_price',v_net_unit);
 END IF;
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
   v_p.proposal_set_id,v_p.purchase_invoice_id,v_p.document_extraction_id,
   v_p.supplier_id,v_p.supplier_profile_id,v_p.supplier_profile_version,v_p.supplier_profile_hash,
   v_p.normalizer_version,v_p.source_file_hash,v_fp,
   v_p.source_table_index,v_p.source_row_index,v_p.source_item_name,
   v_map.id,v_ingredient.id,'ready_for_review',
   v_p.observed,
   v_p.interpreted||jsonb_build_object('match_source','code','match_score',1,
      'net_discount_already_in_printed_unit_price',true),
   jsonb_build_object('physical_quantity',v_phys,'base_unit','ml',
      'purchase_quantity',v_liters,'purchase_unit','l','normalized_unit_price',v_net_unit),
   v_p.pricing||jsonb_build_object('verified_net_price_from_original',true,
      'discount_subtracted_again',false),
   '[]'::jsonb,'{}'::text[],'{}'::text[],
   v_l.quantity,v_l.line_unit,v_l.unit_price,v_l.total_price,
   v_phys,'ml',v_liters,'l',v_net_unit,
   v_p.id,v_actor,
   v_p.provenance||jsonb_build_object('revision',jsonb_build_object(
     'kind','verified_serhs_original_net_price_v1','parent_id',v_p.id::text,
     'source_hash',v_i.content_sha256,'automation_actor',v_actor::text,
     'stock_changed',false,'reason','independent_original_pdf_financial_audit'))
 ) RETURNING id INTO v_new;
 UPDATE public.purchase_invoice_lines SET status='mapped',interpretation_proposal_id=v_new
 WHERE id=v_l.id AND invoice_id=v_i.id AND interpretation_proposal_id=v_p.id
   AND status='pending' AND mapped_ingredient_id=v_ingredient.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent SERHS invoice-line change'; END IF;
 RETURN jsonb_build_object('ok',true,'applied',true,'line_id',v_l.id,'proposal_id',v_new,
   'physical_quantity',v_phys,'stock_changed',false,'net_unit_price',v_net_unit);
END;
$fn$;
REVOKE ALL ON FUNCTION public.prepare_verified_serhs_net_invoice_k5(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_verified_serhs_net_invoice_k5(uuid,boolean) TO service_role;
