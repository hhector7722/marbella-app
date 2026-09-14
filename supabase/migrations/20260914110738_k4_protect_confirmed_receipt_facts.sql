-- K4 · Una confirmación ya aplicada no puede cambiar de significado.
-- Las correcciones futuras se expresarán como una nueva versión/rectificación,
-- nunca reescribiendo la línea documental que originó un PURCHASE canónico.

CREATE OR REPLACE FUNCTION public.prevent_confirmed_receipt_line_fact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
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
    OR NEW.conversion_factor IS DISTINCT FROM OLD.conversion_factor
    OR NEW.line_billing_unit IS DISTINCT FROM OLD.line_billing_unit
    OR NEW.line_content_qty IS DISTINCT FROM OLD.line_content_qty
    OR NEW.line_content_unit IS DISTINCT FROM OLD.line_content_unit
  ) THEN
    RAISE EXCEPTION
      USING ERRCODE = 'P0001',
        MESSAGE = 'La línea ya está confirmada económicamente; corrige mediante una rectificación futura.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_invoice_lines_confirmed_receipt_facts_immutable
  ON public.purchase_invoice_lines;
CREATE TRIGGER purchase_invoice_lines_confirmed_receipt_facts_immutable
  BEFORE UPDATE ON public.purchase_invoice_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_confirmed_receipt_line_fact_mutation();

COMMENT ON FUNCTION public.prevent_confirmed_receipt_line_fact_mutation() IS
  'K4: protege los hechos documentales de una línea con recepción económica confirmada.';
