-- El flujo Docling ya no tiene productores. Se conservan jobs, extracciones,
-- tablas hijas y eventos históricos; solo se retira capacidad de ejecución.
DROP FUNCTION IF EXISTS public.claim_docling_evidence_job(uuid, integer);
DROP FUNCTION IF EXISTS public.complete_docling_evidence_job(uuid, uuid, uuid, boolean, jsonb, text);
DROP FUNCTION IF EXISTS public.enqueue_docling_evidence_job(uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.retry_docling_evidence_jobs(uuid);
DROP FUNCTION IF EXISTS public.persist_document_evidence(uuid, text, text, jsonb, public.extraction_status, jsonb);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='docling_job_status') THEN
    ALTER TYPE public.docling_job_status RENAME TO document_job_status;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_mistral_evidence_job(
  p_job_id uuid, p_lease_token uuid, p_evidence_extraction_id uuid,
  p_succeeded boolean, p_metrics jsonb DEFAULT '{}'::jsonb,
  p_error text DEFAULT NULL, p_retryable boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt integer;
  v_retry boolean;
  v_invoice_id uuid;
  v_attachment_id uuid;
  v_expected_pages integer;
  v_attachment_count integer;
  v_unfinished_count integer;
  v_replay_mode text;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT attempt_count, invoice_id, source_attachment_id, replay_mode
  INTO v_attempt, v_invoice_id, v_attachment_id, v_replay_mode
  FROM public.document_processing_jobs
  WHERE id = p_job_id AND extractor_version LIKE 'mistral-%'
    AND status = 'leased' AND lease_token = p_lease_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job no adquirido'; END IF;

  v_retry := NOT p_succeeded AND p_retryable AND v_attempt < 3;
  UPDATE public.document_processing_jobs
  SET status = CASE WHEN p_succeeded THEN 'completed'::public.document_job_status
                    WHEN v_retry THEN 'pending'::public.document_job_status
                    ELSE 'failed'::public.document_job_status END,
      evidence_extraction_id = p_evidence_extraction_id,
      extraction_metrics = COALESCE(p_metrics, '{}'::jsonb),
      last_error = left(p_error, 160),
      next_attempt_at = CASE WHEN v_retry THEN now() + make_interval(mins => CASE v_attempt WHEN 1 THEN 2 WHEN 2 THEN 4 ELSE 8 END)
                             ELSE next_attempt_at END,
      completed_at = CASE WHEN v_retry THEN NULL ELSE now() END,
      lease_token = NULL, lease_expires_at = NULL
  WHERE id = p_job_id;
  INSERT INTO public.document_processing_job_events (job_id, event_type, payload)
  VALUES (p_job_id, CASE WHEN p_succeeded THEN 'completed' ELSE 'failed' END,
    jsonb_build_object('evidence_extraction_id', p_evidence_extraction_id,
      'metrics', COALESCE(p_metrics, '{}'::jsonb), 'error', left(p_error, 160),
      'retry_scheduled', v_retry));

  -- La relectura histórica solo deja evidencia y eventos; no reescribe
  -- el estado operativo anterior del albarán ni de sus hojas.
  IF v_replay_mode = 'historical' THEN RETURN; END IF;

  IF p_succeeded THEN
    IF v_attachment_id IS NOT NULL THEN
      UPDATE public.purchase_invoice_attachments
      SET ocr_status = 'done', ocr_error = NULL
      WHERE id = v_attachment_id AND invoice_id = v_invoice_id;
    END IF;
    SELECT expected_pages INTO v_expected_pages
    FROM public.purchase_invoices WHERE id = v_invoice_id;
    SELECT count(*) INTO v_attachment_count
    FROM public.purchase_invoice_attachments WHERE invoice_id = v_invoice_id;
    SELECT count(*) INTO v_unfinished_count
    FROM public.document_processing_jobs
    WHERE invoice_id = v_invoice_id AND extractor_version LIKE 'mistral-%'
      AND status <> 'completed';
    IF v_attachment_count + 1 >= v_expected_pages AND v_unfinished_count = 0 THEN
      UPDATE public.purchase_invoices
      SET status = 'pending_mapping', ocr_error = NULL
      WHERE id = v_invoice_id AND status IN ('processing', 'ocr_failed');
    END IF;
  ELSIF NOT v_retry THEN
    IF v_attachment_id IS NOT NULL THEN
      UPDATE public.purchase_invoice_attachments
      SET ocr_status = 'failed', ocr_error = left(coalesce(p_error, 'Mistral no pudo procesar la hoja'), 5000)
      WHERE id = v_attachment_id AND invoice_id = v_invoice_id;
    END IF;
    UPDATE public.purchase_invoices
    SET status = 'ocr_failed', ocr_error = left(coalesce(p_error, 'Mistral no pudo procesar el documento'), 5000)
    WHERE id = v_invoice_id AND status IN ('processing', 'pending_mapping', 'ocr_failed');
  END IF;
END;
$$;
