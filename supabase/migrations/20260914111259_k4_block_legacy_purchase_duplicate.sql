-- K4 · No mezcla ni duplica hechos legacy con la entrada canónica nueva.
-- El RPC devuelve revisiones tipadas para sus precondiciones ordinarias; esta
-- salvaguarda adicional cubre llamadas directas/concurrentes contra una línea
-- que ya tuviera un PURCHASE heredado sin auditoría K4.

CREATE OR REPLACE FUNCTION public.prevent_k4_duplicate_against_legacy_purchase()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.movement_type = 'PURCHASE'::public.stock_movement_type
     AND NEW.reference_type = 'purchase_invoice_line'::public.stock_reference_type
     AND NEW.reference_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.stock_movements legacy
       WHERE legacy.movement_type = 'PURCHASE'::public.stock_movement_type
         AND legacy.reference_doc = 'ALB-LINE-' || NEW.reference_id::text
     ) THEN
    RAISE EXCEPTION
      USING ERRCODE = 'P0001',
        MESSAGE = 'K4_NEEDS_REVIEW: la línea ya tiene un PURCHASE heredado; no se duplicará la recepción.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_movements_k4_block_legacy_purchase_duplicate
  ON public.stock_movements;
CREATE TRIGGER stock_movements_k4_block_legacy_purchase_duplicate
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_k4_duplicate_against_legacy_purchase();
