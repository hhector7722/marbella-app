
-- Deny unauthenticated direct access to operational copilot RPCs and underlying financial summaries.
DO $$
DECLARE f record;
BEGIN
 FOR f IN
 SELECT p.oid::regprocedure AS signature
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname = ANY(ARRAY[
 'consultar_registros_asistencia','consultar_registros_horas_extras',
 'consultar_metricas_basicas','generar_informe_diario','generar_informe_semanal',
 'generar_informe_personalizado','consultar_usuarios','consultar_inventario',
 'consultar_pedidos_abiertos','consultar_cambios_entre_cajas',
 'consultar_flujos_caja_efectivo','consultar_costes_mano_obra',
 'consultar_manuales','consultar_reservas','get_daily_sales_stats',
 'get_cash_closings_summary','gestionar_horarios'])
 LOOP
   EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',f.signature);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role',f.signature);
 END LOOP;
END $$;
-- Definer functions must additionally enforce tenant identity and user role.
CREATE OR REPLACE FUNCTION public.consultar_registros_asistencia(p_user_id uuid,p_fecha_inicio date,p_fecha_fin date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
 SELECT CASE
 WHEN auth.uid() IS NULL OR public.current_employee_role() IS NULL THEN jsonb_build_object('error','forbidden')
 WHEN (auth.uid() IS DISTINCT FROM p_user_id) AND public.current_employee_role() NOT IN ('manager','admin')
 THEN jsonb_build_object('error','forbidden','detail','solo_registros_propios')
 ELSE COALESCE(
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.clock_in ASC NULLS LAST) FROM
   (SELECT * FROM public.time_logs tl WHERE tl.user_id=p_user_id
    AND tl.clock_in::date BETWEEN p_fecha_inicio AND p_fecha_fin) t), '[]'::jsonb)
 END;
$$;
CREATE OR REPLACE FUNCTION public.consultar_registros_horas_extras(p_user_id uuid,p_fecha_inicio date,p_fecha_fin date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
 SELECT CASE
 WHEN auth.uid() IS NULL OR public.current_employee_role() IS NULL THEN jsonb_build_object('error','forbidden')
 WHEN (auth.uid() IS DISTINCT FROM p_user_id) AND public.current_employee_role() NOT IN ('manager','admin')
 THEN jsonb_build_object('error','forbidden','detail','solo_extras_propias')
 ELSE COALESCE(
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.week_start ASC NULLS LAST) FROM
   (SELECT * FROM public.weekly_snapshots ws WHERE ws.user_id=p_user_id
    AND ws.week_start<=p_fecha_fin AND ws.week_end>=p_fecha_inicio) t), '[]'::jsonb)
 END;
$$;
CREATE OR REPLACE FUNCTION public.consultar_metricas_basicas()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
 SELECT CASE WHEN auth.uid() IS NOT NULL AND public.current_employee_role() IN ('manager','admin')
 THEN public.get_daily_sales_stats(CURRENT_DATE)
 ELSE jsonb_build_object('error','forbidden') END;
$$;
CREATE OR REPLACE FUNCTION public.generar_informe_diario(p_fecha date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
 SELECT CASE WHEN auth.uid() IS NOT NULL AND public.current_employee_role() IN ('manager','admin')
 THEN public.get_daily_sales_stats(p_fecha)
 ELSE jsonb_build_object('error','forbidden') END;
$$;
CREATE OR REPLACE FUNCTION public.generar_informe_semanal(p_fecha_inicio date,p_fecha_fin date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE d date; v_days jsonb := '[]'::jsonb;
BEGIN
 IF auth.uid() IS NULL OR public.current_employee_role() NOT IN ('manager','admin')
 THEN RETURN jsonb_build_object('error','forbidden'); END IF;
 IF p_fecha_inicio IS NULL OR p_fecha_fin IS NULL OR p_fecha_fin<p_fecha_inicio OR p_fecha_fin-p_fecha_inicio>62
 THEN RETURN jsonb_build_object('error','rango_invalido'); END IF;
 d:=p_fecha_inicio;
 WHILE d<=p_fecha_fin LOOP
  v_days:=v_days || jsonb_build_array(public.get_daily_sales_stats(d));
  d:=d+1;
 END LOOP;
 RETURN jsonb_build_object('fecha_inicio',p_fecha_inicio,'fecha_fin',p_fecha_fin,
  'cash_closings',public.get_cash_closings_summary(p_fecha_inicio,p_fecha_fin),'daily_sales',v_days);
END;
$$;
