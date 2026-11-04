-- Accept ONLY the two source-PDF-audited SERHS K5 successors.
-- All original anti-double-stock, economic and movement-proof guards remain.
CREATE OR REPLACE FUNCTION public.apply_verified_serhs_653_stock_line(p_line_id uuid, p_mapping_version_id uuid, p_proposal_id uuid, p_delivery_ref text DEFAULT NULL::text, p_delivery_date date DEFAULT NULL::date, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_i public.purchase_invoices%ROWTYPE;
 v_l public.purchase_invoice_lines%ROWTYPE;
 v_p public.purchase_interpretation_proposals%ROWTYPE;
 v_m public.purchase_mapping_versions%ROWTYPE;
 v_g public.ingredients%ROWTYPE;
 v_e public.document_extractions%ROWTYPE;
 v_email public.purchase_email_documents%ROWTYPE;
 v_preview jsonb;
 v_result jsonb;
 v_text text;
 v_table text;
 v_group text;
 v_group_pos integer;
 v_sku_pos integer;
 v_next_pos integer;
 v_segment text;
 v_page jsonb;
 v_tbl jsonb;
 v_sku text;
 v_group_verified boolean := false;
 v_qty numeric;
 v_prior int;
 v_mode text;
 v_conf uuid;
 v_rc int;
 v_serhs_revision boolean := false;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RETURN jsonb_build_object('ok',false,'reason','service_role_only');
 END IF;
 IF p_line_id IS NULL OR p_mapping_version_id IS NULL OR p_proposal_id IS NULL THEN
  RETURN jsonb_build_object('ok',false,'reason','missing_line_mapping_or_proposal');
 END IF;
 SELECT * INTO v_l FROM public.purchase_invoice_lines WHERE id=p_line_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','line_not_found'); END IF;
 SELECT * INTO v_i FROM public.purchase_invoices WHERE id=v_l.invoice_id FOR UPDATE;
 IF NOT FOUND OR v_i.source IS DISTINCT FROM 'email'
    OR v_i.document_kind='other'
    OR v_i.document_kind='delivery_note'
    OR v_i.status NOT IN ('mapped','pending_mapping')
    OR v_i.duplicate_of_invoice_id IS NOT NULL
    OR v_i.invoice_number IS NULL OR v_i.invoice_date IS NULL
    OR v_i.supplier_id IS NULL
    OR v_i.content_sha256 !~ '^[a-f0-9]{64}$' THEN
  RETURN jsonb_build_object('ok',false,'reason','not_verified_email_invoice');
 END IF;
 -- Serialize sources of the same supplier, including concurrent emails.
 PERFORM pg_advisory_xact_lock(hashtextextended('invoice-stock-supplier:'||v_i.supplier_id::text,0));

 IF v_l.status IS DISTINCT FROM 'mapped'
    OR v_l.superseded_by_extraction_id IS NOT NULL
    OR v_l.interpretation_proposal_id IS DISTINCT FROM p_proposal_id
    OR v_l.mapped_ingredient_id IS NULL
    OR v_l.quantity IS NULL OR v_l.quantity<=0
    OR v_l.total_price IS NULL OR v_l.total_price<0 THEN
  RETURN jsonb_build_object('ok',false,'reason','line_not_fully_mapped');
 END IF;
 SELECT * INTO v_p FROM public.purchase_interpretation_proposals WHERE id=p_proposal_id;
 SELECT * INTO v_m FROM public.purchase_mapping_versions WHERE id=p_mapping_version_id;
 SELECT * INTO v_g FROM public.ingredients WHERE id=v_l.mapped_ingredient_id;
 SELECT * INTO v_e FROM public.document_extractions WHERE id=v_p.document_extraction_id;
 SELECT * INTO v_email FROM public.purchase_email_documents
 WHERE invoice_id=v_i.id AND status='imported' AND supplier_id=v_i.supplier_id
 AND content_sha256=v_i.content_sha256;
 IF NOT FOUND OR NOT EXISTS(
  SELECT 1 FROM public.purchase_supplier_sender_addresses sender
  WHERE lower(sender.sender_email)=lower(v_email.sender_email)
    AND sender.supplier_id=v_i.supplier_id AND sender.confirmed_by_owner
 ) THEN RETURN jsonb_build_object('ok',false,'reason','supplier_email_not_confirmed'); END IF;
 -- This immutable K5 successor was created by the narrow, original-PDF audited
 -- SERHS net-unit-price workflow, not by an arbitrary edited proposal.
 SELECT EXISTS(
  SELECT 1 FROM public.purchase_interpretation_proposals parent
  JOIN private.purchase_receipt_automation_actor actor ON actor.singleton=true
  JOIN public.profiles profile ON profile.id=actor.profile_id
  JOIN auth.users u ON u.id=actor.profile_id
  WHERE parent.id=v_p.supersedes_proposal_id
    AND parent.purchase_invoice_id=v_i.id
    AND parent.document_extraction_id=v_e.id
    AND parent.source_file_hash=v_i.content_sha256
    AND parent.status='needs_review'
    AND parent.provenance->>'source'='mistral_canonical'
    AND parent.provenance->>'trigger'='mistral_job_completion'
    AND parent.provenance->>'schema_version'='mistral-pipeline-v3'
    AND NOT (parent.provenance ? 'revision')
    AND parent.mapping_version_id=v_p.mapping_version_id
    AND parent.ingredient_id=v_p.ingredient_id
    AND parent.observed=v_p.observed
    AND parent.source_row_index=v_p.source_row_index
    AND parent.source_item_name=v_p.source_item_name
    AND parent.line_quantity=v_p.line_quantity
    AND parent.line_total=v_p.line_total
    AND v_p.created_by=actor.profile_id
    AND profile.role IN ('admin','manager')
    AND profile.visible_in_plantilla=false
    AND u.email='marbella-purchase-automation@marbella.invalid'
    AND u.raw_app_meta_data->>'marbella_automation_actor'='purchase_receipt_v1'
    AND v_i.id='27475965-ea40-41a2-b871-30ea611eb4c7'::uuid
    AND v_i.supplier_id=8
    AND v_i.invoice_number='FV826/091653'
    AND v_i.invoice_date='2026-10-29'::date
    AND v_i.status='pending_mapping'
    AND v_i.content_sha256='95c7600b43895db2ddaf27f87d3d859b353795017260a299222a71a3689ede3f'
    AND v_i.base_amount=214.40 AND v_i.tax_amount=13.27 AND v_i.total_amount=227.67
    AND v_p.provenance->'revision'->>'kind'='verified_serhs_original_net_price_v1'
    AND v_p.provenance->'revision'->>'parent_id'=parent.id::text
    AND v_p.provenance->'revision'->>'source_hash'=v_i.content_sha256
    AND v_p.provenance->'revision'->>'automation_actor'=actor.profile_id::text
    AND v_p.provenance->'revision'->>'stock_changed'='false'
    AND v_p.pricing->>'verified_net_price_from_original'='true'
    AND v_p.pricing->>'discount_subtracted_again'='false'
    AND v_p.interpreted->>'net_discount_already_in_printed_unit_price'='true'
    AND v_m.status='confirmed' AND v_m.ingredient_id=v_g.id
    AND v_m.supplier_id=8 AND v_m.line_billing_unit='CA'
    AND v_m.line_content_qty=v_m.conversion_factor
    AND lower(v_m.line_content_unit)='l'
    AND v_p.base_unit='ml' AND v_p.purchase_unit='l'
    AND v_p.physical_quantity=v_l.quantity*v_m.conversion_factor*1000
    AND v_p.purchase_quantity=v_l.quantity*v_m.conversion_factor
    AND v_p.normalized_unit_price=round(v_l.total_price/v_p.purchase_quantity,8)
    AND v_p.review_reasons='{}'::text[] AND v_p.warnings='{}'::text[]
    AND (
       (v_l.id='8a4e3177-014e-471c-a111-3bc275ec4974'::uuid
         AND parent.observed->>'supplier_product_code_raw'='05087'
         AND v_l.original_name='RAM SENCERA 1,5L C/6'
         AND v_l.quantity=13 AND v_l.total_price=143.30 AND v_m.conversion_factor=9
         AND parent.review_reasons=ARRAY['descuento_sin_porcentaje_verificado','cantidad_precio_importe_no_reconcilian']::text[])
       OR
       (v_l.id='542bb5cd-80c0-4458-a9cf-fe446fbed16a'::uuid
         AND parent.observed->>'supplier_product_code_raw'='30502'
         AND v_l.original_name='BEG.CIVADA BARISTA YOSOY 1L C6'
         AND v_l.quantity=7 AND v_l.total_price=67.20 AND v_m.conversion_factor=6
         AND parent.review_reasons=ARRAY['descuento_sin_porcentaje_verificado']::text[])
    )
  ) INTO v_serhs_revision;
 IF v_g.id IS NULL OR v_g.archived_at IS NOT NULL OR v_p.id IS NULL
    OR v_p.status IS DISTINCT FROM 'ready_for_review'
    OR COALESCE(array_length(v_p.review_reasons,1),0)>0
    OR COALESCE(array_length(v_p.warnings,1),0)>0
    OR v_p.normalizer_version IS DISTINCT FROM 'mistral-pipeline-v3'
    OR v_p.provenance->>'source' IS DISTINCT FROM 'mistral_canonical'
    OR v_p.provenance->>'trigger' IS DISTINCT FROM 'mistral_job_completion'
    OR v_p.provenance->>'schema_version' IS DISTINCT FROM 'mistral-pipeline-v3'
    OR v_p.provenance->>'economic_effects' IS DISTINCT FROM 'false'
    OR (v_p.provenance ? 'revision' AND NOT v_serhs_revision)
    OR v_p.purchase_invoice_id IS DISTINCT FROM v_i.id
    OR v_p.ingredient_id IS DISTINCT FROM v_l.mapped_ingredient_id
    OR v_p.mapping_version_id IS DISTINCT FROM p_mapping_version_id
    OR v_p.supplier_id IS DISTINCT FROM v_i.supplier_id
    OR v_p.source_file_hash IS DISTINCT FROM v_i.content_sha256
    OR v_p.line_quantity IS DISTINCT FROM v_l.quantity
    OR v_p.line_total IS DISTINCT FROM v_l.total_price
    OR v_p.physical_quantity IS NULL OR v_p.physical_quantity<=0
    OR v_p.normalized_unit_price IS NULL
    OR v_p.interpreted->>'match_source' NOT IN ('code','exact_name')
    OR COALESCE((v_p.interpreted->>'match_score')::numeric,0)<0.95
    OR v_m.id IS NULL OR v_m.status IS DISTINCT FROM 'confirmed'
    OR v_m.ingredient_id IS DISTINCT FROM v_l.mapped_ingredient_id
    OR v_m.supplier_id IS DISTINCT FROM v_i.supplier_id
    OR EXISTS(SELECT 1 FROM public.purchase_mapping_versions newer
      WHERE newer.supersedes_id=v_m.id AND newer.status='confirmed')
    OR v_e.id IS NULL OR v_e.invoice_id IS DISTINCT FROM v_i.id
    OR v_e.file_version_hash IS DISTINCT FROM v_i.content_sha256
    OR v_e.status IS DISTINCT FROM 'success'
    OR v_e.extractor_version IS DISTINCT FROM 'mistral-ocr-4-1-document-observation-v2'
    OR v_e.raw_json_artifact->>'extractor' IS DISTINCT FROM 'mistral'
    OR v_e.raw_json_artifact->>'model' IS DISTINCT FROM 'mistral-ocr-4-1'
    OR v_i.expected_pages IS DISTINCT FROM 1
    OR EXISTS(SELECT 1 FROM public.purchase_invoice_attachments a WHERE a.invoice_id=v_i.id)
    OR NOT EXISTS(
      SELECT 1 FROM public.document_processing_jobs j
      WHERE j.invoice_id=v_i.id AND j.status='completed'
      AND j.evidence_extraction_id=v_e.id
      AND j.file_version_hash=v_i.content_sha256
    ) THEN
  RETURN jsonb_build_object('ok',false,'reason','ocr_mapping_economics_or_pages_unverified');
 END IF;

 IF EXISTS(
  SELECT 1 FROM public.purchase_invoices other
  WHERE other.id<>v_i.id AND other.supplier_id=v_i.supplier_id
  AND other.status<>'discarded'
  AND (other.content_sha256=v_i.content_sha256 OR
       (other.invoice_number=v_i.invoice_number AND other.invoice_date=v_i.invoice_date))
 ) OR EXISTS(
  SELECT 1 FROM public.purchase_receipt_confirmations r WHERE r.purchase_invoice_line_id=p_line_id
 ) OR EXISTS(
  SELECT 1 FROM public.stock_movements s
  WHERE s.movement_type='PURCHASE'
  AND (s.reference_id=p_line_id OR s.reference_doc='ALB-LINE-'||p_line_id::text)
 ) THEN
  RETURN jsonb_build_object('ok',false,'reason','duplicate_invoice_or_line_receipt');
 END IF;
 v_text:=coalesce(v_e.raw_json_artifact->'response'->'pages'->0->>'markdown','');
 IF v_text !~* 'factura' THEN
  RETURN jsonb_build_object('ok',false,'reason','original_invoice_not_identified');
 END IF;
 IF (p_delivery_ref IS NULL) IS DISTINCT FROM (p_delivery_date IS NULL) THEN
  RETURN jsonb_build_object('ok',false,'reason','incomplete_delivery_identity');
 END IF;
 IF p_delivery_ref IS NULL THEN
  v_mode:='invoice_only';
  -- Explicit delivery groups must be reconciled separately.
  IF (v_e.raw_json_artifact->'response')::text ~* 'albar[aá]n[ :]' THEN
   RETURN jsonb_build_object('ok',false,'reason','explicit_delivery_groups_require_per_delivery_proof');
  END IF;
 ELSE
  v_mode:='explicit_delivery';
  IF p_delivery_ref !~ '^[A-Za-z0-9/-]{5,25}$'
     OR p_delivery_date>v_i.invoice_date+3 OR p_delivery_date<v_i.invoice_date-45 THEN
   RETURN jsonb_build_object('ok',false,'reason','delivery_reference_or_date_invalid');
  END IF;
  -- The first table is often an invoice header; scan all original OCR
  -- tables. A receipt line belongs to a delivery only if its supplier SKU
  -- occurs BETWEEN that delivery's heading and the next delivery heading.
  -- Recognize both Sanilec (ALBARAN:2026-A/...) and Froneri
  -- (Albarán Nº 26P... del dd/mm/yyyy), without relying on extracted table indexes.
  v_sku:=upper(coalesce(v_p.observed->>'supplier_product_code_raw',''));
  IF length(v_sku)<3 THEN
   RETURN jsonb_build_object('ok',false,'reason','source_sku_missing');
  END IF;
  FOR v_page IN
   SELECT value FROM jsonb_array_elements(
    coalesce(v_e.raw_json_artifact->'response'->'pages','[]'::jsonb))
  LOOP
   FOR v_tbl IN
    SELECT value FROM jsonb_array_elements(coalesce(v_page->'tables','[]'::jsonb))
   LOOP
    v_table:=coalesce(v_tbl->>'content','');
    v_group:='ALBARAN:2026-'||p_delivery_ref||' '||to_char(p_delivery_date,'DD/MM/YYYY');
    v_group_pos:=strpos(upper(v_table),upper(v_group));
    IF v_group_pos=0 THEN
     v_group:='ALBARÁN Nº '||p_delivery_ref||' del '||to_char(p_delivery_date,'DD/MM/YYYY');
     v_group_pos:=strpos(upper(v_table),upper(v_group));
    END IF;
    IF v_group_pos>0 THEN
     v_segment:=substr(v_table,v_group_pos+length(v_group));
     v_next_pos:=strpos(upper(v_segment),'ALBAR');
     IF v_next_pos>0 THEN v_segment:=substr(v_segment,1,v_next_pos-1); END IF;
     v_sku_pos:=strpos(upper(v_segment),'| '||v_sku||' |');
     IF v_sku_pos>0 THEN v_group_verified:=true; END IF;
    END IF;
   END LOOP;
  END LOOP;
  IF NOT v_group_verified THEN
   RETURN jsonb_build_object('ok',false,
     'reason','delivery_group_and_ocr_line_not_uniquely_linked');
  END IF;
 END IF;
 -- An exact existing receipt for this supplier/product/quantity/amount is
 -- ambiguous without a provider delivery number; do not post it a second time.
 IF EXISTS(
  SELECT 1
  FROM public.purchase_receipt_confirmations r
  JOIN public.purchase_invoices prior ON prior.id=r.purchase_invoice_id
  JOIN public.purchase_invoice_lines prev_line ON prev_line.id=r.purchase_invoice_line_id
  WHERE prior.supplier_id=v_i.supplier_id AND prior.id<>v_i.id
  AND prior.invoice_date BETWEEN
    (CASE WHEN v_mode='invoice_only' THEN v_i.invoice_date-35 ELSE p_delivery_date-1 END)
     AND
    (CASE WHEN v_mode='invoice_only' THEN v_i.invoice_date+3 ELSE p_delivery_date+1 END)
  AND r.ingredient_id=v_l.mapped_ingredient_id
  AND prev_line.quantity=v_l.quantity
  AND abs(prev_line.total_price-v_l.total_price)<0.011
 ) THEN RETURN jsonb_build_object('ok',false,'reason','possible_prior_supplier_delivery_same_item'); END IF;

 IF v_mode='explicit_delivery' AND EXISTS(
  SELECT 1 FROM public.purchase_invoices prior
  WHERE prior.supplier_id=v_i.supplier_id AND prior.id<>v_i.id
  AND prior.invoice_date=p_delivery_date AND
    prior.invoice_number=p_delivery_ref
  AND EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r
             WHERE r.purchase_invoice_id=prior.id)
 ) THEN RETURN jsonb_build_object('ok',false,'reason','delivery_reference_already_in_stock'); END IF;

 v_preview:=public.apply_receipt_line_automated(
  p_line_id,p_mapping_version_id,'[]'::jsonb,
  'verified-invoice-stock:'||p_line_id::text,true,p_proposal_id);
 IF v_preview->>'ok'<>'true'
    OR v_preview->>'proposal_validated'<>'true'
    OR v_preview->>'price_changed'='true'
    OR v_preview->>'mapping_will_be_confirmed'='true'
    OR v_preview->>'ingredient_id' IS DISTINCT FROM v_l.mapped_ingredient_id::text
    OR (v_preview->>'physical_quantity')::numeric IS DISTINCT FROM v_p.physical_quantity
 THEN
  RETURN jsonb_build_object('ok',false,'reason','receipt_preview_not_safe','preview',v_preview);
 END IF;
 IF p_dry_run THEN
  RETURN jsonb_build_object('ok',true,'eligible',true,'preview',true,
   'invoice',v_i.invoice_number,'line_id',v_l.id,
   'proof_mode',v_mode,'physical_quantity',v_p.physical_quantity,
   'stock_changed',false);
 END IF;
 INSERT INTO private.purchase_invoice_stock_authorizations (
  invoice_line_id,invoice_id,supplier_id,supplier_invoice_number,source_sha256,
  source_extraction_id,interpretation_proposal_id,mapping_version_id,
  source_row_index,source_sku,proof_mode,delivery_ref,delivery_date
 ) VALUES (
  v_l.id,v_i.id,v_i.supplier_id,btrim(v_i.invoice_number),v_i.content_sha256,
  v_e.id,v_p.id,v_m.id,v_p.source_row_index,
  coalesce(v_p.observed->>'supplier_product_code_raw',''),
  v_mode,p_delivery_ref,p_delivery_date
 );
 v_result:=public.apply_receipt_line_automated(
  p_line_id,p_mapping_version_id,'[]'::jsonb,
  'verified-invoice-stock:'||p_line_id::text,false,p_proposal_id);
 IF v_result->>'ok'<>'true' OR v_result->>'proposal_validated'<>'true'
    OR v_result->>'price_changed'='true' OR v_result->>'idempotent'='true' THEN
  RAISE EXCEPTION 'Protected invoice receipt rejected; rolled back: %',v_result;
 END IF;
 v_conf:=(v_result->>'confirmation_id')::uuid;
 SELECT count(*) INTO v_rc FROM public.purchase_receipt_confirmations r
 JOIN public.stock_movements s ON s.id=r.stock_movement_id
 WHERE r.id=v_conf AND r.purchase_invoice_line_id=v_l.id
   AND r.ingredient_id=v_l.mapped_ingredient_id
   AND s.movement_type='PURCHASE' AND s.ingredient_id=v_l.mapped_ingredient_id;
 IF v_rc<>1 THEN
  RAISE EXCEPTION 'Invoice receipt verification failed, rolling back';
 END IF;
 RETURN jsonb_build_object('ok',true,'applied',true,'invoice',v_i.invoice_number,
   'line_id',v_l.id,'confirmation_id',v_conf,
   'stock_movement_id',v_result->>'stock_movement_id',
   'quantity',v_p.physical_quantity,'proof_mode',v_mode);
END;
$function$;
REVOKE ALL ON FUNCTION public.apply_verified_serhs_653_stock_line(uuid,uuid,uuid,text,date,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_verified_serhs_653_stock_line(uuid,uuid,uuid,text,date,boolean) TO service_role;
