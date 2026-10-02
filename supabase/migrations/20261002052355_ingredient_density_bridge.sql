-- Puente masa ↔ volumen por ingrediente.
-- density_g_per_ml significa: 1 ml del ingrediente pesa N gramos.
-- No autoriza conversiones globales: solo se usa cuando el ingrediente declara densidad.

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS density_g_per_ml numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ingredients_density_g_per_ml_positive'
      AND conrelid = 'public.ingredients'::regclass
  ) THEN
    ALTER TABLE public.ingredients
      ADD CONSTRAINT ingredients_density_g_per_ml_positive
      CHECK (density_g_per_ml IS NULL OR density_g_per_ml > 0);
  END IF;
END;
$$;

COMMENT ON COLUMN public.ingredients.density_g_per_ml IS
  'Densidad específica opcional del ingrediente: gramos por mililitro. Autoriza conversión masa↔volumen en recetas/stock.';

CREATE OR REPLACE FUNCTION public.convert_pricing_qty_with_density(p_qty numeric, p_from_unit text, p_to_unit text, p_density_g_per_ml numeric DEFAULT NULL::numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  direct_qty numeric; fu text; tu text; qty_ml numeric; qty_g numeric;
BEGIN
  IF p_qty IS NULL THEN RETURN NULL; END IF;
  direct_qty := public.convert_pricing_qty(p_qty,p_from_unit,p_to_unit);
  IF direct_qty IS NOT NULL THEN RETURN direct_qty; END IF;
  IF p_density_g_per_ml IS NULL OR p_density_g_per_ml <= 0
     OR p_density_g_per_ml IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
  THEN RETURN NULL; END IF;
  fu := public.normalize_pricing_unit(p_from_unit);
  tu := public.normalize_pricing_unit(p_to_unit);
  IF fu IN ('ml','cl','l') AND tu IN ('g','kg') THEN
    qty_ml := public.convert_pricing_qty(p_qty,fu,'ml');
    IF qty_ml IS NULL THEN RETURN NULL; END IF;
    qty_g := qty_ml*p_density_g_per_ml;
    RETURN public.convert_pricing_qty(qty_g,'g',tu);
  END IF;
  IF fu IN ('g','kg') AND tu IN ('ml','cl','l') THEN
    qty_g := public.convert_pricing_qty(p_qty,fu,'g');
    IF qty_g IS NULL THEN RETURN NULL; END IF;
    qty_ml := qty_g/p_density_g_per_ml;
    RETURN public.convert_pricing_qty(qty_ml,'ml',tu);
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_recipe_line_cost_v2_with_density(p_quantity numeric, p_recipe_unit text, p_purchase_unit text, p_current_price numeric, p_pack_qty numeric DEFAULT NULL::numeric, p_pack_unit text DEFAULT NULL::text, p_density_g_per_ml numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE converted numeric; issues text[]:=ARRAY[]::text[]; price_ok boolean;
BEGIN
  IF p_quantity IS NULL OR p_quantity<0
     OR p_quantity IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) THEN
    RETURN jsonb_build_object('status','INCOMPATIBLE_UNITS','issues',jsonb_build_array('INCOMPATIBLE_UNITS'),'cost_eur',NULL,'qty_purchase',NULL);
  END IF;
  IF p_quantity=0 THEN
    RETURN jsonb_build_object('status','OK','issues',jsonb_build_array('OK'),'cost_eur',0,'qty_purchase',0);
  END IF;
  converted:=public.recipe_qty_to_purchase_unit_for_cost_with_density(
    p_quantity,p_recipe_unit,p_purchase_unit,NULL,p_pack_qty,p_pack_unit,p_density_g_per_ml
  );
  price_ok:=p_current_price IS NOT NULL AND p_current_price>0
    AND p_current_price NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric);
  IF converted IS NULL THEN issues:=issues||ARRAY['INCOMPATIBLE_UNITS']; END IF;
  IF NOT price_ok THEN issues:=issues||ARRAY['MISSING_PRICE']; END IF;
  IF cardinality(issues)>0 THEN
    RETURN jsonb_build_object('status',issues[1],'issues',to_jsonb(issues),'cost_eur',NULL,'qty_purchase',converted);
  END IF;
  RETURN jsonb_build_object('status','OK','issues',jsonb_build_array('OK'),'cost_eur',converted*p_current_price,'qty_purchase',converted);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_recipe_line_cost_with_density(p_quantity_gross numeric, p_quantity_half numeric, p_recipe_unit text, p_purchase_unit text, p_current_price numeric, p_use_half boolean DEFAULT false, p_supplier_pricing_mode text DEFAULT NULL::text, p_pack_unit_size_qty numeric DEFAULT NULL::numeric, p_pack_unit_size_unit text DEFAULT NULL::text, p_density_g_per_ml numeric DEFAULT NULL::numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  qty numeric:=CASE WHEN p_use_half THEN coalesce(p_quantity_half,0) ELSE coalesce(p_quantity_gross,0) END;
  converted numeric;
BEGIN
  IF p_current_price IS NULL OR p_current_price<0 THEN RETURN 0; END IF;
  IF qty=0 THEN RETURN 0; END IF;
  converted:=public.recipe_qty_to_purchase_unit_for_cost_with_density(
    qty,p_recipe_unit,p_purchase_unit,p_supplier_pricing_mode,
    p_pack_unit_size_qty,p_pack_unit_size_unit,p_density_g_per_ml
  );
  IF converted IS NULL THEN RETURN 0; END IF;
  RETURN converted*p_current_price;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_recipe_cost(p_recipe_id uuid, p_use_half_ration boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  total numeric;
  lines_agg jsonb;
BEGIN
  WITH costed AS (
    SELECT
      ri.id AS line_id,
      i.name AS ingredient_name,
      public.fn_recipe_line_cost_with_density(
        ri.quantity_gross::numeric,
        coalesce(ri.quantity_half, 0)::numeric,
        ri.unit::text,
        i.purchase_unit::text,
        i.current_price::numeric,
        p_use_half_ration,
        i.supplier_pricing_mode::text,
        i.pack_unit_size_qty::numeric,
        i.pack_unit_size_unit::text,
        i.density_g_per_ml::numeric
      ) AS line_cost
    FROM public.recipe_ingredients ri
    JOIN public.ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = p_recipe_id
  )
  SELECT
    coalesce(sum(line_cost), 0),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'line_id', line_id,
          'ingredient_name', ingredient_name,
          'line_cost', round(line_cost::numeric, 2)
        )
      ),
      '[]'::jsonb
    )
  INTO total, lines_agg
  FROM costed;

  RETURN jsonb_build_object(
    'total_cost', round(total::numeric, 2),
    'lines', lines_agg
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_recipe_stock_requirements_v2(p_recipe_id uuid, p_recipe_multiplier numeric DEFAULT 1)
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
        ELSE public.recipe_qty_to_base_unit_with_density(
          ri.quantity_gross * ri.umb_multiplier * walk.factor,
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

CREATE OR REPLACE FUNCTION public.process_staff_consumption(p_employee_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ref text := 'STAFF-' || p_employee_id::text || '-' || EXTRACT(EPOCH FROM now())::text;
  v_food_count integer := 0;
  v_stock_written integer := 0;
  v_error_count integer := 0;
  v_rows jsonb := '[]'::jsonb;
  v_inserted integer := 0;
  cart_rec RECORD;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_employee_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMPTY_CART',
      'stock_written_count', 0,
      'error_count', 0
    );
  END IF;

  SELECT COUNT(*)::integer
  INTO v_food_count
  FROM jsonb_to_recordset(p_items) AS cart(recipe_id uuid, quantity numeric, is_half boolean)
  JOIN public.recipes r ON r.id = cart.recipe_id
  WHERE r.is_sellable IS TRUE
    AND NOT public.is_drink_consumption_recipe(r.name, r.category);

  IF v_food_count = 0 THEN
    INSERT INTO public.staff_consumption_register_errors (
      employee_id,
      reference_doc,
      recipe_id,
      recipe_name,
      quantity,
      is_half,
      is_drink,
      error_message
    )
    SELECT
      p_employee_id,
      v_ref,
      cart.recipe_id,
      r.name,
      LEAST(GREATEST(1, cart.quantity), 20),
      cart.is_half,
      public.is_drink_consumption_recipe(r.name, r.category),
      'La elaboración interna no está disponible para consumo personal'
    FROM jsonb_to_recordset(p_items) AS cart(recipe_id uuid, quantity numeric, is_half boolean)
    JOIN public.recipes r ON r.id = cart.recipe_id
    WHERE r.is_sellable IS NOT TRUE;

    GET DIAGNOSTICS v_error_count = ROW_COUNT;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NO_FOOD',
      'stock_written_count', 0,
      'error_count', v_error_count
    );
  END IF;

  FOR cart_rec IN
    SELECT
      cart.recipe_id,
      LEAST(GREATEST(1, cart.quantity), 20) AS quantity,
      cart.is_half,
      r.name AS recipe_name,
      r.category AS recipe_category,
      r.is_sellable
    FROM jsonb_to_recordset(p_items) AS cart(recipe_id uuid, quantity numeric, is_half boolean)
    JOIN public.recipes r ON r.id = cart.recipe_id
  LOOP
    BEGIN
      v_rows := '[]'::jsonb;

      IF cart_rec.is_sellable IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Elaboración interna no disponible para consumo personal';
      END IF;

      IF cart_rec.is_half IS TRUE THEN
        IF EXISTS (
          SELECT 1
          FROM public.recipe_subrecipes rs
          WHERE rs.parent_recipe_id = cart_rec.recipe_id
        ) THEN
          RAISE EXCEPTION 'Media ración no disponible para recetas con elaboraciones';
        END IF;

        SELECT COALESCE(jsonb_agg(to_jsonb(line)), '[]'::jsonb)
        INTO v_rows
        FROM (
          SELECT
            ri.ingredient_id,
            ing.base_unit AS unit_base,
            public.recipe_qty_to_base_unit_with_density(
              (
                CASE
                  WHEN COALESCE(ri.quantity_half, 0) > 0 THEN ri.quantity_half
                  ELSE ri.quantity_gross * 0.5
                END
              ) * cart_rec.quantity * ri.umb_multiplier,
              ri.unit,
              ing.base_unit,
              ing.supplier_pricing_mode,
              ing.pack_unit_size_qty,
              ing.pack_unit_size_unit,
              ing.density_g_per_ml
            ) AS quantity_base
          FROM public.recipe_ingredients ri
          JOIN public.ingredients ing ON ing.id = ri.ingredient_id
          WHERE ri.recipe_id = cart_rec.recipe_id
        ) AS line;

        IF jsonb_array_length(v_rows) = 0 THEN
          RAISE EXCEPTION 'Receta "%" sin ingredientes en escandallo', cart_rec.recipe_name;
        END IF;
      ELSE
        SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
        INTO v_rows
        FROM public.recipe_stock_requirements_v2_rows(
          cart_rec.recipe_id,
          cart_rec.quantity
        ) AS x;

        IF jsonb_array_length(v_rows) = 0 THEN
          RAISE EXCEPTION 'No se pudo expandir la receta "%"', cart_rec.recipe_name;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_rows) elem
          WHERE COALESCE(elem->>'ok', '') IS DISTINCT FROM 'true'
        ) THEN
          RAISE EXCEPTION 'expansión de stock inválida para recipe_id %: %',
            cart_rec.recipe_id,
            (
              SELECT elem->'errors'
              FROM jsonb_array_elements(v_rows) elem
              WHERE COALESCE(elem->>'ok', '') IS DISTINCT FROM 'true'
              LIMIT 1
            );
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_rows) elem
          WHERE COALESCE((elem->>'ingredient_count')::integer, 0) > 0
        ) THEN
          RAISE EXCEPTION 'Esta receta no tiene materias primas configuradas.';
        END IF;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_rows) elem
        WHERE elem->>'ingredient_id' IS NOT NULL
          AND (
            elem->>'quantity_base' IS NULL
            OR (elem->>'quantity_base')::numeric = 'NaN'::numeric
            OR (elem->>'quantity_base')::numeric = 'Infinity'::numeric
            OR (elem->>'quantity_base')::numeric = '-Infinity'::numeric
            OR (elem->>'quantity_base')::numeric < 0
            OR btrim(COALESCE(elem->>'unit_base', '')) = ''
          )
      ) THEN
        RAISE EXCEPTION 'cantidad de stock no segura para recipe_id %', cart_rec.recipe_id;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM (
          SELECT elem->>'ingredient_id' AS ingredient_id
          FROM jsonb_array_elements(v_rows) elem
          WHERE elem->>'ingredient_id' IS NOT NULL
            AND (elem->>'quantity_base')::numeric > 0
          GROUP BY 1
          HAVING COUNT(DISTINCT btrim(elem->>'unit_base')) > 1
        ) conflict
      ) THEN
        RAISE EXCEPTION 'ingrediente sin una sola unidad base para recipe_id %', cart_rec.recipe_id;
      END IF;

      INSERT INTO public.stock_movements (
        movement_type,
        ingredient_id,
        quantity,
        unit,
        movement_date,
        reference_doc,
        original_description,
        processed_by,
        reference_type,
        reference_external_id,
        origin,
        actor_profile_id,
        provenance
      )
      SELECT
        'WASTE'::text,
        agg.ingredient_id::uuid,
        agg.quantity_base,
        agg.unit_base,
        now(),
        v_ref,
        'Consumo Personal: ' || cart_rec.recipe_name,
        'Auto-Registro Salida (Staff ID: ' || p_employee_id::text || ')',
        'staff_consumption'::public.stock_reference_type,
        v_ref,
        'staff_consumption'::public.stock_movement_origin,
        p_employee_id,
        jsonb_build_object(
          'source', 'staff_consumption',
          'command', 'process_staff_consumption',
          'schema_version', 'b9-recursive-v1'
        )
      FROM (
        SELECT
          elem->>'ingredient_id' AS ingredient_id,
          btrim(elem->>'unit_base') AS unit_base,
          SUM((elem->>'quantity_base')::numeric) AS quantity_base
        FROM jsonb_array_elements(v_rows) elem
        WHERE elem->>'ingredient_id' IS NOT NULL
          AND (elem->>'quantity_base')::numeric > 0
        GROUP BY 1, 2
      ) agg;

      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      IF v_inserted = 0 THEN
        RAISE EXCEPTION 'No se pudo calcular consumo para esta receta.';
      END IF;

      v_stock_written := v_stock_written + 1;
    EXCEPTION
      WHEN OTHERS THEN
        INSERT INTO public.staff_consumption_register_errors (
          employee_id,
          reference_doc,
          recipe_id,
          recipe_name,
          quantity,
          is_half,
          is_drink,
          error_message
        ) VALUES (
          p_employee_id,
          v_ref,
          cart_rec.recipe_id,
          cart_rec.recipe_name,
          cart_rec.quantity,
          cart_rec.is_half,
          public.is_drink_consumption_recipe(cart_rec.recipe_name, cart_rec.recipe_category),
          SQLERRM
        );
        v_error_count := v_error_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'reference_doc', v_ref,
    'stock_written_count', v_stock_written,
    'error_count', v_error_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.recipe_cost_v2_walk(p_recipe_id uuid, p_path uuid[])
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
      ri.quantity_gross,
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
$function$;

