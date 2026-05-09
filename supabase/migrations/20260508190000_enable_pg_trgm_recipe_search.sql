CREATE OR REPLACE FUNCTION public.gestionar_recetas(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre   text := lower(trim(COALESCE(p_datos->>'nombre', p_datos->>'name', '')));
  v_result   jsonb;
BEGIN
  IF p_accion IN ('buscar', 'listar', 'consultar', 'search', 'list', 'get') THEN

    IF v_nombre <> '' THEN
      -- Búsqueda robusta ignorando mayúsculas/minúsculas y buscando coincidencias parciales
      SELECT jsonb_build_object(
        'receta',     row_to_json(r)::jsonb,
        'ingredientes', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'nombre',           i.name,
            'cantidad_bruta',   ri.quantity_gross,
            'unidad',           ri.unit,
            'coste_estimado',   round((ri.quantity_gross * COALESCE(i.current_price, 0))::numeric, 2)
          ))
          FROM public.recipe_ingredients ri
          JOIN public.ingredients i ON i.id = ri.ingredient_id
          WHERE ri.recipe_id = r.id
        ), '[]'::jsonb),
        'precio_venta', r.sale_price,
        'elaboracion',  r.elaboration,
        'presentacion', r.presentation
      )
      INTO v_result
      FROM public.recipes r
      WHERE lower(r.name) ILIKE '%' || v_nombre || '%'
      ORDER BY (CASE WHEN lower(r.name) = v_nombre THEN 0 ELSE 1 END), similarity(lower(r.name), v_nombre) DESC
      LIMIT 1;

      IF v_result IS NULL THEN
        RETURN jsonb_build_object('error', 'receta_no_encontrada', 'nombre_buscado', v_nombre);
      END IF;

      -- Aviso si está vacía
      IF (v_result->>'ingredientes') = '[]' THEN
        RETURN v_result || jsonb_build_object('aviso', 'Atención: Esta receta existe en el catálogo pero no tiene ingredientes vinculados en la tabla recipe_ingredients.');
      END IF;

      RETURN v_result;
    ELSE
      -- Listado general
      RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id,
          'nombre', r.name,
          'categoria', r.category,
          'precio', r.sale_price
        ) ORDER BY r.name)
        FROM public.recipes r
      ), '[]'::jsonb);
    END IF;
  END IF;
  RETURN jsonb_build_object('error', 'accion_no_soportada');
END;
$$;
