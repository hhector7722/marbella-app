-- Finish securing copilot RPCs that were not covered by the 17:28 security migration.
-- No table writes: revoke anonymous EXECUTE from operational functions.
DO $secure$
DECLARE signature regprocedure;
BEGIN
 FOR signature IN
   SELECT p.oid::regprocedure
     FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'asignar_roles',
        'cerrar_caja',
        'crear_pedido',
        'gestionar_cambios_entre_cajas',
        'gestionar_carta',
        'gestionar_consumo_personal',
        'gestionar_flujos_caja_efectivo',
        'gestionar_proveedores',
        'gestionar_recetas',
        'get_employee_role',
        'get_full_period_ticket_sales_detail'
      ])
 LOOP
   EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', signature);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', signature);
 END LOOP;
END
$secure$;