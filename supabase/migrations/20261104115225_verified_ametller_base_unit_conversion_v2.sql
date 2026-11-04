-- V2: use the canonical K4 g/kg and ml/l converter, not a naive equality.
-- Other identity, historic SKU, original-PDF and no-stock guards stay unchanged.
CREATE OR REPLACE FUNCTION public.approve_verified_ametller_mappings_v1(
  p_invoice_id uuid, p_preview boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_i public.purchase_invoices%ROWTYPE;
 v_e public.document_extractions%ROWTYPE;
 v_j public.document_processing_jobs%ROWTYPE;
 v_mail public.purchase_email_documents%ROWTYPE;
 v_l record;
 v_p public.purchase_interpretation_proposals%ROWTYPE;
 v_g public.ingredients%ROWTYPE;
 v_map public.purchase_mapping_versions%ROWTYPE;
 v_row jsonb;
 v_presentations int;
 v_hist_ingredients int;
 v_hist_matched int;
 v_map_id uuid;
 v_mapped int:=0;
 v_checked int:=0;
 v_rejected int:=0;
 v_results jsonb:='[]'::jsonb;
 v_reason text;
 v_unit text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_invoice_id IS NULL THEN
  RETURN jsonb_build_object('ok',false,'reason','service_role_only');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('am_verified_mapping:'||p_invoice_id::text,0));
 SELECT * INTO v_i FROM public.purchase_invoices WHERE id=p_invoice_id FOR UPDATE;
 SELECT * INTO v_e FROM public.document_extractions WHERE invoice_id=p_invoice_id AND status='success';
 SELECT * INTO v_j FROM public.document_processing_jobs WHERE invoice_id=p_invoice_id;
 SELECT * INTO v_mail FROM public.purchase_email_documents WHERE invoice_id=p_invoice_id;
 IF v_i.id IS NULL OR v_e.id IS NULL OR v_j.id IS NULL OR v_mail.id IS NULL
    OR v_i.supplier_id<>1 OR v_i.source<>'email' OR v_i.document_kind<>'monthly_invoice'
    OR v_i.status<>'pending_mapping' OR v_i.duplicate_of_invoice_id IS NOT NULL
    OR v_i.content_sha256 !~ '^[a-f0-9]{64}$'
    OR v_e.file_version_hash<>v_i.content_sha256 OR v_e.extractor_version<>'ametller-pdf-text-v1'
    OR v_e.raw_json_artifact->>'extractor'<>'pdftotext_verified'
    OR v_e.raw_json_artifact->'provenance'->>'kind'<>'digital_text_pdf_fallback'
    OR v_e.raw_json_artifact->'provenance'->>'original_sha256'<>v_i.content_sha256
    OR v_e.raw_json_artifact->'provenance'->>'stock_changed'<>'false'
    OR v_e.raw_json_artifact->'response'->>'original_file_sha256'<>v_i.content_sha256
    OR encode(extensions.digest(convert_to(v_e.raw_json_artifact->'response'->>'source_text','UTF8'),'sha256'),'hex')
      IS DISTINCT FROM v_e.raw_json_artifact->'response'->>'source_text_sha256'
    OR v_j.status<>'completed' OR v_j.replay_mode<>'historical'
    OR v_j.evidence_extraction_id<>v_e.id
    OR v_j.extractor_version<>'ametller-pdf-text-v1'
    OR v_j.file_version_hash<>v_i.content_sha256
    OR v_j.extraction_metrics->>'source_sha'<>v_i.content_sha256
    OR v_mail.status<>'imported' OR v_mail.supplier_id<>1 OR v_mail.content_sha256<>v_i.content_sha256
    OR NOT EXISTS(SELECT 1 FROM public.purchase_supplier_sender_addresses sa
       WHERE lower(sa.sender_email)=lower(v_mail.sender_email)
       AND sa.supplier_id=1 AND sa.confirmed_by_owner)
    OR v_e.raw_json_artifact->'canonical'->>'document_number_raw'<>v_i.invoice_number
    OR (v_e.raw_json_artifact->'canonical'->>'subtotal_raw')::numeric<>v_i.base_amount
    OR (v_e.raw_json_artifact->'canonical'->>'tax_raw')::numeric<>v_i.tax_amount
    OR (v_e.raw_json_artifact->'canonical'->>'total_raw')::numeric<>v_i.total_amount
    OR v_i.base_amount+v_i.tax_amount<>v_i.total_amount
    OR jsonb_array_length(v_e.raw_json_artifact->'canonical'->'lines')<>(
      SELECT count(*) FROM public.purchase_invoice_lines pl
      WHERE pl.invoice_id=p_invoice_id AND pl.superseded_by_extraction_id IS NULL)
    OR (SELECT COALESCE(sum(pl.total_price),0) FROM public.purchase_invoice_lines pl
      WHERE pl.invoice_id=p_invoice_id AND pl.superseded_by_extraction_id IS NULL)<>v_i.base_amount
    OR EXISTS(SELECT 1 FROM public.purchase_invoice_attachments a WHERE a.invoice_id=p_invoice_id)
    OR EXISTS(SELECT 1 FROM public.purchase_invoices duplicate
      WHERE duplicate.id<>v_i.id AND duplicate.supplier_id=1 AND duplicate.status<>'discarded'
      AND (duplicate.content_sha256=v_i.content_sha256
       OR (duplicate.invoice_number=v_i.invoice_number AND duplicate.invoice_date=v_i.invoice_date)))
 THEN RETURN jsonb_build_object('ok',false,'reason','invoice_source_or_economics_not_certified'); END IF;

 FOR v_l IN SELECT * FROM public.purchase_invoice_lines
   WHERE invoice_id=p_invoice_id AND status='pending'
     AND mapped_ingredient_id IS NOT NULL AND superseded_by_extraction_id IS NULL
   ORDER BY id
 LOOP
  v_checked:=v_checked+1;
  v_reason:=NULL;
  SELECT * INTO v_p FROM public.purchase_interpretation_proposals WHERE id=v_l.interpretation_proposal_id;
  SELECT * INTO v_g FROM public.ingredients WHERE id=v_l.mapped_ingredient_id;
  v_row:=v_e.raw_json_artifact->'canonical'->'lines'->v_p.source_row_index;
  v_unit:=CASE
   WHEN lower(trim(v_l.line_unit)) IN ('uni','ud','un','unidad','unidades') THEN 'ud'
   WHEN lower(trim(v_l.line_unit)) IN ('pac','pack','paq','paquete') THEN 'pack'
   ELSE lower(trim(v_l.line_unit)) END;
  IF v_p.id IS NULL OR v_g.id IS NULL OR v_g.archived_at IS NOT NULL
   OR v_l.quantity<=0 OR v_l.total_price<0 OR v_unit IS NULL
   OR v_p.status<>'needs_mapping' OR v_p.mapping_version_id IS NOT NULL OR v_p.ingredient_id IS NOT NULL
   OR v_p.review_reasons<>ARRAY['producto_sin_mapping']::text[] OR cardinality(v_p.warnings)<>0
   OR v_p.normalizer_version<>'ametller-pdf-text-v1'
   OR v_p.provenance->>'source'<>'pdf_text_verified'
   OR v_p.provenance->>'trigger'<>'original_text_fallback'
   OR v_p.provenance->>'schema_version'<>'ametller-pdf-text-v1'
   OR v_p.provenance->>'economic_effects'<>'false'
   OR v_p.provenance->>'original_source_sha'<>v_i.content_sha256
   OR (v_p.provenance ? 'revision')
   OR v_p.purchase_invoice_id<>v_i.id OR v_p.document_extraction_id<>v_e.id
   OR v_p.source_file_hash<>v_i.content_sha256 OR v_p.supplier_id<>1
   OR v_p.source_item_name<>v_l.original_name
   OR v_p.source_row_index IS NULL OR v_p.source_row_index<0 OR v_p.source_row_index>=150
   OR v_p.source_table_index<>(v_row->>'page_index')::integer
   OR v_row IS NULL OR v_p.observed->>'supplier_product_code_raw' IS NULL
   OR v_p.observed->>'supplier_product_code_raw'<>v_row->>'supplier_product_code_raw'
   OR v_p.observed->>'description_raw'<>v_l.original_name
   OR v_row->>'description_raw'<>v_l.original_name
   OR v_row->>'billing_unit_raw'<>v_l.line_unit
   OR (v_row->>'quantity_raw')::numeric<>v_l.quantity
   OR (v_row->>'line_total_raw')::numeric<>v_l.total_price
   OR v_p.line_quantity<>v_l.quantity OR v_p.line_total<>v_l.total_price
   OR NOT EXISTS(SELECT 1 FROM private.purchase_verified_identity_learning known
      WHERE known.invoice_line_id=v_l.id AND known.invoice_id=v_i.id
        AND known.ingredient_id=v_l.mapped_ingredient_id
        AND known.source_sha256=v_i.content_sha256)
   OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r WHERE r.purchase_invoice_line_id=v_l.id)
   OR EXISTS(SELECT 1 FROM public.stock_movements sm
      WHERE sm.reference_id=v_l.id OR sm.reference_doc='ALB-LINE-'||v_l.id::text)
  THEN v_reason:='source_line_or_existing_stock_not_verified'; END IF;
  IF v_reason IS NULL THEN
    SELECT count(DISTINCT (m.ingredient_id,m.conversion_factor,m.line_content_qty,
           lower(trim(m.line_content_unit)),
           CASE WHEN lower(trim(m.line_billing_unit)) IN ('uni','ud','un','unidad','unidades') THEN 'ud'
                WHEN lower(trim(m.line_billing_unit)) IN ('pac','pack','paq','paquete') THEN 'pack'
                ELSE lower(trim(m.line_billing_unit)) END)),
           min(m.id::text)::uuid
    INTO v_presentations,v_map_id
    FROM public.purchase_mapping_versions m
    WHERE m.supplier_id=1 AND m.status='confirmed' AND m.ingredient_id=v_g.id
      AND lower(trim(m.supplier_item_name))=lower(trim(v_l.original_name))
      AND m.conversion_factor>0 AND m.line_content_qty>0
      AND m.line_content_unit IS NOT NULL AND trim(m.line_content_unit)<>''
      AND abs(m.conversion_factor-private.k4_convert_quantity(
        m.line_content_qty,m.line_content_unit,v_g.purchase_unit))<=0.00000001
      AND NOT EXISTS(SELECT 1 FROM public.purchase_mapping_versions other
        WHERE other.supplier_id=1 AND other.status='confirmed'
          AND other.ingredient_id<>v_g.id
          AND lower(trim(other.supplier_item_name))=lower(trim(v_l.original_name)))
      AND CASE WHEN lower(trim(m.line_billing_unit)) IN ('uni','ud','un','unidad','unidades') THEN 'ud'
               WHEN lower(trim(m.line_billing_unit)) IN ('pac','pack','paq','paquete') THEN 'pack'
               ELSE lower(trim(m.line_billing_unit)) END=v_unit
      AND private.k4_base_unit_for_purchase_unit(v_g.purchase_unit)=v_g.base_unit
      AND NOT EXISTS(SELECT 1 FROM public.purchase_mapping_versions n
       WHERE n.supersedes_id=m.id AND n.status='confirmed');
    IF v_presentations<>1 OR v_map_id IS NULL THEN v_reason:='physical_presentation_not_unique'; END IF;
  END IF;
  IF v_reason IS NULL THEN
    SELECT * INTO v_map FROM public.purchase_mapping_versions WHERE id=v_map_id;
    SELECT count(DISTINCT ol.mapped_ingredient_id),
           count(DISTINCT ol.mapped_ingredient_id) FILTER (WHERE ol.mapped_ingredient_id=v_g.id)
    INTO v_hist_ingredients,v_hist_matched
    FROM public.purchase_invoice_lines ol
    JOIN public.purchase_invoices oi ON oi.id=ol.invoice_id
    JOIN public.purchase_interpretation_proposals op ON op.id=ol.interpretation_proposal_id
    WHERE oi.id<>v_i.id AND oi.supplier_id=1 AND oi.source='scanner' AND oi.status='mapped'
      AND ol.status='mapped' AND ol.mapped_ingredient_id IS NOT NULL
      AND ol.superseded_by_extraction_id IS NULL
      AND op.observed->>'supplier_product_code_raw'=v_p.observed->>'supplier_product_code_raw';
    IF v_hist_ingredients<>1 OR v_hist_matched<>1 THEN v_reason:='scanned_sku_not_unique_or_different_ingredient'; END IF;
  END IF;
  IF v_reason IS NULL THEN
    v_mapped:=v_mapped+1;
    v_results:=v_results||jsonb_build_array(jsonb_build_object(
     'line_id',v_l.id,'sku',v_p.observed->>'supplier_product_code_raw',
     'ingredient_id',v_g.id,'mapping_version_id',v_map_id,'factor',v_map.conversion_factor,
     'stock_changed',false,'eligible',true));
    IF NOT p_preview THEN
      INSERT INTO private.purchase_verified_mapping_approvals(
        invoice_line_id,invoice_id,ingredient_id,confirmed_mapping_version_id,
        source_sha256,supplier_sku,factor,content_quantity,content_unit,rule_version)
      VALUES(v_l.id,v_i.id,v_g.id,v_map_id,v_i.content_sha256,
             v_p.observed->>'supplier_product_code_raw',
             v_map.conversion_factor,v_map.line_content_qty,v_map.line_content_unit,
             'ametller_exact_scanned_sku_confirmed_presentation_v2');
      UPDATE public.purchase_invoice_lines
         SET status='mapped' WHERE id=v_l.id AND invoice_id=v_i.id
            AND status='pending' AND mapped_ingredient_id=v_g.id
            AND interpretation_proposal_id=v_p.id AND superseded_by_extraction_id IS NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent mapping changed; rolling back'; END IF;
    END IF;
  ELSE
    v_rejected:=v_rejected+1;
    v_results:=v_results||jsonb_build_array(jsonb_build_object(
       'line_id',v_l.id,'sku',v_p.observed->>'supplier_product_code_raw',
       'eligible',false,'reason',v_reason));
  END IF;
 END LOOP;
 IF NOT p_preview THEN PERFORM public.sync_purchase_invoice_status(v_i.id); END IF;
 RETURN jsonb_build_object('ok',true,'invoice',v_i.invoice_number,
    'applied',NOT p_preview,'eligible_lines',v_mapped,'blocked_lines',v_rejected,
    'stock_changed',false,'invoice_completed',false,'line_results',v_results,
    'rule_version','ametller_exact_scanned_sku_confirmed_presentation_v2');
END;
$f$;
REVOKE ALL ON FUNCTION public.approve_verified_ametller_mappings_v1(uuid,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_verified_ametller_mappings_v1(uuid,boolean)
  TO service_role;
