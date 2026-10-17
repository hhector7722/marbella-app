-- Repair legacy Gemini errors after a complete, successful historical
-- Mistral replay. This changes only operational OCR flags: K4 remains the sole
-- stock producer and every line still needs its normal review/confirmation.
DO $$
DECLARE
  v_targets uuid[];
  v_eligible integer;
  v_updated integer;
BEGIN
  WITH eligible AS (
    SELECT pi.id
    FROM public.purchase_invoices pi
    WHERE pi.status = 'ocr_failed'
      AND pi.ocr_error LIKE 'Fallo en la extracción (Gemini)%'
      AND pi.invoice_date BETWEEN DATE '2026-09-01' AND DATE '2026-09-15'
      AND pi.content_sha256 IS NOT NULL
      AND 1 + (SELECT count(*) FROM public.purchase_invoice_attachments a
               WHERE a.invoice_id = pi.id) >= COALESCE(pi.expected_pages, 1)
      AND NOT EXISTS (
        SELECT 1
        FROM (
          SELECT pi.content_sha256 AS file_hash
          UNION ALL
          SELECT a.content_sha256 FROM public.purchase_invoice_attachments a
          WHERE a.invoice_id = pi.id
        ) page
        WHERE page.file_hash IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.document_processing_jobs j
          JOIN public.document_extractions e ON e.id = j.evidence_extraction_id
          WHERE j.invoice_id = pi.id
            AND j.file_version_hash = page.file_hash
            AND j.extractor_version = 'mistral-ocr-4-1-document-observation-v2'
            AND j.replay_mode = 'historical'
            AND j.status = 'completed'
            AND e.invoice_id = pi.id
            AND e.status = 'success'
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.document_processing_jobs j
        WHERE j.invoice_id = pi.id
          AND j.extractor_version = 'mistral-ocr-4-1-document-observation-v2'
          AND j.status <> 'completed'
      )
      AND EXISTS (
        SELECT 1 FROM public.purchase_invoice_lines l
        WHERE l.invoice_id = pi.id AND l.superseded_by_extraction_id IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_invoice_lines l
        LEFT JOIN public.purchase_interpretation_proposals p
          ON p.id = l.interpretation_proposal_id
          AND p.purchase_invoice_id = pi.id
          AND p.normalizer_version = 'mistral-pipeline-v3'
        LEFT JOIN public.document_extractions e
          ON e.id = p.document_extraction_id
          AND e.invoice_id = pi.id
          AND e.status = 'success'
        WHERE l.invoice_id = pi.id
          AND l.superseded_by_extraction_id IS NULL
          AND (p.id IS NULL OR e.id IS NULL)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_receipt_confirmations c
        WHERE c.purchase_invoice_id = pi.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_invoice_lines l
        JOIN public.stock_movements sm
          ON sm.movement_type = 'PURCHASE'
          AND (sm.reference_doc = 'ALB-LINE-' || l.id::text
               OR (sm.reference_type = 'purchase_invoice_line'::public.stock_reference_type
                   AND sm.reference_id = l.id))
        WHERE l.invoice_id = pi.id
      )
  )
  SELECT array_agg(id ORDER BY id), count(*)
  INTO v_targets, v_eligible
  FROM eligible;

  -- Replaying this data migration after production was repaired is a no-op.
  IF v_eligible = 0 THEN RETURN; END IF;
  IF v_eligible <> 4 THEN
    RAISE EXCEPTION 'Stale Gemini repair expected four eligible invoices, found %',
      v_eligible;
  END IF;

  UPDATE public.purchase_invoices
  SET status = 'pending_mapping', ocr_error = NULL
  WHERE id = ANY(v_targets);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_eligible THEN
    RAISE EXCEPTION 'Stale Gemini repair updated % invoices, expected %',
      v_updated, v_eligible;
  END IF;

  UPDATE public.purchase_invoice_attachments a
  SET ocr_status = 'done', ocr_error = NULL
  WHERE a.invoice_id = ANY(v_targets)
    AND a.ocr_status = 'failed'
    AND a.ocr_error LIKE 'Fallo en la extracción (Gemini)%';
END;
$$;
