-- Copilot: revoke anonymous EXECUTE on sensitive RPCs, and enforce database-side role checks.
-- Existing authenticated application flows retain EXECUTE; role restrictions apply to employee records and assistant reports.
DO $hardening$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname = ANY(ARRAY[
      'consultar_pedidos_abiertos','consultar_flujos_caja_efectivo','consultar_cambios_entre_cajas',
      'consultar_inventario','consultar_registros_asistencia','consultar_registros_horas_extras',
      'consultar_costes_mano_obra','consultar_metricas_basicas','generar_informe_diario',
      'generar_informe_semanal','generar_informe_personalizado','consultar_manuales',
      'consultar_usuarios','consultar_reservas','gestionar_horarios','gestionar_recetas',
      'gestionar_ingredientes','gestionar_proveedores','gestionar_consumo_personal',
      'gestionar_carta','gestionar_reservas','asignar_roles','crear_pedido','cerrar_caja',
      'gestionar_flujos_caja_efectivo','gestionar_cambios_entre_cajas','actualizar_stock',
      'get_daily_sales_stats','get_cash_closings_summary','get_full_period_ticket_sales_detail',
      'get_full_period_ticket_sales_detail_raw','get_employee_role'
    ])
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || fn.signature || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || fn.signature || ' TO authenticated';
  END LOOP;
END;
$hardening$;

-- SECURITY DEFINER functions must check auth.uid and role, not assume that NULL is denied by NOT IN.
CREATE OR REPLACE FUNCTION public.consultar_registros_asistencia(
  p_user_id uuid, p_fecha_inicio date, p_fecha_fin date
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
 SELECT CASE
  WHEN auth.uid() IS NULL OR public.current_employee_role() IS NULL THEN
    jsonb_build_object('error','forbidden')
  WHEN public.current_employee_role() NOT IN ('manager','admin')
       AND auth.uid() IS DISTINCT FROM p_user_id THEN
    jsonb_build_object('error','forbidden','detail','solo_fichajes_propios')
  WHEN p_fecha_fin < p_fecha_inicio OR (p_fecha_fin-p_fecha_inicio)>62 THEN
    jsonb_build_object('error','rango_invalido')
  ELSE
    COALESCE((SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.clock_in ASC NULLS LAST)
      FROM (SELECT * FROM public.time_logs tl
        WHERE tl.user_id=p_user_id AND tl.clock_in::date BETWEEN p_fecha_inicio AND p_fecha_fin) t),
      '[]'::jsonb)
 END;
$$;

CREATE OR REPLACE FUNCTION public.consultar_registros_horas_extras(
  p_user_id uuid, p_fecha_inicio date, p_fecha_fin date
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
 SELECT CASE
  WHEN auth.uid() IS NULL OR public.current_employee_role() IS NULL THEN
    jsonb_build_object('error','forbidden')
  WHEN public.current_employee_role() NOT IN ('manager','admin')
       AND auth.uid() IS DISTINCT FROM p_user_id THEN
    jsonb_build_object('error','forbidden','detail','solo_extras_propias')
  WHEN p_fecha_fin < p_fecha_inicio OR (p_fecha_fin-p_fecha_inicio)>62 THEN
    jsonb_build_object('error','rango_invalido')
  ELSE
    COALESCE((SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.week_start ASC NULLS LAST)
      FROM (SELECT * FROM public.weekly_snapshots ws
        WHERE ws.user_id=p_user_id AND ws.week_start <= p_fecha_fin AND ws.week_end >= p_fecha_inicio) t),
      '[]'::jsonb)
 END;
$$;

CREATE OR REPLACE FUNCTION public.consultar_usuarios(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
 SELECT CASE
  WHEN auth.uid() IS NULL OR coalesce(public.current_employee_role(),'') NOT IN ('manager','admin','supervisor') THEN
    jsonb_build_object('error','forbidden')
  ELSE
    coalesce((SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.full_name ASC NULLS LAST)
      FROM (SELECT p.id,trim(concat_ws(' ',nullif(trim(p.first_name),''),nullif(trim(p.last_name),''))) full_name,
                p.role,p.email FROM public.profiles p) t), '[]'::jsonb)
 END;
