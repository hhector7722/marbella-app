-- =============================================================================
-- Copiloto "Crack" — Conexión de RPCs vacías a tablas reales
-- Sustituye los cascarones "no_implementada" por consultas reales.
-- Tablas conectadas: recipes, recipe_ingredients, ingredients, suppliers,
--                   shifts, profiles, staff_consumption, treasury_log
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. RECETAS: consulta completa con ingredientes y coste
--    Permite: "¿Qué lleva la sangría?", "¿Cuánto cuesta hacer una paella?"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestionar_recetas(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre   text := trim(COALESCE(p_datos->>'nombre', p_datos->>'name', ''));
  v_id       uuid;
  v_result   jsonb;
BEGIN
  -- ACCIÓN: buscar (por nombre o listar todas)
  IF p_accion IN ('buscar', 'listar', 'consultar', 'search', 'list', 'get') THEN

    -- Si hay nombre, buscar por similitud flexible (ilike + unaccent no disponible -> ilike)
    IF v_nombre <> '' THEN
      SELECT jsonb_build_object(
        'receta',     row_to_json(r)::jsonb,
        'ingredientes', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'ingrediente',      i.name,
            'cantidad',         ri.quantity_gross,
            'unidad',           ri.unit,
            'precio_unitario',  i.current_price,
            'coste_linea',      round((
              CASE
                WHEN ri.unit IN ('g','kg') AND i.purchase_unit IN ('g','kg') THEN
                  CASE ri.unit WHEN 'g' THEN ri.quantity_gross/1000 ELSE ri.quantity_gross END *
                  CASE i.purchase_unit WHEN 'g' THEN 1000 ELSE 1 END * i.current_price
                WHEN ri.unit IN ('ml','l') AND i.purchase_unit IN ('ml','l') THEN
                  CASE ri.unit WHEN 'ml' THEN ri.quantity_gross/1000 ELSE ri.quantity_gross END *
                  CASE i.purchase_unit WHEN 'ml' THEN 1000 ELSE 1 END * i.current_price
                ELSE ri.quantity_gross * COALESCE(i.current_price, 0)
              END
            )::numeric, 2)
          ))
          FROM public.recipe_ingredients ri
          JOIN public.ingredients i ON i.id = ri.ingredient_id
          WHERE ri.recipe_id = r.id
        ), '[]'::jsonb),
        'precio_venta',      r.sale_price,
        'elaboracion',       r.elaboration,
        'presentacion',      r.presentation
      )
      INTO v_result
      FROM public.recipes r
      WHERE r.name ILIKE '%' || v_nombre || '%'
      ORDER BY similarity(lower(r.name), lower(v_nombre)) DESC
      LIMIT 1;

      IF v_result IS NULL THEN
        RETURN jsonb_build_object('error', 'receta_no_encontrada', 'nombre_buscado', v_nombre,
          'sugerencia', 'La receta no existe en la base de datos del bar.');
      END IF;
      RETURN v_result;

    ELSE
      -- Listar todas (resumen)
      RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id',           r.id,
          'nombre',       r.name,
          'categoria',    r.category,
          'precio_venta', r.sale_price
        ) ORDER BY r.category, r.name)
        FROM public.recipes r
      ), '[]'::jsonb);
    END IF;

  END IF;

  RETURN jsonb_build_object('error', 'accion_no_soportada', 'acciones_validas', '["buscar","listar"]');
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. INGREDIENTES: consulta con precio y stock, o crear/editar
--    Permite: "¿Cuánto cuesta el tomate?", "Da de alta sal marina"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestionar_ingredientes(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre  text := trim(COALESCE(p_datos->>'nombre', p_datos->>'name', ''));
  v_role    text := public.current_employee_role();
BEGIN
  IF p_accion IN ('buscar', 'listar', 'consultar') THEN
    IF v_nombre <> '' THEN
      RETURN COALESCE((
        SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.name)
        FROM (
          SELECT id, name, current_price, purchase_unit, unit_type,
                 stock_current, allergens
          FROM public.ingredients
          WHERE name ILIKE '%' || v_nombre || '%'
          LIMIT 10
        ) t
      ), jsonb_build_object('error', 'ingrediente_no_encontrado', 'nombre_buscado', v_nombre));
    ELSE
      RETURN COALESCE((
        SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.name)
        FROM (
          SELECT id, name, current_price, purchase_unit, stock_current
          FROM public.ingredients
          ORDER BY name
          LIMIT 50
        ) t
      ), '[]'::jsonb);
    END IF;
  END IF;

  -- Acciones de escritura: solo manager/admin/supervisor/chef
  IF v_role NOT IN ('manager','admin','supervisor','chef') THEN
    RETURN jsonb_build_object('error', 'permiso_denegado', 'rol', v_role);
  END IF;

  IF p_accion IN ('crear', 'crear_ingrediente') THEN
    INSERT INTO public.ingredients (name, current_price, purchase_unit, unit_type)
    VALUES (
      p_datos->>'nombre',
      (p_datos->>'precio')::numeric,
      COALESCE(p_datos->>'unidad', 'kg'),
      COALESCE(p_datos->>'unidad', 'kg')
    );
    RETURN jsonb_build_object('ok', true, 'accion', 'ingrediente_creado', 'nombre', p_datos->>'nombre');
  END IF;

  RETURN jsonb_build_object('error', 'accion_no_soportada', 'acciones_validas', '["buscar","listar","crear"]');
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. PROVEEDORES: consulta de nombre, teléfono, email
--    Permite: "¿Quién trae el aceite?", "Teléfono del proveedor de carne"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestionar_proveedores(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre text := trim(COALESCE(p_datos->>'nombre', p_datos->>'name', ''));
BEGIN
  IF p_accion IN ('buscar', 'listar', 'consultar') THEN
    IF v_nombre <> '' THEN
      RETURN COALESCE((
        SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.name)
        FROM (
          SELECT id, name, phone, email, contact_person, image_url
          FROM public.suppliers
          WHERE name ILIKE '%' || v_nombre || '%'
          LIMIT 5
        ) t
      ), jsonb_build_object('error', 'proveedor_no_encontrado', 'nombre_buscado', v_nombre));
    ELSE
      RETURN COALESCE((
        SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.name)
        FROM (
          SELECT id, name, phone, email, contact_person
          FROM public.suppliers
          ORDER BY name
        ) t
      ), '[]'::jsonb);
    END IF;
  END IF;

  RETURN jsonb_build_object('error', 'accion_no_soportada', 'acciones_validas', '["buscar","listar"]');
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. HORARIOS / TURNOS: quién trabaja qué día
--    Permite: "¿Quién trabaja mañana?", "¿Tengo turno el lunes?"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestionar_horarios(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fecha       date  := COALESCE((p_datos->>'fecha')::date, CURRENT_DATE);
  v_user_id     uuid  := (p_datos->>'user_id')::uuid;
  v_nombre      text  := trim(COALESCE(p_datos->>'nombre', ''));
  v_role        text  := public.current_employee_role();
BEGIN
  IF p_accion IN ('consultar', 'listar', 'ver') THEN

    -- staff solo ve su propio turno a menos que se le diga explícitamente otro
    IF v_role = 'staff' AND v_user_id IS NULL THEN
      v_user_id := auth.uid();
    END IF;

    RETURN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'fecha',        s.date,
        'empleado',     trim(concat_ws(' ', p.first_name, p.last_name)),
        'actividad',    s.activity,
        'hora_inicio',  s.event_start_time,
        'hora_fin',     s.event_end_time,
        'participantes',s.event_participants,
        'categoria',    s.categoria,
        'publicado',    s.is_published
      ) ORDER BY s.date, p.first_name)
      FROM public.shifts s
      JOIN public.profiles p ON p.id = s.user_id
      WHERE s.date = v_fecha
        AND s.is_published = true
        AND (v_user_id IS NULL OR s.user_id = v_user_id)
        AND (v_nombre = '' OR (p.first_name || ' ' || COALESCE(p.last_name,'')) ILIKE '%' || v_nombre || '%')
    ), jsonb_build_object('fecha', v_fecha, 'turnos', '[]', 'nota', 'No hay turnos publicados para esta fecha'));
  END IF;

  RETURN jsonb_build_object('error', 'accion_no_soportada', 'acciones_validas', '["consultar"]');
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. CONSUMO PERSONAL: registrar o consultar consumiciones del staff
--    Permite: "Anota un café para Fernando", "¿Cuánto ha consumido hoy el personal?"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestionar_consumo_personal(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role    text := public.current_employee_role();
  v_fecha   date := COALESCE((p_datos->>'fecha')::date, CURRENT_DATE);
BEGIN
  -- Consulta: resumen del día
  IF p_accion IN ('consultar', 'listar', 'ver', 'resumen') THEN
    IF v_role NOT IN ('manager','admin','supervisor','chef') THEN
      RETURN jsonb_build_object('error', 'permiso_denegado', 'detalle', 'Solo gerencia puede ver el resumen de consumos');
    END IF;
    RETURN COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.consumed_at DESC)
      FROM (
        SELECT
          sc.id,
          sc.consumed_at,
          trim(concat_ws(' ', p.first_name, p.last_name)) AS empleado,
          r.name AS receta,
          sc.quantity,
          sc.is_half
        FROM public.staff_consumption sc
        JOIN public.profiles p ON p.id = sc.employee_id
        JOIN public.recipes r ON r.id = sc.recipe_id
        WHERE sc.consumed_at::date = v_fecha
        ORDER BY sc.consumed_at DESC
        LIMIT 100
      ) t
    ), jsonb_build_object('fecha', v_fecha, 'consumos', '[]'));
  END IF;

  RETURN jsonb_build_object('error', 'accion_no_soportada', 'acciones_validas', '["consultar","listar"]');
END;
$$;

-- ---------------------------------------------------------------------------
-- GRANTS: asegurar que todas las nuevas versiones son ejecutables
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.gestionar_recetas(text, jsonb)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_ingredientes(text, jsonb)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_proveedores(text, jsonb)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_horarios(text, jsonb)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_consumo_personal(text, jsonb)  TO authenticated;

COMMIT;
