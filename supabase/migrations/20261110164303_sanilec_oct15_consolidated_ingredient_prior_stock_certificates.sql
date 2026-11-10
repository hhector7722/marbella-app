-- Four historical A/64108 receipts have real, unreversed PURCHASE
-- movements to archived ingredient IDs. Their owner-confirmed resolved
-- consolidation aliases point to the current monthly ingredients.
-- Certify PRIOR stock identity only; DO NOT create or reassign movements,
-- amend history, change prices or add a second purchase.
CREATE TABLE IF NOT EXISTS private.sanilec_prior_stock_alias_certificates_v1 (
 monthly_line_id uuid PRIMARY KEY REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 original_delivery_line_id uuid NOT NULL UNIQUE REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
 original_receipt_id uuid NOT NULL UNIQUE REFERENCES public.purchase_receipt_confirmations(id) ON DELETE RESTRICT,
 original_stock_movement_id uuid NOT NULL UNIQUE REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
 archived_ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
 canonical_ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
 monthly_invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
 original_delivery_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
 source_hash text NOT NULL CHECK (source_hash~'^[a-f0-9]{64}$'),
 original_scan_hash text NOT NULL CHECK (original_scan_hash~'^[a-f0-9]{64}$'),
 monthly_sku text NOT NULL,
 original_sku text NOT NULL,
 original_net_amount numeric(16,2) NOT NULL CHECK(original_net_amount>0),
 physical_quantity numeric NOT NULL CHECK(physical_quantity>0),
 base_unit text NOT NULL CHECK(base_unit IN('ml','ud')),
 stock_changed boolean NOT NULL DEFAULT false CHECK(NOT stock_changed),
 historical_receipt_unchanged boolean NOT NULL DEFAULT true CHECK(historical_receipt_unchanged),
 evidence text NOT NULL DEFAULT 'source-bound matched October 15 receipt and owner-resolved ingredient consolidation',
 certified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.sanilec_prior_stock_alias_certificates_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sanilec_prior_stock_alias_certificates_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON private.sanilec_prior_stock_alias_certificates_v1 TO service_role;

DO $certify$
DECLARE
 i public.purchase_invoices%ROWTYPE;
 old_i public.purchase_invoices%ROWTYPE;
 monthly public.purchase_invoice_lines%ROWTYPE;
 old_line public.purchase_invoice_lines%ROWTYPE;
 p public.purchase_interpretation_proposals%ROWTYPE;
 old_p public.purchase_interpretation_proposals%ROWTYPE;
 r public.purchase_receipt_confirmations%ROWTYPE;
 movement public.stock_movements%ROWTYPE;
 a public.ingredient_consolidation_aliases%ROWTYPE;
 old_g public.ingredients%ROWTYPE;
 new_g public.ingredients%ROWTYPE;
 e public.document_extractions%ROWTYPE;
 rec record;
 total integer:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('sanilec-Oct15-4-alias-prior-stock-certification',0));
 SELECT * INTO i FROM public.purchase_invoices
  WHERE id='e65af1cb-dec6-4da6-bd6b-e0b2ae4cc860'::uuid FOR UPDATE;
 SELECT * INTO old_i FROM public.purchase_invoices
  WHERE id='4f855dba-719a-4912-9fa0-f355433e7704'::uuid FOR KEY SHARE;
 SELECT * INTO e FROM public.document_extractions
  WHERE id='3cad5b0f-707f-4618-9704-ff20eb0fbdcb'::uuid FOR KEY SHARE;
 IF i.id IS NULL OR old_i.id IS NULL OR e.id IS NULL
 OR i.supplier_id<>9 OR i.source<>'email' OR i.document_kind<>'monthly_invoice'
 OR i.invoice_number<>'A/20456' OR i.status<>'pending_mapping'
 OR i.content_sha256<>'4357ee7da8d4a8e2498c1d6a4495b869a526bac5e5cdefe2d7fcf64373733a3b'
 OR i.base_amount<>673.80 OR i.total_amount<>815.30
 OR old_i.source<>'scanner' OR old_i.supplier_id<>9
 OR old_i.invoice_number<>'A/64108'
 OR old_i.invoice_date<>'2026-10-15'::date
 OR old_i.status='discarded'
 OR old_i.content_sha256<>'e7a7b13182816993e4573ed4a41c42ee2bb12f583961d3975c945ee3b0305157'
 OR e.invoice_id<>i.id OR e.file_version_hash<>i.content_sha256 OR e.status<>'success'
 THEN RAISE EXCEPTION 'Original October source identity changed'; END IF;

 FOR rec IN SELECT * FROM (VALUES
  ('92f126bc-705e-4c12-86bf-314a8c504a55'::uuid,'afc53e3f-b7f5-4a94-9aaf-bb440cf81881'::uuid,
   'TW1073'::text,'TW1073'::text,6::int,1::numeric,11.52::numeric,50::numeric,'ud'::text),
  ('c9e1f43a-8d2f-49f5-9cec-33686ad6b471'::uuid,'dda29daf-c2d2-4189-8b35-332ce947931a'::uuid,
   'BP1356','BP1356',7,1,4.28,500,'ud'),
  ('c101373e-dac6-470f-aa5d-4e9607f6fe04'::uuid,'7a7150d7-74e8-4bd7-8cc6-d446e27716ed'::uuid,
   'TW1097','TW1057',8,1,16.85,1000,'ud'),
  ('5f4b3768-00f5-4777-af1b-2a142688b6a2'::uuid,'458ce73b-69ce-48c4-805e-7444f227ff13'::uuid,
   'QM6001','QM6001',10,5,5.78,5000,'ml')
 ) AS x(month_id,source_id,month_sku,source_sku,row_index,purchased,net_amount,physical_qty,unit)
 ORDER BY x.row_index LOOP
   SELECT * INTO monthly FROM public.purchase_invoice_lines
    WHERE id=rec.month_id AND invoice_id=i.id AND superseded_by_extraction_id IS NULL FOR UPDATE;
   SELECT * INTO old_line FROM public.purchase_invoice_lines
    WHERE id=rec.source_id AND invoice_id=old_i.id AND superseded_by_extraction_id IS NULL FOR KEY SHARE;
   SELECT * INTO p FROM public.purchase_interpretation_proposals WHERE id=monthly.interpretation_proposal_id FOR KEY SHARE;
   SELECT * INTO old_p FROM public.purchase_interpretation_proposals WHERE id=old_line.interpretation_proposal_id FOR KEY SHARE;
   SELECT * INTO r FROM public.purchase_receipt_confirmations WHERE purchase_invoice_line_id=old_line.id FOR KEY SHARE;
   SELECT * INTO movement FROM public.stock_movements WHERE id=r.stock_movement_id FOR KEY SHARE;
   SELECT * INTO a FROM public.ingredient_consolidation_aliases
    WHERE duplicate_ingredient_id=r.ingredient_id AND canonical_ingredient_id=monthly.mapped_ingredient_id FOR KEY SHARE;
   SELECT * INTO old_g FROM public.ingredients WHERE id=r.ingredient_id FOR KEY SHARE;
   SELECT * INTO new_g FROM public.ingredients WHERE id=monthly.mapped_ingredient_id FOR KEY SHARE;
   IF monthly.id IS NULL OR old_line.id IS NULL OR p.id IS NULL OR old_p.id IS NULL
    OR r.id IS NULL OR movement.id IS NULL OR a.duplicate_ingredient_id IS NULL
    OR old_g.id IS NULL OR new_g.id IS NULL
    OR monthly.status<>'mapped' OR old_line.status<>'mapped'
    OR monthly.mapped_ingredient_id IS NULL
    OR monthly.quantity<>rec.purchased OR old_line.quantity<>rec.purchased
    OR monthly.total_price<>rec.net_amount OR old_line.total_price<>rec.net_amount
    OR p.document_extraction_id<>e.id OR p.source_file_hash<>i.content_sha256
    OR p.source_row_index<>rec.row_index
    OR p.observed->>'supplier_product_code_raw'<>rec.month_sku
    OR old_p.observed->>'supplier_product_code_raw'<>rec.source_sku
    OR regexp_replace(monthly.original_name,'^[*^]','')<>regexp_replace(old_line.original_name,'^[*^]','')
    OR a.conversion_status<>'resolved'
    OR old_g.archived_at IS NULL OR old_g.stock_current<>0
    OR new_g.archived_at IS NOT NULL
    OR old_g.base_unit<>rec.unit OR new_g.base_unit<>rec.unit
    OR old_g.purchase_unit<>new_g.purchase_unit
    OR r.purchase_invoice_id<>old_i.id OR r.physical_quantity<>rec.physical_qty
    OR r.base_unit<>rec.unit OR r.ingredient_id<>old_g.id
    OR movement.movement_type<>'PURCHASE'
    OR movement.origin<>'receipt_confirmation'::public.stock_movement_origin
    OR movement.id<>r.stock_movement_id OR movement.ingredient_id<>old_g.id
    OR movement.quantity<>rec.physical_qty OR movement.unit<>rec.unit
    OR movement.reference_id<>old_line.id
    OR EXISTS(SELECT 1 FROM public.stock_movements undo
      WHERE undo.reversal_of_movement_id=movement.id AND undo.origin='reversal'::public.stock_movement_origin)
    OR EXISTS(SELECT 1 FROM private.purchase_invoice_delivery_reconciliations rel
       WHERE rel.invoice_line_id=monthly.id OR rel.original_receipt_id=r.id OR rel.original_delivery_line_id=old_line.id)
    OR EXISTS(SELECT 1 FROM public.stock_movements direct
       WHERE direct.reference_id=monthly.id AND direct.movement_type='PURCHASE')
   THEN RAISE EXCEPTION 'Source, consolidation, net price or unique prior receipt failed for %',rec.month_sku; END IF;
   INSERT INTO private.sanilec_prior_stock_alias_certificates_v1(
    monthly_line_id,original_delivery_line_id,original_receipt_id,original_stock_movement_id,
    archived_ingredient_id,canonical_ingredient_id,monthly_invoice_id,original_delivery_id,
    source_hash,original_scan_hash,monthly_sku,original_sku,original_net_amount,
    physical_quantity,base_unit)
   VALUES(monthly.id,old_line.id,r.id,movement.id,old_g.id,new_g.id,i.id,old_i.id,
    i.content_sha256,old_i.content_sha256,rec.month_sku,rec.source_sku,rec.net_amount,rec.physical_qty,rec.unit);
   total:=total+1;
 END LOOP;
 IF total<>4 THEN RAISE EXCEPTION 'Four unique physical original receipts required, got %',total; END IF;
