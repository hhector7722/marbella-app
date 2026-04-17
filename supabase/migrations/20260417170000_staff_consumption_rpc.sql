CREATE OR REPLACE FUNCTION "public"."process_staff_consumption"(
  p_employee_id uuid,
  p_items jsonb -- Array de objetos: [{ "recipe_id": "uuid", "quantity": 1, "is_half": false }]
) RETURNS void AS $$
DECLARE
  v_ref text := 'STAFF-' || p_employee_id::text || '-' || EXTRACT(EPOCH FROM now())::text;
BEGIN
  -- Si el array está vacío, no hacemos nada (botón "No he consumido nada")
  IF jsonb_array_length(p_items) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO stock_movements (
    movement_type, ingredient_id, quantity, unit, movement_date,
    reference_doc, original_description, processed_by
  )
  SELECT 
    'WASTE',
    ri.ingredient_id,
    -- Cálculo: Usa quantity_half si está marcado y es > 0. Sino, usa gross * 0.5. Aplica multiplicadores.
    (CASE 
      WHEN i.is_half AND COALESCE(ri.quantity_half, 0) > 0 THEN ri.quantity_half 
      ELSE ri.quantity_gross * (CASE WHEN i.is_half THEN 0.5 ELSE 1.0 END) 
    END) * i.quantity * ri.umb_multiplier AS final_quantity,
    ing.unit,
    now(),
    v_ref,
    'Consumo Personal: ' || r.name,
    'Auto-Registro Salida (Staff ID: ' || p_employee_id::text || ')'
  FROM jsonb_to_recordset(p_items) AS i(recipe_id uuid, quantity numeric, is_half boolean)
  JOIN recipe_ingredients ri ON ri.recipe_id = i.recipe_id
  JOIN ingredients ing ON ri.ingredient_id = ing.id
  JOIN recipes r ON r.id = ri.recipe_id;

END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION "public"."process_staff_consumption"(uuid, jsonb) TO authenticated;
