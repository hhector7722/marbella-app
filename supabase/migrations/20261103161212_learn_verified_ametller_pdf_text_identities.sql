-- Strictly identity-only Ametller PDF-text learning.
-- The supplier SKU, exact label, billing family, historic scanned ingredient and
-- owner-confirmed mapping must agree. Retain original review state; no stock.
CREATE TABLE IF NOT EXISTS private.purchase_verified_identity_learning (
  invoice_line_id uuid PRIMARY KEY REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  source_sha256 text NOT NULL,
  provenance text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.purchase_verified_identity_learning FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON private.purchase_verified_identity_learning TO service_role;

CREATE OR REPLACE FUNCTION public.learn_verified_ametller_pdf_text_identities(
  p_invoice_id uuid, p_preview boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  i public.purchase_invoices%ROWTYPE;
  j public.document_processing_jobs%ROWTYPE;
  e public.document_extractions%ROWTYPE;
  v_count integer;
  v_changed integer := 0;
  v_item record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_invoice_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','service_role_only_or_missing_id');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ametller-pdf-text-identity:'||p_invoice_id::text,0));
  SELECT * INTO i FROM public.purchase_invoices WHERE id=p_invoice_id FOR UPDATE;
  SELECT * INTO j FROM public.document_processing_jobs WHERE invoice_id=p_invoice_id FOR KEY SHARE;
  SELECT * INTO e FROM public.document_extractions WHERE invoice_id=p_invoice_id FOR KEY SHARE;

  IF i.id IS NULL OR j.id IS NULL OR e.id IS NULL
    OR i.supplier_id<>1 OR i.source<>'email' OR i.document_kind<>'monthly_invoice'
    OR i.status<>'pending_mapping' OR i.duplicate_of_invoice_id IS NOT NULL
    OR j.status<>'completed' OR j.replay_mode<>'historical'
    OR j.evidence_extraction_id<>e.id
    OR j.extractor_version<>'ametller-pdf-text-v1'
    OR j.extraction_metrics->>'source_sha'<>i.content_sha256
    OR e.status<>'success' OR e.extractor_version<>'ametller-pdf-text-v1'
    OR e.raw_json_artifact->>'extractor'<>'pdftotext_verified'
    OR e.raw_json_artifact->'provenance'->>'kind'<>'digital_text_pdf_fallback'
    OR e.raw_json_artifact->'provenance'->>'original_sha256'<>i.content_sha256
    OR e.file_version_hash<>i.content_sha256
    OR (SELECT count(*) FROM public.purchase_receipt_confirmations r WHERE r.purchase_invoice_id=i.id)<>0
    OR (SELECT count(*) FROM public.stock_movements s WHERE s.reference_id=i.id)<>0
    OR (SELECT count(*) FROM public.ingredient_price_history h WHERE h.purchase_invoice_id=i.id)<>0
    OR (SELECT count(*) FROM public.purchase_invoice_lines l
         WHERE l.invoice_id=i.id AND l.superseded_by_extraction_id IS NULL)
       <>jsonb_array_length(coalesce(e.raw_json_artifact->'canonical'->'lines','[]'::jsonb))
    OR (SELECT coalesce(sum(l.total_price),0) FROM public.purchase_invoice_lines l
         WHERE l.invoice_id=i.id AND l.superseded_by_extraction_id IS NULL)<>i.base_amount
  THEN
    RETURN jsonb_build_object('ok',false,'reason','fallback_or_existing_effects_not_verified');
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.ametller_safe_identity_candidate (
    line_id uuid PRIMARY KEY,
    ingredient_id uuid NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.ametller_safe_identity_candidate;

  WITH current_lines AS (
    SELECT l.id line_id,l.original_name,l.line_unit,p.observed->>'supplier_product_code_raw' sku
    FROM public.purchase_invoice_lines l
    JOIN public.purchase_interpretation_proposals p ON p.id=l.interpretation_proposal_id
    WHERE l.invoice_id=i.id AND l.superseded_by_extraction_id IS NULL
      AND l.status='pending' AND l.mapped_ingredient_id IS NULL
      AND p.status='needs_mapping'
      AND p.review_reasons=ARRAY['producto_sin_mapping']::text[]
      AND cardinality(p.warnings)=0
      AND p.source_file_hash=i.content_sha256 AND p.document_extraction_id=e.id
      AND p.purchase_invoice_id=i.id AND p.supplier_id=1
      AND p.source_item_name=l.original_name
      AND p.observed->>'supplier_product_code_raw' ~ '^[A-Za-z0-9]{2,12}$'
  ), confirmed AS (
    SELECT c.line_id,
      min(m.ingredient_id::text)::uuid ingredient_id,
      count(DISTINCT m.ingredient_id) distinct_ingredients,
      count(DISTINCT (m.conversion_factor,
        lower(btrim(m.line_content_unit)),
        CASE WHEN lower(btrim(m.line_billing_unit)) IN ('uni','un','ud','unidad','unidades') THEN 'ud'
             WHEN lower(btrim(m.line_billing_unit)) IN ('pac','pack','paq','paquete') THEN 'pack'
             ELSE lower(btrim(m.line_billing_unit)) END)) distinct_physical_presentations
    FROM current_lines c
    JOIN public.purchase_mapping_versions m
      ON m.supplier_id=1 AND m.status='confirmed'
      AND lower(btrim(m.supplier_item_name))=lower(btrim(c.original_name))
    JOIN public.ingredients ing ON ing.id=m.ingredient_id AND ing.archived_at IS NULL
    WHERE m.conversion_factor>0 AND m.line_content_qty>0
      AND m.line_content_unit IS NOT NULL AND btrim(m.line_content_unit)<>''
      AND CASE WHEN lower(btrim(m.line_billing_unit)) IN ('uni','un','ud','unidad','unidades') THEN 'ud'
               WHEN lower(btrim(m.line_billing_unit)) IN ('pac','pack','paq','paquete') THEN 'pack'
               ELSE lower(btrim(m.line_billing_unit)) END
       = CASE WHEN lower(btrim(c.line_unit)) IN ('uni','un','ud','unidad','unidades') THEN 'ud'
               WHEN lower(btrim(c.line_unit)) IN ('pac','pack','paq','paquete') THEN 'pack'
               ELSE lower(btrim(c.line_unit)) END
    GROUP BY c.line_id
  ), scanned AS (
    SELECT c.line_id,
      min(l.mapped_ingredient_id::text)::uuid ingredient_id,
      count(DISTINCT l.mapped_ingredient_id) distinct_ingredients
    FROM current_lines c
    JOIN public.purchase_invoice_lines l ON l.original_name=c.original_name
       AND l.status='mapped' AND l.mapped_ingredient_id IS NOT NULL
    JOIN public.purchase_invoices prior ON prior.id=l.invoice_id
       AND prior.id<>i.id AND prior.supplier_id=1 AND prior.source='scanner'
       AND prior.status='mapped'
    JOIN public.purchase_interpretation_proposals pp ON pp.id=l.interpretation_proposal_id
       AND pp.observed->>'supplier_product_code_raw'=c.sku
    WHERE l.superseded_by_extraction_id IS NULL
    GROUP BY c.line_id
  )
  INSERT INTO pg_temp.ametller_safe_identity_candidate(line_id,ingredient_id)
  SELECT c.line_id,c.ingredient_id FROM confirmed c
  JOIN scanned s ON s.line_id=c.line_id AND s.ingredient_id=c.ingredient_id
  WHERE c.distinct_ingredients=1 AND c.distinct_physical_presentations=1
    AND s.distinct_ingredients=1;

  SELECT count(*) INTO v_count FROM pg_temp.ametller_safe_identity_candidate;
  IF p_preview THEN
    RETURN jsonb_build_object('ok',true,'eligible',true,'applied',false,
      'safe_identity_lines',v_count,'stock_changed',false,'review_state_changed',false);
  END IF;

  FOR v_item IN
    SELECT line_id,ingredient_id FROM pg_temp.ametller_safe_identity_candidate
    ORDER BY line_id
  LOOP
    IF EXISTS (SELECT 1 FROM public.purchase_receipt_confirmations r
       WHERE r.purchase_invoice_line_id=v_item.line_id)
    OR EXISTS (SELECT 1 FROM public.stock_movements sm
       WHERE sm.reference_id=v_item.line_id OR sm.reference_doc='ALB-LINE-'||v_item.line_id::text)
    THEN RAISE EXCEPTION 'Previous physical movement for verified identity line'; END IF;

    UPDATE public.purchase_invoice_lines l
    SET mapped_ingredient_id=v_item.ingredient_id
    WHERE l.id=v_item.line_id AND l.invoice_id=i.id
      AND l.mapped_ingredient_id IS NULL AND l.status='pending'
      AND l.superseded_by_extraction_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent purchase-line edit'; END IF;

    INSERT INTO private.purchase_verified_identity_learning
      (invoice_line_id,invoice_id,ingredient_id,source_sha256,provenance)
    VALUES (v_item.line_id,i.id,v_item.ingredient_id,i.content_sha256,
      'confirmed_exact_supplier_item_unit_and_historic_scanned_sku_v1');
    v_changed:=v_changed+1;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.purchase_receipt_confirmations r
    WHERE r.purchase_invoice_id=i.id)
    OR EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.reference_id=i.id)
    OR EXISTS (SELECT 1 FROM public.purchase_invoice_lines l
       JOIN pg_temp.ametller_safe_identity_candidate c ON c.line_id=l.id
       JOIN public.stock_movements sm ON sm.reference_id=l.id
          OR sm.reference_doc='ALB-LINE-'||l.id::text)
  THEN RAISE EXCEPTION 'Stock effect detected: rollback identity learning'; END IF;

  RETURN jsonb_build_object('ok',true,'applied',true,
    'identities_saved',v_changed,'stock_changed',false,
    'review_state_changed',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.learn_verified_ametller_pdf_text_identities(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.learn_verified_ametller_pdf_text_identities(uuid,boolean) TO service_role;
