-- current_price numeric(10,2) truncaba costes por ud muy bajos (p. ej. 3,25 € / 1000 → 0,00).
-- Postgres no permite ALTER TYPE si un trigger declara UPDATE OF current_price → drop/recreate.

DROP TRIGGER IF EXISTS trigger_log_price_history ON public.ingredients;
DROP TRIGGER IF EXISTS trigger_refresh_financials_on_price_change ON public.ingredients;
DROP TRIGGER IF EXISTS trigger_ingredients_pack_pricing_sync ON public.ingredients;

ALTER TABLE public.ingredients
  ALTER COLUMN current_price TYPE numeric(12, 6)
  USING current_price::numeric(12, 6);

UPDATE public.ingredients i
SET current_price = public.compute_ingredient_current_price_from_pack(
  i.pack_price,
  i.pack_units,
  i.pack_unit_size_qty,
  i.pack_unit_size_unit,
  i.purchase_unit
)
WHERE i.supplier_pricing_mode = 'per_pack'
  AND i.pack_price IS NOT NULL
  AND i.pack_units IS NOT NULL
  AND i.pack_units > 0;

CREATE TRIGGER trigger_log_price_history
  BEFORE UPDATE OF current_price ON public.ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.log_price_change();

-- Eliminado en 20260326100000 en muchos entornos; IF NOT EXISTS no aplica a triggers → solo recrear si la función sigue existiendo.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'refresh_recipe_financials'
  ) THEN
    CREATE TRIGGER trigger_refresh_financials_on_price_change
      AFTER UPDATE OF current_price ON public.ingredients
      FOR EACH STATEMENT
      EXECUTE FUNCTION public.refresh_recipe_financials();
  END IF;
END $$;

CREATE TRIGGER trigger_ingredients_pack_pricing_sync
  BEFORE INSERT OR UPDATE OF supplier_pricing_mode, pack_price, pack_units, pack_unit_size_qty, pack_unit_size_unit, purchase_unit
  ON public.ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ingredients_pack_pricing_sync();
