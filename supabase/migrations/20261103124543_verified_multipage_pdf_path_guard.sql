-- Safely match the literal PDF suffix in Postgres without an
-- ambiguous escape sequence. All previous anti-duplicate checks remain.
CREATE OR REPLACE FUNCTION public.requeue_verified_multipage_ocr(p_invoice_id uuid, p_source_sha text, p_verified_pages integer, p_preview boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_doc public.purchase_invoices%ROWTYPE;
  v_job public.document_processing_jobs%ROWTYPE;
  v_email public.purchase_email_documents%ROWTYPE;
  v_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok',false,'reason','service_role_only');
  END IF;
  IF p_invoice_id IS NULL OR p_source_sha !~ '^[0-9a-f]{64}$'
     OR p_verified_pages NOT BETWEEN 2 AND 3
  THEN RETURN jsonb_build_object('ok',false,'reason','invalid_pdf_proof'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('verified-multipage-ocr:'||p_invoice_id::text,0));

  SELECT * INTO v_doc FROM public.purchase_invoices WHERE id=p_invoice_id FOR UPDATE;
  SELECT * INTO v_job FROM public.document_processing_jobs
    WHERE invoice_id=p_invoice_id FOR UPDATE;
  SELECT * INTO v_email FROM public.purchase_email_documents
    WHERE invoice_id=p_invoice_id FOR KEY SHARE;
  IF v_doc.id IS NULL OR v_job.id IS NULL OR v_email.id IS NULL
    OR v_doc.source IS DISTINCT FROM 'email'
    OR v_doc.status IS DISTINCT FROM 'ocr_failed'
    OR v_doc.document_kind IS NOT NULL
    OR v_doc.invoice_number IS DISTINCT FROM 'PROCESANDO…'
    OR v_doc.supplier_id IS NULL
    OR v_doc.duplicate_of_invoice_id IS NOT NULL
    OR v_doc.content_sha256 IS DISTINCT FROM p_source_sha
    OR v_doc.file_path !~ '^email-inbox/[a-f0-9]{2}/[a-f0-9]{64}[.]pdf$'
    OR v_doc.file_path IS DISTINCT FROM v_job.storage_path
    OR v_job.storage_bucket IS DISTINCT FROM 'albaranes'
    OR v_job.file_version_hash IS DISTINCT FROM p_source_sha
    OR v_job.status IS DISTINCT FROM 'failed'
    OR v_job.last_error IS DISTINCT FROM 'processing_failed'
    OR v_job.attempt_count IS DISTINCT FROM 3
    OR v_job.lease_token IS NOT NULL OR v_job.lease_expires_at IS NOT NULL
    OR v_job.evidence_extraction_id IS NOT NULL
    OR v_job.extractor_version IS DISTINCT FROM 'mistral-ocr-4-1-document-observation-v2'
    OR v_email.status IS DISTINCT FROM 'imported'
    OR v_email.duplicate_of IS NOT NULL
    OR v_email.supplier_id IS DISTINCT FROM v_doc.supplier_id
    OR v_email.content_sha256 IS DISTINCT FROM p_source_sha
    OR v_email.storage_path IS DISTINCT FROM v_doc.file_path
    OR NOT EXISTS (
       SELECT 1 FROM public.purchase_supplier_sender_addresses s
       WHERE s.supplier_id=v_doc.supplier_id AND s.confirmed_by_owner
         AND lower(s.sender_email)=lower(v_email.sender_email)
    )
    OR EXISTS (SELECT 1 FROM public.purchase_invoice_lines l WHERE l.invoice_id=v_doc.id)
    OR EXISTS (SELECT 1 FROM public.document_extractions e WHERE e.invoice_id=v_doc.id)
    OR EXISTS (SELECT 1 FROM public.purchase_invoice_attachments a WHERE a.invoice_id=v_doc.id)
    OR EXISTS (SELECT 1 FROM public.purchase_receipt_confirmations r WHERE r.purchase_invoice_id=v_doc.id)
    OR EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.reference_id=v_doc.id)
    OR EXISTS (SELECT 1 FROM public.ingredient_price_history ph WHERE ph.purchase_invoice_id=v_doc.id)
    OR EXISTS (SELECT 1 FROM public.document_processing_job_events e
       WHERE e.job_id=v_job.id AND e.event_type='requeued'
         AND e.payload->>'reason'='verified_multipage_page_bounded_v1')
  THEN RETURN jsonb_build_object('ok',false,'reason','invoice_job_or_original_not_eligible'); END IF;
  SELECT count(*) INTO v_count
  FROM public.document_processing_job_events e
  WHERE e.job_id=v_job.id AND e.event_type='failed'
    AND e.payload->>'error'='processing_failed'
    AND (e.payload->'metrics'->>'duration_ms')::numeric BETWEEN 89000 AND 98000;
  IF v_count<>3 THEN
    RETURN jsonb_build_object('ok',false,'reason','not_three_documented_ocr_timeouts','failures',v_count);
  END IF;

  IF p_preview THEN
    RETURN jsonb_build_object('ok',true,'eligible',true,'applied',false,
      'job_id',v_job.id,'invoice_id',v_doc.id,'pdf_pages',p_verified_pages,
      'replay_mode','historical','stock_allowed',false);
  END IF;

  UPDATE public.document_processing_jobs
  SET status='pending',attempt_count=0,replay_mode='historical',
      lease_token=NULL,lease_expires_at=NULL,last_error=NULL,
      completed_at=NULL,next_attempt_at=now(),
      extraction_metrics='{}'::jsonb
  WHERE id=v_job.id AND status='failed' AND attempt_count=3;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mistral job changed concurrently'; END IF;
  UPDATE public.purchase_invoices
  SET status='processing',ocr_error=NULL
  WHERE id=v_doc.id AND status='ocr_failed';
  IF NOT FOUND THEN RAISE EXCEPTION 'Mistral document changed concurrently'; END IF;
  INSERT INTO public.document_processing_job_events(job_id,event_type,payload)
  VALUES (v_job.id,'requeued',jsonb_build_object(
    'reason','verified_multipage_page_bounded_v1',
    'source_sha',p_source_sha,'pdf_pages',p_verified_pages,
    'economic_effects',false,'replay_mode','historical'));
  RETURN jsonb_build_object('ok',true,'applied',true,'job_id',v_job.id,
    'invoice_id',v_doc.id,'pdf_pages',p_verified_pages,
    'replay_mode','historical','stock_allowed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.requeue_verified_multipage_ocr(uuid,text,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_verified_multipage_ocr(uuid,text,integer,boolean) TO service_role;
