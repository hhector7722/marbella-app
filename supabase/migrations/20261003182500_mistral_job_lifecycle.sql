-- La evidencia OCR y las propuestas son inmutables; estos estados solo reflejan
-- el progreso operativo. No modifica recepciones, movimientos ni precios.
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
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT attempt_count, invoice_id, source_attachment_id
  INTO v_attempt, v_invoice_id, v_attachment_id
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

REVOKE ALL ON FUNCTION public.complete_mistral_evidence_job(uuid, uuid, uuid, boolean, jsonb, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mistral_evidence_job(uuid, uuid, uuid, boolean, jsonb, text, boolean)
  TO service_role;

-- El reintento explícito debe volver a hacer reclamable un fallo sin evidencia.
CREATE OR REPLACE FUNCTION public.retry_docling_evidence_jobs(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice public.purchase_invoices%ROWTYPE;
  v_requeued integer := 0;
  v_immutable_failure_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado para reintentar evidencia documental';
  END IF;
  SELECT * INTO v_invoice FROM public.purchase_invoices pi
  WHERE pi.id = p_invoice_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Albarán no encontrado'; END IF;
  IF v_invoice.created_by IS DISTINCT FROM auth.uid()
     AND NOT public.is_purchase_manager_or_admin() THEN
    RAISE EXCEPTION 'No autorizado para reintentar este albarán';
  END IF;
  SELECT count(*) INTO v_immutable_failure_count
  FROM public.document_processing_jobs dpj
  WHERE dpj.invoice_id = p_invoice_id AND dpj.status = 'failed'
    AND dpj.evidence_extraction_id IS NOT NULL;
  WITH requeued AS (
    UPDATE public.document_processing_jobs dpj
    SET status = 'pending', lease_token = NULL, lease_expires_at = NULL,
        last_error = NULL, completed_at = NULL,
        attempt_count = CASE WHEN dpj.extractor_version LIKE 'mistral-%' THEN 0 ELSE dpj.attempt_count END,
        next_attempt_at = now()
    WHERE dpj.invoice_id = p_invoice_id AND dpj.status = 'failed'
      AND dpj.evidence_extraction_id IS NULL
    RETURNING dpj.id
  ), logged AS (
    INSERT INTO public.document_processing_job_events (job_id, event_type, payload)
    SELECT id, 'requeued', jsonb_build_object('reason', 'user_retry') FROM requeued
    RETURNING job_id
  )
  SELECT count(*) INTO v_requeued FROM logged;
  IF v_requeued > 0 THEN
    UPDATE public.purchase_invoices
    SET status = 'processing', ocr_error = NULL
    WHERE id = p_invoice_id AND status IN ('processing', 'ocr_failed', 'pending_mapping');
    UPDATE public.purchase_invoice_attachments pia
    SET ocr_status = 'pending', ocr_error = NULL
    WHERE pia.invoice_id = p_invoice_id
      AND EXISTS (SELECT 1 FROM public.document_processing_jobs dpj
        WHERE dpj.invoice_id = p_invoice_id AND dpj.source_attachment_id = pia.id
          AND dpj.status = 'pending');
  END IF;
  RETURN jsonb_build_object('requeued_count', v_requeued,
    'immutable_failure_count', v_immutable_failure_count);
END;
$$;
