-- Corrección K4: `stock_movements.movement_type` es varchar, no un enum.
-- Reemplaza la función de protección ya desplegada sin tocar ningún hecho.

CREATE OR REPLACE FUNCTION public.prevent_k4_duplicate_against_legacy_purchase()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.movement_type = 'PURCHASE'
     AND NEW.reference_type = 'purchase_invoice_line'::public.stock_reference_type
     AND NEW.reference_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.stock_movements legacy
       WHERE legacy.movement_type = 'PURCHASE'
         AND legacy.reference_doc = 'ALB-LINE-' || NEW.reference_id::text
     ) THEN
    RAISE EXCEPTION
      USING ERRCODE = 'P0001',
        MESSAGE = 'K4_NEEDS_REVIEW: la línea ya tiene un PURCHASE heredado; no se duplicará la recepción.';
  END IF;
  RETURN NEW;
END;
$$;
