-- B9.7. El Copilot lee la expansión física y el coste canónico de una receta.
-- No recorre la composición, no enseña cantidades parciales y no convierte
-- un coste desconocido en cero. La firma y los permisos no cambian.

CREATE OR REPLACE FUNCTION public.gestionar_recetas(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre text := lower(trim(COALESCE(p_datos->>'nombre', p_datos->>'name', '')));
  v_matches jsonb;
  v_count_all int;
  v_best_match record;
  v_stock_rows jsonb := '[]'::jsonb;
  v_row record;
  v_row_count int := 0;
  v_all_ok boolean := true;
  v_counts_agree boolean := true;
  v_ingredient_count int;
  v_seen_count boolean := false;
  v_physical_count int := 0;
  v_distinct_count int := 0;
  v_bad_leaf boolean := false;
  v_duplicate boolean := false;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_leaf_id uuid;
  v_qty_text text;
  v_unit text;
  v_errors jsonb := '[]'::jsonb;
  v_ingredients jsonb := '[]'::jsonb;
  v_expansion_ok boolean := false;
  v_vacia boolean := false;
  v_num int := 0;
  v_cost jsonb;
  v_motor_ok boolean := false;
  v_total_finite boolean := false;
  v_has_component boolean := false;
  v_has_cost_basis boolean := false;
BEGIN
  IF p_accion IN ('buscar', 'listar', 'consultar', 'search', 'list', 'get') THEN
    IF v_nombre = '' AND p_accion IN ('listar', 'list') THEN
      RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id,
          'nombre', r.name,
          'categoria', r.category,
          'precio_venta', r.sale_price,
          'is_sellable', r.is_sellable
        ) ORDER BY r.category, r.name)
        FROM public.recipes r
      ), '[]'::jsonb);
    END IF;

    IF v_nombre <> '' THEN
      WITH found AS (
        SELECT
          id,
          name,
          category,
          sale_price,
          elaboration,
          presentation,
          is_sellable,
          yield_quantity,
          yield_unit,
          similarity(lower(name), v_nombre) AS sim
        FROM public.recipes
        WHERE lower(name) ILIKE '%' || v_nombre || '%'
           OR similarity(lower(name), v_nombre) > 0.1
        ORDER BY sim DESC, name ASC
        LIMIT 5
      )
      SELECT * INTO v_best_match FROM found LIMIT 1;

      SELECT jsonb_agg(name) INTO v_matches
      FROM (
        SELECT name, similarity(lower(name), v_nombre) AS sim
        FROM public.recipes
        WHERE (lower(name) ILIKE '%' || v_nombre || '%' OR similarity(lower(name), v_nombre) > 0.1)
          AND name IS DISTINCT FROM v_best_match.name
        ORDER BY sim DESC, name ASC
        LIMIT 4
      ) s;

      SELECT count(*) INTO v_count_all FROM public.recipes;

      IF v_best_match.id IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'ok', s.ok,
          'ingredient_count', s.ingredient_count,
          'ingredient_id', s.ingredient_id,
          'ingredient_name', s.ingredient_name,
          'quantity_base', s.quantity_base,
          'unit_base', s.unit_base,
          'errors', s.errors
        )), '[]'::jsonb)
        INTO v_stock_rows
        FROM public.recipe_stock_requirements_v2_rows(v_best_match.id, 1) AS s;

        v_row_count := jsonb_array_length(v_stock_rows);
        FOR v_row IN SELECT value FROM jsonb_array_elements(v_stock_rows) AS t(value)
        LOOP
          IF COALESCE((v_row.value->>'ok')::boolean, false) IS DISTINCT FROM true THEN
            v_all_ok := false;
          END IF;

          IF v_errors = '[]'::jsonb AND jsonb_typeof(v_row.value->'errors') = 'array' THEN
            v_errors := v_row.value->'errors';
          END IF;

          IF v_seen_count AND v_ingredient_count IS DISTINCT FROM (v_row.value->>'ingredient_count')::int THEN
            v_counts_agree := false;
          END IF;
          v_ingredient_count := (v_row.value->>'ingredient_count')::int;
          v_seen_count := true;

          IF NULLIF(v_row.value->>'ingredient_id', '') IS NOT NULL THEN
            v_physical_count := v_physical_count + 1;
            v_leaf_id := (v_row.value->>'ingredient_id')::uuid;
            IF v_leaf_id = ANY(v_seen_ids) THEN
              v_duplicate := true;
            ELSE
              v_seen_ids := v_seen_ids || v_leaf_id;
              v_distinct_count := v_distinct_count + 1;
            END IF;

            v_qty_text := v_row.value->>'quantity_base';
            v_unit := btrim(COALESCE(v_row.value->>'unit_base', ''));
            IF v_qty_text IS NULL
               OR v_qty_text !~ '^[0-9]+(\.[0-9]+)?$'
               OR v_qty_text::numeric <= 0
               OR v_unit = '' THEN
              v_bad_leaf := true;
            ELSIF v_all_ok THEN
              v_ingredients := v_ingredients || jsonb_build_array(jsonb_build_object(
                'ingrediente', COALESCE(NULLIF(btrim(v_row.value->>'ingredient_name'), ''), v_leaf_id::text),
                'cantidad', v_qty_text::numeric,
                'unidad', v_unit
              ));
            END IF;
          END IF;
        END LOOP;

        IF v_row_count > 0
           AND v_all_ok
           AND v_counts_agree
           AND v_ingredient_count = 0
           AND v_physical_count = 0 THEN
          v_expansion_ok := true;
          v_vacia := true;
          v_ingredients := '[]'::jsonb;
          v_num := 0;
        ELSIF v_row_count > 0
           AND v_all_ok
           AND v_counts_agree
           AND v_ingredient_count > 0
           AND v_physical_count = v_ingredient_count
           AND v_distinct_count = v_ingredient_count
           AND NOT v_bad_leaf
           AND NOT v_duplicate THEN
          v_expansion_ok := true;
          v_num := jsonb_array_length(v_ingredients);
          IF v_num IS DISTINCT FROM v_ingredient_count THEN
            v_expansion_ok := false;
            v_ingredients := '[]'::jsonb;
            v_num := 0;
          END IF;
        ELSE
          v_expansion_ok := false;
          v_vacia := false;
          v_ingredients := '[]'::jsonb;
          v_num := 0;
        END IF;

        v_cost := public.get_recipe_cost_v2(v_best_match.id);
        v_motor_ok := COALESCE((v_cost->>'ok')::boolean, false);
        v_total_finite := jsonb_typeof(v_cost->'total_cost_eur') = 'number';
        v_has_component := EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(v_cost->'components', '[]'::jsonb)) AS component
          WHERE component->>'kind' = 'ingredient'
        );
        v_has_cost_basis := v_motor_ok AND v_total_finite AND v_has_component;

        RETURN jsonb_build_object(
          'receta_encontrada', v_best_match.name,
          'is_sellable', v_best_match.is_sellable,
          'yield_quantity', v_best_match.yield_quantity,
          'yield_unit', v_best_match.yield_unit,
          'debug', jsonb_build_object(
            'id_encontrado', v_best_match.id,
            'nombre_encontrado', v_best_match.name,
            'similitud', v_best_match.sim,
            'num_ingredientes', v_num,
            'total_recetas_en_tabla', v_count_all,
            'sugerencias', COALESCE(v_matches, '[]'::jsonb)
          ),
          'ingredientes', v_ingredients,
          'expansion_fisica', jsonb_build_object(
            'ok', v_expansion_ok,
            'ingredient_count', CASE WHEN v_expansion_ok THEN v_ingredient_count ELSE COALESCE(v_ingredient_count, 0) END,
            'vacia', v_vacia,
            'errors', CASE WHEN v_expansion_ok THEN '[]'::jsonb ELSE COALESCE(v_errors, '[]'::jsonb) END
          ),
          'precio_venta', v_best_match.sale_price,
          'elaboracion', v_best_match.elaboration,
          'presentacion', v_best_match.presentation,
          'coste_receta', jsonb_build_object(
            'motor_ok', v_motor_ok,
            'has_cost_basis', v_has_cost_basis,
            'total_cost_eur', CASE
              WHEN v_has_cost_basis THEN v_cost->'total_cost_eur'
              ELSE 'null'::jsonb
            END,
            'errors', COALESCE(v_cost->'errors', '[]'::jsonb)
          )
        );
      END IF;

      RETURN jsonb_build_object(
        'error', 'receta_no_encontrada',
        'nombre_buscado', v_nombre,
        'debug', jsonb_build_object(
          'total_recetas_en_tabla', v_count_all,
          'sugerencias', COALESCE(v_matches, '[]'::jsonb)
        )
      );
    END IF;

    RETURN jsonb_build_object('error', 'nombre_vacio', 'mensaje', 'Indica el nombre de la receta');
  END IF;

  RETURN jsonb_build_object('error', 'accion_no_soportada', 'acciones_validas', '["buscar","listar"]');
END;
$$;

COMMENT ON FUNCTION public.gestionar_recetas(text, jsonb) IS
  'Busca y lista recetas para el Copilot. Las materias primas salen de recipe_stock_requirements_v2_rows y el coste de get_recipe_cost_v2. Un fallo no se enseña como cero.';

GRANT EXECUTE ON FUNCTION public.gestionar_recetas(text, jsonb) TO authenticated;