$$;

CREATE OR REPLACE FUNCTION public.consultar_metricas_basicas()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
 SELECT CASE WHEN auth.uid() IS NULL OR coalesce(public.current_employee_role(),'') NOT IN ('manager','admin')
 THEN jsonb_build_object('error','forbidden')
 ELSE public.get_daily_sales_stats(current_date) END;
$$;

CREATE OR REPLACE FUNCTION public.generar_informe_diario(p_fecha date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
 SELECT CASE WHEN auth.uid() IS NULL OR coalesce(public.current_employee_role(),'') NOT IN ('manager','admin')
 THEN jsonb_build_object('error','forbidden')
 ELSE public.get_daily_sales_stats(p_fecha) END;
$$;

CREATE OR REPLACE FUNCTION public.generar_informe_semanal(p_fecha_inicio date,p_fecha_fin date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  d date;
  v_days jsonb := '[]'::jsonb;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.current_employee_role(),'') NOT IN ('manager','admin')
 THEN RETURN jsonb_build_object('error','forbidden'); END IF;
 IF p_fecha_fin<p_fecha_inicio OR (p_fecha_fin-p_fecha_inicio)>62
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

CREATE OR REPLACE FUNCTION public.generar_informe_personalizado(p_filtros jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
 SELECT CASE WHEN auth.uid() IS NULL OR coalesce(public.current_employee_role(),'') NOT IN ('manager','admin')
 THEN jsonb_build_object('error','forbidden')
 ELSE jsonb_build_object('filtros',coalesce(p_filtros,'{}'::jsonb),'resultado','[]'::jsonb,'nota','stub_sin_implementacion') END;
$$;

-- Block NULL-role users even when a function is invoked by an authenticated token.
-- Preserve published-shift visibility for all actual employees; prevent staff from requesting another user's schedule.
CREATE OR REPLACE FUNCTION public.gestionar_horarios(p_accion text,p_datos jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public
AS $$
DECLARE
 v_fecha date:=coalesce((p_datos->>'fecha')::date,current_date);
 v_user_id uuid:=(p_datos->>'user_id')::uuid;
 v_nombre text:=trim(coalesce(p_datos->>'nombre',''));
 v_role text:=public.current_employee_role();
BEGIN
 IF auth.uid() IS NULL OR v_role IS NULL THEN
  RETURN jsonb_build_object('error','forbidden'); END IF;
 IF p_accion IN ('consultar','listar','ver') THEN
  IF v_role='staff' THEN
    IF v_user_id IS NOT NULL AND v_user_id<>auth.uid() THEN
      RETURN jsonb_build_object('error','forbidden'); END IF;
    v_user_id:=auth.uid();
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('fecha',s.date,
   'empleado',trim(concat_ws(' ',p.first_name,p.last_name)),'actividad',s.activity,
   'hora_inicio',s.event_start_time,'hora_fin',s.event_end_time,
   'participantes',s.event_participants,'categoria',s.categoria,'publicado',s.is_published)
   ORDER BY s.date,p.first_name)
   FROM public.shifts s JOIN public.profiles p ON p.id=s.user_id
   WHERE s.date=v_fecha AND s.is_published=true
    AND (v_user_id IS NULL OR s.user_id=v_user_id)
    AND (v_nombre='' OR (p.first_name || ' ' || coalesce(p.last_name,'')) ILIKE '%'||v_nombre||'%')),
    jsonb_build_object('fecha',v_fecha,'turnos','[]','nota','No hay turnos publicados para esta fecha'));
 END IF;
 RETURN jsonb_build_object('error','accion_no_soportada');
END;
$$;