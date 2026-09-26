-- Paridad de recipe_stock_requirements_v2_rows con get_recipe_stock_requirements_v2.
-- Requiere el esquema y el RPC JSON ya instalados. No escribe stock.

DO $$
DECLARE
  nata uuid := gen_random_uuid();
  bacon uuid := gen_random_uuid();
  parmesan uuid := gen_random_uuid();
  pepper uuid := gen_random_uuid();
  flour uuid := gen_random_uuid();
  salsa uuid := gen_random_uuid();
  pasta uuid := gen_random_uuid();
  direct uuid := gen_random_uuid();
  missing uuid := gen_random_uuid();
  doc jsonb;
  row_count integer;
  src text;
BEGIN
  SELECT p.prosrc INTO src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'recipe_stock_requirements_v2_rows';

  IF src IS NULL
     OR src NOT ILIKE '%get_recipe_stock_requirements_v2%'
     OR src NOT ILIKE '%AS MATERIALIZED%'
     OR src ILIKE '%WITH RECURSIVE%'
     OR src ILIKE '%recipe_ingredients%'
     OR src ILIKE '%recipe_subrecipes%'
     OR src ILIKE '%recursive%' THEN
    RAISE EXCEPTION 'el wrapper no puede ser un segundo motor: %', src;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'recipe_stock_requirements_v2_rows'
      AND (
        p.prosecdef
        OR p.provolatile <> 's'
        OR has_function_privilege('anon', p.oid, 'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'seguridad distinta del RPC canónico';
  END IF;

  INSERT INTO public.ingredients (
    id, name, unit_type, purchase_unit, current_price, base_unit
  ) VALUES
    (nata, 'Nata', 'l', 'l', 1, 'ml'),
    (bacon, 'Bacon', 'kg', 'kg', 1, 'g'),
    (parmesan, 'Parmesano', 'kg', 'kg', 0, 'g'),
    (pepper, 'Pimienta molida', 'kg', 'kg', 0, 'g'),
    (flour, 'Harina', 'kg', 'kg', 2, 'g');

  INSERT INTO public.recipes (id, name) VALUES (direct, 'Directa');
  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit, umb_multiplier)
  VALUES (direct, flour, 0.25, 'kg', 1);

  doc := public.get_recipe_stock_requirements_v2(direct);
  IF (doc->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'directa json: %', doc;
  END IF;
  IF (
    SELECT count(*) FROM public.recipe_stock_requirements_v2_rows(direct)
  ) <> 1 THEN
    RAISE EXCEPTION 'directa: se esperaba una fila';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.recipe_stock_requirements_v2_rows(direct) r
    WHERE r.ok IS DISTINCT FROM (doc->>'ok')::boolean
       OR r.errors IS DISTINCT FROM doc->'errors'
       OR r.ingredient_count IS DISTINCT FROM jsonb_array_length(doc->'ingredients')
       OR r.ingredient_id IS DISTINCT FROM (doc->'ingredients'->0->>'ingredient_id')::uuid
       OR r.quantity_base IS DISTINCT FROM (doc->'ingredients'->0->>'quantity_base')::numeric
       OR r.quantity_base IS DISTINCT FROM 250
       OR r.unit_base IS DISTINCT FROM 'g'
       OR r.contributions IS DISTINCT FROM doc->'ingredients'->0->'contributions'
  ) THEN
    RAISE EXCEPTION 'directa: rows no coincide con el JSON';
  END IF;

  INSERT INTO public.recipes (id, name, is_sellable, yield_quantity, yield_unit)
  VALUES (salsa, 'Salsa carbonara', false, 1, 'ud');
  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit, umb_multiplier)
  VALUES
    (salsa, nata, 50, 'ml', 1),
    (salsa, bacon, 20, 'g', 1),
    (salsa, parmesan, 10, 'g', 1),
    (salsa, pepper, 0.5, 'g', 1);
  INSERT INTO public.recipes (id, name, is_sellable) VALUES (pasta, 'Pasta carbonara', true);
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (pasta, salsa, 1, 'ud');

  doc := public.get_recipe_stock_requirements_v2(pasta);
  SELECT count(*) INTO row_count FROM public.recipe_stock_requirements_v2_rows(pasta);
  IF (doc->>'ok')::boolean IS NOT TRUE
     OR jsonb_array_length(doc->'ingredients') <> 4
     OR row_count <> 4 THEN
    RAISE EXCEPTION 'carbonara: % filas, json %', row_count, doc;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.recipe_stock_requirements_v2_rows(pasta) r
    JOIN LATERAL jsonb_array_elements(doc->'ingredients') item ON (item->>'ingredient_id')::uuid = r.ingredient_id
    WHERE r.ok IS NOT TRUE
       OR r.ingredient_count <> 4
       OR r.errors IS DISTINCT FROM doc->'errors'
       OR r.quantity_base IS DISTINCT FROM (item->>'quantity_base')::numeric
       OR r.unit_base IS DISTINCT FROM item->>'unit_base'
       OR r.contributions IS DISTINCT FROM item->'contributions'
       OR r.quantity_base = 0
  ) THEN
    RAISE EXCEPTION 'carbonara: paridad rota';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.recipe_stock_requirements_v2_rows(pasta)
    WHERE ingredient_name = 'Nata' AND quantity_base = 50 AND unit_base = 'ml'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.recipe_stock_requirements_v2_rows(pasta)
    WHERE ingredient_name = 'Bacon' AND quantity_base = 20 AND unit_base = 'g'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.recipe_stock_requirements_v2_rows(pasta)
    WHERE ingredient_name = 'Parmesano' AND quantity_base = 10 AND unit_base = 'g'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.recipe_stock_requirements_v2_rows(pasta)
    WHERE ingredient_name = 'Pimienta molida' AND quantity_base = 0.5 AND unit_base = 'g'
  ) THEN
    RAISE EXCEPTION 'carbonara: cantidades distintas del lote de una ración';
  END IF;

  doc := public.get_recipe_stock_requirements_v2(pasta, 2);
  IF EXISTS (
    SELECT 1
    FROM public.recipe_stock_requirements_v2_rows(pasta, 2) r
    JOIN LATERAL jsonb_array_elements(doc->'ingredients') item ON (item->>'ingredient_id')::uuid = r.ingredient_id
    WHERE r.recipe_multiplier IS DISTINCT FROM 2
       OR r.quantity_base IS DISTINCT FROM (item->>'quantity_base')::numeric
  ) OR NOT EXISTS (
    SELECT 1 FROM public.recipe_stock_requirements_v2_rows(pasta, 2)
    WHERE ingredient_name = 'Nata' AND quantity_base = 100
  ) OR NOT EXISTS (
    SELECT 1 FROM public.recipe_stock_requirements_v2_rows(pasta, 2)
    WHERE ingredient_name = 'Pimienta molida' AND quantity_base = 1
  ) THEN
    RAISE EXCEPTION 'multiplier 2: %', doc;
  END IF;

  doc := public.get_recipe_stock_requirements_v2(missing);
  SELECT count(*) INTO row_count FROM public.recipe_stock_requirements_v2_rows(missing);
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'inexistente: se esperaba una fila de estado, hay %', row_count;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.recipe_stock_requirements_v2_rows(missing) r
    WHERE r.ok IS NOT FALSE
       OR r.ingredient_count <> 0
       OR r.ingredient_id IS NOT NULL
       OR r.ingredient_name IS NOT NULL
       OR r.quantity_base IS NOT NULL
       OR r.quantity_base = 0
       OR r.unit_base IS NOT NULL
       OR r.contributions IS NOT NULL
       OR r.errors IS DISTINCT FROM doc->'errors'
       OR NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(r.errors) e
         WHERE e->>'status' = 'RECIPE_NOT_FOUND'
       )
  ) THEN
    RAISE EXCEPTION 'inexistente: %', doc;
  END IF;

  UPDATE public.recipe_ingredients SET unit = 'ml' WHERE recipe_id = direct AND ingredient_id = flour;
  doc := public.get_recipe_stock_requirements_v2(direct);
  IF (doc->>'ok')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'se esperaba ok false diagnóstico: %', doc;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.recipe_stock_requirements_v2_rows(direct) r
    WHERE r.ok IS NOT FALSE
       OR r.errors IS DISTINCT FROM doc->'errors'
       OR r.quantity_base IS DISTINCT FROM (doc->'ingredients'->0->>'quantity_base')::numeric
       OR r.quantity_base = 0
  ) THEN
    RAISE EXCEPTION 'ok false no debe convertir null en 0: %', doc;
  END IF;
END;
$$;
