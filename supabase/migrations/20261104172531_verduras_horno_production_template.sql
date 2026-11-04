-- Verduras horno: crear ficha de producción a partir del escandallo del lote existente.
-- La receta vendible y su enlace TPV 197 NO se alteran: preservan ventas,
-- movimientos de inventario y CPV registrados hasta confirmar el rendimiento cocinado.
-- IMPORTANTE: rendimiento NULL (desconocido): no se permite inventar coste por ración.
DO $$
DECLARE
  v_production_category uuid;
  v_sellable_id uuid;
  v_production_id uuid;
  v_ingredient_count int;
BEGIN
  SELECT id INTO STRICT v_production_category
  FROM public.categories
  WHERE slug = 'produccion' AND scope = 'recipes';

  SELECT r.id INTO STRICT v_sellable_id
  FROM public.recipes r
  JOIN public.map_tpv_receta m ON m.recipe_id = r.id
  WHERE r.name = 'Verduras horno' AND r.is_sellable = true AND m.articulo_id = 197;

  IF EXISTS (SELECT 1 FROM public.recipes WHERE name = 'Verduras horno prod') THEN
    RAISE EXCEPTION 'Ya existe Verduras horno prod: hay que revisarla antes de duplicar';
  END IF;

  SELECT count(*) INTO v_ingredient_count
  FROM public.recipe_ingredients WHERE recipe_id = v_sellable_id;
  IF v_ingredient_count <> 8 THEN
    RAISE EXCEPTION 'Escandallo de Verduras horno modificado (% ingredientes), no copiar sin revisar',
      v_ingredient_count;
  END IF;

  INSERT INTO public.recipes (
    name, category, menu_category_id, is_sellable,
    yield_quantity, yield_unit, servings,
    photo_url, photo_detail_url, elaboration, preparation_time, elaboration_video_url
  )
  SELECT
    'Verduras horno prod', 'Producción', v_production_category, false,
    NULL, NULL, servings,
    photo_url, photo_detail_url, elaboration, preparation_time, elaboration_video_url
  FROM public.recipes WHERE id = v_sellable_id
  RETURNING id INTO v_production_id;

  INSERT INTO public.recipe_ingredients (
    recipe_id, ingredient_id, quantity_gross, quantity_net, unit,
    quantity_half, umb_multiplier
  )
  SELECT
    v_production_id, ingredient_id, quantity_gross, quantity_net, unit,
    quantity_half, umb_multiplier
  FROM public.recipe_ingredients WHERE recipe_id = v_sellable_id;

  IF (SELECT count(*) FROM public.recipe_ingredients WHERE recipe_id = v_production_id)
      <> v_ingredient_count THEN
    RAISE EXCEPTION 'Incompleta la copia del escandallo de verduras';
  END IF;

  -- Sin vínculo en recipe_subrecipes mientras no haya rendimiento real
  -- del lote horneado: evita descontar una tanda completa por cada guarnición.
END;
$$;
