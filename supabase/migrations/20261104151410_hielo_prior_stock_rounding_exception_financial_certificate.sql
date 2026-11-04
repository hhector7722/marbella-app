
-- An auditable exception for Hielo Fenix' printed invoice rounding.
-- A monthly invoice can be marked stock-reconciled ONLY if an immutable,
-- independently verified preceding-month PURCHASE has already been posted.
-- Never alters printed line/header amounts, unit prices, receipts or stock.
create table if not exists private.purchase_hielo_rounding_certificates (
 invoice_line_id uuid primary key references public.purchase_invoice_lines(id) on delete restrict,
 invoice_id uuid not null references public.purchase_invoices(id) on delete restrict,
 prior_receipt_id uuid not null references public.purchase_receipt_confirmations(id) on delete restrict,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 printed_gross numeric(16,2) not null,
 header_gross numeric(16,2) not null,
 header_net numeric(16,2) not null,
 header_vat numeric(16,2) not null,
 printed_net_unit_price numeric(16,4) not null,
 net_unit_price_derived numeric(16,6) not null,
 discrepancy_cents integer not null check(discrepancy_cents between -1 and 1 and discrepancy_cents<>0),
 stock_changed boolean not null default false check(stock_changed=false),
 rule_version text not null default 'hielo_prior_gross_rounding_exception_v1',
 certified_at timestamptz not null default now()
);
alter table private.purchase_hielo_rounding_certificates enable row level security;
revoke all on private.purchase_hielo_rounding_certificates from public, anon, authenticated;
grant select on private.purchase_hielo_rounding_certificates to service_role;

-- Preserve all earlier stock-provenance checks unchanged. This SQL snapshot
-- is deliberately made once before installing the additional Hielo clause.
do $snapshot$
declare v_def text;
begin
 if to_regprocedure('private.purchase_invoice_line_stock_reconciled_pre_hielo_v1(uuid,uuid)') is null then
  select pg_get_functiondef('public.purchase_invoice_line_stock_reconciled(uuid,uuid)'::regprocedure) into v_def;
  if v_def is null or v_def not like '%private.purchase_invoice_delivery_reconciliations%' then
   raise exception 'Current stock reconciliation implementation changed; refuse extension';
  end if;
  v_def:=replace(v_def,
    'FUNCTION public.purchase_invoice_line_stock_reconciled(',
    'FUNCTION private.purchase_invoice_line_stock_reconciled_pre_hielo_v1(');
  execute v_def;
  execute 'revoke all on function private.purchase_invoice_line_stock_reconciled_pre_hielo_v1(uuid,uuid) from public,anon,authenticated';
 end if;
end $snapshot$;

