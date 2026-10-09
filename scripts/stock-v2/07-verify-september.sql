-- Pruebas de fase 2, solo SELECT. REQUIERE que el stock inicial siga bloqueado.
with a as(
select
 (select status from stock_v2.opening_baseline_requests where run_id='21ba4e50-8f0b-4873-9395-f9c9c26f839a') opening_status,
 (select count(*) from stock_v2.opening_baseline_lines where run_id='21ba4e50-8f0b-4873-9395-f9c9c26f839a') opening_lines,
 (select count(*) from stock_v2.verified_opening_estimate where run_id='21ba4e50-8f0b-4873-9395-f9c9c26f839a') verified_balance_lines,
 (select count(*) from stock_v2.daily_deltas where run_id='21ba4e50-8f0b-4873-9395-f9c9c26f839a') deltas,
 (select count(*) from stock_v2.daily_deltas where run_id='21ba4e50-8f0b-4873-9395-f9c9c26f839a' and business_date not between '2026-09-01' and '2026-10-09') outside_dates,
 (select count(*) from stock_v2.purchase_line_audit where run_id='21ba4e50-8f0b-4873-9395-f9c9c26f839a') purchase_lines,
 (select count(distinct line_id) from stock_v2.purchase_line_audit where run_id='21ba4e50-8f0b-4873-9395-f9c9c26f839a') distinct_purchase_lines,
 (select count(*) from public.ticket_lines_marbella) historical_ticket_lines,
 (select count(*) from public.tickets_marbella) historical_tickets,
 (select count(*) from public.stock_movements where movement_type='PURCHASE') old_purchase_ledger,
 has_schema_privilege('anon','stock_v2','USAGE') anon_can_use,
 has_schema_privilege('authenticated','stock_v2','USAGE') auth_can_use
)
select 'inventario_de_septiembre_no_inventado' test,case when opening_status='awaiting_original_inventory' and opening_lines=0 and verified_balance_lines=0 then 'OK' else 'FAIL' end result from a
union all select 'simulacion_septiembre_poblada',case when deltas>0 then 'OK' else 'FAIL' end from a
union all select 'fechas_de_simulacion_correctas',case when outside_dates=0 then 'OK' else 'FAIL' end from a
union all select 'compras_sin_filas_duplicadas',case when purchase_lines=distinct_purchase_lines and purchase_lines>0 then 'OK' else 'FAIL' end from a
union all select 'ventas_originales_disponibles',case when historical_ticket_lines>0 and historical_tickets>0 then 'OK' else 'FAIL' end from a
union all select 'compras_originales_conservadas',case when old_purchase_ledger>0 then 'OK' else 'FAIL' end from a
union all select 'datos_de_stock_v2_privados',case when not anon_can_use and not auth_can_use then 'OK' else 'FAIL' end from a
order by test;