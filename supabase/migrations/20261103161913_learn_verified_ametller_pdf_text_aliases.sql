-- Supplier-specific, source-SKU-bound ingredient aliases for a verified
-- Ametller monthly PDF-text extraction. Correct stale erroneous mappings
-- only when the latest confirmed version points to the semantically exact item.
-- Identity-only: no receipt, price, stock or review status changes.
CREATE OR REPLACE FUNCTION public.learn_verified_ametller_pdf_text_aliases(
 p_invoice_id uuid,p_preview boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 i public.purchase_invoices%ROWTYPE;
 j public.document_processing_jobs%ROWTYPE;
 e public.document_extractions%ROWTYPE;
 c record;
 v_count int:=0;
 v_lines jsonb:='[]'::jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_invoice_id IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','service_role_only');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('ametller-pdf-text-alias:'||p_invoice_id::text,0));
 SELECT * INTO i FROM public.purchase_invoices WHERE id=p_invoice_id FOR UPDATE;
 SELECT * INTO j FROM public.document_processing_jobs WHERE invoice_id=i.id FOR KEY SHARE;
 SELECT * INTO e FROM public.document_extractions WHERE invoice_id=i.id FOR KEY SHARE;
 IF i.id IS NULL OR j.id IS NULL OR e.id IS NULL
    OR i.supplier_id<>1 OR i.source<>'email' OR i.status<>'pending_mapping'
    OR i.document_kind<>'monthly_invoice' OR i.duplicate_of_invoice_id IS NOT NULL
    OR j.status<>'completed' OR j.replay_mode<>'historical'
    OR j.evidence_extraction_id<>e.id
    OR j.extractor_version<>'ametller-pdf-text-v1'
    OR j.extraction_metrics->>'source_sha'<>i.content_sha256
    OR e.status<>'success' OR e.extractor_version<>'ametller-pdf-text-v1'
    OR e.file_version_hash<>i.content_sha256
    OR e.raw_json_artifact->>'extractor'<>'pdftotext_verified'
    OR e.raw_json_artifact->'provenance'->>'original_sha256'<>i.content_sha256
    OR e.raw_json_artifact->'provenance'->>'stock_changed'<>'false'
    OR (SELECT count(*) FROM public.purchase_receipt_confirmations r WHERE r.purchase_invoice_id=i.id)>0
    OR (SELECT count(*) FROM public.stock_movements s WHERE s.reference_id=i.id)>0
    OR (SELECT count(*) FROM public.ingredient_price_history p WHERE p.purchase_invoice_id=i.id)>0
    OR (SELECT coalesce(sum(l.total_price),0) FROM public.purchase_invoice_lines l WHERE l.invoice_id=i.id AND l.superseded_by_extraction_id IS NULL)<>i.base_amount
    OR (SELECT count(*) FROM public.purchase_invoice_lines l WHERE l.invoice_id=i.id AND l.superseded_by_extraction_id IS NULL)<>jsonb_array_length(coalesce(e.raw_json_artifact->'canonical'->'lines','[]'::jsonb))
 THEN RETURN jsonb_build_object('ok',false,'reason','verified_fallback_or_stock_constraint_failed'); END IF;

 FOR c IN
 WITH specs(sku,original_label,billing,ingredient_name,confirmed_label,factor,content_qty,content_unit) AS (
 VALUES
  ('8100','Arroz Redondo Extra 1 Kg','UNI','Arroz','Arroz Redondo Extra 1 Kg',1::numeric,1::numeric,'kg'),
  ('20875','Naranja Postre','KG','Naranja','Naranja Postre',1,1,'kg'),
  ('17789','Berenjena 1ª','KG','Berenjena','Berenjena 1ª',1,1,'kg'),
  ('20107','Champiñon Bandeja 250 g','BAN','Champiñones','Champifon Extra Bandeja 250 g',0.25,250,'g'),
  ('41183','Queso Rulo Cabra 1 Kg','UNI','Queso Rulo Cabra 1 Kg','Queso Rulo Cabra 1 Kg',1,1,'kg')
 ), possible AS (
  SELECT l.id line_id,ing.id ingredient_id,s.sku,s.ingredient_name,s.confirmed_label
  FROM public.purchase_invoice_lines l
  JOIN public.purchase_interpretation_proposals p ON p.id=l.interpretation_proposal_id
  JOIN specs s ON s.sku=p.observed->>'supplier_product_code_raw'
    AND s.original_label=l.original_name
    AND lower(s.billing)=lower(l.line_unit)
  JOIN public.ingredients ing ON ing.name=s.ingredient_name AND ing.archived_at IS NULL
  JOIN public.purchase_mapping_versions m ON m.supplier_id=1 AND m.status='confirmed'
    AND m.supplier_item_name=s.confirmed_label AND m.ingredient_id=ing.id
    AND m.conversion_factor=s.factor AND m.line_content_qty=s.content_qty
    AND lower(btrim(m.line_content_unit))=lower(s.content_unit)
  WHERE l.invoice_id=i.id AND l.status='pending' AND l.mapped_ingredient_id IS NULL
    AND l.superseded_by_extraction_id IS NULL
    AND l.quantity>0 AND l.total_price>0
    AND p.status='needs_mapping'
    AND p.review_reasons=ARRAY['producto_sin_mapping']::text[]
    AND cardinality(p.warnings)=0
    AND p.source_item_name=l.original_name
    AND p.purchase_invoice_id=i.id AND p.document_extraction_id=e.id
    AND p.source_file_hash=i.content_sha256 AND p.supplier_id=1
    AND NOT EXISTS (
       SELECT 1 FROM public.purchase_mapping_versions newer
       WHERE newer.supplier_id=1 AND newer.status='confirmed'
         AND newer.supplier_item_name=s.confirmed_label
         AND newer.confirmed_at>m.confirmed_at
    )
    AND (s.sku<>'20107' OR EXISTS(
      SELECT 1 FROM public.purchase_invoice_lines old
      JOIN public.purchase_invoices src ON src.id=old.invoice_id
      JOIN public.purchase_interpretation_proposals op ON op.id=old.interpretation_proposal_id
      WHERE src.supplier_id=1 AND src.source='scanner' AND src.status='mapped'
        AND old.mapped_ingredient_id=ing.id
        AND op.observed->>'supplier_product_code_raw'='20107'
        AND old.original_name='Champifon Extra Bandeja 250 g'))
 )
 SELECT line_id,min(ingredient_id::text)::uuid ingredient_id,
        min(sku) sku,min(ingredient_name) ingredient_name
 FROM possible GROUP BY line_id
 HAVING count(DISTINCT ingredient_id)=1
 LOOP
  IF EXISTS (SELECT 1 FROM public.purchase_receipt_confirmations r WHERE r.purchase_invoice_line_id=c.line_id)
     OR EXISTS (SELECT 1 FROM public.stock_movements sm
       WHERE sm.reference_id=c.line_id OR sm.reference_doc='ALB-LINE-'||c.line_id::text)
  THEN RAISE EXCEPTION 'Existing stock for line being mapped'; END IF;

  v_count:=v_count+1;
  v_lines:=v_lines||jsonb_build_array(jsonb_build_object('line_id',c.line_id,'ingredient',c.ingredient_name,'sku',c.sku));
  IF NOT p_preview THEN
    UPDATE public.purchase_invoice_lines l SET mapped_ingredient_id=c.ingredient_id
    WHERE l.id=c.line_id AND l.invoice_id=i.id AND l.status='pending'
      AND l.mapped_ingredient_id IS NULL AND l.superseded_by_extraction_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent change'; END IF;
    INSERT INTO private.purchase_verified_identity_learning
      (invoice_line_id,invoice_id,ingredient_id,source_sha256,provenance)
    VALUES (c.line_id,i.id,c.ingredient_id,i.content_sha256,
      'verified_ametller_supplier_sku_latest_semantic_confirmation_v1');
  END IF;
 END LOOP;

 IF NOT p_preview AND (
    EXISTS (SELECT 1 FROM public.purchase_receipt_confirmations r WHERE r.purchase_invoice_id=i.id)
    OR EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.reference_id=i.id)
 ) THEN RAISE EXCEPTION 'Unexpected stock effect: rolling back aliases'; END IF;

 RETURN jsonb_build_object('ok',true,'applied',NOT p_preview,
  'identity_count',v_count,'mapped',v_lines,'stock_changed',false,'review_state_changed',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.learn_verified_ametller_pdf_text_aliases(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.learn_verified_ametller_pdf_text_aliases(uuid,boolean) TO service_role;