create or replace function private.hielo_rounding_prior_stock_verified_v1(
 p_line_id uuid,p_ingredient_id uuid
) returns boolean language sql stable security definer set search_path to ''
as $$
select exists(
 select 1
 from private.purchase_hielo_rounding_certificates c
 join private.purchase_hielo_prior_stock_correlations h
  on h.invoice_line_id=c.invoice_line_id and h.invoice_id=c.invoice_id
   and h.prior_receipt_id=c.prior_receipt_id
   and h.original_pdf_sha256=c.source_sha256
   and h.ingredient_id=p_ingredient_id
 join public.purchase_invoice_lines l on l.id=c.invoice_line_id
  and l.invoice_id=c.invoice_id and l.mapped_ingredient_id=p_ingredient_id
  and l.status='mapped' and l.superseded_by_extraction_id is null
 join public.purchase_invoices i on i.id=c.invoice_id
  and i.source='email' and i.supplier_id=13
  and i.document_kind='monthly_invoice'
  and i.content_sha256=c.source_sha256
 join public.purchase_invoice_lines prev on prev.id=h.prior_line_id
 join public.purchase_invoices prev_i on prev_i.id=prev.invoice_id
  and prev_i.supplier_id=13 and prev_i.source='scanner'
  and prev_i.status='mapped'
 join public.purchase_receipt_confirmations r on r.id=h.prior_receipt_id
  and r.purchase_invoice_line_id=prev.id
 join public.stock_movements sm on sm.id=h.prior_stock_movement_id
  and sm.id=r.stock_movement_id and sm.movement_type='PURCHASE'
  and sm.ingredient_id=p_ingredient_id
  and sm.quantity=r.physical_quantity and sm.unit=r.base_unit
 join public.ingredients g on g.id=p_ingredient_id and g.name='Hielo'
  and g.base_unit='g' and g.purchase_unit='kg'
 where c.invoice_line_id=p_line_id and c.stock_changed=false
  and h.prior_stock_movement_id=sm.id
  and h.discrepancy_cents=c.discrepancy_cents
  and h.original_month=date_trunc('month',prev_i.invoice_date)::date
  and prev_i.invoice_date>=h.original_month
  and prev_i.invoice_date < h.original_month+interval '1 month'
  and prev.mapped_ingredient_id=p_ingredient_id and prev.status='mapped'
  and r.ingredient_id=p_ingredient_id and r.physical_quantity=prev.quantity*2000
  and r.base_unit='g' and r.purchase_quantity=prev.quantity*2
  and r.purchase_unit='kg' and sm.quantity>0
  and c.printed_gross=l.total_price and c.header_gross=i.total_amount
  and c.header_net=i.base_amount and c.header_vat=i.tax_amount
  and c.printed_net_unit_price=l.unit_price
  and c.net_unit_price_derived=round(i.base_amount/l.quantity,6)
  and round(i.base_amount*0.10,2)=i.tax_amount
  and i.base_amount+i.tax_amount=i.total_amount
  and abs(i.total_amount-l.total_price)=0.01
  and abs(l.unit_price-i.base_amount/l.quantity)<0.01
  and prev.total_price=i.total_amount
  and NOT exists(select 1 from public.stock_movements reversed
      where reversed.reversal_of_movement_id=sm.id and reversed.origin='reversal')
  and NOT exists(select 1 from public.purchase_receipt_confirmations newer
      where newer.purchase_invoice_line_id=l.id)
  and NOT exists(select 1 from public.stock_movements newer_sm
      where newer_sm.reference_id=l.id and newer_sm.movement_type='PURCHASE')
)
$$;
revoke all on function private.hielo_rounding_prior_stock_verified_v1(uuid,uuid) from public,anon,authenticated;

-- Other suppliers use the complete original reconciliation function verbatim.
create or replace function public.purchase_invoice_line_stock_reconciled(
 p_line_id uuid,p_ingredient_id uuid
) returns boolean language sql stable security definer set search_path to ''
as $$
 select coalesce(
   private.purchase_invoice_line_stock_reconciled_pre_hielo_v1(p_line_id,p_ingredient_id)
   or private.hielo_rounding_prior_stock_verified_v1(p_line_id,p_ingredient_id),false)
$$;

create or replace function public.certify_hielo_prior_monthly_rounding_v1(
 p_invoice_id uuid,p_preview boolean default true
) returns jsonb language plpgsql security definer set search_path to ''
as $$
declare
 i public.purchase_invoices%rowtype;
 l public.purchase_invoice_lines%rowtype;
 p public.purchase_interpretation_proposals%rowtype;
 e public.document_extractions%rowtype;
 em public.purchase_email_documents%rowtype;
 h private.purchase_hielo_prior_stock_correlations%rowtype;
 r public.purchase_receipt_confirmations%rowtype;
 sm public.stock_movements%rowtype;
 old public.purchase_invoice_lines%rowtype;
 old_i public.purchase_invoices%rowtype;
 src jsonb;
 delta int;
 count_lines int;
