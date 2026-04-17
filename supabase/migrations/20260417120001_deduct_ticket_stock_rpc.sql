CREATE OR REPLACE FUNCTION "public"."process_ticket_stock_deduction"(p_numero_documento text) 
RETURNS void AS $$
BEGIN
  -- 1. Idempotencia: Abortar si este ticket ya fue procesado en el ledger
  IF EXISTS (
    SELECT 1 FROM stock_movements 
    WHERE reference_doc = 'TICKET-' || p_numero_documento AND movement_type = 'SALE'
  ) THEN
    RETURN;
  END IF;

  -- 2. Calcular consumos e insertar en el Ledger
  INSERT INTO stock_movements (
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
    'SALE',
    ri.ingredient_id,
    -- Cálculo: Cantidad vendida * Porción de la receta * Cantidad bruta de ingrediente * Multiplicador UMB
    (tl.unidades * mtr.factor_porcion * ri.quantity_gross * ri.umb_multiplier) AS consumed_quantity,
    i.unit,
    now(),
    'TICKET-' || p_numero_documento,
    'Deducción automática TPV - Artículo TPV ID: ' || tl.articulo_id::text,
    'Sistema Automático TPV'
  FROM ticket_lines_marbella tl
  JOIN map_tpv_receta mtr ON tl.articulo_id = mtr.articulo_id
  JOIN recipe_ingredients ri ON mtr.recipe_id = ri.recipe_id
  JOIN ingredients i ON ri.ingredient_id = i.id
  WHERE tl.numero_documento = p_numero_documento;

END;
$$ LANGUAGE plpgsql;
