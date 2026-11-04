-- Los menús llevan una tortilla física completa, no un formato de bocadillo.
-- El menú tortilla del TPV (artículo 154) debe apuntar a su receta vendible.
BEGIN;
DO $$
DECLARE
  v_tortilla uuid;
  v_menu uuid;
  v_embutido uuid;
BEGIN
  SELECT id INTO STRICT v_tortilla FROM public.recipes
  WHERE name = 'Tortilla' AND is_sellable = false;
  SELECT id INTO STRICT v_menu FROM public.recipes
  WHERE name = 'Menú tortilla' AND is_sellable = true;
  SELECT id INTO STRICT v_embutido FROM public.recipes
  WHERE name = 'Menú tortilla y embutido' AND is_sellable = true;

  UPDATE public.recipe_subrecipes
  SET quantity = 1, unit = 'ud', format_full_id = NULL, format_half_id = NULL
  WHERE parent_recipe_id = v_menu AND child_recipe_id = v_tortilla;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menú tortilla no contiene la elaboración Tortilla';
  END IF;

  INSERT INTO public.recipe_subrecipes (
    parent_recipe_id, child_recipe_id, quantity, unit, format_full_id, format_half_id
  ) VALUES (v_embutido, v_tortilla, 1, 'ud', NULL, NULL)
  ON CONFLICT (parent_recipe_id, child_recipe_id)
  DO UPDATE SET quantity = 1, unit = 'ud', format_full_id = NULL, format_half_id = NULL;

  UPDATE public.map_tpv_receta
  SET recipe_id = v_menu
  WHERE articulo_id = 154 AND recipe_id IN (v_tortilla, v_menu);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El artículo TPV 154 ya no corresponde a Tortilla o Menú tortilla';
  END IF;
END;
$$;
COMMIT;
