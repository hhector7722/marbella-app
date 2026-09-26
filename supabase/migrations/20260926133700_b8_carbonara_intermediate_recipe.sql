-- B8.1: Salsa carbonara pasa a elaboración interna de una ración
-- y Pasta carbonara la consume una vez (1 ud).
-- No toca ingredientes, precios, mapeo TPV ni stock.
-- Idempotente si el estado final ya está escrito.
-- Aborta, y por tanto revierte, ante cualquier otra condición.

DO $$
DECLARE
  salsa_id constant uuid := 'fb86f2fb-2eef-40e0-8659-a74b3230c622';
  pasta_id constant uuid := '8bbe3122-225e-4d5f-aa53-af18bfabf471';
  salsa public.recipes%ROWTYPE;
  pasta public.recipes%ROWTYPE;
  existing public.recipe_subrecipes%ROWTYPE;
  relation_exists boolean;
  updated_count integer;
  relation_count integer;
BEGIN
  SELECT *
  INTO salsa
  FROM public.recipes
  WHERE id = salsa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'B8.1 abortada: no existe la receta % (Salsa carbonara)',
      salsa_id;
  END IF;

  IF salsa.name IS DISTINCT FROM 'Salsa carbonara' THEN
    RAISE EXCEPTION
      'B8.1 abortada: % no se llama Salsa carbonara (name=%)',
      salsa_id,
      salsa.name;
  END IF;

  SELECT *
  INTO pasta
  FROM public.recipes
  WHERE id = pasta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'B8.1 abortada: no existe la receta % (Pasta carbonara)',
      pasta_id;
  END IF;

  IF pasta.name IS DISTINCT FROM 'Pasta carbonara' THEN
    RAISE EXCEPTION
      'B8.1 abortada: % no se llama Pasta carbonara (name=%)',
      pasta_id,
      pasta.name;
  END IF;

  IF NOT (
    (salsa.yield_quantity IS NULL AND salsa.yield_unit IS NULL)
    OR (salsa.yield_quantity = 1 AND salsa.yield_unit = 'ud')
  ) THEN
    RAISE EXCEPTION
      'B8.1 abortada: Salsa carbonara ya tiene rendimiento % %',
      salsa.yield_quantity,
      salsa.yield_unit;
  END IF;

  SELECT *
  INTO existing
  FROM public.recipe_subrecipes
  WHERE parent_recipe_id = pasta_id
    AND child_recipe_id = salsa_id
  FOR UPDATE;

  relation_exists := FOUND;

  IF relation_exists AND (
    existing.quantity IS DISTINCT FROM 1
    OR existing.unit IS DISTINCT FROM 'ud'
  ) THEN
    RAISE EXCEPTION
      'B8.1 abortada: Pasta carbonara ya incluye Salsa carbonara con quantity=% unit=%',
      existing.quantity,
      existing.unit;
  END IF;

  UPDATE public.recipes
  SET
    is_sellable = false,
    yield_quantity = 1,
    yield_unit = 'ud'
  WHERE id = salsa_id
    AND name = 'Salsa carbonara';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> 1 THEN
    RAISE EXCEPTION
      'B8.1 abortada: se esperaba actualizar 1 fila de Salsa carbonara y se actualizaron %',
      updated_count;
  END IF;

  IF NOT relation_exists THEN
    INSERT INTO public.recipe_subrecipes (
      parent_recipe_id,
      child_recipe_id,
      quantity,
      unit
    )
    VALUES (pasta_id, salsa_id, 1, 'ud');
  END IF;

  SELECT count(*)
  INTO relation_count
  FROM public.recipe_subrecipes
  WHERE parent_recipe_id = pasta_id
    AND child_recipe_id = salsa_id
    AND quantity = 1
    AND unit = 'ud';

  IF relation_count <> 1 THEN
    RAISE EXCEPTION
      'B8.1 abortada: se esperaba exactamente una relación 1 ud y hay %',
      relation_count;
  END IF;
END;
$$;

-- Validación posterior, no se ejecuta con esta migración:
--
-- SELECT id, name, is_sellable, yield_quantity, yield_unit, sale_price, menu_category_id
-- FROM public.recipes
-- WHERE id IN (
--   'fb86f2fb-2eef-40e0-8659-a74b3230c622',
--   '8bbe3122-225e-4d5f-aa53-af18bfabf471'
-- );
--
-- SELECT parent_recipe_id, child_recipe_id, quantity, unit
-- FROM public.recipe_subrecipes
-- WHERE parent_recipe_id = '8bbe3122-225e-4d5f-aa53-af18bfabf471'
--   AND child_recipe_id = 'fb86f2fb-2eef-40e0-8659-a74b3230c622';
--
-- SELECT public.get_recipe_cost_v2('fb86f2fb-2eef-40e0-8659-a74b3230c622');
-- SELECT public.get_recipe_cost_v2('8bbe3122-225e-4d5f-aa53-af18bfabf471');
-- SELECT public.get_recipe_stock_requirements_v2('8bbe3122-225e-4d5f-aa53-af18bfabf471', 1);
