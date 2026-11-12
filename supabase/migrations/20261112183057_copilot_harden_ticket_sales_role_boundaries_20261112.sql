-- Endurece las consultas de detalle de ventas sin modificar sus cálculos.
-- Roles autorizados: manager y admin. Staff, supervisor y sesiones anónimas
-- reciben { "error": "forbidden" }. La capa principal de consultas conserva
-- los informes de cierres permitidos por otros flujos específicos.
-- Usa la definición real desplegada para conservar las reglas BDP existentes.
DO $audit$
DECLARE
  def_raw text;
  def_wrapper text;
BEGIN
  def_raw := pg_get_functiondef('public.get_full_period_ticket_sales_detail_raw(date,date)'::regprocedure);
  IF def_raw NOT LIKE '%SELECT jsonb_build_object(%'
     OR def_raw NOT LIKE '%);'||chr(10)||'$function$%' THEN
    RAISE EXCEPTION 'Unexpected raw ticket-sales function structure';
  END IF;
  def_raw := replace(
    def_raw,
    'SELECT jsonb_build_object(',
    'SELECT CASE WHEN auth.uid() IS NOT NULL AND public.current_employee_role() IN (''manager'',''admin'') THEN jsonb_build_object('
  );
  def_raw := replace(
    def_raw,
    ');'||chr(10)||'$function$',
    ') ELSE jsonb_build_object(''error'',''forbidden'') END;'||chr(10)||'$function$'
  );
  EXECUTE def_raw;
  def_wrapper := pg_get_functiondef('public.get_full_period_ticket_sales_detail(date,date)'::regprocedure);
  IF def_wrapper NOT LIKE '%BEGIN'||chr(10)||' v_report :=%' THEN
    RAISE EXCEPTION 'Unexpected ticket-sales wrapper structure';
  END IF;
  def_wrapper := replace(
    def_wrapper,
    'BEGIN'||chr(10)||' v_report :=',
    'BEGIN'||chr(10)||
    ' IF auth.uid() IS NULL OR public.current_employee_role() NOT IN (''manager'',''admin'') THEN'||chr(10)||
    '   RETURN jsonb_build_object(''error'',''forbidden'');'||chr(10)||
    ' END IF;'||chr(10)||
    ' v_report :='
  );
  EXECUTE def_wrapper;
END $audit$;
