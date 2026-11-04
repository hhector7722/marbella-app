-- For Ametller monthly invoices only: identify a previously unidentified line
-- using a *specific* already-posted delivery receipt. No new inventory.
-- The existing v4 ledger guard independently certifies the original SHA-linked
-- PDF delivery group, source SKU, quantity, amount and the previous stock movement.
CREATE OR REPLACE FUNCTION public.reconcile_verified_ametller_prior_receipt_v1(
 p_invoice_line uuid,
 p_prior_delivery_line uuid,
 p_delivery_ref text,
 p_delivery_date date,
 p_preview boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_l public.purchase_invoice_lines%ROWTYPE;
 v_i public.purchase_invoices%ROWTYPE;
 v_p public.purchase_interpretation_proposals%ROWTYPE;
 v_old public.purchase_invoice_lines%ROWTYPE;
 v_old_i public.purchase_invoices%ROWTYPE;
 v_old_p public.purchase_interpretation_proposals%ROWTYPE;
 v_map_ingredients int;
 v_map_presentations int;
 v_stock public.purchase_receipt_confirmations%ROWTYPE;
 v_result jsonb;
 v_review jsonb;
 v_sku text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RETURN jsonb_build_object('ok',false,'reason','service_role_only');
 END IF;
 IF p_invoice_line IS NULL OR p_prior_delivery_line IS NULL OR
    p_invoice_line=p_prior_delivery_line OR p_delivery_date IS NULL OR
    nullif(trim(p_delivery_ref),'') IS NULL
 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_source_parameters'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_invoice_line::text,8421));
 SELECT * INTO v_l FROM public.purchase_invoice_lines WHERE id=p_invoice_line FOR UPDATE;
 SELECT * INTO v_i FROM public.purchase_invoices WHERE id=v_l.invoice_id FOR KEY SHARE;
 SELECT * INTO v_p FROM public.purchase_interpretation_proposals
    WHERE id=v_l.interpretation_proposal_id FOR KEY SHARE;
 SELECT * INTO v_old FROM public.purchase_invoice_lines
    WHERE id=p_prior_delivery_line FOR KEY SHARE;
 SELECT * INTO v_old_i FROM public.purchase_invoices WHERE id=v_old.invoice_id FOR KEY SHARE;
 SELECT * INTO v_old_p FROM public.purchase_interpretation_proposals
    WHERE id=v_old.interpretation_proposal_id FOR KEY SHARE;
 SELECT * INTO v_stock FROM public.purchase_receipt_confirmations
    WHERE purchase_invoice_line_id=v_old.id FOR KEY SHARE;
 v_sku:=v_p.observed->>'supplier_product_code_raw';
 IF v_l.id IS NULL OR v_i.id IS NULL OR v_p.id IS NULL OR
    v_old.id IS NULL OR v_old_i.id IS NULL OR v_old_p.id IS NULL OR v_stock.id IS NULL
    OR v_i.supplier_id<>1 OR v_old_i.supplier_id<>1
    OR v_i.source<>'email' OR v_i.document_kind<>'monthly_invoice'
    OR v_i.status<>'pending_mapping' OR v_i.duplicate_of_invoice_id IS NOT NULL
    OR v_old_i.source<>'scanner' OR v_old_i.status<>'mapped'
    OR v_old_i.invoice_date<>p_delivery_date
    OR v_l.status<>'pending' OR v_l.mapped_ingredient_id IS NOT NULL
    OR v_l.superseded_by_extraction_id IS NOT NULL
    OR v_old.status<>'mapped' OR v_old.mapped_ingredient_id IS NULL
    OR v_old.superseded_by_extraction_id IS NOT NULL
    OR v_l.original_name<>v_old.original_name
    OR v_l.line_unit<>v_old.line_unit
    OR v_l.quantity<>v_old.quantity
    OR abs(v_l.total_price-v_old.total_price)>0.011
    OR v_p.status<>'needs_mapping' OR v_p.ingredient_id IS NOT NULL
    OR v_p.mapping_version_id IS NOT NULL
    OR v_p.review_reasons<>ARRAY['producto_sin_mapping']::text[]
    OR cardinality(v_p.warnings)>0
    OR v_p.purchase_invoice_id<>v_i.id
    OR v_p.supplier_id<>1 OR v_p.source_file_hash<>v_i.content_sha256
    OR v_p.source_item_name<>v_l.original_name
    OR v_p.normalizer_version<>'ametller-pdf-text-v1'
    OR v_p.provenance->>'source'<>'pdf_text_verified'
    OR v_p.provenance->>'trigger'<>'original_text_fallback'
    OR v_p.provenance->>'original_source_sha'<>v_i.content_sha256
    OR v_old_p.observed->>'supplier_product_code_raw' IS DISTINCT FROM v_sku
    OR length(trim(v_sku))<3 OR v_old_p.supplier_id<>1
    OR v_stock.ingredient_id<>v_old.mapped_ingredient_id
    OR v_stock.purchase_invoice_line_id<>v_old.id
    OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r
        WHERE r.purchase_invoice_line_id=v_l.id)
    OR EXISTS(SELECT 1 FROM public.stock_movements sm
        WHERE sm.reference_id=v_l.id OR sm.reference_doc='ALB-LINE-'||v_l.id::text)
 THEN RETURN jsonb_build_object('ok',false,'reason','source_or_prior_receipt_not_exactly_verified'); END IF;

 -- Every confirmed presentation for the same SKU/label must identify a
 -- unique ingredient and compatible physical package. In particular, no
 -- new conversion may be invented from an email's free text.
 SELECT count(DISTINCT m.ingredient_id),
        count(DISTINCT (m.ingredient_id,m.conversion_factor,m.line_content_qty,
          lower(trim(m.line_content_unit)),lower(trim(m.line_billing_unit))))
 INTO v_map_ingredients,v_map_presentations
 FROM public.purchase_mapping_versions m
 JOIN public.ingredients ing ON ing.id=m.ingredient_id
 WHERE m.supplier_id=1 AND m.status='confirmed'
   AND lower(trim(m.supplier_item_name))=lower(trim(v_l.original_name))
   AND m.line_billing_unit IS NOT NULL
   AND lower(trim(m.line_billing_unit))=lower(trim(v_l.line_unit))
   AND m.ingredient_id=v_old.mapped_ingredient_id
   AND ing.archived_at IS NULL
   AND m.line_content_qty>0 AND m.conversion_factor>0
   AND abs(m.conversion_factor-
       private.k4_convert_quantity(m.line_content_qty,m.line_content_unit,ing.purchase_unit))<=0.00000001
   AND private.k4_base_unit_for_purchase_unit(ing.purchase_unit)=ing.base_unit;
 IF v_map_ingredients<>1 OR v_map_presentations<>1 OR
    EXISTS(SELECT 1 FROM public.purchase_mapping_versions m
       WHERE m.supplier_id=1 AND m.status='confirmed'
         AND lower(trim(m.supplier_item_name))=lower(trim(v_l.original_name))
         AND m.ingredient_id<>v_old.mapped_ingredient_id)
 THEN RETURN jsonb_build_object('ok',false,'reason','mapping_or_physical_presentation_ambiguous'); END IF;

 IF p_preview THEN
  -- Subtransaction: run the *real* v4 preflight with temporary identity, then
  -- roll back the identity even if the preview succeeds.
  BEGIN
   UPDATE public.purchase_invoice_lines
    SET mapped_ingredient_id=v_old.mapped_ingredient_id WHERE id=v_l.id;
   v_review:=public.record_verified_invoice_delivery_reconciliation_v4(
     p_invoice_line,p_prior_delivery_line,p_delivery_ref,p_delivery_date,true);
   RAISE EXCEPTION 'REVERT_IDENTITY_PROBE_ONLY' USING ERRCODE='P0001';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM<>'REVERT_IDENTITY_PROBE_ONLY' THEN RAISE; END IF;
  END;
  RETURN v_review || jsonb_build_object('stock_changed',false,'identity_preview_only',true);
 END IF;

 UPDATE public.purchase_invoice_lines
  SET mapped_ingredient_id=v_old.mapped_ingredient_id
 WHERE id=v_l.id AND mapped_ingredient_id IS NULL AND status='pending'
   AND interpretation_proposal_id=v_p.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invoice line changed concurrently'; END IF;
 v_review:=public.record_verified_invoice_delivery_reconciliation_v4(
    p_invoice_line,p_prior_delivery_line,p_delivery_ref,p_delivery_date,true);
 IF v_review->>'ok'<>'true' OR v_review->>'eligible'<>'true'
 THEN RAISE EXCEPTION 'Prior delivery proof rejected: %',left(coalesce(v_review->>'reason','unknown'),100); END IF;
 v_result:=public.record_verified_invoice_delivery_reconciliation_v4(
    p_invoice_line,p_prior_delivery_line,p_delivery_ref,p_delivery_date,false);
 IF v_result->>'ok'<>'true' OR v_result->>'applied'<>'true' OR
    v_result->>'stock_changed'<>'false'
 THEN RAISE EXCEPTION 'Atomic reconciliation failed: %',left(coalesce(v_result->>'reason','unknown'),100); END IF;
 INSERT INTO private.purchase_verified_identity_learning
 (invoice_line_id,invoice_id,ingredient_id,source_sha256,provenance)
 VALUES(v_l.id,v_i.id,v_old.mapped_ingredient_id,v_i.content_sha256,
 'exact_scanned_receipt_sku_supplier_name_units_quantity_amount_original_pdf_delivery_v1');
 RETURN jsonb_build_object('ok',true,'applied',true,'stock_changed',false,
  'invoice_line',v_l.id,'prior_delivery_line',v_old.id,
  'ingredient_id',v_old.mapped_ingredient_id,
  'verified_source',true,'reconciliation',v_result);
END;
$f$;
REVOKE ALL ON FUNCTION public.reconcile_verified_ametller_prior_receipt_v1(uuid,uuid,text,date,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_verified_ametller_prior_receipt_v1(uuid,uuid,text,date,boolean)
  TO service_role;
