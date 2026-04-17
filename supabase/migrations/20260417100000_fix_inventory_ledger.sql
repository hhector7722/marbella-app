-- 1. Añadir el multiplicador estricto para proteger el ledger
ALTER TABLE "public"."recipe_ingredients" ADD COLUMN IF NOT EXISTS "umb_multiplier" numeric(10,4) DEFAULT 1.0 NOT NULL;

-- 2. Sobrescribir la función del trigger para habilitar deltas negativos y corregir el error matemático
CREATE OR REPLACE FUNCTION "public"."update_ingredient_stock_trigger"() RETURNS "trigger" AS $$
BEGIN
  IF NEW.movement_type = 'PURCHASE' THEN
    UPDATE ingredients SET stock_current = COALESCE(stock_current, 0) + ABS(NEW.quantity) WHERE id = NEW.ingredient_id;
  ELSIF NEW.movement_type IN ('SALE', 'WASTE') THEN
    UPDATE ingredients SET stock_current = COALESCE(stock_current, 0) - ABS(NEW.quantity) WHERE id = NEW.ingredient_id;
  ELSIF NEW.movement_type IN ('ADJUSTMENT', 'INVENTORY_COUNT') THEN
    UPDATE ingredients SET stock_current = COALESCE(stock_current, 0) + NEW.quantity WHERE id = NEW.ingredient_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
