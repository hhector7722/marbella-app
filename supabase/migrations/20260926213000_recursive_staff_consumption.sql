-- B9.3. Consumo personal de ración completa usa la expansión canónica.
-- La media ración directa conserva quantity_half y convierte a base_unit.
-- La media ración con subrecetas no se escribe. No hay backfill.

CREATE OR REPLACE FUNCTION public.process_staff_consumption(
  p_employee_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
            public.recipe_qty_to_base_unit(
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
              ing.pack_unit_size_unit
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
$$;

COMMENT ON FUNCTION public.process_staff_consumption(uuid, jsonb) IS
  'Registra consumo personal receta a receta. La ración completa expande con recipe_stock_requirements_v2_rows. La media ración directa conserva quantity_half y escribe ingredients.base_unit. La media ración con subrecetas y la elaboración interna no escriben stock.';

GRANT EXECUTE ON FUNCTION public.process_staff_consumption(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_staff_consumption(p_items jsonb)
RETURNS TABLE(recipe_id uuid, recipe_name text, error_message text)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
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
            public.recipe_qty_to_base_unit(
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
              ing.pack_unit_size_unit
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
$$;

COMMENT ON FUNCTION public.validate_staff_consumption(jsonb) IS
  'Comprueba consumo personal sin escribir stock ni errores. La ración completa usa la expansión canónica. La media ración con subrecetas y la elaboración interna no son válidas.';

GRANT EXECUTE ON FUNCTION public.validate_staff_consumption(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_consumption_modal_recipes()
RETURNS TABLE(
  id uuid,
  name text,
  category text,
  photo_url text,
  sort_order integer,
  usage_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.name,
    r.category,
    r.photo_url,
    COALESCE(o.sort_order, 999999) AS sort_order,
    COALESCE(u.usage_count, 0::bigint) AS usage_count
  FROM public.recipes r
  LEFT JOIN public.staff_consumption_recipe_display_order o ON o.recipe_id = r.id
  LEFT JOIN public.staff_consumption_recipe_usage_counts() u ON u.recipe_id = r.id
  WHERE r.is_sellable IS TRUE
  ORDER BY
    (
      COALESCE(o.sort_order, 999999)
      - LEAST(COALESCE(u.usage_count, 0)::integer, 80) * 3
    ) ASC,
    r.name ASC;
$$;

COMMENT ON FUNCTION public.get_consumption_modal_recipes() IS
  'Recetas vendibles del modal fichaje: orden base global guardado, con boost por veces consumidas. Las elaboraciones internas no se proyectan.';

GRANT EXECUTE ON FUNCTION public.get_consumption_modal_recipes() TO authenticated;
