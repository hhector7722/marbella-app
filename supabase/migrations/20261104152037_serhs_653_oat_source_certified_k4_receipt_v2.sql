
-- Bounded SERHS milk-oat receipt only: original PDF net totals validated,
-- 7 cases * 6 litres = 42 L and no matching previous receipt.
-- Preserve the old verifier verbatim except delegation to the original
-- K4 receipt executor under its already-validated automation actor.
do $do$
declare src text;
begin
 select pg_get_functiondef('public.apply_verified_serhs_653_stock_line(uuid,uuid,uuid,text,date,boolean)'::regprocedure)
 into src;
 if src is null or position('v_serhs_revision' in src)=0
    or position('invoice_only' in src)=0
    or position('verified_serhs_original_net_price_v1' in src)=0
    or position('possible_prior_supplier_delivery_same_item' in src)=0
 then raise exception 'SERHS verifier source changed'; end if;
 if (length(src)-length(replace(src,'public.apply_receipt_line_automated(','')))
  /length('public.apply_receipt_line_automated(') <> 2
 then raise exception 'Unexpected K4 delegate call count'; end if;
 src:=replace(src,
  'FUNCTION public.apply_verified_serhs_653_stock_line(',
  'FUNCTION public.apply_verified_serhs_653_stock_line_oat_v2(');
 src:=replace(src,
  ' SELECT * INTO v_l FROM public.purchase_invoice_lines WHERE id=p_line_id FOR UPDATE;',
  E' IF p_line_id IS DISTINCT FROM ''542bb5cd-80c0-4458-a9cf-fe446fbed16a''::uuid THEN\n'
   || E'  RETURN jsonb_build_object(''ok'',false,''reason'',''only_source_certified_oat_42L_price_unchanged''); END IF;\n'
   ||' SELECT * INTO v_l FROM public.purchase_invoice_lines WHERE id=p_line_id FOR UPDATE;');
 src:=replace(src,
  ' v_preview:=public.apply_receipt_line_automated(',
  E' PERFORM set_config(''request.jwt.claim.sub'',v_p.created_by::text,true);\n v_preview:=public.apply_receipt_line(');
 src:=replace(src,
  ' v_result:=public.apply_receipt_line_automated(',
  ' v_result:=public.apply_receipt_line(');
 src:=replace(src,
  E' RETURN jsonb_build_object(''ok'',true,''applied'',true,''invoice'',v_i.invoice_number,',
  E' INSERT INTO private.purchase_receipt_automation_audit (receipt_confirmation_id,interpretation_proposal_id,automation_actor_profile_id,captured_by_profile_id)\n'
  ||E' VALUES(v_conf,v_p.id,v_p.created_by,v_i.created_by);\n'
  ||E' PERFORM public.sync_purchase_invoice_status(v_i.id);\n'
  ||E' RETURN jsonb_build_object(''ok'',true,''applied'',true,''invoice'',v_i.invoice_number,');
 if position('FUNCTION public.apply_verified_serhs_653_stock_line_oat_v2(' in src)=0
   or position('PERFORM set_config(''request.jwt.claim.sub'',v_p.created_by::text,true)' in src)=0
   or position('private.purchase_receipt_automation_audit' in src)=0
 then raise exception 'SERHS v2 construction incomplete'; end if;
 execute src;
end $do$;
revoke all on function public.apply_verified_serhs_653_stock_line_oat_v2(uuid,uuid,uuid,text,date,boolean) from public,anon,authenticated;
grant execute on function public.apply_verified_serhs_653_stock_line_oat_v2(uuid,uuid,uuid,text,date,boolean) to service_role;