CREATE OR REPLACE FUNCTION public.recipe_qty_to_base_unit_with_density(p_qty numeric, p_recipe_unit text, p_base_unit text, p_mode text DEFAULT NULL::text, p_pack_qty numeric DEFAULT NULL::numeric, p_pack_unit text DEFAULT NULL::text, p_density_g_per_ml numeric DEFAULT NULL::numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE v numeric; piece numeric;
BEGIN
  IF p_qty IS NULL THEN RETURN NULL; END IF;
  v:=public.convert_pricing_qty_with_density(p_qty,p_recipe_unit,p_base_unit,p_density_g_per_ml);
  IF v IS NOT NULL THEN RETURN v; END IF;
  IF public.normalize_pricing_unit(p_recipe_unit)='ud'
     AND p_base_unit IN ('ml','g')
     AND p_pack_qty IS NOT NULL AND p_pack_qty>0
     AND p_pack_unit IS NOT NULL AND trim(p_pack_unit)<>'' THEN
    piece:=public.convert_pricing_qty_with_density(p_pack_qty,p_pack_unit,p_base_unit,p_density_g_per_ml);
    IF piece IS NOT NULL AND piece>0 THEN RETURN p_qty*piece; END IF;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recipe_qty_to_purchase_unit_for_cost_with_density(p_qty numeric, p_recipe_unit text, p_purchase_unit text, p_mode text DEFAULT NULL::text, p_pack_qty numeric DEFAULT NULL::numeric, p_pack_unit text DEFAULT NULL::text, p_density_g_per_ml numeric DEFAULT NULL::numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE v numeric; piece numeric; fu text; pu text;
BEGIN
  IF p_qty IS NULL THEN RETURN NULL; END IF;
  v:=public.convert_pricing_qty_with_density(p_qty,p_recipe_unit,p_purchase_unit,p_density_g_per_ml);
  IF v IS NOT NULL THEN RETURN v; END IF;
  fu:=public.normalize_pricing_unit(p_recipe_unit);
  pu:=public.normalize_pricing_unit(coalesce(p_purchase_unit,'ud'));
  IF fu='ud' AND pu IN ('g','kg','ml','l','cl')
     AND p_pack_qty IS NOT NULL AND p_pack_qty>0
     AND p_pack_unit IS NOT NULL AND trim(p_pack_unit)<>'' THEN
    piece:=public.convert_pricing_qty_with_density(p_pack_qty,p_pack_unit,p_purchase_unit,p_density_g_per_ml);
    IF piece IS NOT NULL AND piece>0 THEN RETURN p_qty*piece; END IF;
  END IF;
  IF pu='ud' AND fu IN ('g','kg','ml','l','cl')
     AND p_pack_qty IS NOT NULL AND p_pack_qty>0
     AND p_pack_unit IS NOT NULL AND trim(p_pack_unit)<>'' THEN
    piece:=public.convert_pricing_qty_with_density(p_pack_qty,p_pack_unit,p_recipe_unit,p_density_g_per_ml);
    IF piece IS NOT NULL AND piece>0 THEN RETURN p_qty/piece; END IF;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_staff_consumption(p_items jsonb)
 RETURNS TABLE(recipe_id uuid, recipe_name text, error_message text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  cart_rec RECORD;
  v_rows jsonb := '[]'::jsonb;
  v_positive integer := 0;
  v_failed uuid[] := '{}';
BEGIN
  IF jsonb_array_length(p_items) = 0 THEN
    RETURN;
  END IF;

  FOR cart_rec IN
    SELECT
      cart.recipe_id,
      LEAST(GREATEST(1, cart.quantity), 20) AS quantity,
      cart.is_half,
      r.name AS recipe_name,
      r.is_sellable
    FROM jsonb_to_recordset(p_items) AS cart(recipe_id uuid, quantity numeric, is_half boolean)
    JOIN public.recipes r ON r.id = cart.recipe_id
  LOOP
    IF cart_rec.recipe_id = ANY (v_failed) THEN
      CONTINUE;
    END IF;

    BEGIN
      v_rows := '[]'::jsonb;

      IF cart_rec.is_sellable IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Elaboración interna no disponible para consumo personal';
      END IF;

      IF cart_rec.is_half IS TRUE THEN
        IF EXISTS (
          SELECT 1
          FROM public.recipe_subrecipes rs
          WHERE rs.parent_recipe_id = cart_rec.recipe_id
        ) THEN
          RAISE EXCEPTION 'Media ración no disponible para recetas con elaboraciones';
        END IF;

        SELECT COALESCE(jsonb_agg(to_jsonb(line)), '[]'::jsonb)
        INTO v_rows
        FROM (
          SELECT
            ri.ingredient_id,
            ing.base_unit AS unit_base,
            public.recipe_qty_to_base_unit_with_density(
              (
                CASE
                  WHEN COALESCE(ri.quantity_half, 0) > 0 THEN ri.quantity_half
                  ELSE ri.quantity_gross * 0.5
                END
              ) * cart_rec.quantity * ri.umb_multiplier,
              ri.unit,
              ing.base_unit,
              ing.supplier_pricing_mode,
              ing.pack_unit_size_qty,
              ing.pack_unit_size_unit,
              ing.density_g_per_ml
            ) AS quantity_base
          FROM public.recipe_ingredients ri
          JOIN public.ingredients ing ON ing.id = ri.ingredient_id
          WHERE ri.recipe_id = cart_rec.recipe_id
        ) AS line;

        IF jsonb_array_length(v_rows) = 0 THEN
          RAISE EXCEPTION 'Receta "%" sin ingredientes en escandallo', cart_rec.recipe_name;
        END IF;
      ELSE
        SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
        INTO v_rows
        FROM public.recipe_stock_requirements_v2_rows(
          cart_rec.recipe_id,
          cart_rec.quantity
        ) AS x;

        IF jsonb_array_length(v_rows) = 0 THEN
          RAISE EXCEPTION 'No se pudo expandir la receta "%"', cart_rec.recipe_name;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_rows) elem
          WHERE COALESCE(elem->>'ok', '') IS DISTINCT FROM 'true'
        ) THEN
          RAISE EXCEPTION 'expansión de stock inválida para recipe_id %: %',
            cart_rec.recipe_id,
            (
              SELECT elem->'errors'
              FROM jsonb_array_elements(v_rows) elem
              WHERE COALESCE(elem->>'ok', '') IS DISTINCT FROM 'true'
              LIMIT 1
            );
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_rows) elem
          WHERE COALESCE((elem->>'ingredient_count')::integer, 0) > 0
        ) THEN
          RAISE EXCEPTION 'Esta receta no tiene materias primas configuradas.';
        END IF;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_rows) elem
        WHERE elem->>'ingredient_id' IS NOT NULL
          AND (
            elem->>'quantity_base' IS NULL
            OR (elem->>'quantity_base')::numeric = 'NaN'::numeric
            OR (elem->>'quantity_base')::numeric = 'Infinity'::numeric
            OR (elem->>'quantity_base')::numeric = '-Infinity'::numeric
            OR (elem->>'quantity_base')::numeric < 0
            OR btrim(COALESCE(elem->>'unit_base', '')) = ''
          )
      ) THEN
        RAISE EXCEPTION 'cantidad de stock no segura para recipe_id %', cart_rec.recipe_id;
      END IF;

      SELECT COUNT(*)::integer
      INTO v_positive
      FROM (
        SELECT elem->>'ingredient_id' AS ingredient_id
        FROM jsonb_array_elements(v_rows) elem
        WHERE elem->>'ingredient_id' IS NOT NULL
          AND (elem->>'quantity_base')::numeric > 0
        GROUP BY 1, btrim(elem->>'unit_base')
      ) positive;

      IF v_positive = 0 THEN
        RAISE EXCEPTION 'No se pudo calcular consumo para esta receta.';
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        recipe_id := cart_rec.recipe_id;
        recipe_name := cart_rec.recipe_name;
        error_message := SQLERRM;
        RETURN NEXT;
        v_failed := array_append(v_failed, cart_rec.recipe_id);
    END;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.convert_pricing_qty_with_density(numeric,text,text,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recipe_qty_to_purchase_unit_for_cost_with_density(numeric,text,text,text,numeric,text,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recipe_qty_to_base_unit_with_density(numeric,text,text,text,numeric,text,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_recipe_line_cost_with_density(numeric,numeric,text,text,numeric,boolean,text,numeric,text,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_recipe_line_cost_v2_with_density(numeric,text,text,numeric,numeric,text,numeric) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.convert_pricing_qty_with_density(numeric,text,text,numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recipe_qty_to_purchase_unit_for_cost_with_density(numeric,text,text,text,numeric,text,numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recipe_qty_to_base_unit_with_density(numeric,text,text,text,numeric,text,numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_recipe_line_cost_with_density(numeric,numeric,text,text,numeric,boolean,text,numeric,text,numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_recipe_line_cost_v2_with_density(numeric,text,text,numeric,numeric,text,numeric) TO authenticated, service_role;

DO $$
DECLARE v numeric; j jsonb;
BEGIN
  v := public.convert_pricing_qty_with_density(30,'ml','kg',1.4);
  IF abs(v - 0.042) > 0.000000001 THEN
    RAISE EXCEPTION 'density 30ml->kg failed: %', v;
  END IF;

  v := public.convert_pricing_qty_with_density(140,'g','l',1.4);
  IF abs(v - 0.1) > 0.000000001 THEN
    RAISE EXCEPTION 'density 140g->l failed: %', v;
  END IF;

  IF public.convert_pricing_qty_with_density(30,'ml','kg',NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'cross dimension without density must remain blocked';
  END IF;

  j := public.fn_recipe_line_cost_v2_with_density(30,'ml','kg',10.71,NULL,NULL,1.4);
  IF j->>'status' <> 'OK'
     OR abs((j->>'cost_eur')::numeric - 0.44982) > 0.000000001 THEN
    RAISE EXCEPTION 'density cost failed: %', j;
  END IF;
END;
$$;
