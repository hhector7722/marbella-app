-- La cola K3 ya es durable. Separa las leases de cada extractor para que el
-- worker local Docling no pueda adquirir trabajos del worker Mistral.
ALTER TABLE public.document_processing_jobs
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS document_processing_jobs_mistral_ready_idx
  ON public.document_processing_jobs (next_attempt_at, created_at)
  WHERE status = 'pending' AND extractor_version LIKE 'mistral-%';

CREATE UNIQUE INDEX IF NOT EXISTS purchase_interpretation_proposals_mistral_row_uidx
  ON public.purchase_interpretation_proposals (document_extraction_id, source_row_index)
  WHERE normalizer_version = 'mistral-pipeline-v1' AND source_row_index IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_docling_evidence_job(
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 900
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_job public.document_processing_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_lease_token IS NULL OR p_lease_seconds < 60 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'Lease inválida';
  END IF;
  WITH candidate AS (
    SELECT id FROM public.document_processing_jobs
    WHERE extractor_version LIKE 'docling-%'
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
    'extractor_version', v_job.extractor_version, 'correlation_id', v_job.correlation_id);
END;
$$;

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
    'extractor_version', v_job.extractor_version, 'correlation_id', v_job.correlation_id);
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
DECLARE v_attempt integer; v_retry boolean;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT attempt_count INTO v_attempt FROM public.document_processing_jobs
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
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mistral_evidence_job(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mistral_evidence_job(uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.complete_mistral_evidence_job(uuid, uuid, uuid, boolean, jsonb, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mistral_evidence_job(uuid, uuid, uuid, boolean, jsonb, text, boolean)
  TO service_role;
