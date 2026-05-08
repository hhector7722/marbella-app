-- =============================================================================
-- Habilitar pg_trgm y mejorar búsqueda de recetas
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.gestionar_recetas(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre   text := trim(COALESCE(p_datos->>'nombre', p_datos->>'name', ''));
  v_result   jsonb;
BEGIN
  IF p_accion IN ('buscar', 'listar', 'consultar', 'search', 'list', 'get') THEN

    IF v_nombre <> '' THEN
      -- Búsqueda por similitud (requiere pg_trgm)
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
      ORDER BY 
        (CASE WHEN r.name ILIKE v_nombre THEN 0 ELSE 1 END), -- Prioridad a coincidencia exacta
        similarity(r.name, v_nombre) DESC -- Luego por similitud
      LIMIT 1;

      IF v_result IS NULL THEN
        RETURN jsonb_build_object('error', 'receta_no_encontrada', 'nombre_buscado', v_nombre,
          'sugerencia', 'La receta no existe en la base de datos del bar.');
      END IF;
      RETURN v_result;

    ELSE
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
