-- Single verified retry for the Ametller three-page PDF after replacing
-- repeated full-document OCR with three independently SHA-linked page PDFs.
-- Historical replay: this migration cannot create receipt or stock entries.
DO $migration$
DECLARE
 v_doc public.purchase_invoices%ROWTYPE;
 v_job public.document_processing_jobs%ROWTYPE;
 v_email public.purchase_email_documents%ROWTYPE;
 v_failed integer;
 v_since timestamptz;
 v_id constant uuid := '96923f2c-b493-4384-84c3-5108b1e3a98f';
 v_sha constant text := '59716ef66171492f1f3e01aa95ad3059711b6a657c0a4ae3bdab05ca34f12465';
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('verified-page-pdf:'||v_id::text,0));
 SELECT * INTO v_doc FROM public.purchase_invoices WHERE id=v_id FOR UPDATE;
 SELECT * INTO v_job FROM public.document_processing_jobs
   WHERE invoice_id=v_id FOR UPDATE;
 SELECT * INTO v_email FROM public.purchase_email_documents
   WHERE invoice_id=v_id FOR KEY SHARE;
 IF v_doc.id IS NULL OR v_job.id IS NULL OR v_email.id IS NULL
    OR v_doc.source<>'email' OR v_doc.status<>'processing'
    OR v_doc.supplier_id<>1 OR v_doc.invoice_number<>'PROCESANDO…'
    OR v_doc.duplicate_of_invoice_id IS NOT NULL
    OR v_doc.content_sha256<>v_sha
    OR v_job.file_version_hash<>v_sha
    OR v_job.storage_path<>v_doc.file_path
    OR v_job.storage_bucket<>'albaranes'
    OR v_job.status<>'failed' OR v_job.last_error<>'processing_failed'
    OR v_job.attempt_count<>3 OR v_job.replay_mode<>'historical'
    OR v_job.evidence_extraction_id IS NOT NULL
    OR v_job.lease_token IS NOT NULL OR v_job.lease_expires_at IS NOT NULL
    OR v_email.status<>'imported' OR v_email.supplier_id<>1
    OR v_email.content_sha256<>v_sha
    OR v_email.storage_path<>v_doc.file_path
    OR v_email.duplicate_of IS NOT NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.purchase_supplier_sender_addresses s
      WHERE s.supplier_id=1 AND s.confirmed_by_owner
        AND lower(s.sender_email)=lower(v_email.sender_email)
    )
    OR EXISTS(SELECT 1 FROM public.purchase_invoice_lines l WHERE l.invoice_id=v_id)
    OR EXISTS(SELECT 1 FROM public.document_extractions e WHERE e.invoice_id=v_id)
    OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r WHERE r.purchase_invoice_id=v_id)
    OR EXISTS(SELECT 1 FROM public.stock_movements m WHERE m.reference_id=v_id)
    OR EXISTS(SELECT 1 FROM public.document_processing_job_events ev
      WHERE ev.job_id=v_job.id AND ev.event_type='requeued'
        AND ev.payload->>'reason'='verified_actual_page_pdfs_v1')
 THEN RAISE EXCEPTION 'Ametller split-page retry guard did not pass'; END IF;

 SELECT max(ev.created_at) INTO v_since
 FROM public.document_processing_job_events ev
 WHERE ev.job_id=v_job.id AND ev.event_type='requeued'
 AND ev.payload->>'reason'='verified_pdf_lib_parser_v1';
 SELECT count(*) INTO v_failed FROM public.document_processing_job_events ev
 WHERE ev.job_id=v_job.id AND ev.event_type='failed'
 AND ev.created_at>v_since
 AND ev.payload->>'error'='processing_failed'
 AND (ev.payload->'metrics'->>'duration_ms')::numeric BETWEEN 89000 AND 98000;
 IF v_since IS NULL OR v_failed<>3 THEN
   RAISE EXCEPTION 'Expected three precisely documented OCR timeouts after pdf-lib parser';
 END IF;

 UPDATE public.document_processing_jobs SET status='pending',
  attempt_count=0,replay_mode='historical',lease_token=NULL,
  lease_expires_at=NULL,completed_at=NULL,last_error=NULL,
  next_attempt_at=now(),extraction_metrics='{}'::jsonb
 WHERE id=v_job.id AND status='failed' AND attempt_count=3;
 IF NOT FOUND THEN RAISE EXCEPTION 'Job changed during retry'; END IF;
 INSERT INTO public.document_processing_job_events(job_id,event_type,payload)
 VALUES(v_job.id,'requeued',jsonb_build_object(
    'reason','verified_actual_page_pdfs_v1','source_sha',v_sha,
    'pages',3,'replay_mode','historical','economic_effects',false));
END;
$migration$;
