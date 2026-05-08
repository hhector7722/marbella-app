-- Copiloto operativo — RPCs PostgREST (SECURITY DEFINER + comprobaciones de rol internas)
-- Pedidos abiertos: estado_sala.radiografia_completa (fila operativa id = 1, ver migraciones KDS)

BEGIN;

CREATE OR REPLACE FUNCTION public.consultar_pedidos_abiertos()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(src.elem ORDER BY src.sort_ts DESC NULLS LAST)
      FROM (
        SELECT
          elem AS elem,
          COALESCE(
            NULLIF(trim(elem ->> 'timestamp_tpv'), ''),
            NULLIF(trim(elem ->> 'fecha_apertura'), ''),
            ''
          ) AS sort_ts
        FROM public.estado_sala AS es
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(es.radiografia_completa, '[]'::jsonb)) AS elem
        WHERE es.id = 1
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(elem -> 'productos', '[]'::jsonb)) AS p
            WHERE COALESCE(NULLIF(trim(p ->> 'unidades'), ''), '0')::numeric > 0
          )
      ) AS src
    ),
    '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.consultar_inventario()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.name ASC)
      FROM (
        SELECT
          i.id,
          i.name AS name,
          COALESCE(i.stock_current, 0) AS stock_current,
          COALESCE(i.purchase_unit::text, i.unit::text, '') AS unidad_medida
        FROM public.ingredients AS i
      ) AS t
    ),
    '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.actualizar_stock(p_producto_id uuid, p_cantidad numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_employee_role() NOT IN ('manager','admin','supervisor','chef') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.ingredients
    SET stock_current = COALESCE(stock_current, 0) + p_cantidad, updated_at = now()
    WHERE id = p_producto_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ingrediente_no_encontrado', 'producto_id', p_producto_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'producto_id', p_producto_id, 'delta', p_cantidad);
END;
$$;

