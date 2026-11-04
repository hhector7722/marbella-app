
-- Exactly one SERHS original-PDF-verified whole-milk line.
-- K4 K5 original-line-total rounding is now source-bound, and the old
-- SERHS receipt verifier is preserved intact except for a narrow K4
-- delegation, exact price guard, and append-only financial audit.
DO $patch$
DECLARE
 src text;
 price_guard_preview text := ' OR v_preview->>''price_changed''=''true''';
 price_guard_apply text := ' OR v_result->>''price_changed''=''true''';
 marker text := ' IF v_rc<>1 THEN';
BEGIN
 SELECT pg_get_functiondef(
  'public.apply_verified_serhs_653_stock_line(uuid,uuid,uuid,text,date,boolean)'::regprocedure)
 INTO src;
 IF src IS NULL OR position('v_serhs_revision' in src)=0
   OR position('verified_serhs_original_net_price_v1' in src)=0
   OR position('possible_prior_supplier_delivery_same_item' in src)=0
   OR (length(src)-length(replace(src,
     'public.apply_receipt_line_automated(','')))/
     length('public.apply_receipt_line_automated(')<>2
   OR (length(src)-length(replace(src,price_guard_preview,'')))/
     length(price_guard_preview)<>1
   OR (length(src)-length(replace(src,price_guard_apply,'')))/
     length(price_guard_apply)<>1
   OR position(marker in src)=0
 THEN RAISE EXCEPTION 'Refusing SERHS whole-milk verifier source drift'; END IF;
 src:=replace(src,
   'FUNCTION public.apply_verified_serhs_653_stock_line(',
   'FUNCTION public.apply_verified_serhs_653_stock_line_whole_rounding_v3(');
 src:=replace(src,
  ' SELECT * INTO v_l FROM public.purchase_invoice_lines WHERE id=p_line_id FOR UPDATE;',
  E' IF p_line_id IS DISTINCT FROM ''8a4e3177-014e-471c-a111-3bc275ec4974''::uuid THEN\n'
  ||E'  RETURN jsonb_build_object(''ok'',false,''reason'',''only_source_certified_SERHS_117L_whole_milk''); END IF;\n'
  ||' SELECT * INTO v_l FROM public.purchase_invoice_lines WHERE id=p_line_id FOR UPDATE;');
 src:=replace(src,
  ' v_preview:=public.apply_receipt_line_automated(',
  E' PERFORM set_config(''request.jwt.claim.sub'',v_p.created_by::text,true);\n'
   ||' v_preview:=public.apply_receipt_line(');
 src:=replace(src,
  ' v_result:=public.apply_receipt_line_automated(',
  ' v_result:=public.apply_receipt_line(');
 -- The original PDF's NET LINE amount 143.30 has precedence over
 -- truncated displayed EUR11.02 * 13 = 143.26. The 4-cent difference
 -- falls within 0.005 EUR per package (=0.065). Reject any other price.
 src:=replace(src,price_guard_preview,
  E' OR v_preview->>''price_changed'' IS DISTINCT FROM ''true''\n'
  || E'    OR abs((v_preview->>''price_after'')::numeric -\n'
  || E'       round(v_l.total_price/(v_l.quantity*v_m.conversion_factor),8))>0.00000001\n'
  || E'    OR (v_preview->>''physical_quantity'')::numeric IS DISTINCT FROM 117000\n'
  || E'    OR (v_preview->>''price_before'')::numeric IS DISTINCT FROM v_g.current_price\n'
  || E'    OR abs(v_l.quantity*v_l.unit_price-v_l.total_price)>v_l.quantity*0.005+0.0051');
 src:=replace(src,price_guard_apply,
  E' OR v_result->>''price_changed'' IS DISTINCT FROM ''true''\n'
  || E'    OR abs((v_result->>''price_after'')::numeric -\n'
  || E'       round(v_l.total_price/(v_l.quantity*v_m.conversion_factor),8))>0.00000001');
 src:=replace(src,marker,
  E' IF v_rc<>1 THEN');
 -- Insert audited proof after K4 confirmation and before SUCCESS return.
 src:=replace(src,
  ' RETURN jsonb_build_object(''ok'',true,''applied'',true,''invoice'',v_i.invoice_number,',
  E' INSERT INTO private.purchase_receipt_automation_audit (\n'
  || E'  receipt_confirmation_id,interpretation_proposal_id,\n'
  || E'  automation_actor_profile_id,captured_by_profile_id)\n'
  || E' VALUES(v_conf,v_p.id,v_p.created_by,v_i.created_by);\n'
  || E' INSERT INTO private.purchase_serhs_653_total_price_receipt_audit (\n'
  || E'  receipt_confirmation_id,purchase_invoice_line_id,source_sha256,\n'
  || E'  printed_unit_net,invoiced_line_net,printed_units_net,rounding_eur,\n'
  || E'  verified_purchase_quantity_l,normalized_price_per_l,price_changed,stock_changed)\n'
  || E' VALUES(v_conf,v_l.id,v_i.content_sha256,v_l.unit_price,v_l.total_price,\n'
  || E'   round(v_l.unit_price*v_l.quantity,2),\n'
  || E'   round(v_l.total_price-v_l.unit_price*v_l.quantity,2),\n'
  || E'   v_l.quantity*v_m.conversion_factor,\n'
  || E'   round(v_l.total_price/(v_l.quantity*v_m.conversion_factor),8),\n'
  || E'   (v_result->>''price_changed'')::boolean,true);\n'
  || E' PERFORM public.sync_purchase_invoice_status(v_i.id);\n'
  || E' IF (SELECT status FROM public.purchase_invoices WHERE id=v_i.id)<>''mapped''\n'
  || E' THEN RAISE EXCEPTION ''SERHS 091653 stock not fully reconciled, rolled back''; END IF;\n'
  || ' RETURN jsonb_build_object(''ok'',true,''applied'',true,''invoice'',v_i.invoice_number,');
 IF position('FUNCTION public.apply_verified_serhs_653_stock_line_whole_rounding_v3(' in src)=0
  OR position('purchase_serhs_653_total_price_receipt_audit' in src)=0
  OR position('round(v_l.total_price/(v_l.quantity*v_m.conversion_factor),8)' in src)=0
  OR position('public.apply_receipt_line_automated(' in src)>0
 THEN RAISE EXCEPTION 'SERHS v3 cloning failed safety validation'; END IF;
 EXECUTE src;
END $patch$;
REVOKE ALL ON FUNCTION public.apply_verified_serhs_653_stock_line_whole_rounding_v3(uuid,uuid,uuid,text,date,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_verified_serhs_653_stock_line_whole_rounding_v3(uuid,uuid,uuid,text,date,boolean)
 TO service_role;
