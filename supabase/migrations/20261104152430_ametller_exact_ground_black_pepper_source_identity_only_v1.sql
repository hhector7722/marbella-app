
-- Identity-only Ametller pepper: exact supplier SKU, original SHA-linked OCR,
-- unique existing ingredient "Pimienta molida", printed 820g package.
-- Do not mark mapped, post 820g, change prices or infer prior receipts.
create table if not exists private.purchase_verified_pepper_source_identity (
 invoice_line_id uuid primary key references public.purchase_invoice_lines(id) on delete restrict,
 invoice_id uuid not null references public.purchase_invoices(id) on delete restrict,
 ingredient_id uuid not null references public.ingredients(id) on delete restrict,
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 source_sku text not null check(source_sku='41444'),
 source_label text not null check(source_label='Pimienta Negra Molida 820 g'),
 source_package_g integer not null check(source_package_g=820),
 source_quantity numeric not null check(source_quantity>0),
 source_net_total numeric not null check(source_net_total>=0),
 status_retained boolean not null default true check(status_retained),
 stock_changed boolean not null default false check(not stock_changed),
 rule_version text not null default 'ametller_black_ground_pepper_unique_generic_identity_v1',
 created_at timestamptz not null default now()
);
alter table private.purchase_verified_pepper_source_identity enable row level security;
revoke all on private.purchase_verified_pepper_source_identity from public,anon,authenticated;
grant select on private.purchase_verified_pepper_source_identity to service_role;

create or replace function public.learn_verified_ametller_black_ground_pepper_identity_v1(
 p_invoice_id uuid,p_preview boolean default true
) returns jsonb language plpgsql security definer set search_path to ''
as $f$
declare
 v_i public.purchase_invoices%rowtype;
 v_l public.purchase_invoice_lines%rowtype;
 v_p public.purchase_interpretation_proposals%rowtype;
 v_e public.document_extractions%rowtype;
 v_g public.ingredients%rowtype;
 v_job public.document_processing_jobs%rowtype;
 v_email public.purchase_email_documents%rowtype;
 v_source jsonb;
 v_gcount int;
