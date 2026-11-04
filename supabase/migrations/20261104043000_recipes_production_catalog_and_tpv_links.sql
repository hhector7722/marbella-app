-- Mover solo elaboraciones internas a Producción y corregir los dos enlaces TPV
-- para que consuman por ración a través de sus recetas vendibles.
DO $$
DECLARE
  v_production uuid;
  v_crema uuid;
  v_crema_prod uuid;
  v_panadera uuid;
  v_panadera_prod uuid;
BEGIN
  SELECT id INTO STRICT v_production FROM public.categories
  WHERE name = 'Producción' AND slug = 'produccion' AND scope = 'recipes';

  SELECT id INTO STRICT v_crema FROM public.recipes
  WHERE name = 'Crema' AND is_sellable = true;
  SELECT id INTO STRICT v_crema_prod FROM public.recipes
  WHERE name = 'Crema prod' AND is_sellable = false;
  SELECT id INTO STRICT v_panadera FROM public.recipes
  WHERE name = 'Patatas panadera' AND is_sellable = true;
  SELECT id INTO STRICT v_panadera_prod FROM public.recipes
  WHERE name = 'Patatas panadera prod' AND is_sellable = false;

  IF NOT EXISTS (
    SELECT 1 FROM public.recipe_subrecipes
    WHERE parent_recipe_id = v_crema AND child_recipe_id = v_crema_prod
      AND quantity = 1 AND unit = 'ud'
  ) THEN
    RAISE EXCEPTION 'Crema no consume una unidad de Crema prod';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.recipe_subrecipes
    WHERE parent_recipe_id = v_panadera AND child_recipe_id = v_panadera_prod
      AND quantity = 1 AND unit = 'ud'
  ) THEN
    RAISE EXCEPTION 'Patatas panadera no consume una unidad de Patatas panadera prod';
  END IF;

  UPDATE public.recipes SET category = 'Producción', menu_category_id = v_production
  WHERE is_sellable = false
    AND (category IS DISTINCT FROM 'Producción' OR menu_category_id IS DISTINCT FROM v_production);

  UPDATE public.map_tpv_receta SET recipe_id = v_crema
  WHERE articulo_id = 207 AND recipe_id IN (v_crema_prod, v_crema);
  IF NOT FOUND THEN RAISE EXCEPTION 'Mapping TPV 207 inesperado'; END IF;

  UPDATE public.map_tpv_receta SET recipe_id = v_panadera
  WHERE articulo_id = 203 AND recipe_id IN (v_panadera_prod, v_panadera);
  IF NOT FOUND THEN RAISE EXCEPTION 'Mapping TPV 203 inesperado'; END IF;
END;
$$;
