-- Validación de consumo personal sin insertar stock (para resaltar productos con error en UI).

CREATE OR REPLACE FUNCTION public.validate_staff_consumption(p_items jsonb)
RETURNS TABLE(recipe_id uuid, recipe_name text, error_message text)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  cart_rec RECORD;
  ing_rec RECORD;
  v_failed uuid[] := '{}';
BEGIN
  IF jsonb_array_length(p_items) = 0 THEN
    RETURN;
  END IF;

  FOR cart_rec IN
    SELECT cart.recipe_id, cart.quantity, cart.is_half, r.name AS recipe_name
    FROM jsonb_to_recordset(p_items) AS cart(recipe_id uuid, quantity numeric, is_half boolean)
    JOIN public.recipes r ON r.id = cart.recipe_id
  LOOP
    IF cart_rec.recipe_id = ANY (v_failed) THEN
      CONTINUE;
    END IF;

    BEGIN
      FOR ing_rec IN
        SELECT
          ri.unit AS recipe_unit,
          ri.quantity_gross,
          ri.quantity_half,
          ri.umb_multiplier,
          COALESCE(ing.purchase_unit, 'ud') AS purchase_unit,
          ing.supplier_pricing_mode,
          ing.pack_unit_size_qty,
          ing.pack_unit_size_unit,
          ing.name AS ingredient_name
        FROM public.recipe_ingredients ri
        JOIN public.ingredients ing ON ri.ingredient_id = ing.id
        WHERE ri.recipe_id = cart_rec.recipe_id
      LOOP
        PERFORM public.staff_consumption_qty_to_purchase_unit(
          (CASE
            WHEN cart_rec.is_half AND COALESCE(ing_rec.quantity_half, 0) > 0 THEN ing_rec.quantity_half
            ELSE ing_rec.quantity_gross * (CASE WHEN cart_rec.is_half THEN 0.5 ELSE 1.0 END)
          END) * cart_rec.quantity * ing_rec.umb_multiplier,
          ing_rec.recipe_unit,
          ing_rec.purchase_unit,
          ing_rec.supplier_pricing_mode,
          ing_rec.pack_unit_size_qty,
          ing_rec.pack_unit_size_unit,
          cart_rec.recipe_name,
          ing_rec.ingredient_name
        );
      END LOOP;
    EXCEPTION
      WHEN OTHERS THEN
        recipe_id := cart_rec.recipe_id;
        recipe_name := cart_rec.recipe_name;
        error_message := SQLERRM;
        RETURN NEXT;
        v_failed := array_append(v_failed, cart_rec.recipe_id);
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.validate_staff_consumption(jsonb) IS
  'Comprueba conversión de unidades por receta sin escribir stock_movements; devuelve filas con error.';

GRANT EXECUTE ON FUNCTION public.validate_staff_consumption(jsonb) TO authenticated;
