-- Una relectura manual vuelve al archivo original y reutiliza la extracción
-- Mistral por hash/versión. Nunca cambia el estado económico del albarán.
CREATE OR REPLACE FUNCTION public.reprocess_mistral_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice public.purchase_invoices%ROWTYPE;
  v_page record;
  v_job public.document_processing_jobs%ROWTYPE;
  v_count integer := 0;
  v_version text := 'mistral-ocr-4-1-document-observation-v2';
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_purchase_manager_or_admin() THEN
    RAISE EXCEPTION 'Solo manager o administración puede releer albaranes';
  END IF;
  SELECT * INTO v_invoice FROM public.purchase_invoices
  WHERE id = p_invoice_id FOR SHARE;
  IF NOT FOUND OR v_invoice.file_path IS NULL OR v_invoice.content_sha256 IS NULL THEN
    RAISE EXCEPTION 'El albarán no conserva un documento original verificable';
  END IF;

  FOR v_page IN
    SELECT NULL::uuid AS attachment_id, v_invoice.file_path AS file_path,
      v_invoice.content_sha256 AS content_sha256
    UNION ALL
    SELECT a.id, a.file_path, a.content_sha256
    FROM public.purchase_invoice_attachments a WHERE a.invoice_id = p_invoice_id
  LOOP
    IF v_page.file_path IS NULL OR v_page.content_sha256 IS NULL THEN
      RAISE EXCEPTION 'Una hoja carece de original verificable';
    END IF;
    SELECT * INTO v_job FROM public.document_processing_jobs j
    WHERE j.invoice_id = p_invoice_id AND j.file_version_hash = v_page.content_sha256
      AND j.extractor_version = v_version FOR UPDATE;
    IF FOUND THEN
      IF v_job.status = 'leased' THEN RAISE EXCEPTION 'La relectura ya está en curso'; END IF;
      IF v_job.status = 'failed' AND v_job.evidence_extraction_id IS NOT NULL THEN
        RAISE EXCEPTION 'La evidencia fallida es inmutable; se requiere nueva versión';
      END IF;
      UPDATE public.document_processing_jobs
      SET status = 'pending', replay_mode = 'historical',
        lease_token = NULL, lease_expires_at = NULL, completed_at = NULL,
        attempt_count = 0, next_attempt_at = now(), last_error = NULL,
        requested_by = auth.uid()
      WHERE id = v_job.id;
    ELSE
      INSERT INTO public.document_processing_jobs (
        invoice_id, storage_bucket, storage_path, file_version_hash,
        extractor_version, source_attachment_id, requested_by, replay_mode
      ) VALUES (p_invoice_id, 'albaranes', v_page.file_path,
        v_page.content_sha256, v_version, v_page.attachment_id,
        auth.uid(), 'historical') RETURNING * INTO v_job;
    END IF;
    INSERT INTO public.document_processing_job_events(job_id, event_type, payload)
    VALUES (v_job.id, 'requeued', jsonb_build_object('reason', 'manual_mistral_reprocess'));
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('queued_pages', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.reprocess_mistral_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reprocess_mistral_invoice(uuid) TO authenticated;
