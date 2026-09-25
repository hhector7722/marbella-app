-- Motor canónico de coste recursivo (ADR-0018). No sustituye a get_recipe_cost.
-- La ficha y el resto de consumidores siguen en el RPC legacy.
-- Un fallo de rama deja cost_eur en null. Nunca se codifica como 0.
-- No escribe stock ni impide persistir ciclos: solo los detecta al leer.

CREATE OR REPLACE FUNCTION public.fn_recipe_line_cost_v2(
  p_quantity numeric,
  p_recipe_unit text,
  p_purchase_unit text,
  p_current_price numeric,
  p_pack_qty numeric DEFAULT NULL,
  p_pack_unit text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  converted numeric;
  issues text[] := ARRAY[]::text[];
  price_ok boolean;
BEGIN
  IF p_quantity IS NULL
     OR p_quantity = 'NaN'::numeric
     OR p_quantity = 'Infinity'::numeric
     OR p_quantity = '-Infinity'::numeric
     OR p_quantity < 0 THEN
    RETURN jsonb_build_object(
      'status', 'INCOMPATIBLE_UNITS',
      'issues', jsonb_build_array('INCOMPATIBLE_UNITS'),
      'cost_eur', NULL,
      'qty_purchase', NULL
    );
  END IF;

  IF p_quantity = 0 THEN
    RETURN jsonb_build_object(
      'status', 'OK',
      'issues', jsonb_build_array('OK'),
      'cost_eur', 0,
      'qty_purchase', 0
    );
  END IF;

  converted := public.recipe_qty_to_purchase_unit_for_cost(
    p_quantity,
    p_recipe_unit,
    p_purchase_unit,
    NULL,
    p_pack_qty,
    p_pack_unit
  );

  -- numeric: NaN = NaN y NaN > 0 son verdaderos. Hay que excluirlos por literal.
  price_ok := p_current_price IS NOT NULL
    AND p_current_price > 0
    AND p_current_price <> 'NaN'::numeric
    AND p_current_price <> 'Infinity'::numeric
    AND p_current_price <> '-Infinity'::numeric;

  IF converted IS NULL THEN
    issues := issues || ARRAY['INCOMPATIBLE_UNITS'];
  END IF;
  IF NOT price_ok THEN
    issues := issues || ARRAY['MISSING_PRICE'];
  END IF;

  IF cardinality(issues) > 0 THEN
    RETURN jsonb_build_object(
      'status', issues[1],
      'issues', to_jsonb(issues),
      'cost_eur', NULL,
      'qty_purchase', converted
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'OK',
    'issues', jsonb_build_array('OK'),
    'cost_eur', converted * p_current_price,
    'qty_purchase', converted
  );
END;
$$;

COMMENT ON FUNCTION public.fn_recipe_line_cost_v2(numeric, text, text, numeric, numeric, text) IS
  'Coste de una hoja de ingrediente. cost_eur es null si falta precio o la unidad no convierte. No usa media ración ni sale_price.';

CREATE OR REPLACE FUNCTION public.recipe_cost_v2_walk(
  p_recipe_id uuid,
  p_path uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  recipe public.recipes%ROWTYPE;
  ingredient record;
  subrecipe record;
  line jsonb;
  child jsonb;
  issue text;
  path_next uuid[];
  components jsonb := '[]'::jsonb;
  errors jsonb := '[]'::jsonb;
  batch numeric := 0;
  failed boolean := false;
  edge_failed boolean;
  edge_status text;
  edge_cost numeric;
  qty_in_yield numeric;
  child_batch numeric;
  child_ok boolean;
  factor numeric;
  scaled jsonb;
  depth_status text;
BEGIN
  IF p_recipe_id = ANY(p_path) THEN
    depth_status := 'CYCLE';
  ELSIF coalesce(array_length(p_path, 1), 0) >= 32 THEN
    depth_status := 'MAX_DEPTH_EXCEEDED';
  ELSE
    depth_status := NULL;
  END IF;

  IF depth_status IS NOT NULL THEN
    RETURN jsonb_build_object(
      'recipe_id', p_recipe_id,
      'ok', false,
      'batch_cost_eur', NULL,
      'components', jsonb_build_array(jsonb_build_object(
        'kind', 'subrecipe',
        'line_id', NULL,
        'component_id', p_recipe_id,
        'component_name', NULL,
        'quantity', NULL,
        'unit', NULL,
        'status', depth_status,
        'cost_eur', NULL,
        'local_cost_eur', NULL,
        'path', to_jsonb(p_path || p_recipe_id)
      )),
      'errors', jsonb_build_array(jsonb_build_object(
        'status', depth_status,
        'kind', 'subrecipe',
        'line_id', NULL,
        'component_id', p_recipe_id,
        'component_name', NULL,
        'path', to_jsonb(p_path || p_recipe_id)
      ))
    );
  END IF;

  SELECT * INTO recipe FROM public.recipes WHERE id = p_recipe_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'recipe_id', p_recipe_id,
      'ok', false,
      'batch_cost_eur', NULL,
      'components', '[]'::jsonb,
      'errors', jsonb_build_array(jsonb_build_object(
        'status', 'RECIPE_NOT_FOUND',
        'kind', NULL,
        'line_id', NULL,
        'component_id', p_recipe_id,
        'component_name', NULL,
        'path', to_jsonb(p_path || p_recipe_id)
      ))
    );
  END IF;

  path_next := p_path || p_recipe_id;

  FOR ingredient IN
    SELECT
      ri.id AS line_id,
      ri.quantity_gross,
      ri.unit,
      i.id AS ingredient_id,
      i.name AS ingredient_name,
      i.purchase_unit,
      i.current_price,
      i.pack_unit_size_qty,
      i.pack_unit_size_unit
    FROM public.recipe_ingredients ri
    JOIN public.ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = p_recipe_id
    ORDER BY ri.id
  LOOP
    line := public.fn_recipe_line_cost_v2(
      ingredient.quantity_gross::numeric,
      ingredient.unit::text,
      ingredient.purchase_unit::text,
      ingredient.current_price::numeric,
      ingredient.pack_unit_size_qty::numeric,
      ingredient.pack_unit_size_unit::text
    );

    components := components || jsonb_build_array(jsonb_build_object(
      'kind', 'ingredient',
      'line_id', ingredient.line_id,
      'component_id', ingredient.ingredient_id,
      'component_name', ingredient.ingredient_name,
      'quantity', ingredient.quantity_gross,
      'unit', ingredient.unit,
      'status', line->>'status',
      'issues', line->'issues',
      'cost_eur', line->'cost_eur',
      'local_cost_eur', line->'cost_eur',
      'path', to_jsonb(path_next)
    ));

    IF line->>'status' IS DISTINCT FROM 'OK' THEN
      failed := true;
      FOR issue IN
        SELECT jsonb_array_elements_text(line->'issues')
      LOOP
        errors := errors || jsonb_build_array(jsonb_build_object(
          'status', issue,
          'kind', 'ingredient',
          'line_id', ingredient.line_id,
          'component_id', ingredient.ingredient_id,
          'component_name', ingredient.ingredient_name,
          'path', to_jsonb(path_next)
        ));
      END LOOP;
    ELSE
      batch := batch + (line->>'cost_eur')::numeric;
    END IF;
  END LOOP;

  FOR subrecipe IN
    SELECT
      rs.id AS line_id,
      rs.quantity,
      rs.unit,
      child.id AS child_id,
      child.name AS child_name,
      child.yield_quantity,
      child.yield_unit
    FROM public.recipe_subrecipes rs
    JOIN public.recipes child ON child.id = rs.child_recipe_id
    WHERE rs.parent_recipe_id = p_recipe_id
    ORDER BY rs.id
  LOOP
    edge_failed := false;
    edge_status := 'OK';
    edge_cost := NULL;
    child := NULL;
    child_ok := false;
    child_batch := NULL;
    factor := NULL;
    scaled := '[]'::jsonb;

    IF subrecipe.child_id = ANY(path_next) THEN
      edge_failed := true;
      edge_status := 'CYCLE';
      errors := errors || jsonb_build_array(jsonb_build_object(
        'status', 'CYCLE',
        'kind', 'subrecipe',
        'line_id', subrecipe.line_id,
        'component_id', subrecipe.child_id,
        'component_name', subrecipe.child_name,
        'path', to_jsonb(path_next || subrecipe.child_id)
      ));
    ELSE
      child := public.recipe_cost_v2_walk(subrecipe.child_id, path_next);
      errors := errors || COALESCE(child->'errors', '[]'::jsonb);
      child_ok := COALESCE((child->>'ok')::boolean, false);
      IF child_ok THEN
        child_batch := (child->>'batch_cost_eur')::numeric;
      ELSE
        edge_failed := true;
        edge_status := COALESCE(child->'errors'->0->>'status', 'MISSING_PRICE');
      END IF;

      IF subrecipe.quantity IS NULL
         OR subrecipe.quantity = 'NaN'::numeric
         OR subrecipe.quantity = 'Infinity'::numeric
         OR subrecipe.quantity = '-Infinity'::numeric
         OR subrecipe.quantity <= 0 THEN
        edge_failed := true;
        edge_status := 'INCOMPATIBLE_UNITS';
        errors := errors || jsonb_build_array(jsonb_build_object(
          'status', 'INCOMPATIBLE_UNITS',
          'kind', 'subrecipe',
          'line_id', subrecipe.line_id,
          'component_id', subrecipe.child_id,
          'component_name', subrecipe.child_name,
          'path', to_jsonb(path_next || subrecipe.child_id)
        ));
      END IF;

      IF subrecipe.yield_quantity IS NULL
         OR subrecipe.yield_unit IS NULL
         OR subrecipe.yield_quantity = 'NaN'::numeric
         OR subrecipe.yield_quantity = 'Infinity'::numeric
         OR subrecipe.yield_quantity = '-Infinity'::numeric
         OR subrecipe.yield_quantity <= 0 THEN
        edge_failed := true;
        edge_status := 'MISSING_YIELD';
        errors := errors || jsonb_build_array(jsonb_build_object(
          'status', 'MISSING_YIELD',
          'kind', 'subrecipe',
          'line_id', subrecipe.line_id,
          'component_id', subrecipe.child_id,
          'component_name', subrecipe.child_name,
          'path', to_jsonb(path_next || subrecipe.child_id)
        ));
      ELSIF child_ok
            AND subrecipe.quantity IS NOT NULL
            AND subrecipe.quantity > 0
            AND subrecipe.quantity <> 'NaN'::numeric
            AND subrecipe.quantity <> 'Infinity'::numeric
            AND subrecipe.quantity <> '-Infinity'::numeric THEN
        qty_in_yield := public.convert_pricing_qty(
          subrecipe.quantity::numeric,
          subrecipe.unit::text,
          subrecipe.yield_unit::text
        );
        IF qty_in_yield IS NULL
           OR qty_in_yield = 'NaN'::numeric
           OR qty_in_yield = 'Infinity'::numeric
           OR qty_in_yield = '-Infinity'::numeric THEN
          edge_failed := true;
          edge_status := 'INCOMPATIBLE_UNITS';
          errors := errors || jsonb_build_array(jsonb_build_object(
            'status', 'INCOMPATIBLE_UNITS',
            'kind', 'subrecipe',
            'line_id', subrecipe.line_id,
            'component_id', subrecipe.child_id,
            'component_name', subrecipe.child_name,
            'path', to_jsonb(path_next || subrecipe.child_id)
          ));
        ELSE
          factor := qty_in_yield / subrecipe.yield_quantity;
          edge_cost := factor * child_batch;
          edge_status := 'OK';
          edge_failed := false;
        END IF;
      END IF;

      SELECT COALESCE(jsonb_agg(
        CASE
          WHEN factor IS NULL OR elem->'cost_eur' = 'null'::jsonb OR elem->'cost_eur' IS NULL THEN
            jsonb_set(elem, '{cost_eur}', 'null'::jsonb)
          ELSE
            jsonb_set(elem, '{cost_eur}', to_jsonb((elem->>'cost_eur')::numeric * factor))
        END
        ORDER BY ordinality
      ), '[]'::jsonb)
      INTO scaled
      FROM jsonb_array_elements(COALESCE(child->'components', '[]'::jsonb)) WITH ORDINALITY AS t(elem, ordinality);

      components := components || scaled;
    END IF;

    IF edge_failed THEN
      failed := true;
      edge_cost := NULL;
    END IF;

    components := components || jsonb_build_array(jsonb_build_object(
      'kind', 'subrecipe',
      'line_id', subrecipe.line_id,
      'component_id', subrecipe.child_id,
      'component_name', subrecipe.child_name,
      'quantity', subrecipe.quantity,
      'unit', subrecipe.unit,
      'status', edge_status,
      'cost_eur', edge_cost,
      'local_cost_eur', child_batch,
      'yield_quantity', subrecipe.yield_quantity,
      'yield_unit', subrecipe.yield_unit,
      'path', to_jsonb(path_next || subrecipe.child_id)
    ));

    IF edge_status = 'OK' AND edge_cost IS NOT NULL THEN
      batch := batch + edge_cost;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'recipe_id', p_recipe_id,
    'recipe_name', recipe.name,
    'ok', NOT failed,
    'batch_cost_eur', CASE WHEN failed THEN NULL ELSE batch END,
    'components', components,
    'errors', errors
  );
