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
      -- Buscamos la receta que COINCIDA con el nombre y que TENGA ingredientes si es posible
      SELECT jsonb_build_object(
        'receta',     row_to_json(r)::jsonb,
        'ingredientes', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'nombre',           i.name,
            'cantidad',         ri.quantity_gross,
            'unidad',           ri.unit
          ))
          FROM public.recipe_ingredients ri
          JOIN public.ingredients i ON i.id = ri.ingredient_id
          WHERE ri.recipe_id = r.id
        ), '[]'::jsonb)
      )
      INTO v_result
      FROM public.recipes r
      WHERE lower(r.name) ILIKE '%' || v_nombre || '%'
      ORDER BY 
        (CASE WHEN lower(r.name) = v_nombre THEN 0 ELSE 1 END), -- Coincidencia exacta primero
        (SELECT count(*) FROM public.recipe_ingredients WHERE recipe_id = r.id) DESC -- La que tenga más ingredientes primero
      LIMIT 1;

      IF v_result IS NULL THEN
        RETURN jsonb_build_object('error', 'receta_no_encontrada');
      END IF;

      RETURN v_result;
    ELSE
      -- Listado
      RETURN COALESCE((SELECT jsonb_agg(row_to_json(r)) FROM public.recipes r), '[]'::jsonb);
    END IF;
  END IF;
  RETURN jsonb_build_object('error', 'accion_no_soportada');
END;
$$;
