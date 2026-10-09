-- Stock 2.0: mermas y vistas de diagnóstico. Seguro: SOLO esquema stock_v2.
alter table stock_v2.daily_deltas drop constraint if exists daily_deltas_source_check;
alter table stock_v2.daily_deltas add constraint daily_deltas_source_check
 check(source in ('sale_recipe_estimate','purchase_legacy','purchase_k4','waste_legacy','waste_staff'));

with normalized as (
 select m.*,i.base_unit,
 case when m.unit=i.base_unit then 1::numeric
   when m.unit='kg' and i.base_unit='g' then 1000::numeric
   when m.unit='l' and i.base_unit='ml' then 1000::numeric
   when m.unit='u' and i.base_unit='ud' then 1::numeric
   else null::numeric end factor
 from public.stock_movements m join public.ingredients i on i.id=m.ingredient_id
 where m.movement_type='WASTE' and m.origin in ('legacy','staff_consumption')
 and (m.movement_date at time zone 'Europe/Madrid')::date between '2026-03-08' and '2026-10-09'
)
insert into stock_v2.daily_deltas(
 run_id,business_date,ingredient_id,source,base_unit,signed_quantity,source_records,is_estimate
)
select '3a0e2663-dabd-4849-a893-17b3b4c20289'::uuid,
(movement_date at time zone 'Europe/Madrid')::date,ingredient_id,
case when origin='staff_consumption' then 'waste_staff' else 'waste_legacy' end,
base_unit,round(sum(-quantity*factor),4),count(*),true
from normalized where factor is not null and quantity>0 and base_unit in('g','ml','ud')
group by 2,3,4,5
on conflict do nothing;

insert into stock_v2.issues(run_id,issue_type,source_key,occurrences,evidence)
select '3a0e2663-dabd-4849-a893-17b3b4c20289'::uuid,'waste_unit_unverified',
concat(m.ingredient_id,':',m.unit,':',i.base_unit),count(*),
jsonb_build_object('ingredient_id',m.ingredient_id,'reported_unit',m.unit,
 'base_unit',i.base_unit)
from public.stock_movements m join public.ingredients i on i.id=m.ingredient_id
where m.movement_type='WASTE' and m.origin in ('legacy','staff_consumption')
and (m.movement_date at time zone 'Europe/Madrid')::date between '2026-03-08' and '2026-10-09'
and not (m.unit=i.base_unit or (m.unit='kg' and i.base_unit='g')
 or (m.unit='l' and i.base_unit='ml') or (m.unit='u' and i.base_unit='ud'))
group by m.ingredient_id,m.unit,i.base_unit on conflict do nothing;

-- Albaranes capturados sin entrada asociada: pendientes, nunca auto-contabilizar.
insert into stock_v2.issues(run_id,issue_type,source_key,occurrences,evidence)
select '3a0e2663-dabd-4849-a893-17b3b4c20289'::uuid,'invoice_without_purchase_posting',i.id::text,
greatest((select count(*) from public.purchase_invoice_lines l where l.invoice_id=i.id),1),
jsonb_build_object('invoice_id',i.id,'invoice_status',i.status,
 'has_mistral',exists(select 1 from public.document_extractions e where e.invoice_id=i.id
  and e.extractor_version like 'mistral-%' and e.status='success'))
from public.purchase_invoices i
where i.status::text in ('mapped','pending_mapping','ocr_failed')
and i.duplicate_of_invoice_id is null
and not exists(select 1 from public.purchase_receipt_confirmations c where c.purchase_invoice_id=i.id)
and not exists(select 1 from public.purchase_invoice_lines l join public.stock_movements m
  on m.reference_doc='ALB-LINE-'||l.id::text and m.movement_type='PURCHASE' where l.invoice_id=i.id)
on conflict do nothing;

create or replace view stock_v2.relative_balance with (security_invoker=true) as
select r.id run_id, i.id ingredient_id,i.name ingredient_name,i.base_unit,
coalesce(sum(d.signed_quantity),0)::numeric(20,4) as hypothetical_zero_opening_balance,
coalesce(sum(d.source_records) filter(where d.source='sale_recipe_estimate'),0)::bigint as estimated_recipe_impacts,
coalesce(sum(d.source_records) filter(where d.source like 'purchase_%'),0)::bigint as historical_purchase_movements,
true as requires_opening_stock_validation
from stock_v2.replay_runs r cross join public.ingredients i
left join stock_v2.daily_deltas d on d.run_id=r.id and d.ingredient_id=i.id
group by r.id,i.id,i.name,i.base_unit;

create or replace view stock_v2.inventory_comparison with (security_invoker=true) as
select c.run_id,c.count_id,c.count_date,c.ingredient_id,i.name ingredient_name,
 c.counted_unit,i.base_unit,c.physical_quantity,c.certified,
 coalesce(sum(d.signed_quantity),0)::numeric(20,4) as simulated_relative_balance_at_count,
 case when c.counted_unit=i.base_unit
   then (c.physical_quantity-coalesce(sum(d.signed_quantity),0))::numeric(20,4)
   else null::numeric end as unexplained_opening_or_missing_movements
from stock_v2.inventory_candidates c join public.ingredients i on i.id=c.ingredient_id
left join stock_v2.daily_deltas d on d.run_id=c.run_id and d.ingredient_id=c.ingredient_id
  and d.business_date<=(c.count_date at time zone 'Europe/Madrid')::date
group by c.run_id,c.count_id,c.count_date,c.ingredient_id,i.name,
 c.counted_unit,i.base_unit,c.physical_quantity,c.certified;

comment on view stock_v2.relative_balance is 'Saldo RELATIVO hipotético con existencia inicial cero. Nunca mostrar como stock físico real.';
comment on view stock_v2.inventory_comparison is 'Conciliación informativa con inventarios todavía sin certificar; ninguna entrada de ajuste se aplica.';
revoke all on all tables in schema stock_v2 from public,anon,authenticated;
