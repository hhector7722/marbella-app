-- Formatos exclusivos de Tortilla: sólo se muestran si esa elaboración los tiene.
-- Se mantiene el rendimiento físico en 1 ud: las fracciones se calculan en numeric, no se redondean.
CREATE TABLE public.recipe_consumption_formats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code IN ('entero', 'medio', 'pincho')),
  label text NOT NULL CHECK (btrim(label) <> ''),
  portions_per_batch integer NOT NULL CHECK (portions_per_batch > 0),
  UNIQUE (recipe_id, code),
  UNIQUE (id, recipe_id)
);
ALTER TABLE public.recipe_consumption_formats ENABLE ROW LEVEL SECURITY;
CREATE POLICY recipe_consumption_formats_read ON public.recipe_consumption_formats
  FOR SELECT TO authenticated USING (true);
CREATE POLICY recipe_consumption_formats_write ON public.recipe_consumption_formats
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.recipe_consumption_formats FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_consumption_formats TO authenticated;
GRANT ALL ON public.recipe_consumption_formats TO service_role;

ALTER TABLE public.recipe_subrecipes
  ADD COLUMN format_full_id uuid,
  ADD COLUMN format_half_id uuid,
  ADD CONSTRAINT recipe_subrecipes_full_format_match
    FOREIGN KEY (format_full_id, child_recipe_id)
    REFERENCES public.recipe_consumption_formats(id, recipe_id) ON DELETE RESTRICT,
  ADD CONSTRAINT recipe_subrecipes_half_format_match
    FOREIGN KEY (format_half_id, child_recipe_id)
    REFERENCES public.recipe_consumption_formats(id, recipe_id) ON DELETE RESTRICT;

-- No se modifica ningún artículo del TPV ni se duplica la receta vendible.
-- Si la elaboración Tortilla no existe (instalación vacía), no se siembran filas.
INSERT INTO public.recipe_consumption_formats (recipe_id, code, label, portions_per_batch)
SELECT r.id, formats.code, formats.label, formats.partes
FROM public.recipes r
CROSS JOIN (VALUES
  ('entero','Bocadillo entero',7),
  ('medio','Medio bocadillo',14),
  ('pincho','Pincho',6)
) AS formats(code,label,partes)
WHERE r.name = 'Tortilla' AND r.is_sellable = false
ON CONFLICT (recipe_id, code) DO NOTHING;

UPDATE public.recipes SET yield_quantity = 1, yield_unit = 'ud'
WHERE name = 'Tortilla' AND is_sellable = false;

UPDATE public.recipe_subrecipes link
SET format_full_id = f.id
FROM public.recipes parent, public.recipes child, public.recipe_consumption_formats f
WHERE link.parent_recipe_id = parent.id
  AND link.child_recipe_id = child.id
  AND child.name = 'Tortilla'
  AND f.recipe_id = child.id
  AND ((parent.name = 'Pincho tortilla' AND f.code = 'pincho')
    OR (parent.name = 'Tortilla patatas' AND f.code = 'entero'));

UPDATE public.recipe_subrecipes link
SET format_half_id = f.id
FROM public.recipes parent, public.recipes child, public.recipe_consumption_formats f
WHERE link.parent_recipe_id = parent.id
  AND link.child_recipe_id = child.id
  AND child.name = 'Tortilla'
  AND parent.name = 'Tortilla patatas'
  AND f.recipe_id = child.id AND f.code = 'medio';

UPDATE public.recipes SET has_half_ration = true
WHERE name = 'Tortilla patatas';


