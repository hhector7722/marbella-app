-- Stock 2.0 / septiembre: libro sombra SIN cambio de stock ni de ventas.
-- Ya existe la ejecución de septiembre:
-- run_id = 21ba4e50-8f0b-4873-9395-f9c9c26f839a
-- El inventario declarado por propiedad "principios de septiembre" NO se ha encontrado.
-- No inventar ni fecha exacta ni cantidades ni asumir cero unidades físicas.

create table if not exists stock_v2.opening_baseline_requests (
 run_id uuid primary key references stock_v2.replay_runs(id) on delete cascade,
 requested_month date not null,
 physical_count_at timestamptz,
 source_evidence_ref text,
 status text not null default 'awaiting_original_inventory'
  check(status in ('awaiting_original_inventory','located_unverified','validated')),
 evidence_notes text not null,
 created_at timestamptz not null default now(),
 check (date_trunc('month',requested_month)::date=requested_month),
 check(status<>'validated' or (physical_count_at is not null and source_evidence_ref is not null))
);
alter table stock_v2.opening_baseline_requests enable row level security;
revoke all on stock_v2.opening_baseline_requests from public,anon,authenticated;
insert into stock_v2.opening_baseline_requests(run_id,requested_month,status,evidence_notes)
values('21ba4e50-8f0b-4873-9395-f9c9c26f839a'::uuid,'2026-09-01',
 'awaiting_original_inventory',
 'El usuario confirmó recuento físico a principios de septiembre. No está identificado aún en tablas inventory_counts, stock_movements, Storage ni en los archivos localizados. No usar el 18/09 como si fuera el recuento inicial.')
on conflict (run_id) do nothing;

-- Recortar el snapshot de investigación marzo-octubre para una ejecución SEPT-OCT
-- separada, con movimientos REPRODUCIDOS, no contabilizados otra vez.
insert into stock_v2.daily_deltas(
 run_id,business_date,ingredient_id,source,base_unit,signed_quantity,source_records,is_estimate)
select '21ba4e50-8f0b-4873-9395-f9c9c26f839a'::uuid,
 business_date,ingredient_id,source,base_unit,signed_quantity,source_records,is_estimate
from stock_v2.daily_deltas where run_id='3a0e2663-dabd-4849-a893-17b3b4c20289'::uuid
 and business_date between '2026-09-01' and '2026-10-09'
on conflict do nothing;

insert into stock_v2.inventory_candidates(
run_id,count_id,ingredient_id,count_date,physical_quantity,counted_unit,certified)
select '21ba4e50-8f0b-4873-9395-f9c9c26f839a'::uuid,
count_id,ingredient_id,count_date,physical_quantity,counted_unit,certified
from stock_v2.inventory_candidates
where run_id='3a0e2663-dabd-4849-a893-17b3b4c20289'::uuid
on conflict do nothing;

insert into stock_v2.legacy_inventory_evidence(
run_id,stock_movement_id,ingredient_id,count_at,physical_quantity,
 unit,historical_adjustment,provenance,certified)
select '21ba4e50-8f0b-4873-9395-f9c9c26f839a'::uuid,
stock_movement_id,ingredient_id,count_at,physical_quantity,
 unit,historical_adjustment,provenance,certified
from stock_v2.legacy_inventory_evidence
where run_id='3a0e2663-dabd-4849-a893-17b3b4c20289'::uuid
on conflict do nothing;

-- Snapshot por línea de compra, no genera movimientos ni importes en stock.
create table if not exists stock_v2.purchase_line_audit (
 run_id uuid not null references stock_v2.replay_runs(id) on delete cascade,
 line_id uuid not null references public.purchase_invoice_lines(id),
 invoice_id uuid not null references public.purchase_invoices(id),
 invoice_date date,
 ingredient_id uuid references public.ingredients(id),
 quantity numeric,
 line_unit text,
 line_unit_price numeric,
 line_total numeric,
 duplicate_flag boolean not null default false,
 posted_legacy boolean not null default false,
 posted_k4 boolean not null default false,
 review_state text not null check(review_state in (
  'already_posted','duplicate_flagged','before_september',
  'date_unverified','invoice_partially_posted',
  'ingredient_unmapped','quantity_or_price_invalid','unit_unverified','needs_k4_review')),
 created_at timestamptz not null default now(),
 primary key(run_id,line_id)
);
create index if not exists stock_v2_purchase_audit_state_idx
on stock_v2.purchase_line_audit(run_id,review_state,invoice_date);
alter table stock_v2.purchase_line_audit enable row level security;
revoke all on stock_v2.purchase_line_audit from public,anon,authenticated;

