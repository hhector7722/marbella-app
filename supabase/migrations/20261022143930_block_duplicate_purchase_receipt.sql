CREATE OR REPLACE FUNCTION public.apply_receipt_line(
  p_invoice_line_id uuid,
  p_mapping_version_id uuid,
  p_allocations jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL,
  p_dry_run boolean DEFAULT false,
  p_interpretation_proposal_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_invoice public.purchase_invoices%ROWTYPE;
  v_version text := 'mistral-ocr-4-1-document-observation-v2';
BEGIN
  IF p_interpretation_proposal_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review',
      'message', 'La recepción exige una propuesta Mistral vigente.');
  END IF;

  SELECT i.* INTO v_invoice
  FROM public.purchase_invoice_lines l
  JOIN public.purchase_invoices i ON i.id = l.invoice_id
  JOIN public.purchase_interpretation_proposals p
    ON p.id = l.interpretation_proposal_id
  JOIN public.document_extractions e ON e.id = p.document_extraction_id
  WHERE l.id = p_invoice_line_id
    AND l.superseded_by_extraction_id IS NULL
    AND p.id = p_interpretation_proposal_id
    AND e.invoice_id = i.id
    AND e.extractor_version = v_version
    AND e.status = 'success';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review',
      'message', 'La línea activa no procede de una extracción Mistral vigente.');
  END IF;

  -- Dos fotos del mismo papel tienen líneas distintas. La idempotencia por
  -- línea no basta para impedir que ambas creen stock.
  IF v_invoice.duplicate_of_invoice_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'duplicate_invoice',
      'message', 'Esta captura duplica otro albarán y no admite recepción.');
  END IF;

  IF v_invoice.expected_pages IS NULL OR
     1 + (SELECT count(*) FROM public.purchase_invoice_attachments a
      WHERE a.invoice_id = v_invoice.id) < v_invoice.expected_pages
     OR NOT EXISTS (
       SELECT 1 FROM public.document_extractions e
       WHERE e.invoice_id = v_invoice.id
         AND e.file_version_hash = v_invoice.content_sha256
         AND e.extractor_version = v_version AND e.status = 'success'
     )
     OR EXISTS (
       SELECT 1 FROM public.purchase_invoice_attachments a
       WHERE a.invoice_id = v_invoice.id
         AND NOT EXISTS (
           SELECT 1 FROM public.document_extractions e
           WHERE e.invoice_id = v_invoice.id
             AND e.file_version_hash = a.content_sha256
             AND e.extractor_version = v_version AND e.status = 'success'
         )
     ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review',
      'message', 'Falta una extracción Mistral válida para alguna hoja del albarán.');
  END IF;

  RETURN private.apply_receipt_line_with_proposal_idempotent(
    p_invoice_line_id, p_mapping_version_id, p_allocations,
    p_idempotency_key, p_dry_run, p_interpretation_proposal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_receipt_line(uuid, uuid, jsonb, text, boolean, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_receipt_line(uuid, uuid, jsonb, text, boolean, uuid)
  TO authenticated, service_role;
