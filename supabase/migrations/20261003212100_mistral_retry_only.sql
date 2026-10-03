-- El reintento del extractor principal no debe reactivar trabajos Docling
-- históricos ni interpretar sus fallos inmutables como fallos Mistral.
CREATE OR REPLACE FUNCTION public.retry_mistral_evidence_jobs(p_invoice_id uuid)
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
  WHERE dpj.invoice_id = p_invoice_id AND dpj.extractor_version LIKE 'mistral-%'
    AND dpj.status = 'failed' AND dpj.evidence_extraction_id IS NOT NULL;
  WITH requeued AS (
    UPDATE public.document_processing_jobs dpj
    SET status = 'pending', lease_token = NULL, lease_expires_at = NULL,
        last_error = NULL, completed_at = NULL,
        attempt_count = 0, next_attempt_at = now()
    WHERE dpj.invoice_id = p_invoice_id AND dpj.extractor_version LIKE 'mistral-%'
      AND dpj.status = 'failed' AND dpj.evidence_extraction_id IS NULL
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
          AND dpj.extractor_version LIKE 'mistral-%' AND dpj.status = 'pending');
  END IF;
  RETURN jsonb_build_object('requeued_count', v_requeued,
    'immutable_failure_count', v_immutable_failure_count);
END;
$$;

REVOKE ALL ON FUNCTION public.retry_mistral_evidence_jobs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_mistral_evidence_jobs(uuid) TO authenticated;
