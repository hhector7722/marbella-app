-- Contrato de get_recipe_cost_v2. Se ejecuta sobre una base desechable
-- que ya tiene las funciones. No es una migración.

DO $$
DECLARE
  milk uuid := '00000000-0000-0000-0000-000000000001';
  flour uuid := '00000000-0000-0000-0000-000000000002';
  sauce uuid := '00000000-0000-0000-0000-000000000010';
  lasagna uuid := '00000000-0000-0000-0000-000000000011';
  sellable uuid := '00000000-0000-0000-0000-000000000012';
  hidden uuid := '00000000-0000-0000-0000-000000000013';
  level_c uuid := '00000000-0000-0000-0000-000000000021';
  level_b uuid := '00000000-0000-0000-0000-000000000022';
  level_a uuid := '00000000-0000-0000-0000-000000000023';
  branch uuid := '00000000-0000-0000-0000-000000000030';
  parent uuid := '00000000-0000-0000-0000-000000000031';
  cycle_a uuid := '00000000-0000-0000-0000-000000000041';
  cycle_b uuid := '00000000-0000-0000-0000-000000000042';
  mixed uuid := '00000000-0000-0000-0000-000000000051';
  bare uuid := '00000000-0000-0000-0000-000000000061';
  empty_recipe uuid := '00000000-0000-0000-0000-000000000062';
  result jsonb;
  line jsonb;
  legacy_args text;
  prev uuid;
  nxt uuid;
  i int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'public' AND matviewname = 'recipe_financials'
  ) THEN
    REFRESH MATERIALIZED VIEW public.recipe_financials;
  END IF;
  INSERT INTO public.ingredients (id, name, unit_type, purchase_unit, current_price)
  VALUES
    (milk, 'Leche', 'kg', 'kg', 3.20),
    (flour, 'Harina', 'kg', 'kg', 2);

  line := public.fn_recipe_line_cost_v2(1, 'kg', 'kg', 3.20, NULL, NULL);
  IF line->>'status' <> 'OK' OR (line->>'cost_eur')::numeric <> 3.20 THEN
    RAISE EXCEPTION 'caso 1: %', line;
  END IF;

  line := public.fn_recipe_line_cost_v2(1, 'kg', 'kg', NULL, NULL, NULL);
  IF line->>'status' <> 'MISSING_PRICE' OR line->'cost_eur' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'caso 2: %', line;
  END IF;

  line := public.fn_recipe_line_cost_v2(1, 'kg', 'kg', 0, NULL, NULL);
  IF line->>'status' <> 'MISSING_PRICE' OR line->'cost_eur' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'caso 3: %', line;
  END IF;

  line := public.fn_recipe_line_cost_v2(100, 'g', 'l', 3, NULL, NULL);
  IF line->>'status' <> 'INCOMPATIBLE_UNITS' OR line->'cost_eur' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'caso 4: %', line;
  END IF;

  line := public.fn_recipe_line_cost_v2(250, 'g', 'kg', 8, NULL, NULL);
  IF (line->>'cost_eur')::numeric <> 2 THEN
    RAISE EXCEPTION 'caso 5: %', line;
  END IF;

  line := public.fn_recipe_line_cost_v2(100, 'cl', 'l', 3, NULL, NULL);
  IF (line->>'cost_eur')::numeric <> 3 THEN
    RAISE EXCEPTION 'caso 6 cl: %', line;
  END IF;
  line := public.fn_recipe_line_cost_v2(50, 'ml', 'cl', 2, NULL, NULL);
  IF (line->>'cost_eur')::numeric <> 10 THEN
    RAISE EXCEPTION 'caso 6 ml: %', line;
  END IF;

  line := public.fn_recipe_line_cost_v2(1, 'ud', 'kg', 8, 125, 'g');
  IF line->>'status' <> 'OK' OR (line->>'cost_eur')::numeric <> 1 THEN
    RAISE EXCEPTION 'caso 7: %', line;
  END IF;
  line := public.fn_recipe_line_cost_v2(24, 'ud', 'l', 1, 330, 'ml');
  IF (line->>'cost_eur')::numeric <> 7.92 THEN
    RAISE EXCEPTION 'caso 7 pack: %', line;
  END IF;

  line := public.fn_recipe_line_cost_v2(1, 'g', 'l', NULL, NULL, NULL);
  IF line->'cost_eur' <> 'null'::jsonb
     OR line->'issues' <> '["INCOMPATIBLE_UNITS","MISSING_PRICE"]'::jsonb THEN
    RAISE EXCEPTION 'hoja con dos fallos: %', line;
  END IF;

  line := public.fn_recipe_line_cost_v2(1, 'kg', 'kg', 'NaN'::numeric, NULL, NULL);
  IF line->>'status' <> 'MISSING_PRICE' OR line->'cost_eur' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'precio NaN: %', line;
  END IF;
  line := public.fn_recipe_line_cost_v2(1, 'kg', 'kg', 'Infinity'::numeric, NULL, NULL);
  IF line->>'status' <> 'MISSING_PRICE' OR line->'cost_eur' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'precio Infinity: %', line;
  END IF;
  line := public.fn_recipe_line_cost_v2('NaN'::numeric, 'kg', 'kg', 1, NULL, NULL);
  IF line->>'status' <> 'INCOMPATIBLE_UNITS' OR line->'cost_eur' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'cantidad NaN: %', line;
  END IF;

  INSERT INTO public.recipes (id, name, is_sellable, yield_quantity, yield_unit)
  VALUES
    (sauce, 'Salsa parmesana', false, 1000, 'ml'),
    (lasagna, 'Lasaña', true, NULL, NULL),
    (sellable, 'Bechamel vendible', true, 1000, 'ml'),
    (hidden, 'Bechamel oculta', false, 1000, 'ml');

  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit)
  VALUES
    (sauce, milk, 1, 'kg'),
    (sellable, milk, 1, 'kg'),
    (hidden, milk, 1, 'kg');

  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES
    (lasagna, sauce, 120, 'ml');

  result := public.get_recipe_cost_v2(sauce);
  IF (result->>'ok')::boolean IS NOT TRUE OR (result->>'total_cost_eur')::numeric <> 3.20 THEN
    RAISE EXCEPTION 'caso 8: %', result;
  END IF;

  result := public.get_recipe_cost_v2(lasagna);
  IF (result->>'total_cost_eur')::numeric <> 0.384
     OR (
       SELECT COALESCE(sum((c->>'cost_eur')::numeric), 0)
       FROM jsonb_array_elements(result->'components') c
       WHERE c->>'kind' = 'ingredient'
     ) <> 0.384
     OR (
       SELECT (c->>'cost_eur')::numeric
       FROM jsonb_array_elements(result->'components') c
       WHERE c->>'kind' = 'subrecipe' AND c->>'component_id' = sauce::text
     ) <> 0.384
     OR (
       SELECT (c->>'local_cost_eur')::numeric
       FROM jsonb_array_elements(result->'components') c
       WHERE c->>'kind' = 'subrecipe' AND c->>'component_id' = sauce::text
     ) <> 3.20 THEN
    RAISE EXCEPTION 'caso 9 escalado: %', result;
  END IF;

  UPDATE public.recipe_subrecipes SET quantity = 0.12, unit = 'l' WHERE parent_recipe_id = lasagna;
  result := public.get_recipe_cost_v2(lasagna);
  IF (result->>'total_cost_eur')::numeric <> 0.384 THEN
    RAISE EXCEPTION 'caso 10: %', result;
  END IF;
  UPDATE public.recipe_subrecipes SET quantity = 120, unit = 'ml' WHERE parent_recipe_id = lasagna;

  UPDATE public.recipes SET yield_quantity = NULL, yield_unit = NULL WHERE id = sauce;
  result := public.get_recipe_cost_v2(lasagna);
  IF (result->>'ok')::boolean IS NOT FALSE
     OR result->'total_cost_eur' <> 'null'::jsonb
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(result->'errors') e
       WHERE e->>'status' = 'MISSING_YIELD'
     ) THEN
    RAISE EXCEPTION 'caso 11: %', result;
  END IF;
  UPDATE public.recipes SET yield_quantity = 1000, yield_unit = 'ml' WHERE id = sauce;

  UPDATE public.recipe_subrecipes SET unit = 'g' WHERE parent_recipe_id = lasagna;
  result := public.get_recipe_cost_v2(lasagna);
  IF result->'total_cost_eur' <> 'null'::jsonb
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(result->'errors') e
       WHERE e->>'status' = 'INCOMPATIBLE_UNITS'
     ) THEN
    RAISE EXCEPTION 'caso 12: %', result;
  END IF;
  UPDATE public.recipe_subrecipes SET unit = 'ml' WHERE parent_recipe_id = lasagna;

  INSERT INTO public.recipes (id, name, is_sellable) VALUES (parent, 'Padre vendible', true);
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (parent, sellable, 120, 'ml');
  result := public.get_recipe_cost_v2(parent);
  IF (result->>'total_cost_eur')::numeric <> 0.384 THEN
    RAISE EXCEPTION 'caso 13: %', result;
  END IF;

  UPDATE public.recipe_subrecipes SET child_recipe_id = hidden WHERE parent_recipe_id = parent;
  result := public.get_recipe_cost_v2(parent);
  IF (result->>'total_cost_eur')::numeric <> 0.384 THEN
    RAISE EXCEPTION 'caso 14: %', result;
  END IF;

  INSERT INTO public.recipes (id, name, is_sellable, yield_quantity, yield_unit) VALUES
    (level_c, 'Nivel C', false, 1000, 'ml'),
    (level_b, 'Nivel B', false, 100, 'g'),
    (level_a, 'Nivel A', true, NULL, NULL);
  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit)
  VALUES (level_c, flour, 2, 'kg');
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit) VALUES
    (level_b, level_c, 250, 'ml'),
    (level_a, level_b, 50, 'g');

  result := public.get_recipe_cost_v2(level_b);
  IF (result->>'total_cost_eur')::numeric <> 1 THEN
    RAISE EXCEPTION 'caso 15: %', result;
  END IF;
  result := public.get_recipe_cost_v2(level_a);
  IF (result->>'total_cost_eur')::numeric <> 0.5
     OR (
       SELECT (c->>'cost_eur')::numeric
       FROM jsonb_array_elements(result->'components') c
       WHERE c->>'kind' = 'ingredient' AND c->>'component_id' = flour::text
     ) <> 0.5
     OR (
       SELECT (c->>'local_cost_eur')::numeric
       FROM jsonb_array_elements(result->'components') c
       WHERE c->>'kind' = 'ingredient' AND c->>'component_id' = flour::text
     ) <> 4 THEN
    RAISE EXCEPTION 'caso 16-17 escalado: %', result;
  END IF;

  INSERT INTO public.recipes (id, name, is_sellable, yield_quantity, yield_unit)
  VALUES (branch, 'Rama', false, 100, 'g');
  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit) VALUES
    (branch, flour, 100, 'g'),
    (level_a, flour, 100, 'g');
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (level_a, branch, 100, 'g');
  result := public.get_recipe_cost_v2(level_a);
  IF (result->>'total_cost_eur')::numeric <> 0.9 THEN
    RAISE EXCEPTION 'caso 18: %', result;
  END IF;

  INSERT INTO public.recipes (id, name, is_sellable, yield_quantity, yield_unit) VALUES
    (cycle_a, 'Ciclo A', true, 1, 'ud'),
    (cycle_b, 'Ciclo B', true, 1, 'ud');
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit) VALUES
    (cycle_a, cycle_b, 1, 'ud'),
    (cycle_b, cycle_a, 1, 'ud');
  result := public.get_recipe_cost_v2(cycle_a);
  IF result->'total_cost_eur' <> 'null'::jsonb
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(result->'errors') e
       WHERE e->>'status' = 'CYCLE'
     ) THEN
    RAISE EXCEPTION 'caso 19: %', result;
  END IF;

  INSERT INTO public.recipes (id, name, is_sellable) VALUES (mixed, 'Mixta', true);
  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit)
  VALUES (mixed, flour, 100, 'g');
  UPDATE public.recipes SET yield_quantity = NULL, yield_unit = NULL WHERE id = sauce;
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (mixed, sauce, 120, 'ml');
  result := public.get_recipe_cost_v2(mixed);
  IF result->'total_cost_eur' <> 'null'::jsonb
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(result->'components') c
       WHERE c->>'kind' = 'ingredient' AND (c->>'cost_eur')::numeric = 0.2
     ) THEN
    RAISE EXCEPTION 'caso 20: %', result;
  END IF;

  UPDATE public.ingredients SET current_price = 0 WHERE id = flour;
  UPDATE public.recipe_subrecipes SET unit = 'g' WHERE parent_recipe_id = mixed;
  UPDATE public.recipes SET yield_quantity = 1000, yield_unit = 'ml' WHERE id = sauce;
  result := public.get_recipe_cost_v2(mixed);
  IF result->'total_cost_eur' <> 'null'::jsonb
     OR (
       SELECT count(DISTINCT e->>'status')
       FROM jsonb_array_elements(result->'errors') e
       WHERE e->>'status' IN ('MISSING_PRICE', 'INCOMPATIBLE_UNITS')
     ) <> 2 THEN
    RAISE EXCEPTION 'caso 21: %', result;
  END IF;
  UPDATE public.ingredients SET current_price = 2 WHERE id = flour;

  INSERT INTO public.recipes (id, name, is_sellable) VALUES (empty_recipe, 'Vacía', true);
  result := public.get_recipe_cost_v2(empty_recipe);
  IF (result->>'ok')::boolean IS NOT TRUE
     OR (result->>'total_cost_eur')::numeric <> 0
     OR jsonb_array_length(result->'errors') <> 0 THEN
    RAISE EXCEPTION 'caso 22: %', result;
  END IF;

  SELECT pg_get_function_identity_arguments(p.oid) INTO legacy_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_recipe_cost';
  IF legacy_args IS DISTINCT FROM 'p_recipe_id uuid, p_use_half_ration boolean' THEN
    RAISE EXCEPTION 'caso 23 firma legacy: %', legacy_args;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_recipe_cost'
      AND p.prosrc ILIKE '%recipe_subrecipes%'
  ) THEN
    RAISE EXCEPTION 'caso 23: get_recipe_cost lee subrecetas';
  END IF;

  BEGIN
    INSERT INTO public.recipes (name, yield_quantity, yield_unit)
    VALUES ('NaN yield', 'NaN'::numeric, 'ml');
    RAISE EXCEPTION 'yield NaN fue aceptado';
  EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
    NULL;
  END;
  BEGIN
    INSERT INTO public.recipes (name, yield_quantity, yield_unit)
    VALUES ('Infinity yield', 'Infinity'::numeric, 'ml');
    RAISE EXCEPTION 'yield Infinity fue aceptado';
  EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
    NULL;
  END;
  BEGIN
    INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
    VALUES (empty_recipe, sauce, 'NaN'::numeric, 'ml');
    RAISE EXCEPTION 'quantity NaN fue aceptada';
  EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
    NULL;
  END;

  prev := empty_recipe;
  UPDATE public.recipes SET yield_quantity = 1, yield_unit = 'ud' WHERE id = empty_recipe;
  FOR i IN 1..33 LOOP
    nxt := gen_random_uuid();
    INSERT INTO public.recipes (id, name, is_sellable, yield_quantity, yield_unit)
    VALUES (nxt, 'Nivel ' || i, true, 1, 'ud');
    INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
    VALUES (prev, nxt, 1, 'ud');
    prev := nxt;
  END LOOP;
  result := public.get_recipe_cost_v2(empty_recipe);
  IF NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(result->'errors') e
       WHERE e->>'status' = 'MAX_DEPTH_EXCEEDED'
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(result->'errors') e
       WHERE e->>'status' = 'CYCLE'
     )
     OR (result->>'ok')::boolean IS NOT FALSE
     OR result->'total_cost_eur' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'profundidad: %', result->'errors';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_recipe_cost_v2'
      AND p.prosrc ILIKE '%stock_movements%'
  ) THEN
    RAISE EXCEPTION 'caso 25: el coste escribe o lee stock';
  END IF;

  IF has_function_privilege('anon', 'public.get_recipe_cost_v2(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon puede ejecutar get_recipe_cost_v2';
  END IF;
END $$;
