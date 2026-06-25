-- Fix: Añadir cast explícito a los argumentos de staff_consumption_qty_to_purchase_unit
-- para evitar el error "function public.staff_consumption_qty_to_purchase_unit(double precision, character varying, character varying, text, numeric, text, character varying, character varying) does not exist".

CREATE OR REPLACE FUNCTION public.process_staff_consumption(
  p_employee_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text := 'STAFF-' || p_employee_id::text || '-' || EXTRACT(EPOCH FROM now())::text;
  v_food_count integer := 0;
  v_stock_written integer := 0;
  v_error_count integer := 0;
  cart_rec RECORD;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_employee_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EMPTY_CART',
      'stock_written_count', 0,
      'error_count', 0
    );
  END IF;

  SELECT COUNT(*)::integer
  INTO v_food_count
  FROM jsonb_to_recordset(p_items) AS cart(recipe_id uuid, quantity numeric, is_half boolean)
  JOIN public.recipes r ON r.id = cart.recipe_id
  WHERE NOT public.is_drink_consumption_recipe(r.name, r.category);

  IF v_food_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NO_FOOD',
      'stock_written_count', 0,
      'error_count', 0
    );
  END IF;

  FOR cart_rec IN
    SELECT
      cart.recipe_id,
      LEAST(GREATEST(1, cart.quantity), 20) AS quantity,
      cart.is_half,
      r.name AS recipe_name,
      r.category AS recipe_category
    FROM jsonb_to_recordset(p_items) AS cart(recipe_id uuid, quantity numeric, is_half boolean)
    JOIN public.recipes r ON r.id = cart.recipe_id
  LOOP
    BEGIN
      INSERT INTO public.stock_movements (
        movement_type,
        ingredient_id,
        quantity,
        unit,
        movement_date,
        reference_doc,
        original_description,
        processed_by
      )
      SELECT
        'WASTE'::text,
        ri.ingredient_id,
        public.staff_consumption_qty_to_purchase_unit(
          ((CASE
            WHEN cart_rec.is_half AND COALESCE(ri.quantity_half, 0) > 0 THEN ri.quantity_half
            ELSE ri.quantity_gross * (CASE WHEN cart_rec.is_half THEN 0.5 ELSE 1.0 END)
          END) * cart_rec.quantity * ri.umb_multiplier)::numeric,
          ri.unit::text,
          COALESCE(ing.purchase_unit, 'ud')::text,
          ing.supplier_pricing_mode::text,
          ing.pack_unit_size_qty::numeric,
          ing.pack_unit_size_unit::text,
          cart_rec.recipe_name::text,
          ing.name::text
        ),
        COALESCE(ing.purchase_unit, 'ud'),
        now(),
        v_ref,
        'Consumo Personal: ' || cart_rec.recipe_name,
        'Auto-Registro Salida (Staff ID: ' || p_employee_id::text || ')'
      FROM public.recipe_ingredients ri
      JOIN public.ingredients ing ON ri.ingredient_id = ing.id
      WHERE ri.recipe_id = cart_rec.recipe_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Receta "%" sin ingredientes en escandallo', cart_rec.recipe_name;
      END IF;

      v_stock_written := v_stock_written + 1;
    EXCEPTION
      WHEN OTHERS THEN
        INSERT INTO public.staff_consumption_register_errors (
          employee_id,
          reference_doc,
          recipe_id,
          recipe_name,
          quantity,
          is_half,
          is_drink,
          error_message
        ) VALUES (
          p_employee_id,
          v_ref,
          cart_rec.recipe_id,
          cart_rec.recipe_name,
          cart_rec.quantity,
          cart_rec.is_half,
          public.is_drink_consumption_recipe(cart_rec.recipe_name, cart_rec.recipe_category),
          SQLERRM
        );
        v_error_count := v_error_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'reference_doc', v_ref,
    'stock_written_count', v_stock_written,
    'error_count', v_error_count
  );
END;
$$;

COMMENT ON FUNCTION public.process_staff_consumption(uuid, jsonb) IS
  'Registra consumo personal receta a receta. Exige comida en el carrito; errores técnicos se guardan en staff_consumption_register_errors.';

GRANT EXECUTE ON FUNCTION public.process_staff_consumption(uuid, jsonb) TO authenticated;
