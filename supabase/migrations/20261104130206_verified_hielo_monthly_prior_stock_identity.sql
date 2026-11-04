-- Hielo Fénix: immutable proof of a monthly invoice corresponding to exactly
-- one previously scanned 2kg bag delivery (60g cubes).
-- Identity + prior stock correlation ONLY. No approval of inconsistent economics.
-- Never inserts stock movements, receipt confirmations, or price updates.
CREATE TABLE IF NOT EXISTS private.purchase_hielo_prior_stock_correlations (
  invoice_line_id uuid PRIMARY KEY REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
  prior_line_id uuid NOT NULL UNIQUE REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
  prior_receipt_id uuid NOT NULL UNIQUE REFERENCES public.purchase_receipt_confirmations(id) ON DELETE RESTRICT,
  prior_stock_movement_id uuid NOT NULL UNIQUE REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  original_pdf_sha256 text NOT NULL CHECK(original_pdf_sha256 ~ '^[0-9a-f]{64}$'),
  invoice_total numeric(16,2) NOT NULL CHECK(invoice_total>0),
  printed_line_total numeric(16,2) NOT NULL,
  discrepancy_cents integer NOT NULL,
  original_month date NOT NULL,
  has_verified_financial_cert boolean NOT NULL DEFAULT false,
  rule_version text NOT NULL DEFAULT 'hielo_prior_monthly_receipt_identity_only_v1',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.purchase_hielo_prior_stock_correlations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_hielo_prior_stock_correlations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON private.purchase_hielo_prior_stock_correlations TO service_role;

CREATE OR REPLACE FUNCTION public.learn_verified_hielo_prior_monthly_identity_v1(
 p_invoice_id uuid,p_preview boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_i public.purchase_invoices%ROWTYPE;
 v_l public.purchase_invoice_lines%ROWTYPE;
 v_p public.purchase_interpretation_proposals%ROWTYPE;
 v_e public.document_extractions%ROWTYPE;
 v_job public.document_processing_jobs%ROWTYPE;
 v_mail public.purchase_email_documents%ROWTYPE;
 v_srow jsonb;
 v_old public.purchase_invoice_lines%ROWTYPE;
 v_old_i public.purchase_invoices%ROWTYPE;
 v_receipt public.purchase_receipt_confirmations%ROWTYPE;
 v_stock public.stock_movements%ROWTYPE;
 v_ingredient public.ingredients%ROWTYPE;
 v_current private.purchase_hielo_prior_stock_correlations%ROWTYPE;
 v_count integer;
 v_discrepancy integer;
 v_first date;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_invoice_id IS NULL
 THEN RETURN jsonb_build_object('ok',false,'reason','service_role_only'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hielo-prior-month:'||p_invoice_id::text,0));
 SELECT * INTO v_i FROM public.purchase_invoices WHERE id=p_invoice_id FOR UPDATE;
 IF v_i.id IS NULL OR v_i.source<>'email' OR v_i.supplier_id<>13
    OR v_i.document_kind<>'monthly_invoice' OR v_i.status<>'pending_mapping'
    OR v_i.duplicate_of_invoice_id IS NOT NULL OR v_i.expected_pages<>1
    OR v_i.invoice_date IS NULL OR extract(day from v_i.invoice_date)>10
    OR v_i.content_sha256 !~ '^[a-f0-9]{64}$'
    OR v_i.base_amount<=0 OR v_i.tax_amount<0 OR v_i.total_amount<=0
    OR round(v_i.base_amount+v_i.tax_amount,2)<>v_i.total_amount
    OR round(v_i.base_amount*0.10,2)<>v_i.tax_amount
    OR EXISTS(SELECT 1 FROM public.purchase_invoice_attachments a WHERE a.invoice_id=v_i.id)
 THEN RETURN jsonb_build_object('ok',false,'reason','invoice_not_unique_hielo_monthly_source'); END IF;

 SELECT * INTO v_l FROM public.purchase_invoice_lines WHERE invoice_id=v_i.id
   AND superseded_by_extraction_id IS NULL FOR UPDATE;
 SELECT count(*) INTO v_count FROM public.purchase_invoice_lines
   WHERE invoice_id=v_i.id AND superseded_by_extraction_id IS NULL;
 IF v_count<>1 OR v_l.id IS NULL OR v_l.original_name<>'Glaçons 60gr'
    OR v_l.status<>'pending' OR v_l.quantity<=0
    OR v_l.line_unit IS NOT NULL
    OR (v_l.mapped_ingredient_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM private.purchase_hielo_prior_stock_correlations h
        WHERE h.invoice_line_id=v_l.id AND h.ingredient_id=v_l.mapped_ingredient_id))
 THEN RETURN jsonb_build_object('ok',false,'reason','source_product_not_unambiguously_unmapped'); END IF;
 SELECT * INTO v_current FROM private.purchase_hielo_prior_stock_correlations
  WHERE invoice_line_id=v_l.id;
 IF v_current.invoice_line_id IS NOT NULL
 THEN RETURN jsonb_build_object('ok',true,'eligible',false,'idempotent',true,
   'prior_receipt_id',v_current.prior_receipt_id,
   'ingredient_id',v_current.ingredient_id,'stock_changed',false,
   'economic_mismatch_remaining',true); END IF;

 SELECT * INTO v_p FROM public.purchase_interpretation_proposals
  WHERE id=v_l.interpretation_proposal_id FOR KEY SHARE;
 SELECT * INTO v_e FROM public.document_extractions
  WHERE id=v_p.document_extraction_id FOR KEY SHARE;
 SELECT * INTO v_job FROM public.document_processing_jobs
  WHERE invoice_id=v_i.id FOR KEY SHARE;
 SELECT * INTO v_mail FROM public.purchase_email_documents
  WHERE invoice_id=v_i.id FOR KEY SHARE;
 IF v_p.id IS NULL OR v_e.id IS NULL OR v_job.id IS NULL OR v_mail.id IS NULL
   OR v_p.purchase_invoice_id<>v_i.id OR v_p.supplier_id<>13
   OR v_p.document_extraction_id<>v_e.id OR v_p.source_file_hash<>v_i.content_sha256
   OR v_p.normalizer_version<>'mistral-pipeline-v3'
   OR v_p.source_item_name<>v_l.original_name
   OR v_p.status<>'needs_mapping' OR v_p.ingredient_id IS NOT NULL
   OR v_p.mapping_version_id IS NOT NULL
   OR NOT ('cantidad_precio_importe_no_reconcilian'=ANY(v_p.review_reasons))
   OR NOT ('producto_sin_mapping'=ANY(v_p.review_reasons))
   OR v_p.line_quantity<>v_l.quantity OR v_p.line_total<>v_l.total_price
   OR v_p.provenance->>'source'<>'mistral_canonical'
   OR v_p.provenance->>'trigger'<>'mistral_job_completion'
   OR v_p.provenance->>'schema_version'<>'mistral-pipeline-v3'
   OR v_p.provenance ? 'revision'
   OR v_e.invoice_id<>v_i.id OR v_e.status<>'success'
   OR v_e.extractor_version<>'mistral-ocr-4-1-document-observation-v2'
   OR v_e.file_version_hash<>v_i.content_sha256
   OR v_e.raw_json_artifact->>'extractor'<>'mistral'
   OR v_job.status<>'completed' OR v_job.evidence_extraction_id<>v_e.id
   OR v_job.file_version_hash<>v_i.content_sha256
   OR v_mail.status<>'imported' OR v_mail.supplier_id<>13
   OR v_mail.content_sha256<>v_i.content_sha256
   OR v_mail.storage_path<>v_i.file_path
   OR lower(v_mail.sender_email)<>'facturas@hielofenix.cat'
   OR NOT EXISTS(SELECT 1 FROM public.purchase_supplier_sender_addresses a
      WHERE a.supplier_id=13 AND a.confirmed_by_owner
        AND lower(a.sender_email)=lower(v_mail.sender_email))
 THEN RETURN jsonb_build_object('ok',false,'reason','email_ocr_or_supplier_identity_not_verified'); END IF;

 IF jsonb_array_length(v_e.raw_json_artifact->'canonical'->'lines')<>1
    OR v_e.raw_json_artifact->'canonical'->>'document_number_raw'<>v_i.invoice_number
    OR replace(v_e.raw_json_artifact->'canonical'->>'subtotal_raw',',','.')::numeric<>v_i.base_amount
    OR replace(v_e.raw_json_artifact->'canonical'->>'tax_raw',',','.')::numeric<>v_i.tax_amount
    OR replace(v_e.raw_json_artifact->'canonical'->>'total_raw',',','.')::numeric<>v_i.total_amount
 THEN RETURN jsonb_build_object('ok',false,'reason','ocr_header_not_equal_document'); END IF;
 v_srow:=v_e.raw_json_artifact->'canonical'->'lines'->0;
 IF v_srow->>'description_raw'<>'Glaçons 60gr'
  OR v_p.observed->>'description_raw'<>v_srow->>'description_raw'
  OR v_p.observed->>'quantity_raw'<>v_srow->>'quantity_raw'
  OR v_p.observed->>'line_total_raw'<>v_srow->>'line_total_raw'
  OR v_srow->>'tax_rate_raw'<>'10%'
  OR v_srow->>'content_per_unit_raw'<>'60gr'
  OR replace(v_srow->>'quantity_raw',',','.')::numeric<>v_l.quantity
  OR replace(v_srow->>'line_total_raw',',','.')::numeric<>v_l.total_price
  OR replace(v_srow->>'unit_price_raw',',','.')::numeric<>v_l.unit_price
 THEN RETURN jsonb_build_object('ok',false,'reason','ocr_source_line_not_exact'); END IF;
 -- Gross total and the detail-row gross price can differ by one cent as in
 -- the verified PDF. Flag it, but never change financial totals or clear review.
 v_discrepancy:=round((v_i.total_amount-v_l.total_price)*100)::integer;
 IF abs(v_discrepancy)>1 OR v_l.total_price<=0
 THEN RETURN jsonb_build_object('ok',false,'reason','printed_gross_row_not_matching_header'); END IF;
 v_first:=(date_trunc('month',v_i.invoice_date)-interval '1 month')::date;

 SELECT count(*) INTO v_count
 FROM public.purchase_receipt_confirmations r
 JOIN public.purchase_invoice_lines l ON l.id=r.purchase_invoice_line_id
 JOIN public.purchase_invoices i ON i.id=l.invoice_id
 JOIN public.ingredients g ON g.id=r.ingredient_id
 JOIN public.stock_movements sm ON sm.id=r.stock_movement_id
 WHERE i.supplier_id=13 AND i.source='scanner' AND i.status='mapped'
  AND i.invoice_date>=v_first
  AND i.invoice_date<date_trunc('month',v_i.invoice_date)::date
  AND l.superseded_by_extraction_id IS NULL
  AND l.original_name='Bossa de 2 Kg. (60 g.)'
  AND l.status='mapped' AND l.line_unit='bossa'
  AND l.quantity=v_l.quantity AND l.total_price=v_i.total_amount
  AND l.mapped_ingredient_id=g.id
  AND g.name='Hielo' AND g.archived_at IS NULL
  AND g.purchase_unit='kg' AND g.base_unit='g'
  AND r.physical_quantity=l.quantity*2000
  AND r.base_unit='g' AND r.purchase_quantity=l.quantity*2
  AND r.purchase_unit='kg'
  AND sm.movement_type='PURCHASE' AND sm.quantity=r.physical_quantity
  AND sm.unit=r.base_unit AND sm.ingredient_id=g.id
  AND sm.reference_id=l.id AND sm.origin='receipt_confirmation'
  AND NOT EXISTS(SELECT 1 FROM public.stock_movements reversal
     WHERE reversal.reversal_of_movement_id=sm.id AND reversal.origin='reversal');
 IF v_count<>1
 THEN RETURN jsonb_build_object('ok',false,'reason','historical_delivery_not_unique','matches',v_count); END IF;

 SELECT l.* INTO v_old
 FROM public.purchase_receipt_confirmations r
 JOIN public.purchase_invoice_lines l ON l.id=r.purchase_invoice_line_id
 JOIN public.purchase_invoices i ON i.id=l.invoice_id
 JOIN public.ingredients g ON g.id=r.ingredient_id
 JOIN public.stock_movements sm ON sm.id=r.stock_movement_id
 WHERE i.supplier_id=13 AND i.source='scanner' AND i.status='mapped'
  AND i.invoice_date>=v_first
  AND i.invoice_date<date_trunc('month',v_i.invoice_date)::date
  AND l.superseded_by_extraction_id IS NULL
  AND l.original_name='Bossa de 2 Kg. (60 g.)'
  AND l.status='mapped' AND l.line_unit='bossa'
  AND l.quantity=v_l.quantity AND l.total_price=v_i.total_amount
  AND l.mapped_ingredient_id=g.id AND g.name='Hielo' AND g.archived_at IS NULL
  AND g.purchase_unit='kg' AND g.base_unit='g'
  AND r.physical_quantity=l.quantity*2000 AND r.base_unit='g'
  AND r.purchase_quantity=l.quantity*2 AND r.purchase_unit='kg'
  AND sm.movement_type='PURCHASE' AND sm.quantity=r.physical_quantity
  AND sm.unit=r.base_unit AND sm.ingredient_id=g.id
  AND sm.reference_id=l.id AND sm.origin='receipt_confirmation'
  AND NOT EXISTS(SELECT 1 FROM public.stock_movements reversal
     WHERE reversal.reversal_of_movement_id=sm.id AND reversal.origin='reversal')
 FOR KEY SHARE OF l;
 SELECT * INTO v_old_i FROM public.purchase_invoices WHERE id=v_old.invoice_id FOR KEY SHARE;
 SELECT * INTO v_receipt FROM public.purchase_receipt_confirmations WHERE purchase_invoice_line_id=v_old.id FOR KEY SHARE;
 SELECT * INTO v_stock FROM public.stock_movements WHERE id=v_receipt.stock_movement_id FOR KEY SHARE;
 SELECT * INTO v_ingredient FROM public.ingredients WHERE id=v_receipt.ingredient_id FOR KEY SHARE;
 IF v_old.id IS NULL OR v_receipt.id IS NULL OR v_stock.id IS NULL OR v_ingredient.id IS NULL
  OR EXISTS(SELECT 1 FROM private.purchase_hielo_prior_stock_correlations c
      WHERE c.prior_line_id=v_old.id OR c.prior_receipt_id=v_receipt.id
       OR c.prior_stock_movement_id=v_stock.id)
  OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r WHERE r.purchase_invoice_line_id=v_l.id)
  OR EXISTS(SELECT 1 FROM public.stock_movements s
      WHERE s.reference_id=v_l.id OR s.reference_doc='ALB-LINE-'||v_l.id::text)
  OR EXISTS(SELECT 1 FROM public.ingredient_price_history h WHERE h.purchase_invoice_line_id=v_l.id)
 THEN RETURN jsonb_build_object('ok',false,'reason','receipt_already_reconciled_or_duplicate_stock'); END IF;
 IF p_preview THEN RETURN jsonb_build_object('ok',true,'eligible',true,
    'invoice',v_i.invoice_number,'ingredient_id',v_ingredient.id,
    'historical_receipt_id',v_receipt.id,'historical_physical_g',v_stock.quantity,
    'header_total',v_i.total_amount,'printed_line_total',v_l.total_price,
    'discrepancy_cents',v_discrepancy,'economic_mismatch_remaining',true,
    'stock_changed',false,'review_state_changed',false); END IF;
 INSERT INTO private.purchase_hielo_prior_stock_correlations (
   invoice_line_id,invoice_id,prior_line_id,prior_receipt_id,
   prior_stock_movement_id,ingredient_id,original_pdf_sha256,invoice_total,
   printed_line_total,discrepancy_cents,original_month,has_verified_financial_cert)
 VALUES(v_l.id,v_i.id,v_old.id,v_receipt.id,v_stock.id,v_ingredient.id,
    v_i.content_sha256,v_i.total_amount,v_l.total_price,v_discrepancy,v_first,false);
 INSERT INTO private.purchase_verified_identity_learning(
   invoice_line_id,invoice_id,ingredient_id,source_sha256,provenance)
 VALUES(v_l.id,v_i.id,v_ingredient.id,v_i.content_sha256,
    'hielo_unique_prior_month_60g_2kg_scanned_receipt_gross_match_v1');
 UPDATE public.purchase_invoice_lines
  SET mapped_ingredient_id=v_ingredient.id WHERE id=v_l.id
  AND status='pending' AND mapped_ingredient_id IS NULL
  AND invoice_id=v_i.id AND interpretation_proposal_id=v_p.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Hielo line changed concurrently; rollback'; END IF;
 RETURN jsonb_build_object('ok',true,'eligible',true,'applied',true,
  'invoice',v_i.invoice_number,'ingredient_id',v_ingredient.id,
  'historical_receipt_id',v_receipt.id,'historical_physical_g',v_stock.quantity,
  'economic_mismatch_remaining',true,
  'discrepancy_cents',v_discrepancy,'stock_changed',false,
  'review_state_changed',false);
END;
$f$;
REVOKE ALL ON FUNCTION public.learn_verified_hielo_prior_monthly_identity_v1(uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.learn_verified_hielo_prior_monthly_identity_v1(uuid,boolean)
 TO service_role;
