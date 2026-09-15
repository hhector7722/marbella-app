-- K3 operativo · el escáner entrega documentos a la cola durable Docling.
-- Esta migración solo cambia estado operativo y evidencia documental: no toca
-- ingredientes, precios, líneas económicas, mappings, escandallos ni stock.

ALTER TABLE public.document_processing_jobs
  ADD COLUMN IF NOT EXISTS source_attachment_id uuid
    REFERENCES public.purchase_invoice_attachments(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS document_processing_jobs_source_attachment_idx
  ON public.document_processing_jobs (source_attachment_id)
  WHERE source_attachment_id IS NOT NULL;

ALTER TABLE public.document_processing_job_events
  DROP CONSTRAINT IF EXISTS document_processing_job_events_event_type_check,
  ADD CONSTRAINT document_processing_job_events_event_type_check
    CHECK (event_type IN ('created', 'leased', 'completed', 'failed', 'requeued'));

CREATE OR REPLACE FUNCTION public.enqueue_docling_evidence_job(
  p_invoice_id uuid,
  p_file_version_hash text,
  p_storage_path text,
  p_extractor_version text,
  p_source_attachment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice public.purchase_invoices%ROWTYPE;
  v_attachment public.purchase_invoice_attachments%ROWTYPE;
  v_job public.document_processing_jobs%ROWTYPE;
  v_hash text := btrim(coalesce(p_file_version_hash, ''));
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_extractor text := btrim(coalesce(p_extractor_version, ''));
  v_inserted boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado para encolar evidencia documental';
  END IF;

  SELECT * INTO v_invoice
  FROM public.purchase_invoices pi
  WHERE pi.id = p_invoice_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Albarán no encontrado';
  END IF;

  IF v_invoice.created_by IS DISTINCT FROM auth.uid()
     AND NOT public.is_purchase_manager_or_admin() THEN
    RAISE EXCEPTION 'No autorizado para encolar este albarán';
  END IF;

  IF v_hash = '' OR v_path = '' OR v_extractor = '' THEN
    RAISE EXCEPTION 'Hash, ruta y versión de extractor son obligatorios';
  END IF;

  IF p_source_attachment_id IS NULL THEN
    IF v_invoice.content_sha256 IS DISTINCT FROM v_hash OR v_invoice.file_path IS DISTINCT FROM v_path THEN
      RAISE EXCEPTION 'El documento principal no coincide con el albarán';
    END IF;
  ELSE
    SELECT * INTO v_attachment
    FROM public.purchase_invoice_attachments pia
    WHERE pia.id = p_source_attachment_id
      AND pia.invoice_id = p_invoice_id
    FOR SHARE;

    IF NOT FOUND
       OR v_attachment.content_sha256 IS DISTINCT FROM v_hash
       OR v_attachment.file_path IS DISTINCT FROM v_path THEN
      RAISE EXCEPTION 'La hoja adjunta no coincide con el albarán';
    END IF;
  END IF;

  INSERT INTO public.document_processing_jobs (
    invoice_id,
    storage_bucket,
    storage_path,
    file_version_hash,
    extractor_version,
    source_attachment_id,
    requested_by
  ) VALUES (
    p_invoice_id,
    'albaranes',
    v_path,
    v_hash,
    v_extractor,
    p_source_attachment_id,
    auth.uid()
  )
  ON CONFLICT (invoice_id, file_version_hash, extractor_version) DO NOTHING
  RETURNING * INTO v_job;

  IF FOUND THEN
    v_inserted := true;
  ELSE
    SELECT * INTO v_job
    FROM public.document_processing_jobs dpj
    WHERE dpj.invoice_id = p_invoice_id
      AND dpj.file_version_hash = v_hash
      AND dpj.extractor_version = v_extractor
    FOR SHARE;
  END IF;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'No se pudo crear ni recuperar el trabajo Docling';
  END IF;

  -- `processing` es estado operativo, no una interpretación del documento.
  -- Solo un job recién creado lo puede reiniciar: reencolar uno ya fallido no
  -- debe ocultar su error ni escoger implícitamente otra evidencia.
  IF v_inserted THEN
    UPDATE public.purchase_invoices
    SET status = 'processing',
        ocr_error = NULL
    WHERE id = p_invoice_id;

    IF p_source_attachment_id IS NOT NULL THEN
      UPDATE public.purchase_invoice_attachments
      SET ocr_status = 'pending',
          ocr_error = NULL
      WHERE id = p_source_attachment_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'job_id', v_job.id,
    'status', v_job.status,
    'inserted', v_inserted,
    'evidence_extraction_id', v_job.evidence_extraction_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_docling_evidence_jobs(
  p_invoice_id uuid
)
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

  SELECT * INTO v_invoice
  FROM public.purchase_invoices pi
  WHERE pi.id = p_invoice_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Albarán no encontrado';
  END IF;

  IF v_invoice.created_by IS DISTINCT FROM auth.uid()
     AND NOT public.is_purchase_manager_or_admin() THEN
    RAISE EXCEPTION 'No autorizado para reintentar este albarán';
  END IF;

  SELECT count(*)
  INTO v_immutable_failure_count
  FROM public.document_processing_jobs dpj
  WHERE dpj.invoice_id = p_invoice_id
    AND dpj.status = 'failed'
    AND dpj.evidence_extraction_id IS NOT NULL;

  WITH requeued AS (
    UPDATE public.document_processing_jobs dpj
    SET status = 'pending',
        lease_token = NULL,
        lease_expires_at = NULL,
        last_error = NULL,
        completed_at = NULL
    WHERE dpj.invoice_id = p_invoice_id
      AND dpj.status = 'failed'
      AND dpj.evidence_extraction_id IS NULL
    RETURNING dpj.id, dpj.source_attachment_id
  ), logged AS (
    INSERT INTO public.document_processing_job_events (job_id, event_type, payload)
    SELECT id, 'requeued', jsonb_build_object('reason', 'user_retry')
    FROM requeued
    RETURNING job_id
  )
  SELECT count(*) INTO v_requeued FROM logged;

  IF v_requeued > 0 THEN
    UPDATE public.purchase_invoices
    SET status = 'processing',
        ocr_error = NULL
    WHERE id = p_invoice_id;

    UPDATE public.purchase_invoice_attachments pia
    SET ocr_status = 'pending',
        ocr_error = NULL
    WHERE pia.invoice_id = p_invoice_id
      AND EXISTS (
        SELECT 1
        FROM public.document_processing_jobs dpj
        WHERE dpj.invoice_id = p_invoice_id
          AND dpj.source_attachment_id = pia.id
          AND dpj.status = 'pending'
      );
  END IF;

  RETURN jsonb_build_object(
    'requeued_count', v_requeued,
    'immutable_failure_count', v_immutable_failure_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_docling_evidence_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_evidence_extraction_id uuid,
  p_succeeded boolean,
  p_metrics jsonb DEFAULT '{}'::jsonb,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.docling_job_status;
  v_invoice_id uuid;
  v_source_attachment_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE public.document_processing_jobs
  SET status = CASE WHEN p_succeeded THEN 'completed'::public.docling_job_status ELSE 'failed'::public.docling_job_status END,
      evidence_extraction_id = p_evidence_extraction_id,
      extraction_metrics = COALESCE(p_metrics, '{}'::jsonb),
      last_error = p_error,
      completed_at = now(),
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE id = p_job_id
    AND status = 'leased'
    AND lease_token = p_lease_token
  RETURNING status, invoice_id, source_attachment_id
  INTO v_status, v_invoice_id, v_source_attachment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job no adquirido o lease caducada';
  END IF;

  INSERT INTO public.document_processing_job_events (job_id, event_type, payload)
  VALUES (
    p_job_id,
    CASE WHEN p_succeeded THEN 'completed' ELSE 'failed' END,
    jsonb_build_object('evidence_extraction_id', p_evidence_extraction_id, 'metrics', COALESCE(p_metrics, '{}'::jsonb), 'error', p_error)
  );

  IF p_succeeded THEN
    UPDATE public.purchase_invoices
    SET status = 'pending_mapping',
        ocr_error = NULL
    WHERE id = v_invoice_id;

    IF v_source_attachment_id IS NOT NULL THEN
      UPDATE public.purchase_invoice_attachments
      SET ocr_status = 'done',
          ocr_error = NULL
      WHERE id = v_source_attachment_id;
    END IF;
  ELSE
    UPDATE public.purchase_invoices
    SET status = 'ocr_failed',
        ocr_error = left(coalesce(p_error, 'Docling no pudo procesar el documento'), 5000)
    WHERE id = v_invoice_id;

    IF v_source_attachment_id IS NOT NULL THEN
      UPDATE public.purchase_invoice_attachments
      SET ocr_status = 'failed',
          ocr_error = left(coalesce(p_error, 'Docling no pudo procesar la hoja'), 5000)
      WHERE id = v_source_attachment_id;
    END IF;
  END IF;
END;
$$;

DROP POLICY IF EXISTS k3_document_processing_jobs_select_owner ON public.document_processing_jobs;
CREATE POLICY k3_document_processing_jobs_select_owner ON public.document_processing_jobs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_invoices pi
      WHERE pi.id = document_processing_jobs.invoice_id
        AND pi.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS k3_document_processing_job_events_select_owner ON public.document_processing_job_events;
CREATE POLICY k3_document_processing_job_events_select_owner ON public.document_processing_job_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.document_processing_jobs dpj
      JOIN public.purchase_invoices pi ON pi.id = dpj.invoice_id
      WHERE dpj.id = document_processing_job_events.job_id
        AND pi.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS k3_document_processing_jobs_insert_manager_admin ON public.document_processing_jobs;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.document_processing_jobs FROM authenticated;

REVOKE ALL ON FUNCTION public.enqueue_docling_evidence_job(uuid, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_docling_evidence_job(uuid, text, text, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.retry_docling_evidence_jobs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_docling_evidence_jobs(uuid) TO authenticated;
