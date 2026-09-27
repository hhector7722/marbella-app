-- Copilot: gestionar_recetas lee expansión y coste canónicos.
-- No ejecutar en producción. No aplica la migración: exige que ya esté instalada.

DO $$
DECLARE
  flour uuid := gen_random_uuid();
  nata uuid := gen_random_uuid();
  bacon uuid := gen_random_uuid();
  parmesan uuid := gen_random_uuid();
  pepper uuid := gen_random_uuid();
  unpaid uuid := gen_random_uuid();
  direct uuid := gen_random_uuid();
  sauce uuid := gen_random_uuid();
  carbonara uuid := gen_random_uuid();
  empty_recipe uuid := gen_random_uuid();
  bare uuid := gen_random_uuid();
  broken_parent uuid := gen_random_uuid();
  sellable uuid := gen_random_uuid();
  internal uuid := gen_random_uuid();
  src text;
  identity text;
  found jsonb;
  listed jsonb;
  leaf jsonb;
BEGIN
  SELECT p.prosrc, pg_get_function_identity_arguments(p.oid)
    INTO src, identity
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'gestionar_recetas'
    AND pg_get_function_identity_arguments(p.oid) = 'text, jsonb';

  IF src IS NULL
     OR src NOT ILIKE '%get_recipe_cost_v2%'
     OR src NOT ILIKE '%recipe_stock_requirements_v2_rows%'
     OR src ILIKE '%recipe_ingredients%'
     OR src ILIKE '%recipe_subrecipes%'
     OR src ~* 'get_recipe_cost[[:space:]]*\('
     OR src NOT LIKE '%component->>''kind'' = ''ingredient''%' THEN
    RAISE EXCEPTION 'A-D: gestionar_recetas no usa los motores canónicos';
  END IF;

  IF identity IS DISTINCT FROM 'text, jsonb' THEN
    RAISE EXCEPTION 'firma cambiada: %', identity;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'gestionar_recetas'
      AND pg_get_function_identity_arguments(p.oid) = 'text, jsonb'
      AND p.prosecdef
      AND p.provolatile = 's'
      AND EXISTS (
        SELECT 1 FROM unnest(p.proconfig) cfg
        WHERE cfg = 'search_path=public'
      )
  ) THEN
    RAISE EXCEPTION 'definidor, estabilidad o search_path cambiaron';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.gestionar_recetas(text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'falta EXECUTE para authenticated';
  END IF;

  INSERT INTO public.ingredients (
    id, name, unit_type, purchase_unit, current_price, base_unit
  ) VALUES
    (flour, 'B968 Harina', 'kg', 'kg', 2, 'g'),
    (nata, 'B968 Nata', 'l', 'l', 4, 'ml'),
    (bacon, 'B968 Bacon', 'kg', 'kg', 0, 'g'),
    (parmesan, 'B968 Parmesano', 'kg', 'kg', 8, 'g'),
    (pepper, 'B968 Pimienta molida', 'kg', 'kg', 10, 'g'),
    (unpaid, 'B968 Sin precio', 'kg', 'kg', 0, 'g');

  INSERT INTO public.recipes (id, name, is_sellable, yield_quantity, yield_unit)
  VALUES
    (direct, 'B968 Directa', true, NULL, NULL),
    (sauce, 'B968 Salsa carbonara', false, 1, 'ud'),
    (carbonara, 'B968 Pasta carbonara', true, NULL, NULL),
    (empty_recipe, 'B968 Vacia', true, NULL, NULL),
    (bare, 'B968 Hija sin rendimiento', false, NULL, NULL),
    (broken_parent, 'B968 Padre sin rendimiento', true, NULL, NULL),
    (sellable, 'B968 Vendible lista', true, NULL, NULL),
    (internal, 'B968 Interna lista', false, NULL, NULL);

  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit)
  VALUES
    (direct, flour, 250, 'g'),
    (sauce, nata, 50, 'ml'),
    (sauce, bacon, 20, 'g'),
    (sauce, parmesan, 10, 'g'),
    (sauce, pepper, 0.5, 'g'),
    (bare, unpaid, 100, 'g');

  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES
    (carbonara, sauce, 1, 'ud'),
    (broken_parent, bare, 1, 'ud');

  IF EXISTS (SELECT 1 FROM public.recipe_ingredients WHERE recipe_id = carbonara) THEN
    RAISE EXCEPTION 'F: el padre de prueba tiene ingredientes directos';
  END IF;

  found := public.gestionar_recetas('buscar', jsonb_build_object('nombre', 'B968 Directa'));
  IF found->>'receta_encontrada' IS DISTINCT FROM 'B968 Directa'
     OR (found->>'is_sellable')::boolean IS NOT TRUE
     OR jsonb_array_length(found->'ingredientes') <> 1
     OR (found->'expansion_fisica'->>'ok')::boolean IS NOT TRUE
     OR (found->'coste_receta'->>'motor_ok')::boolean IS NOT TRUE
     OR (found->'coste_receta'->>'has_cost_basis')::boolean IS NOT TRUE
     OR (found->'coste_receta'->>'total_cost_eur')::numeric <> 0.50
     OR (found->'debug'->>'num_ingredientes')::int <> 1 THEN
    RAISE EXCEPTION 'E: directa válida: %', found;
  END IF;

  SELECT value INTO leaf FROM jsonb_array_elements(found->'ingredientes') AS value LIMIT 1;
  IF leaf->>'ingrediente' IS DISTINCT FROM 'B968 Harina'
     OR (leaf->>'cantidad')::numeric <> 250
     OR leaf->>'unidad' IS DISTINCT FROM 'g' THEN
    RAISE EXCEPTION 'E: hoja directa: %', leaf;
  END IF;

  found := public.gestionar_recetas('consultar', jsonb_build_object('nombre', 'B968 Pasta carbonara'));
  IF found->>'receta_encontrada' IS DISTINCT FROM 'B968 Pasta carbonara'
     OR (found->'expansion_fisica'->>'ok')::boolean IS NOT TRUE
     OR jsonb_array_length(found->'ingredientes') <> 4
     OR (found->'debug'->>'num_ingredientes')::int <> 4
     OR (found->'coste_receta'->>'motor_ok')::boolean IS NOT FALSE
     OR (found->'coste_receta'->>'has_cost_basis')::boolean IS NOT FALSE
     OR found->'coste_receta'->'total_cost_eur' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'F/G: carbonara física con coste inválido: %', found;
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(found->'ingredientes') line
       WHERE line->>'ingrediente' = 'B968 Nata'
         AND (line->>'cantidad')::numeric = 50
         AND line->>'unidad' = 'ml'
     )
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(found->'ingredientes') line
       WHERE line->>'ingrediente' = 'B968 Bacon'
         AND (line->>'cantidad')::numeric = 20
         AND line->>'unidad' = 'g'
     )
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(found->'ingredientes') line
       WHERE line->>'ingrediente' = 'B968 Parmesano'
         AND (line->>'cantidad')::numeric = 10
         AND line->>'unidad' = 'g'
     )
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(found->'ingredientes') line
       WHERE line->>'ingrediente' = 'B968 Pimienta molida'
         AND (line->>'cantidad')::numeric = 0.5
         AND line->>'unidad' = 'g'
     ) THEN
    RAISE EXCEPTION 'F: hojas de carbonara: %', found->'ingredientes';
  END IF;

  found := public.gestionar_recetas('buscar', jsonb_build_object('nombre', 'B968 Vacia'));
  IF (found->'expansion_fisica'->>'ok')::boolean IS NOT TRUE
     OR (found->'expansion_fisica'->>'vacia')::boolean IS NOT TRUE
     OR (found->'expansion_fisica'->>'ingredient_count')::int <> 0
     OR found->'ingredientes' <> '[]'::jsonb
     OR (found->'coste_receta'->>'motor_ok')::boolean IS NOT TRUE
     OR (found->'coste_receta'->>'has_cost_basis')::boolean IS NOT FALSE
     OR found->'coste_receta'->'total_cost_eur' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'H: receta sin materia prima: %', found;
  END IF;

  found := public.gestionar_recetas('get', jsonb_build_object('nombre', 'B968 Padre sin rendimiento'));
  IF (found->'expansion_fisica'->>'ok')::boolean IS NOT FALSE
     OR found->'ingredientes' <> '[]'::jsonb
     OR (found->'debug'->>'num_ingredientes')::int <> 0
     OR found->'coste_receta'->'total_cost_eur' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'I: expansión inválida expuso hojas o un cero: %', found;
  END IF;

  listed := public.gestionar_recetas('listar', '{}'::jsonb);
  IF NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(listed) item
       WHERE item->>'id' = sellable::text
         AND (item->>'is_sellable')::boolean IS TRUE
     )
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(listed) item
       WHERE item->>'id' = internal::text
         AND (item->>'is_sellable')::boolean IS FALSE
     ) THEN
    RAISE EXCEPTION 'J: el listado no distingue is_sellable';
  END IF;

  DELETE FROM public.recipe_subrecipes
  WHERE parent_recipe_id IN (carbonara, broken_parent)
     OR child_recipe_id IN (sauce, bare);
  DELETE FROM public.recipe_ingredients
  WHERE recipe_id IN (direct, sauce, bare);
  DELETE FROM public.recipes
  WHERE id IN (direct, sauce, carbonara, empty_recipe, bare, broken_parent, sellable, internal);
  DELETE FROM public.ingredients
  WHERE id IN (flour, nata, bacon, parmesan, pepper, unpaid);
END;
$$;
