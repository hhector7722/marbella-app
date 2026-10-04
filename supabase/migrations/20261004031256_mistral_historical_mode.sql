-- La relectura histórica es durable y no puede activar K4 ni cambiar el
-- estado operativo heredado de un albarán ya existente.
ALTER TABLE public.document_processing_jobs
  ADD COLUMN replay_mode text NOT NULL DEFAULT 'live'
  CHECK (replay_mode IN ('live', 'historical'));

CREATE OR REPLACE FUNCTION public.claim_mistral_evidence_job(
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 180
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_job public.document_processing_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_lease_token IS NULL OR p_lease_seconds < 60 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'Lease inválida';
  END IF;

  WITH expired AS (
    UPDATE public.document_processing_jobs
    SET status = 'failed', last_error = 'lease_expired_after_max_attempts',
        lease_token = NULL, lease_expires_at = NULL, completed_at = now()
    WHERE extractor_version LIKE 'mistral-%' AND status = 'leased'
      AND lease_expires_at < now() AND attempt_count >= 3
    RETURNING id
  )
  INSERT INTO public.document_processing_job_events (job_id, event_type, payload)
  SELECT id, 'failed', '{"error":"lease_expired_after_max_attempts"}'::jsonb FROM expired;

  WITH candidate AS (
    SELECT id FROM public.document_processing_jobs
    WHERE extractor_version LIKE 'mistral-%' AND attempt_count < 3
      AND next_attempt_at <= now()
      AND (status = 'pending' OR (status = 'leased' AND lease_expires_at < now()))
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE public.document_processing_jobs j
  SET status = 'leased', lease_token = p_lease_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = j.attempt_count + 1, last_error = NULL
  FROM candidate WHERE j.id = candidate.id RETURNING j.* INTO v_job;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.document_processing_job_events (job_id, event_type, payload)
  VALUES (v_job.id, 'leased', jsonb_build_object('attempt_count', v_job.attempt_count,
    'lease_expires_at', v_job.lease_expires_at));
  RETURN jsonb_build_object('job_id', v_job.id, 'invoice_id', v_job.invoice_id,
    'storage_bucket', v_job.storage_bucket, 'storage_path', v_job.storage_path,
    'file_version_hash', v_job.file_version_hash,
    'extractor_version', v_job.extractor_version, 'correlation_id', v_job.correlation_id,
    'replay_mode', v_job.replay_mode);
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
  SET status = CASE WHEN p_succeeded THEN 'completed'::public.docling_job_status
                    WHEN v_retry THEN 'pending'::public.docling_job_status
                    ELSE 'failed'::public.docling_job_status END,
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
