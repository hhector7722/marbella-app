CREATE OR REPLACE FUNCTION public.gestionar_recetas(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre text := lower(trim(COALESCE(p_datos->>'nombre', p_datos->>'name', '')));
  v_receta_id uuid;
  v_count_ri int;
  v_count_all int;
  v_recipe_name text;
BEGIN
  -- 1. Buscar la receta por nombre
  SELECT id, name INTO v_receta_id, v_recipe_name 
  FROM public.recipes 
  WHERE lower(name) ILIKE '%' || v_nombre || '%' 
  ORDER BY similarity(lower(name), v_nombre) DESC
  LIMIT 1;
  
  -- 2. Contar cuántos ingredientes hay en la tabla de unión para esa receta
  SELECT count(*) INTO v_count_ri FROM public.recipe_ingredients WHERE recipe_id = v_receta_id;
  
  -- 3. Contar cuántas recetas hay en total
  SELECT count(*) INTO v_count_all FROM public.recipes;

  RETURN jsonb_build_object(
    'debug', jsonb_build_object(
      'id_encontrado', v_receta_id,
      'nombre_encontrado', v_recipe_name,
      'num_ingredientes', v_count_ri,
      'total_recetas_en_tabla', v_count_all
    ),
    'ingredientes', COALESCE((
       SELECT jsonb_agg(jsonb_build_object('n', i.name, 'q', ri.quantity_gross, 'u', ri.unit))
       FROM public.recipe_ingredients ri
       JOIN public.ingredients i ON i.id = ri.ingredient_id
       WHERE ri.recipe_id = v_receta_id
    ), '[]'::jsonb)
  );
END;
$$;