with raw as (
 select l.id line_id,l.invoice_id,i.invoice_date, l.mapped_ingredient_id,
 l.quantity,l.line_unit,l.unit_price,l.total_price,
 (i.duplicate_of_invoice_id is not null) duplicate_flag,
 exists(select 1 from public.stock_movements sm
  where sm.movement_type='PURCHASE' and sm.reference_doc='ALB-LINE-'||l.id::text) posted_legacy,
 exists(select 1 from public.purchase_receipt_confirmations c
  where c.purchase_invoice_line_id=l.id) posted_k4,
 exists(select 1 from public.purchase_receipt_confirmations c
  where c.purchase_invoice_id=i.id) invoice_has_k4,
 exists(select 1 from public.purchase_invoice_lines other
  join public.stock_movements sm
  on sm.movement_type='PURCHASE' and sm.reference_doc='ALB-LINE-'||other.id::text
  where other.invoice_id=i.id) invoice_has_legacy
 from public.purchase_invoice_lines l join public.purchase_invoices i on i.id=l.invoice_id
 where i.created_at >= '2026-09-01' or i.invoice_date >= '2026-09-01'
)
insert into stock_v2.purchase_line_audit(
 run_id,line_id,invoice_id,invoice_date,ingredient_id,quantity,line_unit,
 line_unit_price,line_total,duplicate_flag,posted_legacy,posted_k4,review_state)
select '21ba4e50-8f0b-4873-9395-f9c9c26f839a'::uuid,
 line_id,invoice_id,invoice_date,mapped_ingredient_id,quantity,line_unit,
 unit_price,total_price,duplicate_flag,posted_legacy,posted_k4,
 case
 when posted_legacy or posted_k4 then 'already_posted'
 when duplicate_flag then 'duplicate_flagged'
 when invoice_date is null or invoice_date>'2026-10-09' then 'date_unverified'
 when invoice_date<'2026-09-01' then 'before_september'
 when invoice_has_k4 or invoice_has_legacy then 'invoice_partially_posted'
 when mapped_ingredient_id is null then 'ingredient_unmapped'
 when quantity is null or quantity<=0 or unit_price is null or unit_price<0
      or total_price is null or total_price<0 then 'quantity_or_price_invalid'
 when nullif(btrim(line_unit),'') is null then 'unit_unverified'
 else 'needs_k4_review'
 end
from raw
on conflict do nothing;

-- Auditoría de incidencias solo desde el 1 septiembre, no copiar valores de marzo.
insert into stock_v2.issues(run_id,issue_type,source_key,occurrences,evidence)
select '21ba4e50-8f0b-4873-9395-f9c9c26f839a'::uuid,
'september_tpv_recipe_empty',l.articulo_id::text,count(*),
jsonb_build_object('articulo_id',l.articulo_id,'recipe_id',m.recipe_id)
from public.ticket_lines_marbella l join public.map_tpv_receta m on m.articulo_id=l.articulo_id
where l.fecha_negocio between '2026-09-01' and '2026-10-09'
 and not exists(select 1 from public.recipe_ingredients ri where ri.recipe_id=m.recipe_id)
group by l.articulo_id,m.recipe_id
on conflict do nothing;

insert into stock_v2.issues(run_id,issue_type,source_key,occurrences,evidence)
select '21ba4e50-8f0b-4873-9395-f9c9c26f839a'::uuid,
'september_tpv_article_unmapped',l.articulo_id::text,count(*),
jsonb_build_object('articulo_id',l.articulo_id)
from public.ticket_lines_marbella l left join public.map_tpv_receta m
on m.articulo_id=l.articulo_id
where l.fecha_negocio between '2026-09-01' and '2026-10-09' and m.articulo_id is null
group by l.articulo_id
on conflict do nothing;

create or replace view stock_v2.latest_uncertified_anchor with (security_invoker=true) as
with source_rows as (
 select run_id,ingredient_id,count_at counted_at,unit,physical_quantity,'2026-09-18_ledger_recount'::text origin
 from stock_v2.legacy_inventory_evidence where certified=false
 union all
 select run_id,ingredient_id,count_date,counted_unit,physical_quantity,'pending_inventory_count'::text
 from stock_v2.inventory_candidates where certified=false
), ranked as (
select *,row_number() over(partition by run_id,ingredient_id order by counted_at desc) pos from source_rows
)
select run_id,ingredient_id,counted_at,unit,physical_quantity,origin
from ranked where pos=1;

-- PROYECCIÓN DESPUÉS DEL DÍA DE RECUENTO, no el día del recuento:
-- no se conoce la hora de cada consumo agregado a día para todos los tickets.
-- No está certificada; NO autoriza stock físico ni pedidos automáticos.
create or replace view stock_v2.provisional_since_count with (security_invoker=true) as
select a.run_id,a.ingredient_id,i.name ingredient_name,a.counted_at,a.origin,a.unit,
 a.physical_quantity opening_physical_count,
 coalesce(sum(d.signed_quantity),0)::numeric(20,4) as net_after_count_day,
 case when a.unit=i.base_unit
  then (a.physical_quantity+coalesce(sum(d.signed_quantity),0))::numeric(20,4)
  else null::numeric end as provisional_estimated_quantity,
 'UNVERIFIED_NOT_FOR_PRODUCTION'::text as validation_status
from stock_v2.latest_uncertified_anchor a
join public.ingredients i on i.id=a.ingredient_id
left join stock_v2.daily_deltas d on d.run_id=a.run_id and d.ingredient_id=a.ingredient_id
and d.business_date>(a.counted_at at time zone 'Europe/Madrid')::date
group by a.run_id,a.ingredient_id,i.name,a.counted_at,a.origin,a.unit,
a.physical_quantity,i.base_unit;

comment on view stock_v2.provisional_since_count is
 'Solo estimación para diagnóstico. El día del recuento no se reconstituye; las recetas actuales no son historial versionado.';
revoke all on all tables in schema stock_v2 from public,anon,authenticated;
