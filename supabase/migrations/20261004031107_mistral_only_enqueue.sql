-- Encolado exclusivo de Mistral para el escáner. El extractor no es parámetro del navegador.
CREATE OR REPLACE FUNCTION public.enqueue_mistral_evidence_job(
  p_invoice_id uuid,
  p_file_version_hash text,
  p_storage_path text,
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
  v_extractor text := 'mistral-ocr-4-1-document-observation-v2';
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

  IF v_hash = '' OR v_path = '' THEN
    RAISE EXCEPTION 'Hash y ruta son obligatorios';
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
    RAISE EXCEPTION 'No se pudo crear ni recuperar el trabajo Mistral';
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

REVOKE ALL ON FUNCTION public.enqueue_mistral_evidence_job(uuid, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_mistral_evidence_job(uuid, text, text, uuid)
  TO authenticated;
