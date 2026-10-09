-- Simulación Stock 2.0, snapshot inaugural 08-03-2026..09-10-2026.
-- Ejecutar SOLO con run privado; nunca modificar stock_movements / stock_current.
-- 1: Las ventas se reconstruyen desde tickets y recetas ACTUALES.
--    Su exactitud histórica no está demostrada hasta versionar recetas.
-- 2: Compras confirmadas se toman del libro existente, NO de OCR pendiente.
-- 3: Cantidades de unidades incompatibles van a issues, nunca se infieren.

with sale_rows as (
  select l.fecha_negocio as day, ri.ingredient_id,
         i.base_unit, l.unidades, m.factor_porcion, ri.quantity_gross,
         case
           when ri.unit = i.base_unit then 1::numeric
           when ri.unit='kg' and i.base_unit='g' then 1000::numeric
           when ri.unit='l' and i.base_unit='ml' then 1000::numeric
           when ri.unit='g' and i.base_unit='ml' and i.density_g_per_ml>0 then 1/i.density_g_per_ml
           when ri.unit='ml' and i.base_unit='g' and i.density_g_per_ml>0 then i.density_g_per_ml
           else null
         end as unit_multiplier
  from public.ticket_lines_marbella l
  join public.map_tpv_receta m on m.articulo_id=l.articulo_id
  join public.recipe_ingredients ri on ri.recipe_id=m.recipe_id
  join public.ingredients i on i.id=ri.ingredient_id
  where l.fecha_negocio between '2026-03-08' and '2026-10-09'
)
insert into stock_v2.daily_deltas (
  run_id,business_date,ingredient_id,source,base_unit,signed_quantity,source_records,is_estimate
)
select '3a0e2663-dabd-4849-a893-17b3b4c20289'::uuid,day,ingredient_id,'sale_recipe_estimate',base_unit,
       round(sum(-unidades*factor_porcion*quantity_gross*unit_multiplier),4),
       count(*),true
from sale_rows
where unit_multiplier is not null and quantity_gross>0
 and unidades is not null and factor_porcion>0
 and base_unit in ('g','ml','ud')
group by day,ingredient_id,base_unit
on conflict do nothing;

insert into stock_v2.daily_deltas(
  run_id,business_date,ingredient_id,source,base_unit,signed_quantity,source_records,is_estimate
)
select '3a0e2663-dabd-4849-a893-17b3b4c20289'::uuid,(m.movement_date at time zone 'Europe/Madrid')::date,
 m.ingredient_id,
 case when m.origin='receipt_confirmation' then 'purchase_k4' else 'purchase_legacy' end,
 i.base_unit,round(sum(m.quantity),4),count(*),
 m.origin<>'receipt_confirmation'
from public.stock_movements m
join public.ingredients i on i.id=m.ingredient_id
where m.movement_type='PURCHASE' and m.origin in ('legacy','receipt_confirmation')
 and (m.movement_date at time zone 'Europe/Madrid')::date between '2026-03-08' and '2026-10-09'
 and m.quantity>0 and m.unit=i.base_unit and i.base_unit in ('g','ml','ud')
group by 2,3,4,5,8
on conflict do nothing;

-- Entradas de TPV sin correspondencia con receta.
insert into stock_v2.issues(run_id,issue_type,source_key,occurrences,evidence)
select '3a0e2663-dabd-4849-a893-17b3b4c20289'::uuid,'tpv_article_unmapped',l.articulo_id::text,count(*),
 jsonb_build_object('article_id',l.articulo_id,'units',sum(l.unidades))
from public.ticket_lines_marbella l
left join public.map_tpv_receta m on m.articulo_id=l.articulo_id
where l.fecha_negocio between '2026-03-08' and '2026-10-09'
and m.articulo_id is null
group by l.articulo_id
on conflict do nothing;

-- Recetas enlazadas que no contienen ingredientes.
insert into stock_v2.issues(run_id,issue_type,source_key,occurrences,evidence)
select '3a0e2663-dabd-4849-a893-17b3b4c20289'::uuid,'tpv_recipe_without_ingredients',l.articulo_id::text,count(*),
 jsonb_build_object('article_id',l.articulo_id,'recipe_id',m.recipe_id)
from public.ticket_lines_marbella l join public.map_tpv_receta m on m.articulo_id=l.articulo_id
where l.fecha_negocio between '2026-03-08' and '2026-10-09'
and not exists (select 1 from public.recipe_ingredients ri where ri.recipe_id=m.recipe_id)
group by l.articulo_id,m.recipe_id
on conflict do nothing;

-- Receta en unidad no homologable: no fabricar una conversión.
insert into stock_v2.issues(run_id,issue_type,source_key,occurrences,evidence)
select '3a0e2663-dabd-4849-a893-17b3b4c20289'::uuid,'recipe_unit_unverified',
 concat(l.articulo_id,':',ri.ingredient_id,':',ri.unit,':',i.base_unit),
 count(*), jsonb_build_object('article_id',l.articulo_id,
 'recipe_id',m.recipe_id,'ingredient_id',ri.ingredient_id,
 'recipe_unit',ri.unit,'base_unit',i.base_unit)
from public.ticket_lines_marbella l
join public.map_tpv_receta m on m.articulo_id=l.articulo_id
join public.recipe_ingredients ri on ri.recipe_id=m.recipe_id
join public.ingredients i on i.id=ri.ingredient_id
where l.fecha_negocio between '2026-03-08' and '2026-10-09'
and not (
ri.unit=i.base_unit or (ri.unit='kg' and i.base_unit='g')
or (ri.unit='l' and i.base_unit='ml')
or (ri.unit='g' and i.base_unit='ml' and i.density_g_per_ml>0)
or (ri.unit='ml' and i.base_unit='g' and i.density_g_per_ml>0))
group by l.articulo_id,m.recipe_id,ri.ingredient_id,ri.unit,i.base_unit
on conflict do nothing;

-- Compras con unidad incompatible: se dejan visibles y excluidas.
insert into stock_v2.issues(run_id,issue_type,source_key,occurrences,evidence)
select '3a0e2663-dabd-4849-a893-17b3b4c20289'::uuid,'purchase_unit_unverified',
 concat(m.ingredient_id,':',m.unit,':',i.base_unit),
 count(*),jsonb_build_object('ingredient_id',m.ingredient_id,'ledger_unit',m.unit,
 'base_unit',i.base_unit,'total_recorded_quantity',sum(m.quantity))
from public.stock_movements m
join public.ingredients i on i.id=m.ingredient_id
where m.movement_type='PURCHASE'
and m.origin in ('legacy','receipt_confirmation')
and (m.movement_date at time zone 'Europe/Madrid')::date between '2026-03-08' and '2026-10-09'
and m.unit is distinct from i.base_unit
group by m.ingredient_id,m.unit,i.base_unit
on conflict do nothing;

-- Inventarios existentes: candidatos, NO puntos de cierre acreditados.
insert into stock_v2.inventory_candidates(
  run_id,count_id,ingredient_id,count_date,physical_quantity,counted_unit,certified
)
select '3a0e2663-dabd-4849-a893-17b3b4c20289'::uuid,c.id,l.ingredient_id,c.created_at,
 l.physical_stock,l.unit,c.status='certified'
from public.inventory_counts c
join public.inventory_count_lines l on l.count_id=c.id
where c.created_at::date between '2026-03-08' and '2026-10-09'
  and l.physical_stock is not null
on conflict do nothing;

update stock_v2.replay_runs set status='simulated'
where id='3a0e2663-dabd-4849-a893-17b3b4c20289'::uuid and status='draft';