begin
 if auth.role() is distinct from 'service_role' or p_invoice_id is null
 then return jsonb_build_object('ok',false,'reason','service_role_only'); end if;
 perform pg_advisory_xact_lock(hashtextextended('pepper-source-identity:'||p_invoice_id::text,0));
 select * into v_i from public.purchase_invoices
  where id=p_invoice_id for update;
 select * into v_l from public.purchase_invoice_lines
  where invoice_id=p_invoice_id and original_name='Pimienta Negra Molida 820 g'
   and superseded_by_extraction_id is null for update;
 select count(*) into v_gcount from public.ingredients
  where name='Pimienta molida' and archived_at is null and base_unit='g' and purchase_unit='kg';
 select * into v_g from public.ingredients where name='Pimienta molida'
  and archived_at is null and base_unit='g' and purchase_unit='kg';
 if v_i.id is null or v_l.id is null or v_gcount<>1
  or v_i.supplier_id<>1 or v_i.source<>'email'
  or v_i.document_kind<>'monthly_invoice' or v_i.status<>'pending_mapping'
  or v_i.duplicate_of_invoice_id is not null
  or v_l.status<>'pending' or v_l.line_unit<>'UNI'
  or v_l.quantity<>1 or v_l.total_price<=0
  or (v_l.mapped_ingredient_id is not null and v_l.mapped_ingredient_id<>v_g.id)
 then return jsonb_build_object('ok',false,'reason','invoice_or_ingredient_not_verified'); end if;
 if exists(select 1 from private.purchase_verified_pepper_source_identity existing
   where existing.invoice_line_id=v_l.id and existing.ingredient_id=v_g.id)
 then return jsonb_build_object('ok',true,'idempotent',true,
  'ingredient_id',v_g.id,'stock_changed',false); end if;
 if v_l.mapped_ingredient_id is not null
 then return jsonb_build_object('ok',false,'reason','identity_already_changed_without_audit'); end if;
 select * into v_p from public.purchase_interpretation_proposals
   where id=v_l.interpretation_proposal_id for key share;
 select * into v_e from public.document_extractions
   where id=v_p.document_extraction_id for key share;
 select * into v_job from public.document_processing_jobs
   where invoice_id=v_i.id for key share;
 select * into v_email from public.purchase_email_documents
   where invoice_id=v_i.id for key share;
 if v_p.id is null or v_e.id is null or v_job.id is null or v_email.id is null
   or v_p.purchase_invoice_id<>v_i.id or v_p.supplier_id<>1
   or v_p.source_file_hash<>v_i.content_sha256
   or v_p.source_item_name<>v_l.original_name
   or v_p.status<>'needs_mapping' or v_p.ingredient_id is not null
   or v_p.mapping_version_id is not null
   or v_p.review_reasons<>array['producto_sin_mapping']::text[]
   or cardinality(v_p.warnings)<>0
   or v_p.observed->>'supplier_product_code_raw'<>'41444'
   or v_p.observed->>'description_raw'<>v_l.original_name
   or v_p.observed->>'billing_unit_raw'<>'UNI'
   or v_p.normalizer_version<>'ametller-pdf-text-v1'
   or v_p.provenance->>'source'<>'pdf_text_verified'
   or v_p.provenance->>'trigger'<>'original_text_fallback'
   or v_p.provenance->>'original_source_sha'<>v_i.content_sha256
   or v_e.status<>'success' or v_e.invoice_id<>v_i.id
   or v_e.file_version_hash<>v_i.content_sha256
   or v_e.extractor_version<>'ametller-pdf-text-v1'
   or v_job.status<>'completed'
   or v_job.evidence_extraction_id<>v_e.id
   or v_job.file_version_hash<>v_i.content_sha256
   or v_email.status<>'imported' or v_email.supplier_id<>1
   or v_email.content_sha256<>v_i.content_sha256
   or v_email.storage_path<>v_i.file_path
   or not exists(select 1 from public.purchase_supplier_sender_addresses a
     where a.supplier_id=1 and a.confirmed_by_owner
      and lower(a.sender_email)=lower(v_email.sender_email))
   or exists(select 1 from public.purchase_mapping_versions m
     where m.supplier_id=1 and m.status='confirmed'
      and m.supplier_item_name=v_l.original_name
      and m.ingredient_id<>v_g.id)
 then return jsonb_build_object('ok',false,'reason','source_or_supplier_code_not_verified'); end if;
 if v_p.source_row_index is null or v_p.source_row_index<0 or
    v_p.source_row_index>=jsonb_array_length(v_e.raw_json_artifact->'canonical'->'lines')
 then return jsonb_build_object('ok',false,'reason','canonical_source_row_not_unique'); end if;
 v_source:=v_e.raw_json_artifact->'canonical'->'lines'->v_p.source_row_index;
 if v_source->>'description_raw'<>v_l.original_name
   or v_source->>'supplier_product_code_raw'<>'41444'
   or v_source->>'billing_unit_raw'<>'UNI'
   or v_source->>'content_per_unit_raw' is not null
   or v_p.source_table_index is distinct from (v_source->>'page_index')::integer
   or v_source->>'quantity_raw' !~ '^[0-9]+(\.[0-9]+)?$'
   or v_source->>'line_total_raw' !~ '^[0-9]+(\.[0-9]+)?$'
   or (v_source->>'quantity_raw')::numeric<>v_l.quantity
   or (v_source->>'line_total_raw')::numeric<>v_l.total_price
   or exists(select 1 from public.purchase_receipt_confirmations r
     where r.purchase_invoice_line_id=v_l.id)
   or exists(select 1 from public.stock_movements sm
     where sm.reference_id=v_l.id or sm.reference_doc='ALB-LINE-'||v_l.id::text)
 then return jsonb_build_object('ok',false,'reason','canonical_label_or_line_stock_not_unique'); end if;
 if p_preview then return jsonb_build_object('ok',true,'eligible',true,
  'ingredient_id',v_g.id,'source_package_g',820,
  'identity_only',true,'status_retained',true,'stock_changed',false); end if;
 insert into private.purchase_verified_pepper_source_identity(
   invoice_line_id,invoice_id,ingredient_id,source_sha256,source_sku,source_label,
   source_package_g,source_quantity,source_net_total)
 values(v_l.id,v_i.id,v_g.id,v_i.content_sha256,'41444',
  v_l.original_name,820,v_l.quantity,v_l.total_price);
 update public.purchase_invoice_lines set mapped_ingredient_id=v_g.id
 where id=v_l.id and status='pending' and mapped_ingredient_id is null
   and interpretation_proposal_id=v_p.id;
 if not found then raise exception 'Concurrent verified pepper source edit'; end if;
 insert into private.purchase_verified_identity_learning(
   invoice_line_id,invoice_id,ingredient_id,source_sha256,provenance)
 values(v_l.id,v_i.id,v_g.id,v_i.content_sha256,
  'ametller_exact_ground_black_pepper_unique_generic_identity_820g_source_v1');
 return jsonb_build_object('ok',true,'applied',true,
  'ingredient_id',v_g.id,'physical_size_from_label_g',820,
  'quantity_posted_g',0,'status_retained',true,'stock_changed',false);
end;
$f$;
revoke all on function public.learn_verified_ametller_black_ground_pepper_identity_v1(uuid,boolean)
 from public,anon,authenticated;
grant execute on function public.learn_verified_ametller_black_ground_pepper_identity_v1(uuid,boolean)
 to service_role;
