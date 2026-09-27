-- Ranking de margen con coste recursivo. No ejecutar en producción.
-- Requiere get_recipe_cost_v2 y get_product_margin_ranking ya instalados.

DO $$
DECLARE
  manager uuid := gen_random_uuid();
  flour uuid := gen_random_uuid();
  milk uuid := gen_random_uuid();
  unpaid uuid := gen_random_uuid();
  direct uuid := gen_random_uuid();
  child uuid := gen_random_uuid();
  parent uuid := gen_random_uuid();
  missing_price uuid := gen_random_uuid();
  bare uuid := gen_random_uuid();
  missing_yield uuid := gen_random_uuid();
  incompatible uuid := gen_random_uuid();
  cycle_a uuid := gen_random_uuid();
  cycle_b uuid := gen_random_uuid();
  empty_root uuid := gen_random_uuid();
  hollow_child uuid := gen_random_uuid();
  hollow_parent uuid := gen_random_uuid();
  src text;
  identity text;
  direct_cost jsonb;
  parent_cost jsonb;
  price_cost jsonb;
  yield_cost jsonb;
  unit_cost jsonb;
  cycle_cost jsonb;
  empty_cost jsonb;
  hollow_cost jsonb;
  row_cost numeric;
  row_margin numeric;
  row_total numeric;
  known_before_null integer;
  first_total numeric;
  last_total numeric;
