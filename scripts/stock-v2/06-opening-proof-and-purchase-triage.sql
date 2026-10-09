-- Base de septiembre Stock 2.0: carga de inventario CON evidencia y sugerencias K5.
-- No se inserta ninguna cantidad inicial hasta recuperar el recuento ORIGINAL.
-- Tampoco se escribe sobre tickets, ventas, stock_current ni stock_movements.

create table if not exists stock_v2.opening_baseline_lines (
 run_id uuid not null references stock_v2.opening_baseline_requests(run_id) on delete cascade,
 ingredient_id uuid not null references public.ingredients(id),
 physical_quantity numeric(20,4) not null check(physical_quantity >= 0),
 counted_unit text not null check(counted_unit in ('g','ml','ud')),
 source_line_ref text not null check(length(btrim(source_line_ref))>0),
 evidence_notes text,
 created_at timestamptz not null default now(),
 primary key(run_id,ingredient_id)
);
alter table stock_v2.opening_baseline_lines enable row level security;
revoke all on stock_v2.opening_baseline_lines from public,anon,authenticated;

-- Solo una base expresamente VALIDADA puede ser utilizada como stock calculado.
-- Como el inventario de primeros de septiembre aún no está identificado, esta
-- vista DEBE devolver cero filas, nunca cantidades ficticias o backfill a cero.
create or replace view stock_v2.verified_opening_estimate with (security_invoker=true) as
select b.run_id,b.ingredient_id,i.name ingredient_name,b.counted_unit,
 o.physical_count_at,b.physical_quantity as opening_quantity,
 coalesce(sum(d.signed_quantity),0)::numeric(20,4) as estimated_post_opening_delta,
 (b.physical_quantity + coalesce(sum(d.signed_quantity),0))::numeric(20,4) as estimated_quantity,
 true as recipe_history_unverified
from stock_v2.opening_baseline_lines b
join stock_v2.opening_baseline_requests o on o.run_id=b.run_id
join public.ingredients i on i.id=b.ingredient_id and b.counted_unit=i.base_unit
left join stock_v2.daily_deltas d on d.run_id=b.run_id
 and d.ingredient_id=b.ingredient_id
 and d.business_date>(o.physical_count_at at time zone 'Europe/Madrid')::date
where o.status='validated' and o.physical_count_at is not null
 and o.source_evidence_ref is not null
group by b.run_id,b.ingredient_id,i.name,b.counted_unit,
 o.physical_count_at,b.physical_quantity;

-- Candidatos Mistral SOLO para resolver mapeos. Ninguna sugerencia autoriza
-- validar una presentación, registrar compras o cambiar precios.
create or replace view stock_v2.purchase_mapping_triage with (security_invoker=true) as
select a.run_id,a.line_id,a.invoice_id,a.invoice_date,
 a.review_state,a.posted_legacy,a.posted_k4,
 a.ingredient_id as confirmed_legacy_ingredient_id,
 l.interpretation_proposal_id,
 p.normalizer_version,p.status::text as proposal_status,
 p.ingredient_id as proposed_ingredient_id,
 p.mapping_version_id as proposed_mapping_version_id,
 nullif(p.interpreted->>'candidate_ingredient_id','') as ocr_candidate_ingredient_id,
 p.interpreted->>'match_source' as match_source,
 p.review_reasons,
 case
  when a.posted_legacy or a.posted_k4 then 'ALREADY_POSTED'
  when a.review_state='invoice_partially_posted' then 'MUST_RECONCILE_PARTIAL_RECEIPT'
  when a.review_state='date_unverified' then 'DATE_UNVERIFIED'
  when a.review_state='ingredient_unmapped'
   and p.interpreted->>'candidate_ingredient_id' is not null
    then 'CANDIDATE_NOT_YET_CONFIRMED'
  when a.review_state='needs_k4_review' and p.status::text='ready_for_review'
    then 'REQUIRES_K4_PREVIEW_AND_PAGE_EVIDENCE'
  else 'REQUIRES_HUMAN_OR_ECONOMIC_REVIEW'
 end as next_action
from stock_v2.purchase_line_audit a
join public.purchase_invoice_lines l on l.id=a.line_id
left join public.purchase_interpretation_proposals p on p.id=l.interpretation_proposal_id;

comment on view stock_v2.verified_opening_estimate is
 'Permanece vacío hasta contar con inventario físico de septiembre identificado y aprobado. Aun validado, el consumo retroactivo sigue estimado por receta actual.';
comment on view stock_v2.purchase_mapping_triage is
 'Ayuda a conciliar albaranes sin registrar ninguna compra. Los candidate_ingredient_id no se aceptan automáticamente.';
revoke all on all tables in schema stock_v2 from public,anon,authenticated;