CREATE OR REPLACE FUNCTION public.recipe_cost_v2_walk_portion(p_recipe_id uuid, p_path uuid[], p_use_half boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      CASE WHEN p_use_half THEN COALESCE(NULLIF(ri.quantity_half, 0), ri.quantity_gross / 2) ELSE ri.quantity_gross END AS quantity_gross,
      ri.unit,
      i.id AS ingredient_id,
      i.name AS ingredient_name,
      i.purchase_unit,
      i.current_price,
      i.pack_unit_size_qty,
      i.pack_unit_size_unit,
      i.density_g_per_ml
    FROM public.recipe_ingredients ri
    JOIN public.ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = p_recipe_id
    ORDER BY ri.id
  LOOP
    line := public.fn_recipe_line_cost_v2_with_density(
      ingredient.quantity_gross::numeric,
      ingredient.unit::text,
      ingredient.purchase_unit::text,
      ingredient.current_price::numeric,
      ingredient.pack_unit_size_qty::numeric,
      ingredient.pack_unit_size_unit::text,
      ingredient.density_g_per_ml::numeric
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
      CASE WHEN p_use_half AND rs.format_full_id IS NULL THEN rs.quantity / 2 ELSE rs.quantity END AS quantity,
      rs.unit,
      rs.format_full_id,
      rs.format_half_id,
      CASE WHEN p_use_half THEN half_format.portions_per_batch ELSE full_format.portions_per_batch END AS selected_denominator,
      child.id AS child_id,
      child.name AS child_name,
      child.yield_quantity,
      child.yield_unit
    FROM public.recipe_subrecipes rs
    JOIN public.recipes child ON child.id = rs.child_recipe_id
    LEFT JOIN public.recipe_consumption_formats full_format ON full_format.id = rs.format_full_id
    LEFT JOIN public.recipe_consumption_formats half_format ON half_format.id = rs.format_half_id
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
      child := public.recipe_cost_v2_walk_portion(subrecipe.child_id, path_next, false);
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
        qty_in_yield := CASE
          WHEN subrecipe.format_full_id IS NOT NULL THEN
            subrecipe.yield_quantity * subrecipe.quantity / NULLIF(subrecipe.selected_denominator, 0)
          ELSE public.convert_pricing_qty(
            subrecipe.quantity::numeric,
            subrecipe.unit::text,
            subrecipe.yield_unit::text
          )
        END;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_recipe_stock_requirements_v2_portion(p_recipe_id uuid, p_recipe_multiplier numeric, p_use_half boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      NULL::uuid AS edge_line_id,
      p_use_half AS is_half
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
      rs.id,
      false AS is_half
    FROM walk
    JOIN public.recipe_subrecipes rs ON rs.parent_recipe_id = walk.recipe_id
    JOIN public.recipes child ON child.id = rs.child_recipe_id
    LEFT JOIN public.recipe_consumption_formats full_format ON full_format.id = rs.format_full_id
    LEFT JOIN public.recipe_consumption_formats half_format ON half_format.id = rs.format_half_id
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN walk.is_half AND rs.format_full_id IS NOT NULL AND rs.format_half_id IS NULL THEN NULL::numeric
        WHEN walk.is_half AND rs.format_half_id IS NOT NULL THEN
          child.yield_quantity * rs.quantity / NULLIF(half_format.portions_per_batch, 0)
        WHEN NOT walk.is_half AND rs.format_full_id IS NOT NULL THEN
          child.yield_quantity * rs.quantity / NULLIF(full_format.portions_per_batch, 0)
        WHEN walk.is_half THEN public.convert_pricing_qty(rs.quantity / 2, rs.unit, child.yield_unit)
        ELSE public.convert_pricing_qty(rs.quantity, rs.unit, child.yield_unit)
      END AS qty
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
          OR (walk.is_half AND ri.quantity_half < 0)
          OR ri.umb_multiplier = 'NaN'::numeric
          OR ri.umb_multiplier = 'Infinity'::numeric
          OR ri.umb_multiplier = '-Infinity'::numeric
          OR ri.umb_multiplier < 0 THEN NULL
        ELSE public.recipe_qty_to_base_unit_with_density(
          (CASE WHEN walk.is_half THEN COALESCE(NULLIF(ri.quantity_half, 0), ri.quantity_gross / 2) ELSE ri.quantity_gross END) * ri.umb_multiplier * walk.factor,
          ri.unit,
          i.base_unit,
          i.supplier_pricing_mode,
          i.pack_unit_size_qty,
          i.pack_unit_size_unit,
          i.density_g_per_ml
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
$function$;

CREATE OR REPLACE FUNCTION public.recipe_stock_requirements_v2_portion_rows(
  p_recipe_id uuid,
  p_recipe_multiplier numeric, p_use_half boolean
)
RETURNS TABLE (
  recipe_id uuid,
  recipe_multiplier numeric,
  ok boolean,
  ingredient_count integer,
  ingredient_id uuid,
  ingredient_name text,
  quantity_base numeric,
  unit_base text,
  contributions jsonb,
  errors jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH payload AS MATERIALIZED (
    SELECT public.get_recipe_stock_requirements_v2_portion(
      p_recipe_id,
      p_recipe_multiplier,
      p_use_half
    ) AS doc
  )
  SELECT
    (payload.doc->>'recipe_id')::uuid,
    (payload.doc->>'recipe_multiplier')::numeric,
    (payload.doc->>'ok')::boolean,
    COALESCE(
      jsonb_array_length(
        CASE
          WHEN jsonb_typeof(payload.doc->'ingredients') = 'array'
          THEN payload.doc->'ingredients'
        END
      ),
      0
    ),
    (item->>'ingredient_id')::uuid,
    item->>'ingredient_name',
    (item->>'quantity_base')::numeric,
    item->>'unit_base',
    item->'contributions',
    payload.doc->'errors'
  FROM payload
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(payload.doc->'ingredients') = 'array'
      THEN payload.doc->'ingredients'
      ELSE '[]'::jsonb
    END
  ) AS item ON true;
$$;

CREATE OR REPLACE FUNCTION public.get_recipe_cost_v2_half(p_recipe_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  walked jsonb;
BEGIN
  walked := public.recipe_cost_v2_walk_portion(p_recipe_id, ARRAY[]::uuid[], true);
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


-- Compatibilidad: todos los consumidores previos siguen entrando por los mismos RPC.
CREATE OR REPLACE FUNCTION public.recipe_cost_v2_walk(p_recipe_id uuid, p_path uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT public.recipe_cost_v2_walk_portion(p_recipe_id, p_path, false); $$;

CREATE OR REPLACE FUNCTION public.get_recipe_stock_requirements_v2(p_recipe_id uuid, p_recipe_multiplier numeric DEFAULT 1)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT public.get_recipe_stock_requirements_v2_portion(p_recipe_id, p_recipe_multiplier, false); $$;

REVOKE ALL ON FUNCTION public.recipe_cost_v2_walk_portion(uuid, uuid[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_recipe_stock_requirements_v2_portion(uuid, numeric, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recipe_stock_requirements_v2_portion_rows(uuid, numeric, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_recipe_cost_v2_half(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recipe_cost_v2_walk_portion(uuid, uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_recipe_stock_requirements_v2_portion(uuid, numeric, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recipe_stock_requirements_v2_portion_rows(uuid, numeric, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_recipe_cost_v2_half(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.process_ticket_stock_deduction(p_numero_documento text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_recipe_id uuid;
  v_ingredient_id uuid;
  v_multiplier numeric;
  v_errors jsonb;
  v_movement_count integer := 0;
  v_has_issue boolean := false;
  v_ticket_line_count integer := 0;
  v_mapped_line_count integer := 0;
  v_unmapped_line_count integer := 0;
  v_unmapped_article_ids jsonb := '[]'::jsonb;
BEGIN
  IF btrim(coalesce(p_numero_documento, '')) = '' THEN
    RAISE EXCEPTION 'El número de ticket es obligatorio';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ticket-stock:' || p_numero_documento, 0));

  EXECUTE 'DROP TABLE IF EXISTS pg_temp.ticket_stock_b9';

  IF EXISTS (
    SELECT 1
    FROM private.ticket_stock_deduction_runs
    WHERE numero_documento = p_numero_documento
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements
    WHERE reference_doc = 'TICKET-' || p_numero_documento
      AND movement_type = 'SALE'
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ticket_lines_marbella
    WHERE numero_documento = p_numero_documento
  ) THEN
    RAISE EXCEPTION 'ticket % sin líneas persistidas; no se puede cerrar el stock', p_numero_documento;
  END IF;

  SELECT mtr.recipe_id
  INTO v_recipe_id
  FROM public.ticket_lines_marbella tl
  JOIN public.map_tpv_receta mtr ON tl.articulo_id = mtr.articulo_id
  WHERE tl.numero_documento = p_numero_documento
    AND (
      mtr.factor_porcion IS NULL
      OR mtr.factor_porcion <= 0
      OR mtr.factor_porcion = 'NaN'::numeric
      OR mtr.factor_porcion = 'Infinity'::numeric
      OR mtr.factor_porcion = '-Infinity'::numeric
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'factor_porcion inválido para recipe_id %', v_recipe_id;
  END IF;

  SELECT nets.recipe_id, nets.multiplier
  INTO v_recipe_id, v_multiplier
  FROM (
    SELECT
      mtr.recipe_id,
      sum(tl.unidades * mtr.factor_porcion) AS multiplier
    FROM public.ticket_lines_marbella tl
    JOIN public.map_tpv_receta mtr ON tl.articulo_id = mtr.articulo_id
    WHERE tl.numero_documento = p_numero_documento
    GROUP BY mtr.recipe_id
  ) nets
  WHERE nets.multiplier < 0
     OR nets.multiplier = 'NaN'::numeric
     OR nets.multiplier = 'Infinity'::numeric
     OR nets.multiplier = '-Infinity'::numeric
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'multiplicador neto inválido para recipe_id %: %', v_recipe_id, v_multiplier;
  END IF;

  EXECUTE $sql$
    CREATE TEMP TABLE pg_temp.ticket_stock_b9 (
      recipe_id uuid,
      is_half boolean,
      ok boolean,
      ingredient_count integer,
      ingredient_id uuid,
      quantity_base numeric,
      unit_base text,
      errors jsonb
    ) ON COMMIT DROP
  $sql$;

  EXECUTE $sql$
    INSERT INTO pg_temp.ticket_stock_b9 (
      recipe_id, is_half, ok, ingredient_count, ingredient_id, quantity_base, unit_base, errors
    )
    SELECT
      nets.recipe_id,
      nets.is_half,
      rows.ok,
      rows.ingredient_count,
      rows.ingredient_id,
      rows.quantity_base,
      rows.unit_base,
      rows.errors
    FROM (
      SELECT
        mtr.recipe_id,
        (tl.articulo_id = 83 AND COALESCE(tl.nombre, '') ~* '^[[:space:]]*1/2[.]') AS is_half,
        sum(tl.unidades * mtr.factor_porcion) AS multiplier
      FROM public.ticket_lines_marbella tl
      JOIN public.map_tpv_receta mtr ON tl.articulo_id = mtr.articulo_id
      WHERE tl.numero_documento = $1
      GROUP BY mtr.recipe_id, (tl.articulo_id = 83 AND COALESCE(tl.nombre, '') ~* '^[[:space:]]*1/2[.]')
      HAVING sum(tl.unidades * mtr.factor_porcion) > 0
    ) nets
    CROSS JOIN LATERAL public.recipe_stock_requirements_v2_portion_rows(
      nets.recipe_id,
      nets.multiplier,
      nets.is_half
    ) AS rows
  $sql$
  USING p_numero_documento;

  EXECUTE $sql$
    SELECT EXISTS (
      SELECT 1
      FROM pg_temp.ticket_stock_b9
      WHERE ok IS DISTINCT FROM true
    )
  $sql$
  INTO v_has_issue;

  IF v_has_issue THEN
    EXECUTE $sql$
      SELECT recipe_id, errors
      FROM pg_temp.ticket_stock_b9
      WHERE ok IS DISTINCT FROM true
      LIMIT 1
    $sql$
    INTO v_recipe_id, v_errors;
    RAISE EXCEPTION 'expansión de stock inválida para recipe_id %: %', v_recipe_id, v_errors;
  END IF;

  EXECUTE $sql$
    SELECT EXISTS (
      SELECT 1
      FROM pg_temp.ticket_stock_b9
      WHERE ingredient_id IS NOT NULL
        AND (quantity_base IS NULL OR unit_base IS NULL OR btrim(unit_base) = '')
    )
  $sql$
  INTO v_has_issue;

  IF v_has_issue THEN
    EXECUTE $sql$
      SELECT recipe_id
      FROM pg_temp.ticket_stock_b9
      WHERE ingredient_id IS NOT NULL
        AND (quantity_base IS NULL OR unit_base IS NULL OR btrim(unit_base) = '')
      LIMIT 1
    $sql$
    INTO v_recipe_id;
    RAISE EXCEPTION 'expansión de stock sin cantidad segura para recipe_id %', v_recipe_id;
  END IF;

  EXECUTE $sql$
    SELECT EXISTS (
      SELECT 1
      FROM pg_temp.ticket_stock_b9
      WHERE ingredient_id IS NOT NULL
      GROUP BY ingredient_id
      HAVING count(DISTINCT unit_base) > 1
    )
  $sql$
  INTO v_has_issue;

  IF v_has_issue THEN
    EXECUTE $sql$
      SELECT ingredient_id
      FROM pg_temp.ticket_stock_b9
      WHERE ingredient_id IS NOT NULL
      GROUP BY ingredient_id
      HAVING count(DISTINCT unit_base) > 1
      LIMIT 1
    $sql$
    INTO v_ingredient_id;
    RAISE EXCEPTION 'ingrediente % sin una sola unidad base en el ticket', v_ingredient_id;
  END IF;

  EXECUTE $sql$
    INSERT INTO public.stock_movements (
      movement_type, ingredient_id, quantity, unit, movement_date,
      reference_doc, original_description, processed_by,
      reference_type, reference_external_id, idempotency_key, origin, provenance
    )
    SELECT
      'SALE',
      agg.ingredient_id,
      agg.quantity_base,
      agg.unit_base,
      now(),
      'TICKET-' || $1,
      'Deducción automática TPV - Ticket ' || $1,
      'process_ticket_stock_deduction',
      'sale_ticket'::public.stock_reference_type,
      $1,
      'sale:' || $1 || ':' || agg.ingredient_id::text,
      'sale_webhook'::public.stock_movement_origin,
      jsonb_build_object(
        'source', 'bdp_webhook',
        'command', 'process_ticket_stock_deduction',
        'schema_version', 'b9-recursive-v1',
        'expansion', 'recipe_stock_requirements_v2_rows'
      )
    FROM (
      SELECT
        ingredient_id,
        unit_base,
        sum(quantity_base) AS quantity_base
      FROM pg_temp.ticket_stock_b9
      WHERE ingredient_id IS NOT NULL
      GROUP BY ingredient_id, unit_base
    ) agg
    WHERE agg.quantity_base IS NOT NULL
      AND agg.quantity_base > 0
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  $sql$
  USING p_numero_documento;

  GET DIAGNOSTICS v_movement_count = ROW_COUNT;

  SELECT
    count(*)::integer,
    count(mtr.recipe_id)::integer,
    (count(*) - count(mtr.recipe_id))::integer,
    COALESCE((
      SELECT jsonb_agg(missing.articulo_id ORDER BY missing.articulo_id)
      FROM (
        SELECT DISTINCT tl_missing.articulo_id
        FROM public.ticket_lines_marbella tl_missing
        WHERE tl_missing.numero_documento = p_numero_documento
          AND NOT EXISTS (
            SELECT 1
            FROM public.map_tpv_receta mapped
            WHERE mapped.articulo_id = tl_missing.articulo_id
          )
      ) missing
    ), '[]'::jsonb)
  INTO
    v_ticket_line_count,
    v_mapped_line_count,
    v_unmapped_line_count,
    v_unmapped_article_ids
  FROM public.ticket_lines_marbella tl
  LEFT JOIN public.map_tpv_receta mtr ON mtr.articulo_id = tl.articulo_id
  WHERE tl.numero_documento = p_numero_documento;

  INSERT INTO private.ticket_stock_deduction_runs (
    numero_documento, movement_count, provenance
  ) VALUES (
    p_numero_documento,
    v_movement_count,
    jsonb_build_object(
      'source', 'bdp_webhook',
      'command', 'process_ticket_stock_deduction',
      'schema_version', 'b9-recursive-v1',
      'ticket_line_count', v_ticket_line_count,
      'mapped_line_count', v_mapped_line_count,
      'unmapped_line_count', v_unmapped_line_count,
      'unmapped_article_ids', v_unmapped_article_ids
    )
  );

  EXECUTE 'DROP TABLE IF EXISTS pg_temp.ticket_stock_b9';
END;
$$;
