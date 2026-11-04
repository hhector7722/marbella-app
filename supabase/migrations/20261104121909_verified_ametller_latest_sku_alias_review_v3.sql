-- Ametller: honor a subsequent owner-confirmed supplier SKU mapping only when
-- a previous contradictory scanned assignment predates that correction.
-- The generic SHA-verified audit must have rejected the line *solely* for its
-- historic physical-presentation ambiguity. Three explicit SKU cases have
-- independently confirmed packaging. Never posts stock or changes prices.
CREATE OR REPLACE FUNCTION public.approve_verified_ametller_late_aliases_v3(
 p_invoice_id uuid,p_preview boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_base jsonb;
 v_i public.purchase_invoices%ROWTYPE;
 v_item jsonb;
 v_l public.purchase_invoice_lines%ROWTYPE;
 v_p public.purchase_interpretation_proposals%ROWTYPE;
 v_g public.ingredients%ROWTYPE;
 v_m public.purchase_mapping_versions%ROWTYPE;
 v_source_name text;
 v_sku text;
 v_expected_name text;
 v_expected_line text;
 v_expected_billing text;
 v_expected_amount numeric;
 v_expected_content numeric;
 v_expected_unit text;
 v_wrong_date date;
 v_approved int:=0;
 v_blocked jsonb:='[]'::jsonb;
 v_previews jsonb:='[]'::jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_invoice_id IS NULL
 THEN RETURN jsonb_build_object('ok',false,'reason','service_role_only'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('am_verified_mapping:'||p_invoice_id::text,0));
 SELECT * INTO v_i FROM public.purchase_invoices WHERE id=p_invoice_id FOR UPDATE;
 IF v_i.id IS NULL OR v_i.supplier_id<>1 OR v_i.status<>'pending_mapping'
 THEN RETURN jsonb_build_object('ok',false,'reason','not_pending_ametller'); END IF;
 v_base:=public.approve_verified_ametller_mappings_v1(p_invoice_id,true);
 IF v_base->>'ok'<>'true' OR v_base->>'stock_changed'<>'false'
 THEN RETURN jsonb_build_object('ok',false,'reason','sha_verified_base_authority_refused'); END IF;
 FOR v_item IN SELECT * FROM jsonb_array_elements(v_base->'line_results')
 LOOP
  IF v_item->>'eligible' IS DISTINCT FROM 'false'
   OR v_item->>'reason'<>'physical_presentation_not_unique' THEN CONTINUE; END IF;
  SELECT * INTO v_l FROM public.purchase_invoice_lines
   WHERE id=(v_item->>'line_id')::uuid FOR UPDATE;
  SELECT * INTO v_p FROM public.purchase_interpretation_proposals
   WHERE id=v_l.interpretation_proposal_id FOR KEY SHARE;
  SELECT * INTO v_g FROM public.ingredients WHERE id=v_l.mapped_ingredient_id;
  v_sku:=v_p.observed->>'supplier_product_code_raw';
  v_source_name:=NULL;
  v_expected_name:=NULL;
  v_expected_line:=NULL;
  v_expected_billing:=NULL;
  v_expected_amount:=NULL;
  v_expected_content:=NULL;
  v_expected_unit:=NULL;
  IF v_sku='8100' AND v_l.original_name='Arroz Redondo Extra 1 Kg'
    AND v_l.line_unit='UNI' THEN
    v_expected_name:='Arroz';v_source_name:='Arroz Redondo Extra 1 Kg';
    v_expected_line:='UNI';v_expected_billing:='uni';
    v_expected_amount:=1;v_expected_content:=1;v_expected_unit:='kg';
  ELSIF v_sku='20875' AND v_l.original_name='Naranja Postre'
    AND v_l.line_unit='KG' THEN
    v_expected_name:='Naranja';v_source_name:='Naranja Postre';
    v_expected_line:='KG';v_expected_billing:='kg';
    v_expected_amount:=1;v_expected_content:=1;v_expected_unit:='kg';
  ELSIF v_sku='20107' AND v_l.original_name='Champiñon Bandeja 250 g'
    AND v_l.line_unit='BAN' THEN
    v_expected_name:='Champiñones';v_source_name:='Champifon Extra Bandeja 250 g';
    v_expected_line:='BAN';v_expected_billing:='ud';
    v_expected_amount:=0.25;v_expected_content:=250;v_expected_unit:='g';
  ELSE CONTINUE; END IF;
  IF v_l.status<>'pending' OR v_g.id IS NULL OR v_g.archived_at IS NOT NULL
    OR v_g.name<>v_expected_name OR v_l.line_unit<>v_expected_line
    OR v_l.quantity<=0 OR v_l.total_price<0
    OR v_p.purchase_invoice_id<>v_i.id OR v_p.source_file_hash<>v_i.content_sha256
    OR v_p.source_item_name<>v_l.original_name
    OR v_p.observed->>'supplier_product_code_raw'<>v_sku
    OR NOT EXISTS(
      SELECT 1 FROM private.purchase_verified_identity_learning le
      WHERE le.invoice_line_id=v_l.id AND le.invoice_id=v_i.id
       AND le.ingredient_id=v_g.id AND le.source_sha256=v_i.content_sha256
       AND le.provenance='verified_ametller_supplier_sku_latest_semantic_confirmation_v1')
    OR EXISTS(SELECT 1 FROM public.purchase_receipt_confirmations rc WHERE rc.purchase_invoice_line_id=v_l.id)
    OR EXISTS(SELECT 1 FROM public.stock_movements sm
      WHERE sm.reference_id=v_l.id OR sm.reference_doc='ALB-LINE-'||v_l.id::text)
  THEN
    v_blocked:=v_blocked||jsonb_build_array(jsonb_build_object('id',v_l.id,'reason','identity_or_existing_stock_conflict'));
    CONTINUE;
  END IF;
  SELECT * INTO v_m
  FROM public.purchase_mapping_versions m
  WHERE m.supplier_id=1 AND m.status='confirmed'
   AND m.ingredient_id=v_g.id AND m.supplier_item_name=v_source_name
   AND lower(trim(m.line_billing_unit))=v_expected_billing
   AND m.line_content_qty=v_expected_content
   AND lower(trim(m.line_content_unit))=v_expected_unit
   AND m.conversion_factor=v_expected_amount
   AND abs(private.k4_convert_quantity(m.line_content_qty,m.line_content_unit,v_g.purchase_unit)
     -m.conversion_factor)<0.00000001
   AND private.k4_base_unit_for_purchase_unit(v_g.purchase_unit)=v_g.base_unit
   AND m.confirmed_by IS NOT NULL AND m.confirmed_at IS NOT NULL
  ORDER BY m.confirmed_at DESC,m.id DESC LIMIT 1;
  IF v_m.id IS NULL OR
    EXISTS(SELECT 1 FROM public.purchase_mapping_versions newer
      WHERE newer.supplier_id=1 AND newer.status='confirmed'
       AND newer.supplier_item_name=v_source_name AND newer.confirmed_at>v_m.confirmed_at)
  THEN
    v_blocked:=v_blocked||jsonb_build_array(jsonb_build_object('id',v_l.id,'reason','latest_confirmation_unverified'));
    CONTINUE;
  END IF;
  IF NOT EXISTS(
   SELECT 1 FROM public.purchase_invoice_lines old
   JOIN public.purchase_invoices oi ON oi.id=old.invoice_id
   JOIN public.purchase_interpretation_proposals op ON op.id=old.interpretation_proposal_id
   JOIN public.purchase_receipt_confirmations rc ON rc.purchase_invoice_line_id=old.id
   JOIN public.stock_movements sm ON sm.id=rc.stock_movement_id AND sm.movement_type='PURCHASE'
   WHERE oi.supplier_id=1 AND oi.source='scanner' AND oi.status='mapped'
    AND old.mapped_ingredient_id=v_g.id AND old.status='mapped'
    AND old.superseded_by_extraction_id IS NULL
    AND op.observed->>'supplier_product_code_raw'=v_sku
    AND old.original_name=v_source_name
    AND NOT EXISTS(SELECT 1 FROM public.stock_movements rev
      WHERE rev.reversal_of_movement_id=sm.id AND rev.origin='reversal')
  ) THEN
    v_blocked:=v_blocked||jsonb_build_array(jsonb_build_object('id',v_l.id,'reason','matching_scanned_stock_unverified'));
    CONTINUE;
  END IF;
  -- A newer mistaken scan is a conflict. The latest confirmed correction
  -- must postdate every previously posted conflicting SKU identity.
  SELECT max(oi.invoice_date) INTO v_wrong_date
   FROM public.purchase_invoice_lines old
   JOIN public.purchase_invoices oi ON oi.id=old.invoice_id
   JOIN public.purchase_interpretation_proposals op ON op.id=old.interpretation_proposal_id
   JOIN public.purchase_receipt_confirmations rc ON rc.purchase_invoice_line_id=old.id
   WHERE oi.supplier_id=1 AND oi.source='scanner' AND oi.status='mapped'
     AND old.mapped_ingredient_id IS NOT NULL AND old.mapped_ingredient_id<>v_g.id
     AND old.status='mapped' AND old.superseded_by_extraction_id IS NULL
     AND op.observed->>'supplier_product_code_raw'=v_sku;
  IF v_wrong_date IS NOT NULL AND v_wrong_date>=v_m.confirmed_at::date
  THEN
    v_blocked:=v_blocked||jsonb_build_array(jsonb_build_object('id',v_l.id,'reason','contradiction_not_superseded_by_confirmation'));
    CONTINUE;
  END IF;
  v_approved:=v_approved+1;
  v_previews:=v_previews||jsonb_build_array(jsonb_build_object(
     'line_id',v_l.id,'sku',v_sku,'ingredient_id',v_g.id,
     'confirmed_version',v_m.id,'prior_conflict_date',v_wrong_date,
     'approval',NOT p_preview,'stock_changed',false));
  IF NOT p_preview THEN
    INSERT INTO private.purchase_verified_mapping_approvals(
      invoice_line_id,invoice_id,ingredient_id,confirmed_mapping_version_id,
      source_sha256,supplier_sku,factor,content_quantity,content_unit,rule_version)
    VALUES(v_l.id,v_i.id,v_g.id,v_m.id,v_i.content_sha256,v_sku,
           v_m.conversion_factor,v_m.line_content_qty,v_m.line_content_unit,
           'ametller_latest_owner_confirmed_sku_alias_v3');
    UPDATE public.purchase_invoice_lines
    SET status='mapped'
    WHERE id=v_l.id AND status='pending'
       AND mapped_ingredient_id=v_g.id
       AND interpretation_proposal_id=v_p.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent verified alias edit'; END IF;
  END IF;
 END LOOP;
 IF NOT p_preview THEN PERFORM public.sync_purchase_invoice_status(v_i.id); END IF;
 RETURN jsonb_build_object('ok',true,'applied',NOT p_preview,
   'eligible_lines',v_approved,'blocked',v_blocked,
   'approved_rows',v_previews,'stock_changed',false,
   'invoice_completed',false,'rule_version','ametller_latest_owner_confirmed_sku_alias_v3');
END;
$f$;
REVOKE ALL ON FUNCTION public.approve_verified_ametller_late_aliases_v3(uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_verified_ametller_late_aliases_v3(uuid,boolean)
 TO service_role;
