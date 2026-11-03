-- Accept a fully reconciled, independently verified, digital-text fallback
-- when the OCR provider exhausted its attempts. Never posts stock or prices.
CREATE OR REPLACE FUNCTION public.adopt_verified_pdf_text_extraction(
  p_invoice_id uuid, p_preview boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_i public.purchase_invoices%ROWTYPE;
  v_e public.document_extractions%ROWTYPE;
  v_j public.document_processing_jobs%ROWTYPE;
  v_m public.purchase_email_documents%ROWTYPE;
  v_source jsonb;
  v_canonical jsonb;
  v_groups jsonb;
  v_group jsonb;
  v_expected_row integer := 0;
  v_first integer;
  v_last integer;
  v_group_count integer := 0;
  v_line_count integer;
  v_proposal_count integer;
  v_source_net numeric;
  v_group_sum numeric := 0;
  v_expected_sum numeric;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_invoice_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','service_role_only_or_bad_id');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('verified-text-extraction:'||p_invoice_id::text,0));

  SELECT * INTO v_i FROM public.purchase_invoices WHERE id=p_invoice_id FOR UPDATE;
  SELECT * INTO v_j FROM public.document_processing_jobs WHERE invoice_id=p_invoice_id FOR UPDATE;
  SELECT * INTO v_e FROM public.document_extractions WHERE invoice_id=p_invoice_id FOR KEY SHARE;
  SELECT * INTO v_m FROM public.purchase_email_documents WHERE invoice_id=p_invoice_id FOR KEY SHARE;
  v_source:=v_e.raw_json_artifact->'response';
  v_canonical:=v_e.raw_json_artifact->'canonical';
  v_groups:=v_source->'deliveries';

  IF v_i.id IS NULL OR v_j.id IS NULL OR v_e.id IS NULL OR v_m.id IS NULL
    OR v_i.source<>'email' OR v_i.supplier_id<>1
    OR v_i.document_kind<>'monthly_invoice' OR v_i.status<>'pending_mapping'
    OR v_i.duplicate_of_invoice_id IS NOT NULL
    OR v_i.content_sha256 IS NULL OR v_i.content_sha256 !~ '^[a-f0-9]{64}$'
    OR v_j.status<>'failed' OR v_j.attempt_count<>3
    OR v_j.replay_mode<>'historical' OR v_j.last_error<>'processing_failed'
    OR v_j.evidence_extraction_id IS NOT NULL
    OR v_j.lease_token IS NOT NULL OR v_j.lease_expires_at IS NOT NULL
    OR v_j.file_version_hash<>v_i.content_sha256
    OR v_j.storage_path<>v_i.file_path OR v_j.storage_bucket<>'albaranes'
    OR v_j.extractor_version<>'mistral-ocr-4-1-document-observation-v2'
    OR v_e.status<>'success' OR v_e.file_version_hash<>v_i.content_sha256
    OR v_e.extractor_version<>'ametller-pdf-text-v1'
    OR v_e.raw_json_artifact->>'extractor'<>'pdftotext_verified'
    OR v_e.raw_json_artifact->'provenance'->>'parser'<>'ametller-pdf-text-v1'
    OR v_e.raw_json_artifact->'provenance'->>'kind'<>'digital_text_pdf_fallback'
    OR v_e.raw_json_artifact->'provenance'->>'original_sha256'<>v_i.content_sha256
    OR v_e.raw_json_artifact->'provenance'->>'stock_changed'<>'false'
    OR v_m.content_sha256<>v_i.content_sha256 OR v_m.storage_path<>v_i.file_path
    OR v_m.supplier_id<>1 OR v_m.status<>'imported'
    OR v_m.document_kind<>'monthly_invoice' OR v_m.duplicate_of IS NOT NULL
    OR NOT EXISTS (
       SELECT 1 FROM public.purchase_supplier_sender_addresses a
       WHERE a.supplier_id=1 AND a.confirmed_by_owner
         AND lower(a.sender_email)=lower(v_m.sender_email))
    OR v_source->>'original_file_sha256'<>v_i.content_sha256
    OR v_source->>'source_text_sha256' IS NULL
    OR encode(extensions.digest(convert_to(v_source->>'source_text','UTF8'),'sha256'),'hex')
      <> v_source->>'source_text_sha256'
    OR position(v_i.invoice_number in (v_source->>'source_text'))=0
    OR position('EL FOGO TORRAT' in (v_source->>'source_text'))=0
    OR v_canonical->>'document_number_raw'<>v_i.invoice_number
    OR v_canonical->>'total_raw'<>to_char(v_i.total_amount,'FM999999990.00')
    OR v_canonical->>'subtotal_raw'<>to_char(v_i.base_amount,'FM999999990.00')
    OR v_canonical->>'tax_raw'<>to_char(v_i.tax_amount,'FM999999990.00')
    OR v_i.total_amount<>round(v_i.base_amount+v_i.tax_amount,2)
    OR EXISTS (SELECT 1 FROM public.purchase_receipt_confirmations r WHERE r.purchase_invoice_id=v_i.id)
    OR EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.reference_id=v_i.id)
    OR EXISTS (SELECT 1 FROM public.ingredient_price_history ph WHERE ph.purchase_invoice_id=v_i.id)
    OR EXISTS (SELECT 1 FROM public.purchase_invoice_attachments a WHERE a.invoice_id=v_i.id)
    OR (SELECT count(*) FROM public.document_extractions ex WHERE ex.invoice_id=v_i.id)<>1
    OR (SELECT count(*) FROM public.document_processing_jobs jb WHERE jb.invoice_id=v_i.id)<>1
    OR EXISTS (
       SELECT 1 FROM public.document_processing_job_events ev
       WHERE ev.job_id=v_j.id AND ev.event_type='completed'
         AND ev.payload->>'recovery'='verified_pdf_text_fallback_v1')
  THEN
    RETURN jsonb_build_object('ok',false,'reason','fallback_source_or_prior_effects_not_verified');
  END IF;

  SELECT count(*),coalesce(sum(l.total_price),0) INTO v_line_count,v_source_net
  FROM public.purchase_invoice_lines l
  WHERE l.invoice_id=v_i.id AND l.superseded_by_extraction_id IS NULL;
  SELECT count(*) INTO v_proposal_count
  FROM public.purchase_interpretation_proposals p WHERE p.purchase_invoice_id=v_i.id;

  IF v_line_count<1 OR v_line_count>150
    OR v_proposal_count<>v_line_count
    OR jsonb_array_length(coalesce(v_canonical->'lines','[]'::jsonb))<>v_line_count
    OR v_source_net<>v_i.base_amount
    OR (SELECT count(DISTINCT p.source_row_index)
        FROM public.purchase_invoice_lines l
        JOIN public.purchase_interpretation_proposals p ON p.id=l.interpretation_proposal_id
        WHERE l.invoice_id=v_i.id AND l.superseded_by_extraction_id IS NULL)<>v_line_count
    OR EXISTS(
      SELECT 1 FROM public.purchase_invoice_lines l
      LEFT JOIN public.purchase_interpretation_proposals p ON p.id=l.interpretation_proposal_id
      WHERE l.invoice_id=v_i.id AND l.superseded_by_extraction_id IS NULL
        AND (l.status<>'pending' OR l.mapped_ingredient_id IS NOT NULL
          OR p.id IS NULL OR p.source_file_hash<>v_i.content_sha256
          OR p.document_extraction_id<>v_e.id OR p.purchase_invoice_id<>v_i.id
          OR p.source_item_name<>l.original_name OR p.line_quantity<>l.quantity
          OR p.line_total<>l.total_price OR p.source_row_index NOT BETWEEN 0 AND 149))
  THEN RETURN jsonb_build_object('ok',false,'reason','fallback_canonical_rows_or_proposals_not_reconciled');
  END IF;

  IF jsonb_typeof(v_groups)<>'array'
    OR jsonb_array_length(v_groups)<1 OR jsonb_array_length(v_groups)>25
  THEN RETURN jsonb_build_object('ok',false,'reason','missing_delivery_groups'); END IF;

  FOR v_group IN SELECT value FROM jsonb_array_elements(v_groups) LOOP
    IF v_group->>'printed'<>'true'
      OR v_group->>'number' !~ '^20[0-9]{2}/01/[0-9]{7}$'
      OR v_group->>'date' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
      OR position(v_group->>'number' in (v_source->>'source_text'))=0
    THEN RETURN jsonb_build_object('ok',false,'reason','delivery_origin_not_printed'); END IF;

    v_first:=(v_group->>'firstRow')::integer;
    v_last:=(v_group->>'lastRow')::integer;
    IF v_first<>v_expected_row OR v_last<v_first OR v_last>=v_line_count
    THEN RETURN jsonb_build_object('ok',false,'reason','delivery_rows_not_contiguous'); END IF;
    SELECT coalesce(sum(l.total_price),0) INTO v_expected_sum
    FROM public.purchase_invoice_lines l
    JOIN public.purchase_interpretation_proposals p ON p.id=l.interpretation_proposal_id
    WHERE l.invoice_id=v_i.id AND l.superseded_by_extraction_id IS NULL
      AND p.source_row_index BETWEEN v_first AND v_last;

    IF round(v_expected_sum*100)<>(v_group->>'netCents')::numeric
    THEN RETURN jsonb_build_object('ok',false,'reason','delivery_subtotal_not_matched'); END IF;
    v_group_sum:=v_group_sum+v_expected_sum;
    v_expected_row:=v_last+1;
    v_group_count:=v_group_count+1;
  END LOOP;
  IF v_expected_row<>v_line_count OR v_group_sum<>v_i.base_amount
  THEN RETURN jsonb_build_object('ok',false,'reason','delivery_groups_do_not_cover_invoice'); END IF;

  IF p_preview THEN
    RETURN jsonb_build_object('ok',true,'eligible',true,'applied',false,
      'source','verified_pdf_text_fallback_v1','lines',v_line_count,
      'delivery_groups',v_group_count,'base',v_source_net,'stock_changed',false);
  END IF;

  UPDATE public.document_processing_jobs
  SET status='completed',
      evidence_extraction_id=v_e.id,
      extractor_version=v_e.extractor_version,
      last_error=NULL,
      completed_at=now(),
      extraction_metrics=jsonb_build_object(
        'extractor','pdftotext_verified','fallback_after_mistral_failure',true,
        'line_count',v_line_count,'delivery_count',v_group_count,
        'source_sha',v_i.content_sha256,'replay_mode','historical',
        'stock_changed',false)
  WHERE id=v_j.id AND status='failed' AND attempt_count=3
    AND evidence_extraction_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'OCR job changed concurrently'; END IF;

  INSERT INTO public.document_processing_job_events(job_id,event_type,payload)
  VALUES (v_j.id,'completed',jsonb_build_object(
    'recovery','verified_pdf_text_fallback_v1',
    'extraction_id',v_e.id,'original_sha',v_i.content_sha256,
    'delivery_groups',v_group_count,'line_count',v_line_count,
    'stock_changed',false,'historical_replay',true));

  RETURN jsonb_build_object('ok',true,'applied',true,
    'lines',v_line_count,'delivery_groups',v_group_count,
    'stock_changed',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.adopt_verified_pdf_text_extraction(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.adopt_verified_pdf_text_extraction(uuid,boolean) TO service_role;
