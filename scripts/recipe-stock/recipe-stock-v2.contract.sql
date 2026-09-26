-- Contrato de get_recipe_stock_requirements_v2 contra el esquema real.

DO $$
DECLARE
  flour uuid := gen_random_uuid();
  milk uuid := gen_random_uuid();
  piece uuid := gen_random_uuid();
  root uuid := gen_random_uuid();
  sauce uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  d uuid := gen_random_uuid();
  empty_recipe uuid := gen_random_uuid();
  missing uuid := gen_random_uuid();
  result jsonb;
  qty numeric;
  n int;
  prev uuid;
  nxt uuid;
  head uuid;
  moves_before bigint;
  stock_before numeric;
  ticket_args text;
  ticket_src text;
BEGIN
  INSERT INTO public.ingredients (
    id, name, unit_type, purchase_unit, current_price, base_unit, pack_unit_size_qty, pack_unit_size_unit
  ) VALUES
    (flour, 'Harina', 'kg', 'kg', 2, 'g', NULL, NULL),
    (milk, 'Leche', 'l', 'l', 0, 'ml', NULL, NULL),
    (piece, 'Huevo', 'ud', 'ud', 0.2, 'g', 125, 'g');

  -- 1–4. Directos: 0.25 kg → 250 g; 1 l → 1000 ml; 3 ud → 3 ud.
  INSERT INTO public.recipes (id, name) VALUES (root, 'Directa');
  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit, umb_multiplier)
  VALUES (root, flour, 0.25, 'kg', 1);
  result := public.get_recipe_stock_requirements_v2(root);
  SELECT (i->>'quantity_base')::numeric INTO qty
  FROM jsonb_array_elements(result->'ingredients') i;
  IF (result->>'ok')::boolean IS NOT TRUE OR qty <> 250 OR result->'ingredients'->0->>'unit_base' <> 'g' THEN
    RAISE EXCEPTION 'caso 1-2: %', result;
  END IF;

  UPDATE public.recipe_ingredients SET ingredient_id = milk, quantity_gross = 1, unit = 'l' WHERE recipe_id = root;
  result := public.get_recipe_stock_requirements_v2(root);
  SELECT (i->>'quantity_base')::numeric INTO qty FROM jsonb_array_elements(result->'ingredients') i;
  IF qty <> 1000 OR result->'ingredients'->0->>'unit_base' <> 'ml' THEN
    RAISE EXCEPTION 'caso 3 l: %', result;
  END IF;
  UPDATE public.recipe_ingredients SET quantity_gross = 100, unit = 'cl' WHERE recipe_id = root;
  result := public.get_recipe_stock_requirements_v2(root);
  SELECT (i->>'quantity_base')::numeric INTO qty FROM jsonb_array_elements(result->'ingredients') i;
  IF qty <> 1000 THEN RAISE EXCEPTION 'caso 3 cl: %', result; END IF;
  UPDATE public.recipe_ingredients SET quantity_gross = 50, unit = 'ml' WHERE recipe_id = root;
  result := public.get_recipe_stock_requirements_v2(root);
  SELECT (i->>'quantity_base')::numeric INTO qty FROM jsonb_array_elements(result->'ingredients') i;
  IF qty <> 50 THEN RAISE EXCEPTION 'caso 3 ml: %', result; END IF;

  UPDATE public.recipe_ingredients
  SET ingredient_id = piece, quantity_gross = 3, unit = 'ud', umb_multiplier = 1
  WHERE recipe_id = root;
  UPDATE public.ingredients SET base_unit = 'ud', pack_unit_size_qty = NULL WHERE id = piece;
  result := public.get_recipe_stock_requirements_v2(root);
  SELECT (i->>'quantity_base')::numeric INTO qty FROM jsonb_array_elements(result->'ingredients') i;
  IF qty <> 3 OR result->'ingredients'->0->>'unit_base' <> 'ud' THEN
    RAISE EXCEPTION 'caso 4: %', result;
  END IF;

  -- 5. Puente ud → g.
  UPDATE public.ingredients SET base_unit = 'g', pack_unit_size_qty = 125, pack_unit_size_unit = 'g' WHERE id = piece;
  UPDATE public.recipe_ingredients SET quantity_gross = 1, unit = 'ud' WHERE recipe_id = root;
  result := public.get_recipe_stock_requirements_v2(root);
  SELECT (i->>'quantity_base')::numeric INTO qty FROM jsonb_array_elements(result->'ingredients') i;
  IF qty <> 125 THEN RAISE EXCEPTION 'caso 5: %', result; END IF;
  IF public.recipe_qty_to_base_unit(1, 'ud', 'g', 'per_pack', 125, 'g')
     IS DISTINCT FROM public.recipe_qty_to_base_unit(1, 'ud', 'g', 'per_purchase_unit', 125, 'g') THEN
    RAISE EXCEPTION 'caso modo: p_mode cambia el puente y hay que cubrir los dos modos';
  END IF;

  -- 6. umb_multiplier.
  UPDATE public.ingredients SET pack_unit_size_qty = NULL, pack_unit_size_unit = NULL WHERE id = piece;
  UPDATE public.recipe_ingredients
  SET ingredient_id = flour, quantity_gross = 50, unit = 'g', umb_multiplier = 2
  WHERE recipe_id = root;
  result := public.get_recipe_stock_requirements_v2(root);
  SELECT (i->>'quantity_base')::numeric INTO qty FROM jsonb_array_elements(result->'ingredients') i;
  IF qty <> 100 THEN RAISE EXCEPTION 'caso 6: %', result; END IF;

  -- 7. Precio 0 no rompe. 8. is_sellable no cambia.
  UPDATE public.recipe_ingredients SET ingredient_id = milk, quantity_gross = 10, unit = 'ml', umb_multiplier = 1
  WHERE recipe_id = root;
  result := public.get_recipe_stock_requirements_v2(root);
  SELECT (i->>'quantity_base')::numeric INTO qty FROM jsonb_array_elements(result->'ingredients') i;
  IF qty <> 10 OR (result->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'caso 7: %', result;
  END IF;

  INSERT INTO public.recipes (id, name, is_sellable, yield_quantity, yield_unit)
  VALUES (sauce, 'Salsa', true, 1000, 'ml');
  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit, umb_multiplier)
  VALUES (sauce, flour, 200, 'g', 1);
  INSERT INTO public.recipes (id, name, is_sellable, yield_quantity, yield_unit)
  VALUES (other, 'Salsa no vendible', false, 1000, 'ml');
  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit, umb_multiplier)
  VALUES (other, flour, 200, 'g', 1);
  IF (
       SELECT jsonb_agg(jsonb_build_object(
         'ingredient_id', i->>'ingredient_id',
         'quantity_base', i->>'quantity_base',
         'unit_base', i->>'unit_base'
       ))
       FROM jsonb_array_elements(public.get_recipe_stock_requirements_v2(sauce)->'ingredients') i
     ) IS DISTINCT FROM (
       SELECT jsonb_agg(jsonb_build_object(
         'ingredient_id', i->>'ingredient_id',
         'quantity_base', i->>'quantity_base',
         'unit_base', i->>'unit_base'
       ))
       FROM jsonb_array_elements(public.get_recipe_stock_requirements_v2(other)->'ingredients') i
     ) THEN
    RAISE EXCEPTION 'caso 8: is_sellable altera el consumo';
  END IF;

  -- 9. Unidad incompatible.
  UPDATE public.recipe_ingredients SET unit = 'ml' WHERE recipe_id = root AND ingredient_id = milk;
  UPDATE public.recipe_ingredients SET ingredient_id = flour, quantity_gross = 1, unit = 'ml'
  WHERE recipe_id = root;
  result := public.get_recipe_stock_requirements_v2(root);
  IF (result->>'ok')::boolean IS NOT FALSE
     OR result->'ingredients'->0->'quantity_base' <> 'null'::jsonb
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(result->'errors') e
       WHERE e->>'status' = 'INCOMPATIBLE_UNITS'
     ) THEN
    RAISE EXCEPTION 'caso 9: %', result;
  END IF;
  DELETE FROM public.recipe_ingredients WHERE recipe_id = root;

  -- 10–11. 120 ml y 0.12 l de un lote de 1000 ml con 200 g → 24 g.
  INSERT INTO public.recipes (id, name) VALUES (a, 'Padre');
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (a, sauce, 120, 'ml');
  result := public.get_recipe_stock_requirements_v2(a);
  SELECT (i->>'quantity_base')::numeric INTO qty FROM jsonb_array_elements(result->'ingredients') i;
  IF qty <> 24 THEN RAISE EXCEPTION 'caso 10: %', result; END IF;
  UPDATE public.recipe_subrecipes SET quantity = 0.12, unit = 'l'
  WHERE parent_recipe_id = a AND child_recipe_id = sauce;
  result := public.get_recipe_stock_requirements_v2(a);
  SELECT (i->>'quantity_base')::numeric INTO qty FROM jsonb_array_elements(result->'ingredients') i;
  IF qty <> 24 THEN RAISE EXCEPTION 'caso 11: %', result; END IF;

  -- 12. Missing yield.
  UPDATE public.recipes SET yield_quantity = NULL, yield_unit = NULL WHERE id = sauce;
  result := public.get_recipe_stock_requirements_v2(a);
  IF (result->>'ok')::boolean IS NOT FALSE
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result->'errors') e WHERE e->>'status' = 'MISSING_YIELD')
     OR result->'ingredients'->0->>'quantity_base' = '0' THEN
    RAISE EXCEPTION 'caso 12: %', result;
  END IF;
  UPDATE public.recipes SET yield_quantity = 1000, yield_unit = 'ml' WHERE id = sauce;

  -- 13. g contra yield ml.
  UPDATE public.recipe_subrecipes SET quantity = 100, unit = 'g' WHERE parent_recipe_id = a;
  result := public.get_recipe_stock_requirements_v2(a);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(result->'errors') e WHERE e->>'status' = 'INCOMPATIBLE_UNITS'
  ) THEN
    RAISE EXCEPTION 'caso 13: %', result;
  END IF;
  UPDATE public.recipe_subrecipes SET quantity = 120, unit = 'ml' WHERE parent_recipe_id = a;

  -- 14–16. Tres niveles: C 200 g / 1000 ml; B consume 250 ml yield 100 g; A consume 50 g.
  -- Factor A: 50/100 * 250/1000 = 0.125 → 25 g.
  INSERT INTO public.recipes (id, name, yield_quantity, yield_unit)
  VALUES (b, 'Nivel B', 100, 'g'), (c, 'Nivel C', 1000, 'ml');
  DELETE FROM public.recipe_ingredients WHERE recipe_id = sauce;
  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit, umb_multiplier)
  VALUES (c, flour, 200, 'g', 1);
  DELETE FROM public.recipe_subrecipes WHERE parent_recipe_id = a;
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (b, c, 250, 'ml'), (a, b, 50, 'g');
  result := public.get_recipe_stock_requirements_v2(a);
  SELECT (i->>'quantity_base')::numeric INTO qty FROM jsonb_array_elements(result->'ingredients') i;
  IF qty <> 25 THEN RAISE EXCEPTION 'caso 14-16: %', result; END IF;

  -- 17. Cadena de 40. Hoja con 1 g. Cada arista 1/1 ud. Resultado 1 g.
  head := gen_random_uuid();
  INSERT INTO public.recipes (id, name, yield_quantity, yield_unit)
  VALUES (head, 'cadena 0', 1, 'ud');
  prev := head;
  FOR n IN 1..40 LOOP
    nxt := gen_random_uuid();
    INSERT INTO public.recipes (id, name, yield_quantity, yield_unit)
    VALUES (nxt, 'cadena ' || n, 1, 'ud');
    INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
    VALUES (prev, nxt, 1, 'ud');
    prev := nxt;
  END LOOP;
  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit, umb_multiplier)
  VALUES (prev, flour, 1, 'g', 1);
  result := public.get_recipe_stock_requirements_v2(head);
  SELECT (i->>'quantity_base')::numeric INTO qty FROM jsonb_array_elements(result->'ingredients') i;
  IF (result->>'ok')::boolean IS NOT TRUE OR qty <> 1 THEN
    RAISE EXCEPTION 'caso 17: %', result;
  END IF;

  -- 18–21 y suma operativa: 50 g directos + 20 g + 30 g = 100 g, una fila.
  DELETE FROM public.recipe_subrecipes WHERE parent_recipe_id = a;
  DELETE FROM public.recipe_ingredients WHERE recipe_id IN (b, c, sauce, other);
  UPDATE public.recipes SET yield_quantity = 1000, yield_unit = 'g' WHERE id IN (b, sauce);
  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit, umb_multiplier)
  VALUES
    (a, flour, 50, 'g', 1),
    (b, flour, 200, 'g', 1),
    (sauce, flour, 300, 'g', 1);
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (a, b, 100, 'g'), (a, sauce, 100, 'g');
  result := public.get_recipe_stock_requirements_v2(a);
  IF jsonb_array_length(result->'ingredients') <> 1 THEN
    RAISE EXCEPTION 'caso 18-20: más de una fila %', result;
  END IF;
  SELECT (i->>'quantity_base')::numeric INTO qty FROM jsonb_array_elements(result->'ingredients') i;
  IF qty <> 100 THEN RAISE EXCEPTION 'caso suma: %', result; END IF;
  IF (
    SELECT sum((contrib->>'quantity_base')::numeric)
    FROM jsonb_array_elements(result->'ingredients'->0->'contributions') contrib
  ) <> 100
  OR jsonb_array_length(result->'ingredients'->0->'contributions') <> 3 THEN
    RAISE EXCEPTION 'caso 21 contributions: %', result;
  END IF;

  -- 22. DAG A→B→D y A→C→D. D tiene 10 g, yield 1 ud. Cada camino consume 1 ud. Total 20 g.
  INSERT INTO public.recipes (id, name, yield_quantity, yield_unit) VALUES (d, 'Compartida', 1, 'ud');
  UPDATE public.recipes SET yield_quantity = 1, yield_unit = 'ud' WHERE id IN (b, c);
  DELETE FROM public.recipe_ingredients WHERE recipe_id IN (a, b, c, sauce);
  DELETE FROM public.recipe_subrecipes WHERE parent_recipe_id IN (a, b, c);
  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit, umb_multiplier)
  VALUES (d, flour, 10, 'g', 1);
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (b, d, 1, 'ud'), (c, d, 1, 'ud'), (a, b, 1, 'ud'), (a, c, 1, 'ud');
  result := public.get_recipe_stock_requirements_v2(a);
  SELECT (i->>'quantity_base')::numeric INTO qty FROM jsonb_array_elements(result->'ingredients') i;
  IF (result->>'ok')::boolean IS NOT TRUE OR qty <> 20
     OR jsonb_array_length(result->'ingredients'->0->'contributions') <> 2
     OR result->'ingredients'->0->'contributions'->0->>'line_id'
        IS DISTINCT FROM result->'ingredients'->0->'contributions'->1->>'line_id'
     OR result->'ingredients'->0->'contributions' IS DISTINCT FROM (
       SELECT jsonb_agg(contrib ORDER BY contrib->'path', contrib->>'line_id')
       FROM jsonb_array_elements(result->'ingredients'->0->'contributions') contrib
     ) THEN
    RAISE EXCEPTION 'caso 22: %', result;
  END IF;

  -- 23. Ciclo heredado.
  ALTER TABLE public.recipe_subrecipes DISABLE TRIGGER recipe_subrecipes_cycle_guard;
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (b, a, 1, 'ud');
  ALTER TABLE public.recipe_subrecipes ENABLE TRIGGER recipe_subrecipes_cycle_guard;
  PERFORM set_config('statement_timeout', '2000', true);
  result := public.get_recipe_stock_requirements_v2(a);
  IF (result->>'ok')::boolean IS NOT FALSE
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result->'errors') e WHERE e->>'status' = 'CYCLE') THEN
    RAISE EXCEPTION 'caso 23: %', result->'errors';
  END IF;
  DELETE FROM public.recipe_subrecipes WHERE parent_recipe_id = b AND child_recipe_id = a;

  -- 24. MISSING_YIELD y INCOMPATIBLE_UNITS a la vez.
  DELETE FROM public.recipe_subrecipes WHERE parent_recipe_id = a;
  DELETE FROM public.recipe_ingredients WHERE recipe_id = a;
  UPDATE public.recipes SET yield_quantity = NULL, yield_unit = NULL WHERE id = b;
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (a, b, 1, 'ud');
  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit, umb_multiplier)
  VALUES (a, flour, 1, 'ml', 1);
  result := public.get_recipe_stock_requirements_v2(a);
  IF (result->>'ok')::boolean IS NOT FALSE
     OR (
       SELECT count(DISTINCT e->>'status')
       FROM jsonb_array_elements(result->'errors') e
       WHERE e->>'status' IN ('MISSING_YIELD', 'INCOMPATIBLE_UNITS')
     ) <> 2 THEN
    RAISE EXCEPTION 'caso 24: %', result;
  END IF;

  -- 25. Vacía.
  INSERT INTO public.recipes (id, name) VALUES (empty_recipe, 'Vacía');
  result := public.get_recipe_stock_requirements_v2(empty_recipe);
  IF (result->>'ok')::boolean IS NOT TRUE
     OR jsonb_array_length(result->'ingredients') <> 0
     OR jsonb_array_length(result->'errors') <> 0 THEN
    RAISE EXCEPTION 'caso 25: %', result;
  END IF;

  -- 26. Inexistente.
  result := public.get_recipe_stock_requirements_v2(missing);
  IF (result->>'ok')::boolean IS NOT FALSE
     OR result->'errors'->0->>'status' <> 'RECIPE_NOT_FOUND' THEN
    RAISE EXCEPTION 'caso 26: %', result;
  END IF;

  -- 27. Multiplicador 2.
  DELETE FROM public.recipe_ingredients WHERE recipe_id = a;
  DELETE FROM public.recipe_subrecipes WHERE parent_recipe_id = a;
  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit, umb_multiplier)
  VALUES (a, flour, 10, 'g', 1);
  result := public.get_recipe_stock_requirements_v2(a, 2);
  SELECT (i->>'quantity_base')::numeric INTO qty FROM jsonb_array_elements(result->'ingredients') i;
  IF qty <> 20 THEN RAISE EXCEPTION 'caso 27: %', result; END IF;

  -- 28. Multiplicador inválido.
  BEGIN
    PERFORM public.get_recipe_stock_requirements_v2(a, NULL);
    RAISE EXCEPTION 'NULL fue aceptado';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.get_recipe_stock_requirements_v2(a, 0);
    RAISE EXCEPTION '0 fue aceptado';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.get_recipe_stock_requirements_v2(a, -1);
    RAISE EXCEPTION 'negativo fue aceptado';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.get_recipe_stock_requirements_v2(a, 'NaN'::numeric);
    RAISE EXCEPTION 'NaN fue aceptado';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.get_recipe_stock_requirements_v2(a, 'Infinity'::numeric);
    RAISE EXCEPTION 'Infinity fue aceptado';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- 29–31. No escribe.
  SELECT count(*) INTO moves_before FROM public.stock_movements;
  SELECT stock_current INTO stock_before FROM public.ingredients WHERE id = flour;
  PERFORM public.get_recipe_stock_requirements_v2(a, 2);
  IF (SELECT count(*) FROM public.stock_movements) <> moves_before
     OR (SELECT stock_current FROM public.ingredients WHERE id = flour) IS DISTINCT FROM stock_before
     OR (SELECT quantity_gross FROM public.recipe_ingredients WHERE recipe_id = a AND ingredient_id = flour) <> 10 THEN
    RAISE EXCEPTION 'caso 29-31: el motor escribió';
  END IF;

  -- 32. La venta usa el wrapper de B9.1 y no lee el escandallo directo.
  SELECT pg_get_function_identity_arguments(p.oid), p.prosrc
  INTO ticket_args, ticket_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'process_ticket_stock_deduction';
  IF ticket_src IS NULL
     OR ticket_args IS DISTINCT FROM 'p_numero_documento text'
     OR ticket_src NOT ILIKE '%recipe_stock_requirements_v2_rows%'
     OR ticket_src ILIKE '%recipe_ingredients%'
     OR ticket_src ILIKE '%WITH RECURSIVE%' THEN
    RAISE EXCEPTION 'caso 32: la venta no usa el wrapper de stock';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_recipe_cost_v2'
      AND p.prosrc ILIKE '%get_recipe_stock_requirements_v2%'
  ) THEN
    RAISE EXCEPTION 'caso 34: el coste llama al stock';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'recipe_subrecipes_reject_cycle'
  ) THEN
    RAISE EXCEPTION 'caso 35: falta el guard de ciclos';
  END IF;
  IF has_function_privilege('anon', 'public.get_recipe_stock_requirements_v2(uuid, numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon puede ejecutar la expansión';
  END IF;
END $$;
