-- Auto-reconcile only the OWNER-CONFIRMED, unit-compatible canonical ingredient IDs
-- of unposted lines of previously received email invoices. Does not create stock,
-- update costs, mark receipts, or change mapped/pending line status.
-- All physical quantity discrepancies remain blocked for review.
BEGIN;
CREATE TABLE IF NOT EXISTS private.purchase_ingredient_alias_repair_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_id uuid NOT NULL,
 invoice_line_id uuid NOT NULL,
 old_ingredient_id uuid NOT NULL,
 canonical_ingredient_id uuid NOT NULL,
 line_status_at_repair text NOT NULL,
 alias_reason text NOT NULL,
 reconciled_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (invoice_line_id,old_ingredient_id,canonical_ingredient_id)
);
CREATE OR REPLACE FUNCTION public.reconcile_pending_ingredient_aliases(p_invoice_id uuid, p_apply boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_invoice public.purchase_invoices%ROWTYPE;
 v_ready int := 0;
 v_blocked_conversion int := 0;
 v_changed int := 0;
 v_audited int := 0;
 v_remaining int := 0;
 v_lines jsonb := '[]'::jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RETURN jsonb_build_object('ok',false,'reason','service_role_only');
 END IF;
 IF p_invoice_id IS NULL THEN
  RETURN jsonb_build_object('ok',false,'reason','invalid_invoice_id');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_invoice_id::text,5573));
 SELECT * INTO v_invoice FROM public.purchase_invoices
 WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND OR v_invoice.status IS DISTINCT FROM 'pending_mapping'
    OR v_invoice.source IS DISTINCT FROM 'email'
    OR v_invoice.document_kind IS DISTINCT FROM 'monthly_invoice'
    OR v_invoice.duplicate_of_invoice_id IS NOT NULL THEN
  RETURN jsonb_build_object('ok',false,'reason','not_eligible_pending_monthly_invoice');
 END IF;
 IF (SELECT count(*) FROM public.document_extractions e
     WHERE e.invoice_id=p_invoice_id AND e.status='success'
       AND e.file_version_hash=v_invoice.content_sha256
       AND e.extractor_version='mistral-ocr-4-1-document-observation-v2') <> 1 THEN
  RETURN jsonb_build_object('ok',false,'reason','document_extraction_unverified');
 END IF;
 WITH candidates AS (
 SELECT l.id FROM public.purchase_invoice_lines l
 JOIN public.ingredient_consolidation_aliases a ON a.duplicate_ingredient_id=l.mapped_ingredient_id
 JOIN public.ingredients src ON src.id=a.duplicate_ingredient_id
 JOIN public.ingredients dst ON dst.id=a.canonical_ingredient_id
 WHERE l.invoice_id=p_invoice_id AND l.superseded_by_extraction_id IS NULL
 AND l.status IN ('mapped','pending')
 AND a.conversion_status='resolved'
 AND src.archived_at IS NOT NULL AND dst.archived_at IS NULL
 AND src.base_unit=dst.base_unit AND src.purchase_unit=dst.purchase_unit
 AND NOT EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r WHERE r.purchase_invoice_line_id=l.id)
 AND NOT EXISTS(SELECT 1 FROM public.stock_movements s WHERE s.reference_id=l.id OR s.reference_doc='ALB-LINE-'||l.id::text)
 AND NOT EXISTS(SELECT 1 FROM public.ingredient_price_history h WHERE h.purchase_invoice_line_id=l.id)
 )
 SELECT count(*) INTO v_ready FROM candidates;
 SELECT count(*) INTO v_blocked_conversion
 FROM public.purchase_invoice_lines l
 JOIN public.ingredient_consolidation_aliases a ON a.duplicate_ingredient_id=l.mapped_ingredient_id
 WHERE l.invoice_id=p_invoice_id AND l.superseded_by_extraction_id IS NULL
 AND a.conversion_status<>'resolved';
 IF p_apply AND v_ready > 0 THEN
  WITH candidates AS (
    SELECT l.id AS line_id, l.mapped_ingredient_id AS old_id,
      a.canonical_ingredient_id AS new_id, l.status AS prior_status,a.reason AS alias_reason
    FROM public.purchase_invoice_lines l
    JOIN public.ingredient_consolidation_aliases a ON a.duplicate_ingredient_id=l.mapped_ingredient_id
    JOIN public.ingredients src ON src.id=a.duplicate_ingredient_id
    JOIN public.ingredients dst ON dst.id=a.canonical_ingredient_id
    WHERE l.invoice_id=p_invoice_id AND l.superseded_by_extraction_id IS NULL
    AND l.status IN ('mapped','pending') AND a.conversion_status='resolved'
    AND src.archived_at IS NOT NULL AND dst.archived_at IS NULL
    AND src.base_unit=dst.base_unit AND src.purchase_unit=dst.purchase_unit
    AND NOT EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations r WHERE r.purchase_invoice_line_id=l.id)
    AND NOT EXISTS(SELECT 1 FROM public.stock_movements s WHERE s.reference_id=l.id OR s.reference_doc='ALB-LINE-'||l.id::text)
    AND NOT EXISTS(SELECT 1 FROM public.ingredient_price_history h WHERE h.purchase_invoice_line_id=l.id)
  ),
  modified AS (
    UPDATE public.purchase_invoice_lines l
    SET mapped_ingredient_id=c.new_id
    FROM candidates c
    WHERE l.id=c.line_id AND l.mapped_ingredient_id=c.old_id
    RETURNING l.id AS line_id,l.invoice_id,c.old_id,c.new_id,c.prior_status,c.alias_reason
  ),
  logged AS (
    INSERT INTO private.purchase_ingredient_alias_repair_audit (
      invoice_id,invoice_line_id,old_ingredient_id,canonical_ingredient_id,line_status_at_repair,alias_reason
    )
    SELECT m.invoice_id,m.line_id,m.old_id,m.new_id,m.prior_status,m.alias_reason
    FROM modified m
    ON CONFLICT (invoice_line_id,old_ingredient_id,canonical_ingredient_id) DO NOTHING
    RETURNING id
  )
  SELECT (SELECT count(*) FROM modified),
         (SELECT count(*) FROM logged),
         COALESCE((SELECT jsonb_agg(line_id) FROM modified),'[]'::jsonb)
  INTO v_changed,v_audited,v_lines;
  IF v_changed <> v_ready OR v_audited <> v_changed THEN
   RAISE EXCEPTION 'Atomic alias reconciliation mismatch: candidates %, changed %, audited %',
     v_ready,v_changed,v_audited;
  END IF;
 END IF;
 SELECT count(*) INTO v_remaining FROM public.purchase_invoice_lines l
 JOIN public.ingredients g ON g.id=l.mapped_ingredient_id
 WHERE l.invoice_id=p_invoice_id AND l.superseded_by_extraction_id IS NULL
 AND g.archived_at IS NOT NULL;
 RETURN jsonb_build_object('ok',true,'invoice_id',p_invoice_id,
  'mode',CASE WHEN p_apply THEN 'apply' ELSE 'preview' END,
  'candidates',v_ready,'changed_lines',v_changed,'audit_rows',v_audited,
  'blocked_unverified_conversion',v_blocked_conversion,
  'archived_ingredient_lines_remaining',v_remaining,
  'changed_line_ids',v_lines,
  'stock_changed',false,'prices_changed',false,'status_changed',false);
END;
$function$

REVOKE ALL ON FUNCTION public.reconcile_pending_ingredient_aliases(uuid,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_pending_ingredient_aliases(uuid,boolean)
  TO service_role;
COMMIT;
