-- Correct one OCR cent against independently verified original SERHS PDF.
-- Original bytes SHA256: 2094253d65dea4d762f49e1ba7090dead591ffe89c746389d6cd6fd3b81382f1
-- PDF prints TOTAL 335,78; printed base 303,26 + VAT 32,52 = 335,78.
-- Never alter original OCR evidence, line mappings, stock or price history.
CREATE TABLE IF NOT EXISTS private.purchase_invoice_original_pdf_amount_corrections (
 invoice_id uuid PRIMARY KEY REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
 source_sha256 text NOT NULL,
 original_observed_total numeric(12,2) NOT NULL,
 corrected_original_pdf_total numeric(12,2) NOT NULL,
 pdf_verified_base numeric(12,2) NOT NULL,
 pdf_verified_tax numeric(12,2) NOT NULL,
 source_note text NOT NULL,
 applied_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.purchase_invoice_original_pdf_amount_corrections FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON private.purchase_invoice_original_pdf_amount_corrections TO service_role;

CREATE OR REPLACE FUNCTION public.correct_verified_serhs_654_pdf_total(
 p_preview boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 v_id uuid := '8045fa1f-4612-46b4-848c-f90471e8eda3';
 v_hash text := '2094253d65dea4d762f49e1ba7090dead591ffe89c746389d6cd6fd3b81382f1';
 v_i public.purchase_invoices%ROWTYPE;
 v_e public.document_extractions%ROWTYPE;
 v_j public.document_processing_jobs%ROWTYPE;
 v_mail public.purchase_email_documents%ROWTYPE;
 v_line_count integer;
 v_sum numeric;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RETURN jsonb_build_object('ok',false,'reason','service_role_only');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('serhs-original-pdf-total:'||v_id::text,0));
 SELECT * INTO v_i FROM public.purchase_invoices WHERE id=v_id FOR UPDATE;
 SELECT * INTO v_e FROM public.document_extractions WHERE invoice_id=v_id FOR KEY SHARE;
 SELECT * INTO v_j FROM public.document_processing_jobs WHERE invoice_id=v_id FOR KEY SHARE;
 SELECT * INTO v_mail FROM public.purchase_email_documents WHERE invoice_id=v_id FOR KEY SHARE;
 SELECT count(*),sum(total_price) INTO v_line_count,v_sum
 FROM public.purchase_invoice_lines l
 WHERE l.invoice_id=v_id AND l.superseded_by_extraction_id IS NULL;
 IF v_i.id IS NULL OR v_e.id IS NULL OR v_j.id IS NULL OR v_mail.id IS NULL
   OR v_i.source<>'email' OR v_i.supplier_id<>8
   OR v_i.invoice_number<>'FV826/091654' OR v_i.invoice_date<>'2026-10-29'::date
   OR v_i.status<>'pending_mapping' OR v_i.document_kind IS NOT NULL
   OR v_i.duplicate_of_invoice_id IS NOT NULL
   OR v_i.content_sha256<>v_hash OR v_i.expected_pages<>1
   OR v_i.base_amount<>303.26 OR v_i.tax_amount<>32.52 OR v_i.total_amount<>335.79
   OR v_e.file_version_hash<>v_hash OR v_e.status<>'success'
   OR v_e.extractor_version<>'mistral-ocr-4-1-document-observation-v2'
   OR v_e.raw_json_artifact->>'extractor'<>'mistral'
   OR v_e.raw_json_artifact->>'model'<>'mistral-ocr-4-1'
   OR v_e.raw_json_artifact->'canonical'->>'document_number_raw'<>'FV826/091654'
   OR v_e.raw_json_artifact->'canonical'->>'subtotal_raw'<>'303,26'
   OR v_e.raw_json_artifact->'canonical'->>'tax_raw'<>'32,52'
   OR v_e.raw_json_artifact->'canonical'->>'total_raw'<>'335,79'
   OR v_j.status<>'completed' OR v_j.evidence_extraction_id<>v_e.id
   OR v_j.file_version_hash<>v_hash
   OR v_mail.status<>'imported' OR v_mail.content_sha256<>v_hash
   OR v_mail.storage_path<>v_i.file_path OR v_mail.supplier_id<>8
   OR lower(v_mail.sender_email)<>'grupserhs@grupserhs.com'
   OR NOT EXISTS (
       SELECT 1 FROM public.purchase_supplier_sender_addresses a
       WHERE a.supplier_id=8 AND a.confirmed_by_owner
        AND lower(a.sender_email)=lower(v_mail.sender_email))
   OR v_line_count<>4 OR v_sum<>303.26
   OR 303.26+32.52<>335.78
   OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r WHERE r.purchase_invoice_id=v_id)
   OR EXISTS(SELECT 1 FROM public.stock_movements s WHERE s.reference_id=v_id)
   OR EXISTS(SELECT 1 FROM private.purchase_invoice_original_pdf_amount_corrections c WHERE c.invoice_id=v_id)
 THEN RETURN jsonb_build_object('ok',false,'reason','source_or_amount_state_not_verified'); END IF;
 IF p_preview THEN
   RETURN jsonb_build_object('ok',true,'eligible',true,'applied',false,
      'invoice','FV826/091654','recorded_total',335.79,
      'original_pdf_total',335.78,'stock_changed',false);
 END IF;
 UPDATE public.purchase_invoices SET total_amount=335.78
 WHERE id=v_id AND total_amount=335.79 AND base_amount=303.26 AND tax_amount=32.52;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original invoice changed concurrently'; END IF;
 INSERT INTO private.purchase_invoice_original_pdf_amount_corrections(
   invoice_id,source_sha256,original_observed_total,corrected_original_pdf_total,
   pdf_verified_base,pdf_verified_tax,source_note
 ) VALUES (
   v_id,v_hash,335.79,335.78,303.26,32.52,
   'Independent pdftotext from SHA256-verified original: printed subtotal 303,26; IVA 32,52; TOTAL 335,78. OCR incorrectly reported 335,79.'
 );
 RETURN jsonb_build_object('ok',true,'applied',true,'invoice','FV826/091654',
   'previous_total',335.79,'corrected_total',335.78,'stock_changed',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.correct_verified_serhs_654_pdf_total(boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.correct_verified_serhs_654_pdf_total(boolean) TO service_role;
