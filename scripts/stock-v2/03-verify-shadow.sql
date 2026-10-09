-- Pruebas de integridad para el snapshot Stock 2.0 (SOLO CONSULTAS).
-- Cada fila debe ser 'OK'; cualquier FAIL impide su promoción a stock operativo.
with audit as (
  select
    (select count(*) from stock_v2.daily_deltas where run_id='3a0e2663-dabd-4849-a893-17b3b4c20289') as events,
    (select count(*) from stock_v2.issues where run_id='3a0e2663-dabd-4849-a893-17b3b4c20289') as issues,
    (select count(*) from stock_v2.inventory_candidates where run_id='3a0e2663-dabd-4849-a893-17b3b4c20289') as counts,
    (select count(*) from stock_v2.daily_deltas where run_id='3a0e2663-dabd-4849-a893-17b3b4c20289'
      and business_date not between '2026-03-08' and '2026-10-09') as outside_period,
    (select count(*) from stock_v2.daily_deltas where run_id='3a0e2663-dabd-4849-a893-17b3b4c20289'
      and base_unit not in('g','ml','ud')) as invalid_base_units,
    (select count(*) from stock_v2.daily_deltas where run_id='3a0e2663-dabd-4849-a893-17b3b4c20289'
      and source='sale_recipe_estimate' and signed_quantity>0) as positive_sale_groups,
    (select count(*) from stock_v2.inventory_candidates where run_id='3a0e2663-dabd-4849-a893-17b3b4c20289' and certified) as certified_counts,
    has_schema_privilege('anon','stock_v2','USAGE') as anon_usage,
    has_schema_privilege('authenticated','stock_v2','USAGE') as authenticated_usage,
    (select status from stock_v2.replay_runs where id='3a0e2663-dabd-4849-a893-17b3b4c20289') as run_status
)
select 'schema_privado' test, case when not anon_usage and not authenticated_usage then 'OK' else 'FAIL' end result
from audit
union all select 'simulacion_con_datos', case when events>0 and issues>0 then 'OK' else 'FAIL' end from audit
union all select 'ningun_evento_fuera_de_periodo',case when outside_period=0 then 'OK' else 'FAIL' end from audit
union all select 'solo_unidades_base',case when invalid_base_units=0 then 'OK' else 'FAIL' end from audit
union all select 'inventarios_no_aplicados_ni_certificados',case when counts>0 and certified_counts=0 then 'OK' else 'FAIL' end from audit
union all select 'ejecucion_solo_simulada',case when run_status='simulated' then 'OK' else 'FAIL' end from audit
order by test;
