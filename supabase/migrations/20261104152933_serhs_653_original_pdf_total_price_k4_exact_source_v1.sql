
-- Verified original SERHS invoice's 13-box milk line: the printed 11.02 EUR
-- is rounded; the legally printed line NET is 143.30 EUR. K4 must use the
-- latter (not silently charge only 143.26) for its physical unit cost.
-- Exact invoice, PDF SHA, immutable K5 successor and half-cent/box bound.
-- Original K4 is preserved as a verbatim private snapshot for audit/repair.
create table if not exists private.purchase_serhs_653_total_price_receipt_audit (
 receipt_confirmation_id uuid primary key references public.purchase_receipt_confirmations(id) on delete restrict,
 purchase_invoice_line_id uuid not null unique references public.purchase_invoice_lines(id) on delete restrict,
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 printed_unit_net numeric(16,4) not null,
 invoiced_line_net numeric(16,2) not null,
 printed_units_net numeric(16,2) not null,
 rounding_eur numeric(16,2) not null check(rounding_eur=0.04),
 verified_purchase_quantity_l numeric not null check(verified_purchase_quantity_l=117),
 normalized_price_per_l numeric(18,8) not null,
 price_changed boolean not null,
 stock_changed boolean not null check(stock_changed=true),
 rule_version text not null default 'serhs_653_original_line_total_net_priority_k4_v1',
 created_at timestamptz not null default now()
);
alter table private.purchase_serhs_653_total_price_receipt_audit enable row level security;
revoke all on private.purchase_serhs_653_total_price_receipt_audit from public,anon,authenticated;
grant select on private.purchase_serhs_653_total_price_receipt_audit to service_role;

do $patch$
declare
 old text;
 source text;
 original_assignment text := '  v_normalized_price := v_observed_price / v_effective_mapping.conversion_factor;';
 extra text;
begin
 select pg_get_functiondef('private.apply_receipt_line(uuid,uuid,jsonb,text,boolean)'::regprocedure) into old;
 if old is null or position(original_assignment in old)=0
  or (length(old)-length(replace(old,original_assignment,'')))/length(original_assignment)<>1
 then raise exception 'K4 implementation changed; abort rounding migration'; end if;
 if to_regprocedure('private.apply_receipt_line_pre_serhs_653_v1(uuid,uuid,jsonb,text,boolean)') is null then
   source:=replace(old,
    'FUNCTION private.apply_receipt_line(',
    'FUNCTION private.apply_receipt_line_pre_serhs_653_v1(');
   if source=old then raise exception 'K4 snapshot signature changed'; end if;
   execute source;
   execute 'revoke all on function private.apply_receipt_line_pre_serhs_653_v1(uuid,uuid,jsonb,text,boolean) from public,anon,authenticated';
 end if;
 extra := original_assignment || E'
  -- The stored net line total, independently certified from the immutable
  -- original PDF, has accounting precedence over a rounded displayed price
  -- ONLY for this exact historical SERHS source-bound K5 successor.
  IF auth.role() = ''service_role''
   AND v_invoice.id = ''27475965-ea40-41a2-b871-30ea611eb4c7''::uuid
   AND v_invoice.invoice_number = ''FV826/091653''
   AND v_invoice.source = ''email'' AND v_invoice.supplier_id = 8
   AND v_invoice.status = ''pending_mapping''
   AND v_invoice.content_sha256 = ''95c7600b43895db2ddaf27f87d3d859b353795017260a299222a71a3689ede3f''
   AND v_invoice.base_amount=214.40 AND v_invoice.tax_amount=13.27
   AND v_invoice.total_amount=227.67
   AND v_line.id = ''8a4e3177-014e-471c-a111-3bc275ec4974''::uuid
   AND v_line.original_name = ''RAM SENCERA 1,5L C/6''
   AND v_line.quantity=13 AND v_line.unit_price=11.02
   AND v_line.total_price=143.30
   AND v_mapping.id = ''f188a23d-a9a3-48b0-9299-fcab44e140fe''::uuid
   AND v_mapping.status=''confirmed''
   AND v_effective_mapping.conversion_factor=9
   AND v_ingredient.id = ''789d0b3a-ef8c-459b-980f-9af288746840''::uuid
   AND v_ingredient.name=''Leche entera''
   AND v_purchase_quantity=117
   AND v_physical_quantity=117000
   AND abs(v_line.quantity*v_line.unit_price-v_line.total_price)
     <=v_line.quantity*0.005+0.0051
   AND EXISTS(
     SELECT 1 FROM public.purchase_interpretation_proposals p
     JOIN public.purchase_interpretation_proposals parent ON parent.id=p.supersedes_proposal_id
     JOIN public.document_extractions e ON e.id=p.document_extraction_id
     JOIN public.purchase_email_documents mail ON mail.invoice_id=v_invoice.id
     WHERE p.id=v_line.interpretation_proposal_id
       AND p.purchase_invoice_id=v_invoice.id AND p.status=''ready_for_review''
       AND p.mapping_version_id=v_mapping.id
       AND p.ingredient_id=v_ingredient.id
       AND p.source_file_hash=v_invoice.content_sha256
       AND p.review_reasons=''{}''::text[] AND p.warnings=''{}''::text[]
       AND p.physical_quantity=v_physical_quantity AND p.purchase_quantity=v_purchase_quantity
       AND p.base_unit=''ml'' AND p.purchase_unit=''l''
       AND p.normalized_unit_price=round(v_line.total_price/v_purchase_quantity,8)
       AND p.provenance->''revision''->>''kind''=''verified_serhs_original_net_price_v1''
       AND p.provenance->''revision''->>''source_hash''=v_invoice.content_sha256
       AND p.pricing->>''verified_net_price_from_original''=''true''
       AND parent.purchase_invoice_id=v_invoice.id
       AND parent.provenance->>''source''=''mistral_canonical''
       AND parent.review_reasons=ARRAY[''descuento_sin_porcentaje_verificado'',''cantidad_precio_importe_no_reconcilian'']::text[]
       AND e.invoice_id=v_invoice.id AND e.status=''success''
       AND e.file_version_hash=v_invoice.content_sha256
       AND e.raw_json_artifact->>''extractor''=''mistral''
       AND mail.status=''imported'' AND mail.supplier_id=8
       AND mail.content_sha256=v_invoice.content_sha256
       AND mail.storage_path=v_invoice.file_path
       AND lower(mail.sender_email)=''grupserhs@grupserhs.com''
       AND EXISTS(SELECT 1 FROM public.purchase_supplier_sender_addresses adr
         WHERE lower(adr.sender_email)=lower(mail.sender_email)
          AND adr.supplier_id=8 AND adr.confirmed_by_owner)
   )
  THEN
    v_normalized_price := v_line.total_price / v_purchase_quantity;
  END IF;';
 old:=replace(old,original_assignment,extra);
 execute old;
end $patch$;
