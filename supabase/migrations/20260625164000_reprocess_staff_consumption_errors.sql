-- Reprocesar errores de consumo de personal desde el 14 de junio de 2026

DO $$
DECLARE
  err RECORD;
  v_stock_written integer := 0;
BEGIN
  -- Iterar sobre los errores registrados desde el 14 de junio (incluido)
  FOR err IN 
    SELECT * FROM public.staff_consumption_register_errors 
    WHERE created_at >= '2026-06-14 00:00:00+02'
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
            WHEN err.is_half AND COALESCE(ri.quantity_half, 0) > 0 THEN ri.quantity_half
            ELSE ri.quantity_gross * (CASE WHEN err.is_half THEN 0.5 ELSE 1.0 END)
          END) * err.quantity * ri.umb_multiplier)::numeric,
          ri.unit::text,
          COALESCE(ing.purchase_unit, 'ud')::text,
          ing.supplier_pricing_mode::text,
          ing.pack_unit_size_qty::numeric,
          ing.pack_unit_size_unit::text,
          err.recipe_name::text,
          ing.name::text
        ),
        COALESCE(ing.purchase_unit, 'ud'),
        err.created_at, -- Mantenemos la fecha en la que se intentó registrar
        err.reference_doc,
        'Consumo Personal: ' || err.recipe_name,
        'Auto-Registro Salida (Staff ID: ' || err.employee_id::text || ')'
      FROM public.recipe_ingredients ri
      JOIN public.ingredients ing ON ri.ingredient_id = ing.id
      WHERE ri.recipe_id = err.recipe_id;

      -- Si llegamos aquí sin excepción, eliminamos el error porque se procesó correctamente
      DELETE FROM public.staff_consumption_register_errors WHERE id = err.id;
      v_stock_written := v_stock_written + 1;
    EXCEPTION
      WHEN OTHERS THEN
        -- Si sigue fallando por otro motivo (por ej. falta de receta/ingredientes), 
        -- actualizamos el mensaje de error pero lo dejamos en la tabla.
        UPDATE public.staff_consumption_register_errors 
        SET error_message = 'RETRY ERROR: ' || SQLERRM 
        WHERE id = err.id;
    END;
  END LOOP;
  
  RAISE NOTICE 'Reprocesados % registros de consumo de personal.', v_stock_written;
END;
$$;
