-- =============================================================================
-- Copiloto "Crack" — Búsqueda Flexible y Descriptiva de Recetas
-- Mejora la detección de nombres similares y devuelve campos claros para la IA.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.gestionar_recetas(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre   text := lower(trim(COALESCE(p_datos->>'nombre', p_datos->>'name', '')));
  v_receta_id uuid;
  v_recipe_name text;
  v_matches jsonb;
  v_count_all int;
  v_best_match RECORD;
BEGIN
  -- 1. Si no hay acción o es buscar/consultar
  IF p_accion IN ('buscar', 'listar', 'consultar', 'search', 'list', 'get') THEN
    
    -- Listar todas (resumen) si no hay nombre
    IF v_nombre = '' AND p_accion IN ('listar', 'list') THEN
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

    -- Si hay nombre, buscar por similitud flexible
    IF v_nombre <> '' THEN
      -- Buscar coincidencias (ILIKE + similarity)
      -- Usamos una CTE para obtener las mejores y luego procesar la mejor
      WITH found AS (
        SELECT 
          id, 
          name, 
          category,
          sale_price,
          elaboration,
          presentation,
          similarity(lower(name), v_nombre) as sim
        FROM public.recipes
        WHERE lower(name) ILIKE '%' || v_nombre || '%' 
           OR similarity(lower(name), v_nombre) > 0.1
        ORDER BY sim DESC, name ASC
        LIMIT 5
      )
      SELECT * INTO v_best_match FROM found LIMIT 1;

      -- Obtener sugerencias (las otras 4)
      SELECT jsonb_agg(name) INTO v_matches 
      FROM (
        SELECT name, similarity(lower(name), v_nombre) as sim
        FROM public.recipes 
        WHERE (lower(name) ILIKE '%' || v_nombre || '%' OR similarity(lower(name), v_nombre) > 0.1)
          AND name <> v_best_match.name
        ORDER BY sim DESC, name ASC
        LIMIT 4
      ) s;

      SELECT count(*) INTO v_count_all FROM public.recipes;

      IF v_best_match.id IS NOT NULL THEN
        RETURN jsonb_build_object(
          'receta_encontrada', v_best_match.name,
          'debug', jsonb_build_object(
            'id_encontrado', v_best_match.id,
            'nombre_encontrado', v_best_match.name,
            'similitud', v_best_match.sim,
            'num_ingredientes', (SELECT count(*) FROM public.recipe_ingredients WHERE recipe_id = v_best_match.id),
            'total_recetas_en_tabla', v_count_all,
            'sugerencias', COALESCE(v_matches, '[]'::jsonb)
          ),
          'ingredientes', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'ingrediente',      i.name,
              'cantidad',         ri.quantity_gross,
              'unidad',           ri.unit,
              'precio_unitario',  i.current_price
            ))
            FROM public.recipe_ingredients ri
            JOIN public.ingredients i ON i.id = ri.ingredient_id
            WHERE ri.recipe_id = v_best_match.id
          ), '[]'::jsonb),
          'precio_venta', v_best_match.sale_price,
          'elaboracion',  v_best_match.elaboration,
          'presentacion', v_best_match.presentation
        );
      ELSE
        RETURN jsonb_build_object(
          'error', 'receta_no_encontrada',
          'nombre_buscado', v_nombre,
          'debug', jsonb_build_object(
            'total_recetas_en_tabla', v_count_all,
            'sugerencias', COALESCE(v_matches, '[]'::jsonb)
          )
        );
      END IF;
    ELSE
       -- Búsqueda vacía sin acción listar
       RETURN jsonb_build_object('error', 'nombre_vacio', 'mensaje', 'Indica el nombre de la receta');
    END IF;
  END IF;

  RETURN jsonb_build_object('error', 'accion_no_soportada', 'acciones_validas', '["buscar","listar"]');
END;
$$;

COMMIT;