begin
 if auth.role() is distinct from 'service_role' or p_invoice_id is null
 then return jsonb_build_object('ok',false,'reason','service_role_only'); end if;
 perform pg_advisory_xact_lock(hashtextextended('hielo-prior-month:'||p_invoice_id::text,0));
 select * into i from public.purchase_invoices where id=p_invoice_id for update;
 select * into l from public.purchase_invoice_lines
   where invoice_id=i.id and superseded_by_extraction_id is null for update;
 select count(*) into count_lines from public.purchase_invoice_lines
   where invoice_id=i.id and superseded_by_extraction_id is null;
 if i.id is null or count_lines<>1 or l.id is null or i.supplier_id<>13
   or i.source<>'email' or i.document_kind<>'monthly_invoice'
   or i.status not in ('pending_mapping','mapped')
   or i.duplicate_of_invoice_id is not null
   or i.total_amount<=0 or i.base_amount<=0 or i.tax_amount<=0
   or i.base_amount+i.tax_amount<>i.total_amount
   or round(i.base_amount*0.10,2)<>i.tax_amount
   or l.original_name<>'Glaçons 60gr' or l.quantity<=0
   or l.line_unit is not null
   or l.mapped_ingredient_id<>'90634e0b-9d22-44e4-ae7d-38704fee67f7'::uuid
 then return jsonb_build_object('ok',false,'reason','not_unique_valid_hielo_monthly'); end if;
 select * into h from private.purchase_hielo_prior_stock_correlations
   where invoice_line_id=l.id and invoice_id=i.id and ingredient_id=l.mapped_ingredient_id for key share;
 if h.invoice_line_id is null or h.original_pdf_sha256<>i.content_sha256
  or h.has_verified_financial_cert is true and not exists(
     select 1 from private.purchase_hielo_rounding_certificates c
     where c.invoice_line_id=l.id)
 then return jsonb_build_object('ok',false,'reason','missing_prior_source_bound_receipt'); end if;
 if exists(select 1 from private.purchase_hielo_rounding_certificates c
   where c.invoice_line_id=l.id) then
  return jsonb_build_object('ok',true,'idempotent',true,'applied',false,
    'invoice_status',i.status,'stock_changed',false); end if;
 if l.status<>'pending' or l.total_price<=0 or l.unit_price<=0
   or l.quantity<>25 or i.total_amount<>28.75 or i.base_amount<>26.14
   or i.tax_amount<>2.61 or l.total_price<>28.74 or l.unit_price<>1.04
 then return jsonb_build_object('ok',false,'reason','original_economics_changed_or_review_missing'); end if;
 delta:=round((i.total_amount-l.total_price)*100)::integer;
 if abs(delta)<>1 or h.discrepancy_cents<>delta
   or abs(l.unit_price-(i.base_amount/l.quantity))>=0.01
 then return jsonb_build_object('ok',false,'reason','rounding_not_within_source_verified_display_precision'); end if;
 select * into p from public.purchase_interpretation_proposals
   where id=l.interpretation_proposal_id for key share;
 select * into e from public.document_extractions
   where id=p.document_extraction_id for key share;
 select * into em from public.purchase_email_documents
   where invoice_id=i.id for key share;
 if p.id is null or e.id is null or em.id is null
  or p.purchase_invoice_id<>i.id or p.source_file_hash<>i.content_sha256
  or p.source_item_name<>l.original_name
  or p.provenance->>'source'<>'mistral_canonical'
  or p.provenance->>'trigger'<>'mistral_job_completion'
  or p.normalizer_version<>'mistral-pipeline-v3'
  or p.status<>'needs_mapping'
  or e.invoice_id<>i.id or e.file_version_hash<>i.content_sha256 or e.status<>'success'
  or e.extractor_version<>'mistral-ocr-4-1-document-observation-v2'
  or e.raw_json_artifact->>'extractor'<>'mistral'
  or e.raw_json_artifact->'canonical'->>'document_number_raw'<>i.invoice_number
  or replace(e.raw_json_artifact->'canonical'->>'subtotal_raw',',','.')::numeric<>i.base_amount
  or replace(e.raw_json_artifact->'canonical'->>'tax_raw',',','.')::numeric<>i.tax_amount
  or replace(e.raw_json_artifact->'canonical'->>'total_raw',',','.')::numeric<>i.total_amount
  or em.supplier_id<>13 or em.status<>'imported' or em.content_sha256<>i.content_sha256
  or em.storage_path<>i.file_path
  or lower(em.sender_email)<>'facturas@hielofenix.cat'
  or not exists(select 1 from public.purchase_supplier_sender_addresses a
    where a.supplier_id=13 and lower(a.sender_email)=lower(em.sender_email)
     and a.confirmed_by_owner)
 then return jsonb_build_object('ok',false,'reason','original_pdf_sender_or_canonical_economics_not_verified'); end if;
 src:=e.raw_json_artifact->'canonical'->'lines'->0;
 if jsonb_array_length(e.raw_json_artifact->'canonical'->'lines')<>1
   or src->>'description_raw'<>l.original_name
   or replace(src->>'quantity_raw',',','.')::numeric<>l.quantity
   or replace(src->>'unit_price_raw',',','.')::numeric<>l.unit_price
   or replace(src->>'line_total_raw',',','.')::numeric<>l.total_price
 then return jsonb_build_object('ok',false,'reason','original_pdf_line_changed'); end if;
 select * into old from public.purchase_invoice_lines where id=h.prior_line_id for key share;
 select * into old_i from public.purchase_invoices where id=old.invoice_id for key share;
 select * into r from public.purchase_receipt_confirmations where id=h.prior_receipt_id for key share;
 select * into sm from public.stock_movements where id=h.prior_stock_movement_id for key share;
 if old.id is null or old_i.id is null or r.id is null or sm.id is null
  or old_i.supplier_id<>13 or old_i.source<>'scanner'
  or old.status<>'mapped' or old.quantity<>l.quantity
  or old.original_name<>'Bossa de 2 Kg. (60 g.)'
  or old.total_price<>i.total_amount
  or old.mapped_ingredient_id<>l.mapped_ingredient_id
  or r.purchase_invoice_line_id<>old.id or r.ingredient_id<>l.mapped_ingredient_id
  or r.physical_quantity<>50000 or r.base_unit<>'g' or r.purchase_quantity<>50
  or r.purchase_unit<>'kg'
  or sm.id<>r.stock_movement_id or sm.movement_type<>'PURCHASE'
  or sm.quantity<>50000 or sm.unit<>'g' or sm.reference_id<>old.id
  or exists(select 1 from public.stock_movements reverse
     where reverse.reversal_of_movement_id=sm.id and reverse.origin='reversal')
  or exists(select 1 from public.purchase_receipt_confirmations nr
     where nr.purchase_invoice_line_id=l.id)
  or exists(select 1 from public.stock_movements nm
     where nm.reference_id=l.id and nm.movement_type='PURCHASE')
 then return jsonb_build_object('ok',false,'reason','physical_stock_not_unique_or_already_posted'); end if;
 if p_preview then
  return jsonb_build_object('ok',true,'eligible',true,'stock_changed',false,
   'base',i.base_amount,'tax',i.tax_amount,'header_total',i.total_amount,
   'printed_line_total',l.total_price,'printed_net_unit_price',l.unit_price,
   'derived_net_unit_price',round(i.base_amount/l.quantity,6),
   'difference_cents',delta,'prior_receipt_id',r.id,'prior_stock_g',sm.quantity);
 end if;
 insert into private.purchase_hielo_rounding_certificates
  (invoice_line_id,invoice_id,prior_receipt_id,source_sha256,printed_gross,
   header_gross,header_net,header_vat,printed_net_unit_price,
   net_unit_price_derived,discrepancy_cents)
 values(l.id,i.id,r.id,i.content_sha256,l.total_price,i.total_amount,
   i.base_amount,i.tax_amount,l.unit_price,round(i.base_amount/l.quantity,6),delta);
 update public.purchase_invoice_lines set status='mapped'
   where id=l.id and status='pending' and mapped_ingredient_id=r.ingredient_id
     and interpretation_proposal_id=p.id;
 if not found then raise exception 'Hielo source line changed concurrently'; end if;
 update private.purchase_hielo_prior_stock_correlations
   set has_verified_financial_cert=true where invoice_line_id=l.id and has_verified_financial_cert=false;
 perform public.sync_purchase_invoice_status(i.id);
 if (select status from public.purchase_invoices where id=i.id)<>'mapped'
 then raise exception 'Physical prior receipt certification failed sync; rollback'; end if;
 return jsonb_build_object('ok',true,'applied',true,
  'invoice_status','mapped','difference_cents',delta,
  'source_pdf_unchanged',true,'stock_changed',false);
end;
$$;
revoke all on function public.certify_hielo_prior_monthly_rounding_v1(uuid,boolean)
 from public,anon,authenticated;
grant execute on function public.certify_hielo_prior_monthly_rounding_v1(uuid,boolean)
 to service_role;
