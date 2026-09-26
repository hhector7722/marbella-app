-- Consumo personal recursivo. No ejecutar en producción.
-- Requiere el esquema, el wrapper v2 y las funciones de B9.3 ya instaladas.

DO $$
DECLARE
  employee uuid := gen_random_uuid();
  flour uuid := gen_random_uuid();
  nata uuid := gen_random_uuid();
  bacon uuid := gen_random_uuid();
  parmesan uuid := gen_random_uuid();
  pepper uuid := gen_random_uuid();
  pincho uuid := gen_random_uuid();
  direct uuid := gen_random_uuid();
  salsa uuid := gen_random_uuid();
  pasta uuid := gen_random_uuid();
  empty_recipe uuid := gen_random_uuid();
  bad_recipe uuid := gen_random_uuid();
  good_a uuid := gen_random_uuid();
  good_b uuid := gen_random_uuid();
  half_recipe uuid := gen_random_uuid();
  internal_recipe uuid := gen_random_uuid();
  src text;
  val_src text;
  modal_src text;
  result jsonb;
  ref text;
  stock_before integer;
  errors_before integer;
  validation_errors integer;
BEGIN
  SELECT p.prosrc INTO src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'process_staff_consumption'
    AND pg_get_function_identity_arguments(p.oid) = 'uuid, jsonb';

  SELECT p.prosrc INTO val_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'validate_staff_consumption';

  SELECT p.prosrc INTO modal_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_consumption_modal_recipes';

  IF src IS NULL
     OR src NOT ILIKE '%recipe_stock_requirements_v2_rows%'
     OR src ILIKE '%staff_consumption_qty_to_purchase_unit%'
     OR src NOT ILIKE '%recipe_qty_to_base_unit%'
     OR src NOT ILIKE '%Media ración no disponible para recetas con elaboraciones%'
     OR src NOT ILIKE '%b9-recursive-v1%'
     OR src NOT ILIKE '%Consumo Personal:%'
     OR src !~* 'recipe_stock_requirements_v2_rows[[:space:]]*\([[:space:]]*cart_rec\.recipe_id[[:space:]]*,[[:space:]]*cart_rec\.quantity[[:space:]]*\)' THEN
    RAISE EXCEPTION 'L: el consumo personal no usa la expansión canónica';
  END IF;

  IF src ~* 'recipe_stock_requirements_v2_rows[[:space:]]*\([^)]*0\.5' THEN
    RAISE EXCEPTION 'I: la media ración llama al wrapper';
  END IF;

  IF val_src IS NULL
     OR val_src NOT ILIKE '%recipe_stock_requirements_v2_rows%'
     OR val_src ILIKE '%staff_consumption_qty_to_purchase_unit%'
     OR val_src ILIKE '%INSERT INTO%'
     OR val_src ILIKE '%staff_consumption_register_errors%' THEN
    RAISE EXCEPTION 'K: validate no refleja las reglas o escribe';
  END IF;

  IF modal_src IS NULL OR modal_src NOT ILIKE '%is_sellable%' THEN
    RAISE EXCEPTION 'N: el modal no filtra elaboraciones internas';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.process_staff_consumption(uuid, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.validate_staff_consumption(jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_consumption_modal_recipes()', 'EXECUTE') THEN
    RAISE EXCEPTION 'los permisos de consumo personal cambiaron';
  END IF;

  INSERT INTO public.profiles (id, role) VALUES (employee, 'staff');
  PERFORM set_config('request.jwt.claim.sub', employee::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', employee)::text, true);

  IF auth.uid() IS DISTINCT FROM employee THEN
    RAISE EXCEPTION 'auth.uid no está fijado: %', auth.uid();
  END IF;

  INSERT INTO public.ingredients (
    id, name, unit_type, purchase_unit, current_price, base_unit
  ) VALUES
    (flour, 'B93 Harina', 'kg', 'kg', 2, 'g'),
    (nata, 'B93 Nata', 'l', 'l', 1, 'ml'),
    (bacon, 'B93 Bacon', 'kg', 'kg', 1, 'g'),
    (parmesan, 'B93 Parmesano', 'kg', 'kg', 0, 'g'),
    (pepper, 'B93 Pimienta', 'kg', 'kg', 0, 'g'),
    (pincho, 'B93 Pincho', 'ud', 'ud', 1, 'ud');

  INSERT INTO public.recipes (id, name, is_sellable) VALUES
    (direct, 'B93 Directa', true),
    (empty_recipe, 'B93 Vacia', true),
    (bad_recipe, 'B93 Mala', true),
    (good_a, 'B93 Buena A', true),
    (good_b, 'B93 Buena B', true),
    (half_recipe, 'B93 Media', true),
    (pasta, 'B93 Pasta carbonara', true),
    (internal_recipe, 'B93 Interna', false);
  INSERT INTO public.recipes (id, name, is_sellable, yield_quantity, yield_unit)
  VALUES (salsa, 'B93 Salsa carbonara', false, 1, 'ud');

  INSERT INTO public.recipe_ingredients (
    recipe_id, ingredient_id, quantity_gross, quantity_half, unit, umb_multiplier
  ) VALUES
    (direct, flour, 0.25, NULL, 'kg', 1),
    (bad_recipe, flour, 1, NULL, 'ml', 1),
    (good_a, bacon, 20, NULL, 'g', 1),
    (good_b, nata, 50, NULL, 'ml', 1),
    (half_recipe, pincho, 3, 0.5, 'ud', 1),
    (half_recipe, bacon, 10, 0, 'g', 1),
    (salsa, nata, 50, NULL, 'ml', 1),
    (salsa, bacon, 20, NULL, 'g', 1),
    (salsa, parmesan, 10, NULL, 'g', 1),
    (salsa, pepper, 0.5, NULL, 'g', 1),
    (internal_recipe, flour, 0.25, NULL, 'kg', 1);
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (pasta, salsa, 1, 'ud');

  -- A. Ración completa directa: 0.25 kg → 250 g.
  result := public.process_staff_consumption(
    employee,
    jsonb_build_array(jsonb_build_object('recipe_id', direct, 'quantity', 1, 'is_half', false))
  );
  ref := result->>'reference_doc';
  IF (result->>'ok')::boolean IS NOT TRUE
     OR (result->>'error_count')::integer <> 0
     OR NOT EXISTS (
       SELECT 1 FROM public.stock_movements
       WHERE reference_doc = ref AND ingredient_id = flour AND quantity = 250 AND unit = 'g'
     ) THEN
    RAISE EXCEPTION 'A: %', result;
  END IF;

  -- B. Carbonara completa.
  result := public.process_staff_consumption(
    employee,
    jsonb_build_array(jsonb_build_object('recipe_id', pasta, 'quantity', 1, 'is_half', false))
  );
  ref := result->>'reference_doc';
  IF (result->>'ok')::boolean IS NOT TRUE OR (result->>'error_count')::integer <> 0 THEN
    RAISE EXCEPTION 'B estado: %', result;
  END IF;
  IF (
    SELECT count(*) FROM public.stock_movements WHERE reference_doc = ref
  ) <> 4
  OR NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = ref AND ingredient_id = nata AND quantity = 50 AND unit = 'ml'
  )
  OR NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = ref AND ingredient_id = bacon AND quantity = 20 AND unit = 'g'
  )
  OR NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = ref AND ingredient_id = parmesan AND quantity = 10 AND unit = 'g'
  )
  OR NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = ref AND ingredient_id = pepper AND quantity = 0.5 AND unit = 'g'
  ) THEN
    RAISE EXCEPTION 'B cantidades: %', result;
  END IF;

  -- M. El reporting histórico sigue reconociendo el fichaje.
  IF NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = ref
      AND movement_type = 'WASTE'
      AND reference_doc LIKE 'STAFF-%'
      AND original_description = 'Consumo Personal: B93 Pasta carbonara'
      AND processed_by = 'Auto-Registro Salida (Staff ID: ' || employee::text || ')'
      AND reference_type = 'staff_consumption'::public.stock_reference_type
      AND reference_external_id = ref
      AND origin = 'staff_consumption'::public.stock_movement_origin
      AND actor_profile_id = employee
      AND provenance->>'schema_version' = 'b9-recursive-v1'
  ) OR COALESCE((
    SELECT usage_count
    FROM public.staff_consumption_recipe_usage_counts()
    WHERE recipe_id = pasta
  ), 0) < 1 THEN
    RAISE EXCEPTION 'M: el consumo no cuenta la receta';
  END IF;

  -- C. Multiplicador 2.
  result := public.process_staff_consumption(
    employee,
    jsonb_build_array(jsonb_build_object('recipe_id', pasta, 'quantity', 2, 'is_half', false))
  );
  ref := result->>'reference_doc';
  IF NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = ref AND ingredient_id = nata AND quantity = 100 AND unit = 'ml'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = ref AND ingredient_id = pepper AND quantity = 1 AND unit = 'g'
  ) THEN
    RAISE EXCEPTION 'C: %', result;
  END IF;

  -- D. Expansión inválida.
  result := public.process_staff_consumption(
    employee,
    jsonb_build_array(jsonb_build_object('recipe_id', bad_recipe, 'quantity', 1, 'is_half', false))
  );
  ref := result->>'reference_doc';
  IF (result->>'ok')::boolean IS NOT TRUE
     OR (result->>'error_count')::integer <> 1
     OR EXISTS (SELECT 1 FROM public.stock_movements WHERE reference_doc = ref)
     OR NOT EXISTS (
       SELECT 1 FROM public.staff_consumption_register_errors
       WHERE reference_doc = ref AND recipe_id = bad_recipe
     ) THEN
    RAISE EXCEPTION 'D: %', result;
  END IF;

  -- E. Expansión válida vacía.
  result := public.process_staff_consumption(
    employee,
    jsonb_build_array(jsonb_build_object('recipe_id', empty_recipe, 'quantity', 1, 'is_half', false))
  );
  ref := result->>'reference_doc';
  IF (result->>'error_count')::integer <> 1
     OR EXISTS (SELECT 1 FROM public.stock_movements WHERE reference_doc = ref)
     OR NOT EXISTS (
       SELECT 1 FROM public.staff_consumption_register_errors
       WHERE reference_doc = ref
         AND recipe_id = empty_recipe
         AND error_message ILIKE '%materias primas%'
     ) THEN
    RAISE EXCEPTION 'E: %', result;
  END IF;

  -- F. Carrito mixto: dos válidas y una inválida.
  result := public.process_staff_consumption(
    employee,
    jsonb_build_array(
      jsonb_build_object('recipe_id', good_a, 'quantity', 1, 'is_half', false),
      jsonb_build_object('recipe_id', bad_recipe, 'quantity', 1, 'is_half', false),
      jsonb_build_object('recipe_id', good_b, 'quantity', 1, 'is_half', false)
    )
  );
  ref := result->>'reference_doc';
  IF (result->>'ok')::boolean IS NOT TRUE
     OR (result->>'error_count')::integer <> 1
     OR (result->>'stock_written_count')::integer <> 2
     OR NOT EXISTS (
       SELECT 1 FROM public.stock_movements
       WHERE reference_doc = ref AND ingredient_id = bacon AND quantity = 20 AND unit = 'g'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.stock_movements
       WHERE reference_doc = ref AND ingredient_id = nata AND quantity = 50 AND unit = 'ml'
     )
     OR EXISTS (
       SELECT 1 FROM public.stock_movements
       WHERE reference_doc = ref AND ingredient_id = flour
     ) THEN
    RAISE EXCEPTION 'F: %', result;
  END IF;

  -- G y H. Media ración directa asimétrica y fallback.
  result := public.process_staff_consumption(
    employee,
    jsonb_build_array(jsonb_build_object('recipe_id', half_recipe, 'quantity', 1, 'is_half', true))
  );
  ref := result->>'reference_doc';
  IF (result->>'error_count')::integer <> 0
     OR NOT EXISTS (
       SELECT 1 FROM public.stock_movements
       WHERE reference_doc = ref AND ingredient_id = pincho AND quantity = 0.5 AND unit = 'ud'
     )
     OR EXISTS (
       SELECT 1 FROM public.stock_movements
       WHERE reference_doc = ref AND ingredient_id = pincho AND quantity = 1.5
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.stock_movements
       WHERE reference_doc = ref AND ingredient_id = bacon AND quantity = 5 AND unit = 'g'
     ) THEN
    RAISE EXCEPTION 'G/H: %', result;
  END IF;

  -- I. Media ración con subreceta.
  result := public.process_staff_consumption(
    employee,
    jsonb_build_array(jsonb_build_object('recipe_id', pasta, 'quantity', 1, 'is_half', true))
  );
  ref := result->>'reference_doc';
  IF (result->>'error_count')::integer <> 1
     OR EXISTS (SELECT 1 FROM public.stock_movements WHERE reference_doc = ref)
     OR NOT EXISTS (
       SELECT 1 FROM public.staff_consumption_register_errors
       WHERE reference_doc = ref
         AND recipe_id = pasta
         AND error_message = 'Media ración no disponible para recetas con elaboraciones'
     ) THEN
    RAISE EXCEPTION 'I: %', result;
  END IF;

  -- J1. Solo una elaboración interna: NO_FOOD, cero stock y un error.
  result := public.process_staff_consumption(
    employee,
    jsonb_build_array(jsonb_build_object('recipe_id', internal_recipe, 'quantity', 1, 'is_half', false))
  );
  ref := result->>'reference_doc';
  IF (result->>'ok')::boolean IS NOT FALSE
     OR result->>'code' IS DISTINCT FROM 'NO_FOOD'
     OR (result->>'error_count')::integer <> 1
     OR (result->>'stock_written_count')::integer <> 0
     OR EXISTS (SELECT 1 FROM public.stock_movements WHERE reference_doc = ref)
     OR (
       SELECT count(*) FROM public.staff_consumption_register_errors
       WHERE reference_doc = ref AND recipe_id = internal_recipe
     ) <> 1 THEN
    RAISE EXCEPTION 'J1: %', result;
  END IF;

  -- J2. Interna junto a una receta válida: un solo error y la válida se escribe.
  result := public.process_staff_consumption(
    employee,
    jsonb_build_array(
      jsonb_build_object('recipe_id', direct, 'quantity', 1, 'is_half', false),
      jsonb_build_object('recipe_id', internal_recipe, 'quantity', 1, 'is_half', false)
    )
  );
  ref := result->>'reference_doc';
  IF (result->>'ok')::boolean IS NOT TRUE
     OR (result->>'error_count')::integer <> 1
     OR (result->>'stock_written_count')::integer <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.stock_movements
       WHERE reference_doc = ref AND ingredient_id = flour AND quantity = 250 AND unit = 'g'
     )
     OR EXISTS (
       SELECT 1 FROM public.stock_movements
       WHERE reference_doc = ref AND original_description ILIKE '%B93 Interna%'
     )
     OR (
       SELECT count(*) FROM public.staff_consumption_register_errors
       WHERE reference_doc = ref AND recipe_id = internal_recipe
     ) <> 1
     OR EXISTS (
       SELECT 1 FROM public.get_consumption_modal_recipes() WHERE id = internal_recipe
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.get_consumption_modal_recipes() WHERE id = direct
     ) THEN
    RAISE EXCEPTION 'J2/N: %', result;
  END IF;

  -- K. Validate no escribe y señala los mismos rechazos.
  SELECT count(*)::integer INTO stock_before FROM public.stock_movements;
  SELECT count(*)::integer INTO errors_before FROM public.staff_consumption_register_errors;

  SELECT count(*)::integer INTO validation_errors
  FROM public.validate_staff_consumption(jsonb_build_array(
    jsonb_build_object('recipe_id', direct, 'quantity', 1, 'is_half', false),
    jsonb_build_object('recipe_id', half_recipe, 'quantity', 1, 'is_half', true)
  ));
  IF validation_errors <> 0 THEN
    RAISE EXCEPTION 'K válidas: %', validation_errors;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.validate_staff_consumption(jsonb_build_array(
      jsonb_build_object('recipe_id', bad_recipe, 'quantity', 1, 'is_half', false)
    ))
  ) OR NOT EXISTS (
    SELECT 1 FROM public.validate_staff_consumption(jsonb_build_array(
      jsonb_build_object('recipe_id', empty_recipe, 'quantity', 1, 'is_half', false)
    ))
  ) OR NOT EXISTS (
    SELECT 1 FROM public.validate_staff_consumption(jsonb_build_array(
      jsonb_build_object('recipe_id', pasta, 'quantity', 1, 'is_half', true)
    )) WHERE error_message = 'Media ración no disponible para recetas con elaboraciones'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.validate_staff_consumption(jsonb_build_array(
      jsonb_build_object('recipe_id', internal_recipe, 'quantity', 1, 'is_half', false)
    ))
  ) THEN
    RAISE EXCEPTION 'K rechazos';
  END IF;

  IF (SELECT count(*) FROM public.stock_movements) <> stock_before
     OR (SELECT count(*) FROM public.staff_consumption_register_errors) <> errors_before THEN
    RAISE EXCEPTION 'K: validate escribió';
  END IF;

  DELETE FROM public.stock_movements WHERE actor_profile_id = employee;
  DELETE FROM public.staff_consumption_register_errors WHERE employee_id = employee;
  DELETE FROM public.recipe_subrecipes WHERE parent_recipe_id = pasta;
  DELETE FROM public.recipe_ingredients WHERE recipe_id IN (
    direct, bad_recipe, good_a, good_b, half_recipe, salsa, internal_recipe
  );
  DELETE FROM public.recipes WHERE id IN (
    direct, empty_recipe, bad_recipe, good_a, good_b, half_recipe, pasta, salsa, internal_recipe
  );
  DELETE FROM public.ingredients WHERE id IN (flour, nata, bacon, parmesan, pepper, pincho);
  DELETE FROM public.profiles WHERE id = employee;
END;
$$;
