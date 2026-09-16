CREATE OR REPLACE FUNCTION public.prevent_confirmed_receipt_line_fact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.purchase_receipt_confirmations confirmation
    WHERE confirmation.purchase_invoice_line_id = OLD.id
  ) AND (
    NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
    OR NEW.original_name IS DISTINCT FROM OLD.original_name
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.line_unit IS DISTINCT FROM OLD.line_unit
    OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
    OR NEW.total_price IS DISTINCT FROM OLD.total_price
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.mapped_ingredient_id IS DISTINCT FROM OLD.mapped_ingredient_id
    OR NEW.interpretation_proposal_id IS DISTINCT FROM OLD.interpretation_proposal_id
  ) THEN
    RAISE EXCEPTION
      USING ERRCODE = 'P0001',
        MESSAGE = 'La línea ya está confirmada económicamente; corrige mediante una rectificación futura.';
  END IF;
  RETURN NEW;
END;
$function$;