END;
$$;

COMMENT ON FUNCTION public.recipe_cost_v2_walk(uuid, uuid[]) IS
  'Expansión interna del coste v2. El segundo argumento es el camino de recetas ya visitadas.';

CREATE OR REPLACE FUNCTION public.get_recipe_cost_v2(p_recipe_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  walked jsonb;
BEGIN
  walked := public.recipe_cost_v2_walk(p_recipe_id, ARRAY[]::uuid[]);
  RETURN jsonb_build_object(
    'recipe_id', p_recipe_id,
    'ok', walked->'ok',
    'total_cost_eur', CASE
      WHEN COALESCE((walked->>'ok')::boolean, false) THEN walked->'batch_cost_eur'
      ELSE 'null'::jsonb
    END,
    'components', COALESCE(walked->'components', '[]'::jsonb),
    'errors', COALESCE(walked->'errors', '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_recipe_cost_v2(uuid) IS
  'Coste recursivo de la composición completa. total_cost_eur es null si alguna rama falla. No sustituye a get_recipe_cost.';

REVOKE ALL ON FUNCTION public.fn_recipe_line_cost_v2(numeric, text, text, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recipe_cost_v2_walk(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_recipe_cost_v2(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_recipe_line_cost_v2(numeric, text, text, numeric, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recipe_cost_v2_walk(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_recipe_cost_v2(uuid) TO authenticated, service_role;