BEGIN
  SELECT p.prosrc, pg_get_function_identity_arguments(p.oid)
  INTO src, identity
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_product_margin_ranking'
    AND pg_get_function_identity_arguments(p.oid) = 'integer, date, date';

  IF src IS NULL
     OR src NOT ILIKE '%get_recipe_cost_v2%'
     OR src ILIKE '%recipe_ingredients%'
     OR src ILIKE '%recipe_subrecipes%'
     OR src ~* 'get_recipe_cost[[:space:]]*\('
     OR src ILIKE '%recipe_qty_to_purchase_unit_for_cost%'
     OR src ILIKE '%COALESCE(base_recipe_cost, 0)%'
     OR src NOT ILIKE '%AS MATERIALIZED%'
     OR src NOT ILIKE '%NULLS LAST%'
     OR src NOT ILIKE '%factor_porcion IS NOT NULL%'
     OR src NOT ILIKE '%has_cost_basis%'
     OR src NOT LIKE '%component->>''kind'' = ''ingredient''%' THEN
    RAISE EXCEPTION 'L: el ranking no usa el coste v2 canónico';
  END IF;

  IF identity IS DISTINCT FROM 'integer, date, date' THEN
    RAISE EXCEPTION 'M: la firma cambió: %', identity;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_product_margin_ranking'
      AND pg_get_function_identity_arguments(p.oid) = 'integer, date, date'
      AND p.prosecdef
      AND p.provolatile = 's'
      AND EXISTS (
        SELECT 1 FROM unnest(p.proconfig) cfg
        WHERE cfg = 'search_path=public'
      )
  ) THEN
    RAISE EXCEPTION 'M: definidor, estabilidad o search_path cambiaron';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.get_product_margin_ranking(integer, date, date)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.get_product_margin_ranking(integer, date, date)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'M: faltan permisos de authenticated o service_role';
  END IF;

  INSERT INTO public.profiles (id, role) VALUES (manager, 'manager');
  PERFORM set_config('request.jwt.claim.sub', manager::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', manager)::text,
    true
  );

  INSERT INTO public.ingredients (
    id, name, unit_type, purchase_unit, current_price, base_unit
  ) VALUES
    (flour, 'B94 Harina', 'kg', 'kg', 2, 'g'),
    (milk, 'B94 Leche', 'kg', 'kg', 3.20, 'g'),
    (unpaid, 'B94 Sin precio', 'kg', 'kg', 0, 'g');

  INSERT INTO public.recipes (id, name, is_sellable, yield_quantity, yield_unit)
  VALUES
    (direct, 'B94 Directa', true, NULL, NULL),
    (child, 'B94 Hija', false, 1000, 'ml'),
    (parent, 'B94 Padre', true, NULL, NULL),
    (missing_price, 'B94 Sin precio', true, NULL, NULL),
    (bare, 'B94 Sin rendimiento', false, NULL, NULL),
    (missing_yield, 'B94 Padre sin rendimiento', true, NULL, NULL),
    (incompatible, 'B94 Unidades', true, NULL, NULL),
    (cycle_a, 'B94 Ciclo A', true, 1, 'ud'),
    (cycle_b, 'B94 Ciclo B', true, 1, 'ud'),
    (empty_root, 'B94 Vacía', true, NULL, NULL),
    (hollow_child, 'B94 Hija vacía', false, 1, 'ud'),
    (hollow_parent, 'B94 Padre hueco', true, NULL, NULL);

  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit)
  VALUES
    (direct, flour, 250, 'g'),
    (child, milk, 1, 'kg'),
    (missing_price, unpaid, 100, 'g'),
    (bare, flour, 100, 'g'),
    (incompatible, flour, 100, 'ml');

  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES
    (parent, child, 120, 'ml'),
    (missing_yield, bare, 1, 'ud'),
    (hollow_parent, hollow_child, 1, 'ud');

  -- El guardia rechaza el segundo arco. El fixture lo desactiva solo para
  -- dejar un ciclo ya persistido, que es lo que el ranking tiene que leer.
  ALTER TABLE public.recipe_subrecipes DISABLE TRIGGER recipe_subrecipes_cycle_guard;
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES
    (cycle_a, cycle_b, 1, 'ud'),
    (cycle_b, cycle_a, 1, 'ud');
  ALTER TABLE public.recipe_subrecipes ENABLE TRIGGER recipe_subrecipes_cycle_guard;

  IF EXISTS (
    SELECT 1 FROM public.recipe_ingredients WHERE recipe_id = parent
  ) THEN
    RAISE EXCEPTION 'C: el padre de prueba tiene ingredientes directos';
  END IF;

  direct_cost := public.get_recipe_cost_v2(direct);
  parent_cost := public.get_recipe_cost_v2(parent);
  price_cost := public.get_recipe_cost_v2(missing_price);
  yield_cost := public.get_recipe_cost_v2(missing_yield);
  unit_cost := public.get_recipe_cost_v2(incompatible);
  cycle_cost := public.get_recipe_cost_v2(cycle_a);
  empty_cost := public.get_recipe_cost_v2(empty_root);
  hollow_cost := public.get_recipe_cost_v2(hollow_parent);

  IF (direct_cost->>'ok')::boolean IS NOT TRUE
     OR (direct_cost->>'total_cost_eur')::numeric <> 0.50 THEN
    RAISE EXCEPTION 'A: coste directo v2: %', direct_cost;
  END IF;

  IF (parent_cost->>'ok')::boolean IS NOT TRUE
     OR (parent_cost->>'total_cost_eur')::numeric <> 0.384 THEN
    RAISE EXCEPTION 'B: coste recursivo v2: %', parent_cost;
  END IF;

  IF (price_cost->>'ok')::boolean IS NOT FALSE
     OR price_cost->'total_cost_eur' <> 'null'::jsonb
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(price_cost->'errors') e
       WHERE e->>'status' = 'MISSING_PRICE'
     ) THEN
    RAISE EXCEPTION 'D: se esperaba MISSING_PRICE: %', price_cost;
  END IF;

  IF (yield_cost->>'ok')::boolean IS NOT FALSE
     OR yield_cost->'total_cost_eur' <> 'null'::jsonb
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(yield_cost->'errors') e
       WHERE e->>'status' = 'MISSING_YIELD'
     ) THEN
    RAISE EXCEPTION 'E: se esperaba MISSING_YIELD: %', yield_cost;
  END IF;

  IF (unit_cost->>'ok')::boolean IS NOT FALSE
     OR unit_cost->'total_cost_eur' <> 'null'::jsonb
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(unit_cost->'errors') e
       WHERE e->>'status' = 'INCOMPATIBLE_UNITS'
     ) THEN
    RAISE EXCEPTION 'F: se esperaba INCOMPATIBLE_UNITS: %', unit_cost;
  END IF;

  IF (cycle_cost->>'ok')::boolean IS NOT FALSE
     OR cycle_cost->'total_cost_eur' <> 'null'::jsonb
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(cycle_cost->'errors') e
       WHERE e->>'status' = 'CYCLE'
     ) THEN
    RAISE EXCEPTION 'G: se esperaba CYCLE: %', cycle_cost;
  END IF;

  IF (empty_cost->>'ok')::boolean IS NOT TRUE
     OR (empty_cost->>'total_cost_eur')::numeric <> 0
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(empty_cost->'components') c
       WHERE c->>'kind' = 'ingredient'
     ) THEN
    RAISE EXCEPTION 'N: la raíz vacía no es ok/0 sin ingredientes: %', empty_cost;
  END IF;

  IF (hollow_cost->>'ok')::boolean IS NOT TRUE
     OR (hollow_cost->>'total_cost_eur')::numeric <> 0
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(hollow_cost->'components') c
       WHERE c->>'kind' = 'subrecipe'
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(hollow_cost->'components') c
       WHERE c->>'kind' = 'ingredient'
     ) THEN
    RAISE EXCEPTION 'O: el padre hueco no conserva solo el nodo de subreceta: %', hollow_cost;
  END IF;

  INSERT INTO public.tickets_marbella (
    numero_documento, fecha, hora_cierre, total_documento
  ) VALUES (
    'B94-2099', DATE '2099-12-31', TIME '12:00', 0
  );

  INSERT INTO public.ticket_lines_marbella (
    numero_documento, linea, articulo_id, fecha_negocio,
    unidades, precio_unidad, importe_total
  ) VALUES
    ('B94-2099', 1, 910940101, DATE '2099-12-31', 2, 10, 20),
    ('B94-2099', 2, 910940102, DATE '2099-12-31', 4, 10, 40),
    ('B94-2099', 3, 910940103, DATE '2099-12-31', 1, 10, 10),
    ('B94-2099', 4, 910940104, DATE '2099-12-31', 1, 10, 10),
    ('B94-2099', 5, 910940105, DATE '2099-12-31', 20, 10, 200),
    ('B94-2099', 6, 910940106, DATE '2099-12-31', 1, 10, 10),
    ('B94-2099', 7, 910940107, DATE '2099-12-31', 1, 10, 10),
    ('B94-2099', 8, 910940108, DATE '2099-12-31', 1, 10, 10),
    ('B94-2099', 9, 910940109, DATE '2099-12-31', 3, 10, 30),
    ('B94-2099', 10, 910940110, DATE '2099-12-31', 6, 10, 60),
    ('B94-2099', 11, 910940111, DATE '2099-12-31', 7, 10, 70),
    ('B94-2099', 12, 910940112, DATE '2099-12-31', 1, 10, 10),
    ('B94-2099', 13, 910940113, DATE '2099-12-31', 1, 10, 10);

  INSERT INTO public.map_tpv_receta (articulo_id, recipe_id, factor_porcion)
  VALUES
    (910940101, direct, 1),
    (910940102, direct, 1),
    (910940103, direct, 2),
    (910940104, parent, 1),
    (910940105, missing_price, 1),
    (910940106, missing_yield, 1),
    (910940107, incompatible, 1),
    (910940108, cycle_a, 1),
    (910940109, direct, 0),
    (910940110, direct, -1),
    (910940111, direct, 1),
    (910940112, empty_root, 1),
    (910940113, hollow_parent, 1);

  UPDATE public.map_tpv_receta
  SET factor_porcion = 'NaN'::numeric
  WHERE articulo_id = 910940111;

  CREATE TEMP TABLE b94_rank ON COMMIT DROP AS
  SELECT row_number() OVER () AS pos, r.*
  FROM public.get_product_margin_ranking(500, DATE '2099-12-31', DATE '2099-12-31') r;

  SELECT recipe_cost, margin_per_unit, total_margin_contribution
  INTO row_cost, row_margin, row_total
  FROM b94_rank
  WHERE recipe_id = direct AND total_units_sold = 2;

  IF row_cost IS DISTINCT FROM round((direct_cost->>'total_cost_eur')::numeric, 2)
     OR row_cost IS DISTINCT FROM 0.50
     OR row_margin IS DISTINCT FROM 9.50
     OR row_total IS DISTINCT FROM 19.00 THEN
    RAISE EXCEPTION 'A: ranking directo % / % / %', row_cost, row_margin, row_total;
  END IF;

  SELECT recipe_cost, margin_per_unit, total_margin_contribution
  INTO row_cost, row_margin, row_total
  FROM b94_rank
  WHERE recipe_id = parent;

  IF row_cost IS DISTINCT FROM round((parent_cost->>'total_cost_eur')::numeric, 2)
     OR row_cost IS DISTINCT FROM 0.38
     OR row_cost = 0
     OR row_margin IS DISTINCT FROM 9.62
     OR row_total IS DISTINCT FROM 9.62 THEN
    RAISE EXCEPTION 'B/C: ranking recursivo % / % / %', row_cost, row_margin, row_total;
  END IF;

  IF EXISTS (
    SELECT 1 FROM b94_rank
    WHERE recipe_id IN (missing_price, missing_yield, incompatible, cycle_a)
      AND (
        recipe_cost IS NOT NULL
        OR margin_per_unit IS NOT NULL
        OR total_margin_contribution IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'D-G: un coste inválido se convirtió en número';
  END IF;

  SELECT recipe_cost, margin_per_unit, total_margin_contribution
  INTO row_cost, row_margin, row_total
  FROM b94_rank
  WHERE recipe_id = direct AND total_units_sold = 1;

  IF row_cost IS DISTINCT FROM round((direct_cost->>'total_cost_eur')::numeric * 2, 2)
     OR row_cost IS DISTINCT FROM 1.00
     OR row_margin IS DISTINCT FROM 9.00
     OR row_total IS DISTINCT FROM 9.00 THEN
    RAISE EXCEPTION 'H: factor 2 % / % / %', row_cost, row_margin, row_total;
  END IF;

  IF (
    SELECT count(*)
    FROM b94_rank
    WHERE recipe_id = direct
      AND total_units_sold IN (3, 6, 7)
      AND recipe_cost IS NULL
      AND margin_per_unit IS NULL
      AND total_margin_contribution IS NULL
  ) <> 3 THEN
    RAISE EXCEPTION 'I: un factor inválido produjo coste';
  END IF;

  IF (
    SELECT count(*)
    FROM b94_rank
    WHERE recipe_id = direct
      AND total_units_sold IN (2, 4)
      AND recipe_cost = 0.50
  ) <> 2 THEN
    RAISE EXCEPTION 'J: dos artículos de la misma receta no comparten el coste';
  END IF;

  IF EXISTS (
    SELECT 1 FROM b94_rank
    WHERE recipe_id IN (empty_root, hollow_parent)
      AND (
        recipe_cost IS NOT NULL
        OR margin_per_unit IS NOT NULL
        OR total_margin_contribution IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'N/O: una receta sin materia prima salió a coste cero';
  END IF;

  SELECT total_margin_contribution INTO first_total
  FROM b94_rank
  WHERE pos = 1;

  SELECT total_margin_contribution INTO last_total
  FROM b94_rank
  WHERE pos = (SELECT max(pos) FROM b94_rank);

  SELECT count(*) INTO known_before_null
  FROM b94_rank ranked
  WHERE ranked.total_margin_contribution IS NULL
    AND ranked.pos < (
      SELECT max(later.pos)
      FROM b94_rank later
      WHERE later.total_margin_contribution IS NOT NULL
    );

  IF first_total IS NULL
     OR first_total IS DISTINCT FROM 38.00
     OR last_total IS NOT NULL
     OR known_before_null <> 0 THEN
    RAISE EXCEPTION 'K: NULLS LAST no se cumple. primero % ultimo % cruces %',
      first_total, last_total, known_before_null;
  END IF;

  DELETE FROM public.ticket_lines_marbella WHERE numero_documento = 'B94-2099';
  DELETE FROM public.tickets_marbella WHERE numero_documento = 'B94-2099';
  DELETE FROM public.map_tpv_receta
  WHERE articulo_id BETWEEN 910940101 AND 910940113;
  DELETE FROM public.recipe_subrecipes
  WHERE parent_recipe_id IN (parent, missing_yield, cycle_a, cycle_b, hollow_parent)
     OR child_recipe_id IN (child, bare, cycle_a, cycle_b, hollow_child);
  DELETE FROM public.recipe_ingredients
  WHERE recipe_id IN (direct, child, missing_price, bare, incompatible);
  DELETE FROM public.recipes
  WHERE id IN (
    direct, child, parent, missing_price, bare, missing_yield,
    incompatible, cycle_a, cycle_b, empty_root, hollow_child, hollow_parent
  );
  DELETE FROM public.ingredients WHERE id IN (flour, milk, unpaid);
  DELETE FROM public.profiles WHERE id = manager;
END;
$$;
