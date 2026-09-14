-- K4 · El caché legacy `ingredients.stock_current` no es productor de una
-- recepción canónica. `public.stock_current` se deriva del único ledger
-- `stock_movements`. El trigger histórico se conserva para sus movimientos
-- existentes, con nombres cualificados para no depender del search_path.

CREATE OR REPLACE FUNCTION public.update_ingredient_stock_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.movement_type = 'PURCHASE'
     AND NEW.reference_type = 'purchase_invoice_line'::public.stock_reference_type
     AND NEW.origin = 'receipt_confirmation'::public.stock_movement_origin THEN
    RETURN NEW;
  END IF;

  IF NEW.movement_type = 'PURCHASE' THEN
    UPDATE public.ingredients
    SET stock_current = COALESCE(stock_current, 0) + ABS(NEW.quantity)
    WHERE id = NEW.ingredient_id;
  ELSIF NEW.movement_type IN ('SALE', 'WASTE') THEN
    UPDATE public.ingredients
    SET stock_current = COALESCE(stock_current, 0) - ABS(NEW.quantity)
    WHERE id = NEW.ingredient_id;
  ELSIF NEW.movement_type IN ('ADJUSTMENT', 'INVENTORY_COUNT') THEN
    UPDATE public.ingredients
    SET stock_current = COALESCE(stock_current, 0) + NEW.quantity
    WHERE id = NEW.ingredient_id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_ingredient_stock_trigger() IS
  'Compatibilidad legacy: K4 omite receipts canónicos; stock_current canónico es la proyección derivada stock_current.';
