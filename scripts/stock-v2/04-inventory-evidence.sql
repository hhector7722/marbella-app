-- Evidencia física ya capturada por el motor de inventarios anterior.
-- NO se aplica el ajuste del ledger (ya existe). Tampoco se considera certificada.
create table if not exists stock_v2.legacy_inventory_evidence (
  run_id uuid not null references stock_v2.replay_runs(id) on delete cascade,
  stock_movement_id uuid not null references public.stock_movements(id),
  ingredient_id uuid not null references public.ingredients(id),
  count_at timestamptz not null,
  physical_quantity numeric(20,4) not null,
  unit text not null,
  historical_adjustment numeric(20,4) not null,
  provenance jsonb not null,
  certified boolean not null default false,
  primary key(run_id,stock_movement_id)
);
alter table stock_v2.legacy_inventory_evidence enable row level security;
revoke all on stock_v2.legacy_inventory_evidence from public,anon,authenticated;

insert into stock_v2.legacy_inventory_evidence (
  run_id,stock_movement_id,ingredient_id,count_at,physical_quantity,
  unit,historical_adjustment,provenance,certified
)
select '3a0e2663-dabd-4849-a893-17b3b4c20289'::uuid,m.id,m.ingredient_id,m.movement_date,
 (m.provenance->>'physical_stock')::numeric,m.unit,m.quantity,m.provenance,false
from public.stock_movements m
where m.movement_type='INVENTORY_COUNT'
and m.origin='inventory_count'
and m.provenance->>'physical_stock' ~ '^[0-9]+(\.[0-9]+)?$'
and m.movement_date::date between '2026-03-08' and '2026-10-09'
on conflict do nothing;

create or replace view stock_v2.legacy_inventory_comparison with (security_invoker=true) as
select e.run_id,e.stock_movement_id,e.ingredient_id,i.name ingredient_name,e.count_at,
 e.unit,i.base_unit,e.physical_quantity,e.historical_adjustment,e.certified,
 coalesce(sum(d.signed_quantity),0)::numeric(20,4) as hypothetical_balance_at_count,
 case when e.unit=i.base_unit then
 (e.physical_quantity-coalesce(sum(d.signed_quantity),0))::numeric(20,4)
 else null::numeric end as unresolved_initial_stock_or_missing_movements
from stock_v2.legacy_inventory_evidence e
join public.ingredients i on i.id=e.ingredient_id
left join stock_v2.daily_deltas d on d.run_id=e.run_id and d.ingredient_id=e.ingredient_id
 and d.business_date<=(e.count_at at time zone 'Europe/Madrid')::date
group by e.run_id,e.stock_movement_id,e.ingredient_id,i.name,e.count_at,e.unit,
 i.base_unit,e.physical_quantity,e.historical_adjustment,e.certified;

comment on table stock_v2.legacy_inventory_evidence is
 'Copia privada de los physical_stock históricos que estaban en provenance. No se aplica delta dos veces ni se certifica automáticamente.';
revoke all on all tables in schema stock_v2 from public,anon,authenticated;