END;
$certify$;

CREATE OR REPLACE FUNCTION private.sanilec_verified_consolidated_prior_stock_v1(
 p_line_id uuid,p_ingredient_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
 SELECT EXISTS(
  SELECT 1 FROM private.sanilec_prior_stock_alias_certificates_v1 c
  JOIN public.purchase_invoice_lines ml ON ml.id=c.monthly_line_id
  JOIN public.purchase_invoices mi ON mi.id=ml.invoice_id
  JOIN public.document_extractions e ON e.invoice_id=mi.id
    AND e.id='3cad5b0f-707f-4618-9704-ff20eb0fbdcb'::uuid
    AND e.status='success' AND e.file_version_hash=mi.content_sha256
  JOIN public.purchase_invoice_lines dl ON dl.id=c.original_delivery_line_id
  JOIN public.purchase_invoices di ON di.id=dl.invoice_id
  JOIN public.purchase_receipt_confirmations r ON r.id=c.original_receipt_id
    AND r.purchase_invoice_line_id=dl.id
    AND r.purchase_invoice_id=di.id
  JOIN public.stock_movements sm ON sm.id=c.original_stock_movement_id
    AND sm.id=r.stock_movement_id AND sm.reference_id=dl.id
  JOIN public.ingredient_consolidation_aliases a ON a.duplicate_ingredient_id=c.archived_ingredient_id
    AND a.canonical_ingredient_id=c.canonical_ingredient_id
  JOIN public.ingredients old_g ON old_g.id=c.archived_ingredient_id
  JOIN public.ingredients new_g ON new_g.id=c.canonical_ingredient_id
  JOIN public.purchase_interpretation_proposals mp ON mp.id=ml.interpretation_proposal_id
  JOIN public.purchase_interpretation_proposals dp ON dp.id=dl.interpretation_proposal_id
  WHERE c.monthly_line_id=p_line_id AND c.canonical_ingredient_id=p_ingredient_id
   AND mi.id=c.monthly_invoice_id AND mi.status<>'discarded'
   AND mi.document_kind='monthly_invoice' AND mi.source='email' AND mi.supplier_id=9
   AND mi.invoice_number='A/20456' AND mi.content_sha256=c.source_hash
   AND mi.content_sha256='4357ee7da8d4a8e2498c1d6a4495b869a526bac5e5cdefe2d7fcf64373733a3b'
   AND di.id=c.original_delivery_id AND di.source='scanner' AND di.supplier_id=9
   AND di.invoice_number='A/64108' AND di.invoice_date='2026-10-15'::date
   AND di.status<>'discarded' AND di.content_sha256=c.original_scan_hash
   AND di.content_sha256='e7a7b13182816993e4573ed4a41c42ee2bb12f583961d3975c945ee3b0305157'
   AND ml.status='mapped' AND ml.superseded_by_extraction_id IS NULL
   AND ml.mapped_ingredient_id=p_ingredient_id
   AND dl.status='mapped' AND dl.superseded_by_extraction_id IS NULL
   AND dp.observed->>'supplier_product_code_raw'=c.original_sku
   AND mp.observed->>'supplier_product_code_raw'=c.monthly_sku
   AND mp.source_file_hash=mi.content_sha256
   AND ml.quantity=dl.quantity AND ml.total_price=dl.total_price
   AND ml.total_price=c.original_net_amount
   AND regexp_replace(ml.original_name,'^[*^]','')=regexp_replace(dl.original_name,'^[*^]','')
   AND a.conversion_status='resolved'
   AND old_g.archived_at IS NOT NULL AND old_g.stock_current=0
   AND new_g.archived_at IS NULL
   AND old_g.base_unit=new_g.base_unit AND old_g.purchase_unit=new_g.purchase_unit
   AND r.ingredient_id=c.archived_ingredient_id
   AND r.physical_quantity=c.physical_quantity AND r.base_unit=c.base_unit
   AND sm.ingredient_id=c.archived_ingredient_id
   AND sm.movement_type='PURCHASE' AND sm.origin='receipt_confirmation'::public.stock_movement_origin
   AND sm.quantity=c.physical_quantity AND sm.unit=c.base_unit
   AND NOT EXISTS(SELECT 1 FROM public.stock_movements reversal
     WHERE reversal.reversal_of_movement_id=sm.id AND reversal.origin='reversal'::public.stock_movement_origin)
   AND NOT EXISTS(SELECT 1 FROM private.purchase_invoice_delivery_reconciliations other
     WHERE other.invoice_line_id=p_line_id OR other.original_receipt_id=r.id)
   AND NOT EXISTS(SELECT 1 FROM public.stock_movements newm
     WHERE newm.reference_id=p_line_id AND newm.movement_type='PURCHASE')
 );
$f$;
REVOKE ALL ON FUNCTION private.sanilec_verified_consolidated_prior_stock_v1(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.purchase_invoice_line_stock_reconciled(
 p_line_id uuid,p_ingredient_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
 SELECT CASE
  WHEN p_line_id IS NULL OR p_ingredient_id IS NULL THEN false
  ELSE COALESCE(
   private.sanilec_verified_consolidated_prior_stock_v1(p_line_id,p_ingredient_id)
   OR (
     (EXISTS(
      SELECT 1 FROM private.purchase_invoice_delivery_reconciliations d
      WHERE d.invoice_line_id=p_line_id
     ) OR EXISTS(
      SELECT 1 FROM private.purchase_hielo_rounding_certificates c
      WHERE c.invoice_line_id=p_line_id
     ) OR EXISTS(
      SELECT 1 FROM public.stock_movements sm
      WHERE sm.reference_doc='ALB-LINE-'||p_line_id::text
        AND sm.movement_type='PURCHASE' AND sm.ingredient_id<>p_ingredient_id
        AND sm.quantity>0
     ))
     AND (private.purchase_invoice_line_stock_reconciled_pre_hielo_v1(p_line_id,p_ingredient_id)
       OR private.hielo_rounding_prior_stock_verified_v1(p_line_id,p_ingredient_id))
   ),false)
 END;
$f$;
REVOKE ALL ON FUNCTION public.purchase_invoice_line_stock_reconciled(uuid,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.purchase_invoice_line_stock_reconciled(uuid,uuid)
 TO authenticated,service_role;

DO $verify$
DECLARE
 n int;
BEGIN
 SELECT count(*) INTO n FROM private.sanilec_prior_stock_alias_certificates_v1 cert
 WHERE public.purchase_invoice_line_stock_reconciled(cert.monthly_line_id,cert.canonical_ingredient_id);
 IF n<>4 THEN RAISE EXCEPTION 'Consolidated prior-stock certificate rejected % of 4',4-n; END IF;
 -- Preserve existing original invoices' stock: seven previous links and
 -- the newly certified eight original Sanilec arrivals still reconcile.
 IF NOT public.purchase_invoice_line_stock_reconciled(
  '81571aaf-6ccb-4677-b206-933e05127a93'::uuid,
  '994d9639-7a40-49d3-9405-4236130f06b9'::uuid)
 THEN RAISE EXCEPTION 'Original exact-ingredient receipt proof regressed'; END IF;
 PERFORM public.sync_purchase_invoice_status('e65af1cb-dec6-4da6-bd6b-e0b2ae4cc860'::uuid);
END;
$verify$;
