-- Expansión física de una receta hasta materias primas.
-- No escribe stock y no sustituye a process_ticket_stock_deduction.
-- Si ok es false, las cantidades son diagnóstico: no son una expansión segura para el ledger.
-- La hoja reutiliza recipe_qty_to_base_unit (unidad base g|ml|ud).
-- La arista de subreceta solo convierte con convert_pricing_qty, sin puente de presentación.

CREATE OR REPLACE FUNCTION public.get_recipe_stock_requirements_v2(
  p_recipe_id uuid,
  p_recipe_multiplier numeric DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  ingredients jsonb;
  errors jsonb;
  found boolean;
BEGIN
  IF p_recipe_multiplier IS NULL
     OR p_recipe_multiplier = 'NaN'::numeric
     OR p_recipe_multiplier = 'Infinity'::numeric
     OR p_recipe_multiplier = '-Infinity'::numeric
     OR p_recipe_multiplier <= 0 THEN
    RAISE EXCEPTION 'p_recipe_multiplier debe ser finito y mayor que cero'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.recipes WHERE id = p_recipe_id
  ) INTO found;

  IF NOT found THEN
    RETURN jsonb_build_object(
      'recipe_id', p_recipe_id,
      'recipe_multiplier', p_recipe_multiplier,
      'ok', false,
      'ingredients', '[]'::jsonb,
      'errors', jsonb_build_array(jsonb_build_object(
        'status', 'RECIPE_NOT_FOUND',
        'recipe_id', p_recipe_id
      ))
    );
  END IF;

  WITH RECURSIVE walk AS (
    SELECT
      p_recipe_id AS recipe_id,
      p_recipe_multiplier AS factor,
      ARRAY[p_recipe_id] AS path,
      NULL::text AS edge_status,
      NULL::uuid AS edge_line_id
    UNION ALL
    SELECT
      rs.child_recipe_id,
      CASE
        WHEN rs.child_recipe_id = ANY (walk.path) THEN NULL
        WHEN child.yield_quantity IS NULL
          OR child.yield_unit IS NULL
          OR child.yield_quantity = 'NaN'::numeric
          OR child.yield_quantity = 'Infinity'::numeric
          OR child.yield_quantity = '-Infinity'::numeric
          OR child.yield_quantity <= 0 THEN NULL
        WHEN rs.quantity IS NULL
          OR rs.quantity = 'NaN'::numeric
          OR rs.quantity = 'Infinity'::numeric
          OR rs.quantity = '-Infinity'::numeric
          OR rs.quantity <= 0 THEN NULL
        WHEN conv.qty IS NULL
          OR conv.qty = 'NaN'::numeric
          OR conv.qty = 'Infinity'::numeric
          OR conv.qty = '-Infinity'::numeric
          OR walk.factor = 'NaN'::numeric
          OR walk.factor = 'Infinity'::numeric
          OR walk.factor = '-Infinity'::numeric THEN NULL
        ELSE walk.factor * conv.qty / child.yield_quantity
      END,
      walk.path || rs.child_recipe_id,
      CASE
        WHEN rs.child_recipe_id = ANY (walk.path) THEN 'CYCLE'
        WHEN child.yield_quantity IS NULL
          OR child.yield_unit IS NULL
          OR child.yield_quantity = 'NaN'::numeric
          OR child.yield_quantity = 'Infinity'::numeric
          OR child.yield_quantity = '-Infinity'::numeric
          OR child.yield_quantity <= 0 THEN 'MISSING_YIELD'
        WHEN rs.quantity IS NULL
          OR rs.quantity = 'NaN'::numeric
          OR rs.quantity = 'Infinity'::numeric
          OR rs.quantity = '-Infinity'::numeric
          OR rs.quantity <= 0
          OR conv.qty IS NULL
          OR conv.qty = 'NaN'::numeric
          OR conv.qty = 'Infinity'::numeric
          OR conv.qty = '-Infinity'::numeric
          THEN 'INCOMPATIBLE_UNITS'
        ELSE NULL
      END,
      rs.id
    FROM walk
    JOIN public.recipe_subrecipes rs ON rs.parent_recipe_id = walk.recipe_id
    JOIN public.recipes child ON child.id = rs.child_recipe_id
    LEFT JOIN LATERAL (
      SELECT public.convert_pricing_qty(rs.quantity, rs.unit, child.yield_unit) AS qty
    ) conv ON true
    WHERE walk.edge_status IS NULL
  ),
  leaves AS (
    SELECT
      i.id AS ingredient_id,
      i.name AS ingredient_name,
      i.base_unit AS unit_base,
      ri.id AS line_id,
      walk.path,
      CASE
        WHEN ri.quantity_gross IS NULL
          OR ri.umb_multiplier IS NULL
          OR ri.quantity_gross = 'NaN'::numeric
          OR ri.quantity_gross = 'Infinity'::numeric
          OR ri.quantity_gross = '-Infinity'::numeric
          OR ri.quantity_gross < 0
          OR ri.umb_multiplier = 'NaN'::numeric
          OR ri.umb_multiplier = 'Infinity'::numeric
          OR ri.umb_multiplier = '-Infinity'::numeric
          OR ri.umb_multiplier < 0 THEN NULL
        ELSE public.recipe_qty_to_base_unit(
          ri.quantity_gross * ri.umb_multiplier * walk.factor,
          ri.unit,
          i.base_unit,
          i.supplier_pricing_mode,
          i.pack_unit_size_qty,
          i.pack_unit_size_unit
        )
      END AS quantity_base
    FROM walk
    JOIN public.recipe_ingredients ri ON ri.recipe_id = walk.recipe_id
    JOIN public.ingredients i ON i.id = ri.ingredient_id
    WHERE walk.edge_status IS NULL
  ),
  leaf_errors AS (
    SELECT
      'INCOMPATIBLE_UNITS'::text AS status,
      'ingredient'::text AS kind,
      leaves.line_id,
      leaves.ingredient_id AS component_id,
      leaves.path
    FROM leaves
    WHERE leaves.quantity_base IS NULL
  ),
  edge_errors AS (
    SELECT
      walk.edge_status AS status,
      'subrecipe'::text AS kind,
      walk.edge_line_id AS line_id,
      walk.path[cardinality(walk.path)] AS component_id,
      walk.path
    FROM walk
    WHERE walk.edge_status IS NOT NULL
  ),
  all_errors AS (
    SELECT status, kind, line_id, component_id, path FROM leaf_errors
    UNION ALL
    SELECT status, kind, line_id, component_id, path FROM edge_errors
  )
  SELECT
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'ingredient_id', grouped.ingredient_id,
          'ingredient_name', grouped.ingredient_name,
          'quantity_base', grouped.quantity_base,
          'unit_base', grouped.unit_base,
          'contributions', grouped.contributions
        )
        ORDER BY grouped.ingredient_id
      )
      FROM (
        SELECT
          leaves.ingredient_id,
          min(leaves.ingredient_name) AS ingredient_name,
          leaves.unit_base,
          CASE
            WHEN bool_or(leaves.quantity_base IS NULL) THEN NULL
            ELSE sum(leaves.quantity_base)
          END AS quantity_base,
          jsonb_agg(
            jsonb_build_object(
              'line_id', leaves.line_id,
              'quantity_base', leaves.quantity_base,
              'path', to_jsonb(leaves.path)
            )
            ORDER BY leaves.path, leaves.line_id
          ) AS contributions
        FROM leaves
        GROUP BY leaves.ingredient_id, leaves.unit_base
      ) grouped
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'status', all_errors.status,
          'kind', all_errors.kind,
          'line_id', all_errors.line_id,
          'component_id', all_errors.component_id,
          'path', to_jsonb(all_errors.path)
        )
        ORDER BY all_errors.status, all_errors.line_id, all_errors.path
      )
      FROM all_errors
    ), '[]'::jsonb)
  INTO ingredients, errors;

  RETURN jsonb_build_object(
    'recipe_id', p_recipe_id,
    'recipe_multiplier', p_recipe_multiplier,
    'ok', jsonb_array_length(errors) = 0,
    'ingredients', ingredients,
    'errors', errors
  );
END;
$$;

COMMENT ON FUNCTION public.get_recipe_stock_requirements_v2(uuid, numeric) IS
  'Expande una receta a materias primas en ingredients.base_unit. Si ok es false, las cantidades no son seguras para escribir stock. No lee el precio ni is_sellable.';

REVOKE ALL ON FUNCTION public.get_recipe_stock_requirements_v2(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recipe_stock_requirements_v2(uuid, numeric) TO authenticated, service_role;
