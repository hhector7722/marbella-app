-- Restringir los horarios publicados al propio empleado para el rol staff.
-- Mantener el acceso de responsables/chef al cuadrante publicado.
CREATE OR REPLACE FUNCTION public.gestionar_horarios(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fecha date := COALESCE((p_datos->>'fecha')::date, CURRENT_DATE);
  v_user_id uuid := (p_datos->>'user_id')::uuid;
  v_nombre text := trim(COALESCE(p_datos->>'nombre', ''));
  v_role text := public.current_employee_role();
BEGIN
  IF auth.uid() IS NULL OR v_role NOT IN ('staff','supervisor','chef','manager','admin') THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;

  IF p_accion NOT IN ('consultar','listar','ver') THEN
    RETURN jsonb_build_object('error','accion_no_soportada','acciones_validas','["consultar"]');
  END IF;

  IF v_role='staff' THEN
    IF v_user_id IS NOT NULL AND v_user_id IS DISTINCT FROM auth.uid() THEN
      RETURN jsonb_build_object('error','forbidden','detail','solo_horarios_propios');
    END IF;
    v_user_id := auth.uid();
    v_nombre := '';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'fecha',(s.start_time AT TIME ZONE 'Europe/Madrid')::date,
      'empleado',trim(concat_ws(' ',p.first_name,p.last_name)),
      'actividad',s.activity,
      'hora_inicio',s.event_start_time,
      'hora_fin',s.event_end_time,
      'participantes',s.event_participants,
      'categoria',s.categoria,
      'publicado',s.is_published
    ) ORDER BY (s.start_time AT TIME ZONE 'Europe/Madrid')::date,p.first_name)
    FROM public.shifts s
    JOIN public.profiles p ON p.id=s.user_id
    WHERE (s.start_time AT TIME ZONE 'Europe/Madrid')::date=v_fecha
      AND s.is_published=true
      AND (v_user_id IS NULL OR s.user_id=v_user_id)
      AND (v_nombre='' OR (p.first_name||' '||COALESCE(p.last_name,'')) ILIKE '%'||v_nombre||'%')
  ),jsonb_build_object('fecha',v_fecha,'turnos','[]','nota','No hay turnos publicados para esta fecha'));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.gestionar_horarios(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gestionar_horarios(text,jsonb) TO authenticated;
