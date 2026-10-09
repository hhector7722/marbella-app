-- Comprobación del cambio del primer inventario. CONSULTAS; no crea inventarios.
with state as (
  select
   (select count(*) from public.ingredients where archived_at is null and inventory_visible=true) active_inventory,
   (select count(*) from public.ingredients where archived_at is null and inventory_visible=true and base_unit='ud') active_units,
   (select count(*) from stock_v2.unit_stock_counts) new_certified_counts,
   (select count(*) from stock_v2.unit_stock_count_lines) new_count_lines,
   (select count(*) from public.inventory_counts where status='pending') old_pending,
   (select count(*) from public.inventory_count_drafts) saved_drafts,
   (select count(*) from public.stock_movements where movement_type='INVENTORY_COUNT') canonical_inventory_movements,
   (select count(*) from public.ticket_lines_marbella) sales_lines,
   has_function_privilege('anon','public.certify_unit_stock_count(uuid)','EXECUTE') can_anon_certify,
   has_function_privilege('anon','public.get_unit_stock_status()','EXECUTE') can_anon_view,
   has_schema_privilege('authenticated','stock_v2','USAGE') can_staff_read_private
)
select 'catalogo_coincide_con_inventory_visible' control,
 case when active_inventory=active_units and active_units>0 then 'OK' else 'REVISAR_NO_UNITARIOS' end result from state
union all
select 'primer_stock_espera_a_recuento',
 case when new_certified_counts=0 and new_count_lines=0 then 'OK' else 'RECUENTO_YA_REGISTRADO' end from state
union all
select 'inventarios_viejos_fuera_de_pendientes',
 case when old_pending=0 and saved_drafts=0 then 'OK' else 'REVISAR_BORRADORES' end from state
union all
select 'funciones_no_publicas',
 case when not can_anon_certify and not can_anon_view and not can_staff_read_private then 'OK' else 'ERROR_PERMISOS' end from state
union all
select 'ventas_e_inventario_ledger_original_disponibles',
 case when sales_lines>0 and canonical_inventory_movements>0 then 'OK' else 'FALLO_DATOS' end from state
order by control;