CREATE OR REPLACE FUNCTION public.consultar_flujos_caja_efectivo(p_fecha_inicio date, p_fecha_fin date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC NULLS LAST)
      FROM (
        SELECT tl.id, tl.box_id, tl.type, tl.amount, tl.breakdown, tl.user_id, tl.notes, tl.created_at, tl.closing_id
        FROM public.treasury_log AS tl
        WHERE tl.created_at::date BETWEEN p_fecha_inicio AND p_fecha_fin
      ) AS t
    ),
    '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.consultar_cambios_entre_cajas(p_fecha_inicio date, p_fecha_fin date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC NULLS LAST)
      FROM (
        SELECT tl.id, tl.box_id, tl.type, tl.amount, tl.breakdown, tl.user_id, tl.notes, tl.created_at, tl.closing_id
        FROM public.treasury_log AS tl
        WHERE tl.type = 'SWAP'::text AND tl.created_at::date BETWEEN p_fecha_inicio AND p_fecha_fin
      ) AS t
    ),
    '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.consultar_registros_asistencia(p_user_id uuid, p_fecha_inicio date, p_fecha_fin date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.current_employee_role() = 'staff'::text AND auth.uid() IS DISTINCT FROM p_user_id THEN
      jsonb_build_object('error', 'forbidden', 'detail', 'staff_solo_ve_sus_propios_fichajes')
    ELSE COALESCE(
      (
        SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.clock_in ASC NULLS LAST)
        FROM (
          SELECT *
          FROM public.time_logs AS tl
          WHERE tl.user_id = p_user_id
            AND tl.clock_in::date BETWEEN p_fecha_inicio AND p_fecha_fin
        ) AS t
      ),
      '[]'::jsonb
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.consultar_registros_horas_extras(p_user_id uuid, p_fecha_inicio date, p_fecha_fin date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.current_employee_role() = 'staff'::text AND auth.uid() IS DISTINCT FROM p_user_id THEN
      jsonb_build_object('error', 'forbidden', 'detail', 'staff_solo_ve_sus_propios_snapshots')
    ELSE COALESCE(
      (
        SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.week_start ASC NULLS LAST)
        FROM (
          SELECT *
          FROM public.weekly_snapshots AS ws
          WHERE ws.user_id = p_user_id
            AND ws.week_start <= p_fecha_fin
            AND ws.week_end >= p_fecha_inicio
        ) AS t
      ),
      '[]'::jsonb
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.consultar_costes_mano_obra(p_fecha_inicio date, p_fecha_fin date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r text := public.current_employee_role();
  d date;
  v_user RECORD;
  v_day_fixed numeric;
  v_day_ot numeric;
  v_total numeric := 0;
BEGIN
  IF r IS NULL OR r NOT IN ('manager','admin','supervisor','chef') THEN
    RETURN jsonb_build_object('error', 'forbidden', 'detail', 'solo_gerencia_cocina_o_supervisor');
  END IF;

  IF p_fecha_fin < p_fecha_inicio THEN
    RETURN jsonb_build_object('error', 'rango_invalido');
  END IF;

  d := p_fecha_inicio;
  WHILE d <= p_fecha_fin LOOP
    v_day_fixed := 0;
    v_day_ot := 0;

    FOR v_user IN
      SELECT p.id AS uid
      FROM public.profiles AS p
      WHERE COALESCE(p.joining_date, DATE '2000-01-01') <= d
    LOOP
      v_day_fixed := v_day_fixed + public.fn_labor_fixed_day_for_user(v_user.uid, d);
      v_day_ot := v_day_ot + COALESCE(public.fn_labor_overtime_allocated_day(v_user.uid, d), 0);
    END LOOP;

    v_total := v_total + round(v_day_fixed + v_day_ot, 2);
    d := d + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'fecha_inicio', p_fecha_inicio,
    'fecha_fin', p_fecha_fin,
    'coste_total', round(v_total, 2)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consultar_metricas_basicas()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_daily_sales_stats(CURRENT_DATE);
$$;

CREATE OR REPLACE FUNCTION public.generar_informe_diario(p_fecha date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_daily_sales_stats(p_fecha);
$$;

CREATE OR REPLACE FUNCTION public.generar_informe_semanal(p_fecha_inicio date, p_fecha_fin date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date;
  v_days jsonb := '[]'::jsonb;
BEGIN
  IF p_fecha_fin < p_fecha_inicio THEN
    RETURN jsonb_build_object('error', 'rango_invalido');
  END IF;

  d := p_fecha_inicio;
  WHILE d <= p_fecha_fin LOOP
    v_days := v_days || jsonb_build_array(public.get_daily_sales_stats(d));
    d := d + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'fecha_inicio', p_fecha_inicio,
    'fecha_fin', p_fecha_fin,
    'cash_closings', public.get_cash_closings_summary(p_fecha_inicio, p_fecha_fin),
    'daily_sales', v_days
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.generar_informe_personalizado(p_filtros jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'filtros', COALESCE(p_filtros, '{}'::jsonb),
    'resultado', '[]'::jsonb,
    'nota', 'stub_sin_implementacion'
  );
$$;

CREATE OR REPLACE FUNCTION public.consultar_manuales(p_tema text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'tema', COALESCE(trim(p_tema), ''),
    'manuales',
    jsonb_build_array(
      'check-list.pdf',
      'horno-limpieza.pdf',
      'horno-funcionamiento.mp4',
      'altavoces.mp4',
      'bebidas.png',
      'cambios-lluvia.png',
      'cuadro-electrico.png'
    ),
    'ruta_estatica_publica',
    '/docs/manuals/'
  );
$$;

CREATE OR REPLACE FUNCTION public.consultar_usuarios(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.current_employee_role() NOT IN ('manager','admin','supervisor') THEN
      jsonb_build_object('error', 'forbidden')
    ELSE COALESCE(
      (
        SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.full_name ASC NULLS LAST)
        FROM (
          SELECT
            p.id,
            trim(concat_ws(' ', NULLIF(trim(p.first_name), ''), NULLIF(trim(p.last_name), ''))) AS full_name,
            p.role,
            p.email
          FROM public.profiles AS p
        ) AS t
      ),
      '[]'::jsonb
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.asignar_roles(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role IN ('manager','admin')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_role NOT IN ('manager','staff','chef','supervisor','admin') THEN
    RETURN jsonb_build_object('error', 'rol_invalido');
  END IF;

  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'usuario_no_encontrado', 'user_id', p_user_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id, 'role', p_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.consultar_reservas(p_fecha date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('fecha', p_fecha, 'reservas', '[]'::jsonb, 'motivo', 'sin_tabla_dedicada');
$$;

CREATE OR REPLACE FUNCTION public.cerrar_caja(p_usuario_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'error',
    'no_implementada',
    'mensaje',
    'Usar el flujo nativo de cierre de caja en la app.',
    'usuario_id_ref',
    p_usuario_id
  );
$$;

CREATE OR REPLACE FUNCTION public.gestionar_flujos_caja_efectivo(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('error', 'no_implementada', 'accion', p_accion, 'datos', p_datos);
$$;

CREATE OR REPLACE FUNCTION public.gestionar_cambios_entre_cajas(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('error', 'no_implementada', 'accion', p_accion, 'datos', p_datos);
$$;

CREATE OR REPLACE FUNCTION public.gestionar_carta(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('error', 'no_implementada', 'accion', p_accion, 'datos', p_datos);
$$;

CREATE OR REPLACE FUNCTION public.gestionar_recetas(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('error', 'no_implementada', 'accion', p_accion, 'datos', p_datos);
$$;

CREATE OR REPLACE FUNCTION public.gestionar_ingredientes(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('error', 'no_implementada', 'accion', p_accion, 'datos', p_datos);
$$;

CREATE OR REPLACE FUNCTION public.gestionar_consumo_personal(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('error', 'no_implementada', 'accion', p_accion, 'datos', p_datos);
$$;

CREATE OR REPLACE FUNCTION public.gestionar_proveedores(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('error', 'no_implementada', 'accion', p_accion, 'datos', p_datos);
$$;

CREATE OR REPLACE FUNCTION public.gestionar_horarios(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('error', 'no_implementada', 'accion', p_accion, 'datos', p_datos);
$$;

CREATE OR REPLACE FUNCTION public.gestionar_reservas(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('error', 'no_implementada', 'accion', p_accion, 'datos', p_datos);
$$;

CREATE OR REPLACE FUNCTION public.crear_pedido(p_mesa text, p_items jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'error',
    'no_implementada',
    'mensaje',
    'Los pedidos entran vía TPV/BDP, no por copiloto.',
    'mesa',
    p_mesa,
    'items',
    p_items
  );
$$;

CREATE OR REPLACE FUNCTION public.crear_usuario(p_datos jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('error', 'no_implementada', 'datos', p_datos);
$$;

CREATE OR REPLACE FUNCTION public.editar_usuario(p_user_id uuid, p_datos jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('error', 'no_implementada', 'user_id', p_user_id, 'datos', p_datos);
$$;

GRANT EXECUTE ON FUNCTION public.consultar_pedidos_abiertos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_inventario() TO authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_stock(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_flujos_caja_efectivo(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_cambios_entre_cajas(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_registros_asistencia(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_registros_horas_extras(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_costes_mano_obra(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_metricas_basicas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generar_informe_diario(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generar_informe_semanal(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generar_informe_personalizado(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_manuales(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_usuarios(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_roles(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_reservas(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_caja(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_flujos_caja_efectivo(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_cambios_entre_cajas(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_carta(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_recetas(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_ingredientes(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_consumo_personal(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_proveedores(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_horarios(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_reservas(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_pedido(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_usuario(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.editar_usuario(uuid, jsonb) TO authenticated;

COMMIT;
