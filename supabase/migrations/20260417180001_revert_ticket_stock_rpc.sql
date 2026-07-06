CREATE OR REPLACE FUNCTION "public"."revert_ticket_stock_deduction"(p_numero_documento text) 
RETURNS void AS $$
BEGIN
  -- 1. Idempotencia: Abortar si ya hay un reintegro para este ticket
  IF EXISTS (
    SELECT 1 FROM stock_movements 
    WHERE reference_doc = 'REFUND-' || p_numero_documento AND movement_type = 'ADJUSTMENT'
  ) THEN
    RETURN;
  END IF;

  -- 2. Insertar movimientos compensatorios (Reingreso al stock teórico)
  INSERT INTO stock_movements (
    movement_type, ingredient_id, quantity, unit, movement_date,
    reference_doc, original_description, processed_by
  )
  SELECT 
    'ADJUSTMENT',
    ingredient_id,
    ABS(quantity), -- ABS() vuelve la salida negativa en una entrada positiva
    unit,
    now(),
    'REFUND-' || p_numero_documento,
    'Reintegro automático por anulación de TPV - Ticket Original: ' || p_numero_documento,
    'Sistema Automático TPV'
  FROM stock_movements
  WHERE reference_doc = 'TICKET-' || p_numero_documento AND movement_type = 'SALE';

END;
$$ LANGUAGE plpgsql;
